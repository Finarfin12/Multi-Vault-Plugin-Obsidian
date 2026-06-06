import { App } from 'obsidian';
import { IndexCache, IndexedFile } from '../types';

export class IndexStore {
  private app: App;
  private readonly CACHE_FILE = 'index-cache.json';

  constructor(app: App) {
    this.app = app;
  }

  public async saveIndex(files: IndexedFile[], storeSnippets: boolean = true): Promise<void> {
    const filesToCache = storeSnippets ? files : files.map(f => {
      const copy = { ...f };
      delete copy.contentPreview;
      return copy;
    });

    const cache: IndexCache = {
      version: 1,
      generatedAt: new Date().toISOString(),
      files: filesToCache
    };

    const dataPath = this.getPluginDataPath();
    if (dataPath) {
      // Obsidian's adapter handles vault-relative paths
      // The plugin data folder is at .obsidian/plugins/multi-vault-navigator
      const pluginDir = this.app.vault.configDir + '/plugins/multi-vault-navigator';
      const filePath = `${pluginDir}/${this.CACHE_FILE}`;
      
      // We must ensure the dir exists, though it should if settings are saved
      const exists = await this.app.vault.adapter.exists(pluginDir);
      if (!exists) {
        await this.app.vault.adapter.mkdir(pluginDir);
      }
      
      await this.app.vault.adapter.write(filePath, JSON.stringify(cache));
    }
  }

  public async loadIndex(): Promise<IndexedFile[]> {
    const dataPath = this.getPluginDataPath();
    if (dataPath) {
      const pluginDir = this.app.vault.configDir + '/plugins/multi-vault-navigator';
      const filePath = `${pluginDir}/${this.CACHE_FILE}`;
      
      try {
        const exists = await this.app.vault.adapter.exists(filePath);
        if (exists) {
          const content = await this.app.vault.adapter.read(filePath);
          const cache: IndexCache = JSON.parse(content);
          return cache.files || [];
        }
      } catch (e) {
        console.error("Failed to load index cache", e);
      }
    }
    return [];
  }

  public async clearIndex(): Promise<void> {
    const pluginDir = this.app.vault.configDir + '/plugins/multi-vault-navigator';
    const filePath = `${pluginDir}/${this.CACHE_FILE}`;
    try {
      const exists = await this.app.vault.adapter.exists(filePath);
      if (exists) {
        await this.app.vault.adapter.remove(filePath);
      }
    } catch (e) {
      console.error("Failed to clear index cache", e);
    }
  }

  private getPluginDataPath(): string | null {
    // using Obsidian's built-in configDir
    return this.app.vault.configDir;
  }
}
