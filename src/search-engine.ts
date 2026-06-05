import MiniSearch, { SearchResult } from 'minisearch';
import { IndexedFile } from './types';

export interface MultiVaultSearchResult extends SearchResult {
  file: IndexedFile;
}

export class SearchEngine {
  private miniSearch: MiniSearch<IndexedFile>;
  private indexedFiles: IndexedFile[] = [];

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
    this.miniSearch.removeAll();
    this.miniSearch.addAll(files);
  }

  public search(query: string, options?: { vaultId?: string, limit?: number }): IndexedFile[] {
    if (!query.trim()) {
      return [];
    }

    let results = this.miniSearch.search(query, {
      filter: (result) => {
        if (options?.vaultId && result.vaultId !== options.vaultId) {
          return false;
        }
        return true;
      }
    });

    if (options?.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    // Map back to IndexedFile
    return results.map(r => this.indexedFiles.find(f => f.id === r.id) as IndexedFile).filter(f => !!f);
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
