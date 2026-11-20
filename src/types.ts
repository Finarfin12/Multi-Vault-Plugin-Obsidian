export interface VaultConfig {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  color?: string;
  icon?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
}

export interface IndexedFile {
  id: string;
  vaultId: string;
  vaultName: string;
  absolutePath: string;
  relativePath: string;
  basename: string;
  extension: string;
  frontmatter?: Record<string, unknown>;
  headings?: string[];
  tags?: string[];
  outgoingLinks?: string[];
  /** `vaultname::Note` targets of [[Vault::Note]] links (vault name lower-cased); feeds the cross-vault map. */
  crossVaultLinks?: string[];
  /** Approximate number of words in the note body. */
  wordCount?: number;
  /** Creation time (ms) when the file system reports one. */
  ctime?: number;
  /** (modified time, word count) pairs seen over time, newest last; used to estimate words added in a period. */
  wordHistory?: Array<[number, number]>;
  mtime: number;
  size: number;
  contentPreview?: string;
}

export interface IndexOptions {
  maxPreviewChars: number;
  autoRefreshOnStartup: boolean;
  globalExcludePatterns: string[];
  storeSnippetsInCache: boolean;
  /** Index the whole note text (not only the preview) so any word can be found. */
  fullText: boolean;
  /** Only the first N bytes of a note are indexed (full-text mode). */
  maxIndexedBytes: number;
  /** Watch enabled vaults and update the index when files change. */
  watchVaults: boolean;
}

/** What changed in one vault since the last index run. */
export interface IndexDelta {
  vaultId: string;
  added: IndexedFile[];
  updated: IndexedFile[];
  /** Ids of files that no longer exist (or are now excluded). */
  removed: string[];
}

export interface MultiVaultSettings {
  vaults: VaultConfig[];
  indexOptions: IndexOptions;
  savedSearches: { id: string, name: string, query: string }[];
  pinnedFiles: string[];
  uiStyle?: 'classic' | 'modern';
  ignoredVaultPaths?: string[];
}

/** Cache format 3: file metadata plus the serialized search index. Format 2 is discarded and rebuilt. */
export interface IndexCache {
  version: number;
  generatedAt: string;
  /** Settings that shape what is parsed; a change forces a full re-read. */
  parseSignature?: string;
  files: IndexedFile[];
  /** MiniSearch index (as plain object). Absent when snippets are not stored in the cache. */
  search?: unknown;
}

export const DEFAULT_SETTINGS: MultiVaultSettings = {
  vaults: [],
  indexOptions: {
    maxPreviewChars: 1000,
    autoRefreshOnStartup: true,
    globalExcludePatterns: [],
    storeSnippetsInCache: true,
    fullText: true,
    maxIndexedBytes: 200000,
    watchVaults: true
  },
  savedSearches: [],
  pinnedFiles: [],
  uiStyle: 'classic',
  ignoredVaultPaths: []
};
