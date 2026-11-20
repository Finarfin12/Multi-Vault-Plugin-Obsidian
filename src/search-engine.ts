import MiniSearch, { AsPlainObject, Options, SearchResult } from 'minisearch';
import { IndexDelta, IndexedFile } from './types';

export interface MultiVaultSearchResult extends SearchResult {
  file: IndexedFile;
}

/** What is handed to MiniSearch: the cached metadata plus, in full-text mode, the note body (never stored in the cache). */
type SearchDoc = IndexedFile & { body?: string };

const normalizeTag = (tag: string) => tag.toLowerCase().replace(/^#+/, '');

/**
 * True when the file has every target tag, either exactly or as a parent of
 * a nested tag (#project matches #project/alpha, but #art never matches #smart).
 */
function hasAllTags(file: IndexedFile, targets: string[]): boolean {
  if (!file.tags) return false;
  const fileTags = file.tags.map(normalizeTag);
  return targets.map(normalizeTag).every(tt => fileTags.some(ft => ft === tt || ft.startsWith(`${tt}/`)));
}

function createOptions(): Options<SearchDoc> {
  return {
    fields: ['basename', 'relativePath', 'headingsStr', 'tagsStr', 'contentPreview', 'body'],
    storeFields: ['id'],
    extractField: (document, fieldName) => {
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
      const val = document[fieldName as keyof IndexedFile];
      if (val === undefined || val === null) return '';
      if (typeof val === 'string') return val;
      if (typeof val === 'number' || typeof val === 'boolean') return String(val);
      if (Array.isArray(val)) return val.map((v) => String(v)).join(' ');
      return '';
    },
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
}

export class SearchEngine {
  private miniSearch: MiniSearch<SearchDoc>;
  private fileMap: Map<string, IndexedFile> = new Map();
  private allFilesCache: IndexedFile[] | null = null;

  constructor() {
    this.miniSearch = new MiniSearch<SearchDoc>(createOptions());
  }

  /** Replace everything (metadata-only; no bodies). Kept for callers that do not use deltas. */
  public indexFiles(files: IndexedFile[]) {
    this.fileMap.clear();
    files.forEach(f => this.fileMap.set(f.id, f));
    this.allFilesCache = null;
    this.miniSearch.removeAll();
    this.miniSearch.addAll(files);
  }

  /** Drop every document. */
  public clear() {
    this.fileMap.clear();
    this.allFilesCache = null;
    this.miniSearch.removeAll();
  }

  /**
   * Incrementally apply one vault's changes: only changed documents are touched.
   * `bodies` maps file id -> note text for full-text indexing (omit for preview-only).
   */
  public applyDelta(delta: IndexDelta, bodies?: Map<string, string>) {
    for (const id of delta.removed) {
      if (this.miniSearch.has(id)) this.miniSearch.discard(id);
      this.fileMap.delete(id);
    }
    for (const file of [...delta.added, ...delta.updated]) {
      const body = bodies?.get(file.id);
      const doc: SearchDoc = body === undefined ? file : { ...file, body };
      if (this.miniSearch.has(file.id)) this.miniSearch.replace(doc);
      else this.miniSearch.add(doc);
      this.fileMap.set(file.id, file);
    }
    this.allFilesCache = null;
  }

  /** Serializable snapshot of the search index (vacuumed first so discarded documents are not stored). */
  public async serialize(): Promise<AsPlainObject> {
    if (this.miniSearch.dirtCount > 0) await this.miniSearch.vacuum();
    return this.miniSearch.toJSON();
  }

  /**
   * Restore from a cache snapshot. Returns false (and leaves the engine empty)
   * when the snapshot is unusable, so the caller can rebuild from disk.
   */
  public loadFromCache(files: IndexedFile[], search: unknown): boolean {
    try {
      if (!search || typeof search !== 'object') return false;
      const loaded = MiniSearch.loadJS<SearchDoc>(search as AsPlainObject, createOptions());
      if (loaded.documentCount !== files.length) return false;
      this.miniSearch = loaded;
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

    let results = this.miniSearch.search(query, {
      filter: (result: SearchResult) => {
        const id = result.id as string;
        const file = this.fileMap.get(id);
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

    if (options?.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    // Map back to MultiVaultSearchResult
    // MiniSearch's SearchResult.id is typed as `any`; cast to string explicitly.
    return results.flatMap((r: SearchResult): MultiVaultSearchResult[] => {
      const id = r.id as string;
      const file = this.fileMap.get(id);
      if (!file) return [];
      return [{ id, terms: r.terms, queryTerms: r.queryTerms, score: r.score, match: r.match, file }];
    });
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
