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
  mtime: number;
  size: number;
  contentPreview?: string;
}

export interface IndexOptions {
  maxPreviewChars: number;
  autoRefreshOnStartup: boolean;
  globalExcludePatterns: string[];
  storeSnippetsInCache: boolean;
}

export interface MultiVaultSettings {
  vaults: VaultConfig[];
  indexOptions: IndexOptions;
  savedSearches: { id: string, name: string, query: string }[];
  pinnedFiles: string[];
}

export interface IndexCache {
  version: number;
  generatedAt: string;
  files: IndexedFile[];
}

export const DEFAULT_SETTINGS: MultiVaultSettings = {
  vaults: [],
  indexOptions: {
    maxPreviewChars: 1000,
    autoRefreshOnStartup: true,
    globalExcludePatterns: [],
    storeSnippetsInCache: true
  },
  savedSearches: [],
  pinnedFiles: []
};
