import MiniSearch, { SearchResult } from 'minisearch';
import { IndexedFile } from './types';

export interface MultiVaultSearchResult extends SearchResult {
  file: IndexedFile;
}

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

export class SearchEngine {
  private miniSearch: MiniSearch<IndexedFile>;
  private indexedFiles: IndexedFile[] = [];
  private fileMap: Map<string, IndexedFile> = new Map();

  constructor() {
    this.miniSearch = new MiniSearch<IndexedFile>({
      fields: ['basename', 'relativePath', 'headingsStr', 'tagsStr', 'contentPreview'],
      storeFields: ['id'],
      extractField: (document, fieldName) => {
        if (fieldName === 'headingsStr') {
          return document.headings ? document.headings.join(' ') : '';
        }
        if (fieldName === 'tagsStr') {
          return document.tags ? document.tags.join(' ') : '';
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
          contentPreview: 1
        },
        fuzzy: 0.2,
        prefix: true
      }
    });
  }

  public indexFiles(files: IndexedFile[]) {
    this.indexedFiles = files;
    this.fileMap.clear();
    files.forEach(f => this.fileMap.set(f.id, f));
    this.miniSearch.removeAll();
    this.miniSearch.addAll(files);
  }

  public getFileById(id: string): IndexedFile | undefined {
    return this.fileMap.get(id);
  }

  public search(query: string, options?: { vaultId?: string, limit?: number, tags?: string[] }): MultiVaultSearchResult[] {
    if (!query.trim()) {
      if (options?.tags && options.tags.length > 0) {
        let files = this.indexedFiles;
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
    let files = this.indexedFiles;
    if (vaultId) {
      files = files.filter(f => f.vaultId === vaultId);
    }
    
    // Sort by mtime descending (on a copy: the array is shared with the indexer)
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

    for (const f of this.indexedFiles) {
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
