import MiniSearch from 'minisearch';
import { IndexDelta, IndexedFile } from './types';
import { hasAllTags } from './search/tags';
import { matchesFilters, ParsedQuery } from './search/query-parser';

/**
 * Type boundary for the search library.
 *
 * The Obsidian review bot cannot always resolve the types of `minisearch`
 * (they then collapse to `any` and trigger no-unsafe-* warnings), so every
 * value that comes out of the library is cast to the local shapes below
 * exactly once, here, and nothing else in the plugin touches library types.
 */
interface RawSearchHit {
  id: unknown;
  score: number;
  terms: string[];
  queryTerms: string[];
  match: Record<string, string[]>;
}

/** What is handed to the search index: the cached metadata plus, in full-text mode, the note body (never stored in the cache). */
type SearchDoc = IndexedFile & { body?: string };

/** The few MiniSearch members this plugin uses, typed locally. */
interface SearchIndex {
  search(
    query: string,
    options?: { filter?: (hit: RawSearchHit) => boolean; combineWith?: 'AND' | 'OR'; prefix?: boolean; fuzzy?: boolean | number }
  ): RawSearchHit[];
  has(id: string): boolean;
  add(doc: SearchDoc): void;
  addAll(docs: SearchDoc[]): void;
  replace(doc: SearchDoc): void;
  discard(id: string): void;
  removeAll(): void;
  vacuum(): Promise<void>;
  toJSON(): unknown;
  readonly dirtCount: number;
  readonly documentCount: number;
}

export interface MultiVaultSearchResult {
  id: string;
  score: number;
  terms: string[];
  queryTerms: string[];
  match: Record<string, string[]>;
  file: IndexedFile;
}


function extractField(document: SearchDoc, fieldName: string): string {
  if (fieldName === 'headingsStr') {
    return document.headings ? document.headings.join(' ') : '';
  }
  if (fieldName === 'tagsStr') {
    return document.tags ? document.tags.join(' ') : '';
  }
  if (fieldName === 'body') {
    return document.body ?? '';
  }
  if (fieldName === 'contentPreview' && document.body !== undefined) {
    // The body already contains the preview text; do not count it twice
    return '';
  }
  const val: unknown = document[fieldName as keyof IndexedFile];
  if (val === undefined || val === null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.map((v) => String(v)).join(' ');
  return '';
}

const INDEX_OPTIONS = {
  fields: ['basename', 'relativePath', 'headingsStr', 'tagsStr', 'contentPreview', 'body'],
  storeFields: ['id'],
  extractField,
  searchOptions: {
    boost: {
      basename: 5,
      headingsStr: 3,
      tagsStr: 3,
      relativePath: 2,
      contentPreview: 1,
      body: 1
    },
    fuzzy: 0.2,
    prefix: true
  }
};

/** The one place where a library value is trusted to have the local shape. */
function castIndex(value: unknown): SearchIndex {
  return value as SearchIndex;
}

/** Library boundary: create an empty index. */
function createIndex(): SearchIndex {
  return castIndex(new MiniSearch(INDEX_OPTIONS));
}

/** Library boundary: restore an index from its plain-object snapshot (throws when unusable). */
function restoreIndex(snapshot: unknown): SearchIndex {
  return castIndex(MiniSearch.loadJS(snapshot as never, INDEX_OPTIONS));
}

export class SearchEngine {
  private index: SearchIndex;
  private fileMap: Map<string, IndexedFile> = new Map();
  private allFilesCache: IndexedFile[] | null = null;

  constructor() {
    this.index = createIndex();
  }

  /** Replace everything (metadata-only; no bodies). Kept for callers that do not use deltas. */
  public indexFiles(files: IndexedFile[]) {
    this.fileMap.clear();
    files.forEach(f => this.fileMap.set(f.id, f));
    this.allFilesCache = null;
    this.index.removeAll();
    this.index.addAll(files);
  }

  /** Drop every document. */
  public clear() {
    this.fileMap.clear();
    this.allFilesCache = null;
    this.index.removeAll();
  }

  /**
   * Incrementally apply one vault's changes: only changed documents are touched.
   * `bodies` maps file id -> note text for full-text indexing (omit for preview-only).
   */
  public applyDelta(delta: IndexDelta, bodies?: Map<string, string>) {
    for (const id of delta.removed) {
      if (this.index.has(id)) this.index.discard(id);
      this.fileMap.delete(id);
    }
    for (const file of [...delta.added, ...delta.updated]) {
      const body = bodies?.get(file.id);
      const doc: SearchDoc = body === undefined ? file : { ...file, body };
      if (this.index.has(file.id)) this.index.replace(doc);
      else this.index.add(doc);
      this.fileMap.set(file.id, file);
    }
    this.allFilesCache = null;
  }

  /** Serializable snapshot of the search index (vacuumed first so discarded documents are not stored). */
  public async serialize(): Promise<unknown> {
    if (this.index.dirtCount > 0) await this.index.vacuum();
    return this.index.toJSON();
  }

  /**
   * Restore from a cache snapshot. Returns false (and leaves the engine empty)
   * when the snapshot is unusable, so the caller can rebuild from disk.
   */
  public loadFromCache(files: IndexedFile[], search: unknown): boolean {
    try {
      if (!search || typeof search !== 'object') return false;
      const loaded = restoreIndex(search);
      if (loaded.documentCount !== files.length) return false;
      this.index = loaded;
      this.fileMap.clear();
      files.forEach(f => this.fileMap.set(f.id, f));
      this.allFilesCache = null;
      return true;
    } catch {
      this.clear();
      return false;
    }
  }

  public get documentCount(): number {
    return this.fileMap.size;
  }

  private allFiles(): IndexedFile[] {
    if (!this.allFilesCache) this.allFilesCache = Array.from(this.fileMap.values());
    return this.allFilesCache;
  }

  public getFileById(id: string): IndexedFile | undefined {
    return this.fileMap.get(id);
  }

  public search(query: string, options?: { vaultId?: string, limit?: number, tags?: string[] }): MultiVaultSearchResult[] {
    if (!query.trim()) {
      if (options?.tags && options.tags.length > 0) {
        let files = this.allFiles();
        if (options.vaultId) files = files.filter(f => f.vaultId === options.vaultId);

        const targetTags = options.tags;
        files = files.filter(f => hasAllTags(f, targetTags));

        if (options.limit && options.limit > 0) {
          files = files.slice(0, options.limit);
        }
        return files.map(f => ({
           id: f.id,
           file: f,
           score: 1,
           terms: [],
           match: {},
           queryTerms: []
        }));
      }
      return [];
    }

    const hits = this.index.search(query, {
      filter: (hit: RawSearchHit) => {
        if (typeof hit.id !== 'string') return false;
        const file = this.fileMap.get(hit.id);
        if (!file) return false;

        if (options?.vaultId && file.vaultId !== options.vaultId) {
          return false;
        }

        if (options?.tags && options.tags.length > 0 && !hasAllTags(file, options.tags)) {
           return false;
        }

        return true;
      }
    });

    const limited = options?.limit && options.limit > 0 ? hits.slice(0, options.limit) : hits;

    const results: MultiVaultSearchResult[] = [];
    for (const hit of limited) {
      if (typeof hit.id !== 'string') continue;
      const file = this.fileMap.get(hit.id);
      if (!file) continue;
      results.push({ id: hit.id, terms: hit.terms, queryTerms: hit.queryTerms, score: hit.score, match: hit.match, file });
    }
    return results;
  }

  /** Ids of documents that contain any of the given words exactly (no prefix, no fuzzy). */
  private idsContaining(terms: string[]): Set<string> {
    const ids = new Set<string>();
    for (const term of terms) {
      for (const hit of this.index.search(term, { prefix: false, fuzzy: false })) {
        if (typeof hit.id === 'string') ids.add(hit.id);
      }
    }
    return ids;
  }

  /**
   * Search with operators (F10). Handles vault/path/tag/modified filters,
   * excluded words and the words of phrases. The exact order of phrase words is
   * verified separately (see search/run-search.ts) because it needs the note text.
   * With only filters and no words, every matching note is listed, newest first.
   */
  public searchParsed(parsed: ParsedQuery, options: { vaultId?: string; limit?: number } = {}): MultiVaultSearchResult[] {
    const excluded = parsed.notTerms.length > 0 ? this.idsContaining(parsed.notTerms) : new Set<string>();
    const accept = (file: IndexedFile): boolean =>
      !excluded.has(file.id)
      && (!options.vaultId || file.vaultId === options.vaultId)
      && matchesFilters(file, parsed);

    const wordQuery = [parsed.text, ...parsed.phrases].join(' ').trim();
    const limit = options.limit && options.limit > 0 ? options.limit : Infinity;

    if (!wordQuery) {
      return this.allFiles()
        .filter(accept)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, limit)
        .map(f => ({ id: f.id, file: f, score: 1, terms: [], match: {}, queryTerms: [] }));
    }

    const hits = this.index.search(wordQuery, {
      // A phrase needs all of its words in the same note
      combineWith: parsed.phrases.length > 0 ? 'AND' : 'OR',
      filter: (hit: RawSearchHit) => {
        if (typeof hit.id !== 'string') return false;
        const file = this.fileMap.get(hit.id);
        return file !== undefined && accept(file);
      }
    });

    const results: MultiVaultSearchResult[] = [];
    for (const hit of hits) {
      if (results.length >= limit) break;
      if (typeof hit.id !== 'string') continue;
      const file = this.fileMap.get(hit.id);
      if (!file) continue;
      results.push({ id: hit.id, terms: hit.terms, queryTerms: hit.queryTerms, score: hit.score, match: hit.match, file });
    }
    return results;
  }

  public getRecentFiles(limit: number = 50, vaultId?: string): IndexedFile[] {
    let files = this.allFiles();
    if (vaultId) {
      files = files.filter(f => f.vaultId === vaultId);
    }

    // Sort by mtime descending (on a copy: the array is shared)
    return [...files].sort((a, b) => b.mtime - a.mtime).slice(0, limit);
  }

  /**
   * Find cross-vault backlinks: files whose outgoing wikilinks point to `target`.
   * Uses indexed `outgoingLinks` when available, with a contentPreview
   * fallback for caches built before link extraction existed.
   */
  public findBacklinks(target: IndexedFile, limit: number = 20): IndexedFile[] {
    const targetName = target.basename.toLowerCase();
    const crossVaultRef = `${target.vaultName.toLowerCase()}::${targetName}`;
    const results: IndexedFile[] = [];

    for (const f of this.allFiles()) {
      if (f.id === target.id) continue;

      const links = f.outgoingLinks ?? [];
      if (links.includes(targetName) || links.includes(crossVaultRef)) {
        results.push(f);
        continue;
      }

      // Fallback for old caches without outgoingLinks
      if (!f.outgoingLinks && f.contentPreview) {
        const preview = f.contentPreview.toLowerCase();
        if (preview.includes(`[[${targetName}`) || preview.includes(`[[${crossVaultRef}`)) {
          results.push(f);
        }
      }

      if (results.length >= limit) break;
    }

    return results;
  }
}
