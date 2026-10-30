import { App, Notice } from 'obsidian';
import { VaultRegistry } from '../vault-registry';
import { FileScanner } from './file-scanner';
import { MarkdownParser } from './markdown-parser';
import { IndexStore } from './index-store';
import { IndexedFile, MultiVaultSettings } from '../types';

export class Indexer {
  private app: App;
  private vaultRegistry: VaultRegistry;
  private settings: MultiVaultSettings;
  private onUpdate: () => void;

  private store: IndexStore;

  private indexedFiles: IndexedFile[] = [];
  private isIndexing: boolean = false;
  private rerunRequested: boolean = false;
  private lastIndexTime: number = 0;

  constructor(app: App, vaultRegistry: VaultRegistry, settings: MultiVaultSettings, onUpdate: () => void) {
    this.app = app;
    this.vaultRegistry = vaultRegistry;
    this.settings = settings;
    this.onUpdate = onUpdate;

    this.store = new IndexStore(this.app);
  }

  public async initialize(): Promise<void> {
    // Load cached index first
    this.indexedFiles = await this.store.loadIndex();
  }

  public getIndexedFiles(): IndexedFile[] {
    return this.indexedFiles;
  }

  /**
   * Rebuild the index from disk. `force` skips the cooldown; use it when
   * settings or files changed and the index must reflect that. A request
   * that arrives mid-build is queued and run once the current build ends.
   */
  public async buildFullIndex(showNotice = false, force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastIndexTime < 15000) {
      if (showNotice) new Notice("Indexing is on cooldown. Please wait a few seconds.");
      return;
    }

    if (this.isIndexing) {
      this.rerunRequested = true;
      if (showNotice) new Notice("Indexing is already in progress; it will run again when done.");
      return;
    }

    this.isIndexing = true;
    if (showNotice) new Notice("Starting cross-vault index build...");

    try {
      // Built per run so changed exclude patterns and preview length apply
      const scanner = new FileScanner(this.settings.indexOptions.globalExcludePatterns || []);
      const parser = new MarkdownParser(this.settings.indexOptions.maxPreviewChars);

      const enabledVaults = this.vaultRegistry.getEnabledVaults();
      const allFiles: IndexedFile[] = [];

      let fileCount = 0;

      for (const vault of enabledVaults) {
        // Scan files
        const fileEntries = await scanner.scanVaultAsync(vault);

        // Parse files
        for (const entry of fileEntries) {
          const indexed = await parser.parseMarkdownFileAsync(entry, vault);
          allFiles.push(indexed);

          fileCount++;
          if (fileCount % 50 === 0) {
             await new Promise(resolve => window.setTimeout(resolve, 0)); // yield to UI
          }
        }
      }

      this.indexedFiles = allFiles;
      this.lastIndexTime = Date.now();
      this.onUpdate();

      // Save cache
      await this.store.saveIndex(this.indexedFiles, this.settings.indexOptions.storeSnippetsInCache !== false);

      if (showNotice) {
        new Notice(`Index built successfully! ${this.indexedFiles.length} files indexed across ${enabledVaults.length} vaults.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (showNotice) new Notice(`Failed to build index: ${message}`);
    } finally {
      this.isIndexing = false;
    }

    if (this.rerunRequested) {
      this.rerunRequested = false;
      await this.buildFullIndex(false, true);
    }
  }

  public async clearIndex(): Promise<void> {
    this.indexedFiles = [];
    this.onUpdate();
    await this.store.clearIndex();
    new Notice("Index cleared.");
  }
}
