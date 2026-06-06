import MiniSearch, { SearchResult } from 'minisearch';
import { IndexedFile } from './types';

export interface MultiVaultSearchResult extends SearchResult {
  file: IndexedFile;
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
        return val !== undefined && val !== null ? String(val) : '';
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

  public search(query: string, options?: { vaultId?: string, limit?: number, tags?: string[] }): MultiVaultSearchResult[] {
    if (!query.trim()) {
      if (options?.tags && options.tags.length > 0) {
        let files = this.indexedFiles;
        if (options.vaultId) files = files.filter(f => f.vaultId === options.vaultId);
        
        const targetTags = options.tags.map(t => t.toLowerCase().replace('#', ''));
        files = files.filter(f => {
           if (!f.tags) return false;
           const fileTags = f.tags.map(t => t.toLowerCase().replace('#', ''));
           return targetTags.every(tt => fileTags.some(ft => ft === tt || ft.includes(tt)));
        });
        
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
      filter: (result) => {
        const file = this.fileMap.get(String(result.id));
        if (!file) return false;

        if (options?.vaultId && file.vaultId !== options.vaultId) {
          return false;
        }

        if (options?.tags && options.tags.length > 0) {
           if (!file.tags) return false;
           const targetTags = options.tags.map(t => t.toLowerCase().replace('#', ''));
           const fileTags = file.tags.map(t => t.toLowerCase().replace('#', ''));
           const hasAllTags = targetTags.every(tt => fileTags.some(ft => ft === tt || ft.includes(tt)));
           if (!hasAllTags) return false;
        }

        return true;
      }
    });

    if (options?.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    // Map back to MultiVaultSearchResult
    return results.flatMap(r => {
      const file = this.fileMap.get(String(r.id));
      return file ? [{ ...r, file }] : [];
    });
  }

  public getRecentFiles(limit: number = 50, vaultId?: string): IndexedFile[] {
    let files = this.indexedFiles;
    if (vaultId) {
      files = files.filter(f => f.vaultId === vaultId);
    }
    
    // Sort by mtime descending
    return files.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
  }
}
