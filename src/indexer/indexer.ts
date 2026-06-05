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
  
  private scanner: FileScanner;
  private parser: MarkdownParser;
  private store: IndexStore;

  private indexedFiles: IndexedFile[] = [];
  private isIndexing: boolean = false;

  constructor(app: App, vaultRegistry: VaultRegistry, settings: MultiVaultSettings) {
    this.app = app;
    this.vaultRegistry = vaultRegistry;
    this.settings = settings;

    this.scanner = new FileScanner(this.settings.indexOptions.globalExcludePatterns || []);
    this.parser = new MarkdownParser(this.settings.indexOptions.maxPreviewChars);
    this.store = new IndexStore(this.app);
  }

  public async initialize(): Promise<void> {
    // Load cached index first
    this.indexedFiles = await this.store.loadIndex();
  }

  public getIndexedFiles(): IndexedFile[] {
    return this.indexedFiles;
  }

  public async buildFullIndex(showNotice = false): Promise<void> {
    if (this.isIndexing) {
      if (showNotice) new Notice("Indexing is already in progress...");
      return;
    }

    this.isIndexing = true;
    if (showNotice) new Notice("Starting cross-vault index build...");

    try {
      const enabledVaults = this.vaultRegistry.getEnabledVaults();
      const allFiles: IndexedFile[] = [];

      let fileCount = 0;

      for (const vault of enabledVaults) {
        // Scan files
        const fileEntries = await this.scanner.scanVaultAsync(vault);
        
        // Parse files
        for (const entry of fileEntries) {
          const indexed = await this.parser.parseMarkdownFileAsync(entry, vault);
          allFiles.push(indexed);
          
          fileCount++;
          if (fileCount % 50 === 0) {
             await new Promise(resolve => setTimeout(resolve, 0)); // yield to UI
          }
        }
      }

      this.indexedFiles = allFiles;
      
      // Save cache
      await this.store.saveIndex(this.indexedFiles);

      if (showNotice) {
        new Notice(`Index built successfully! ${this.indexedFiles.length} files indexed across ${enabledVaults.length} vaults.`);
      }
    } catch (e) {
      console.error("Index build failed:", e);
      if (showNotice) new Notice("Failed to build index. See console for details.");
    } finally {
      this.isIndexing = false;
    }
  }

  public async clearIndex(): Promise<void> {
    this.indexedFiles = [];
    await this.store.clearIndex();
    new Notice("Index cleared.");
  }
}
