import { App } from 'obsidian';
import { IndexCache, IndexedFile } from '../types';

/** Current cache format: file metadata + serialized search index. Older formats are discarded and rebuilt. */
export const CACHE_VERSION = 3;

export interface LoadedIndex {
  files: IndexedFile[];
  /** Serialized search index; null when the cache was written without it. */
  search: unknown;
  parseSignature: string | null;
}

export class IndexStore {
  private app: App;
  private readonly CACHE_FILE = 'index-cache.json';

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Write the cache. When `storeSnippets` is false neither the previews nor the
   * search index (which holds the words of every note) are written to disk.
   */
  public async saveIndex(
    files: IndexedFile[],
    search: unknown,
    storeSnippets: boolean = true,
    parseSignature?: string
  ): Promise<void> {
    const filesToCache = storeSnippets ? files : files.map(f => {
      const copy = { ...f };
      delete copy.contentPreview;
      return copy;
    });

    const cache: IndexCache = {
      version: CACHE_VERSION,
      generatedAt: new Date().toISOString(),
      parseSignature,
      files: filesToCache
    };
    if (storeSnippets && search) cache.search = search;

    const pluginDir = this.getPluginDir();
    const filePath = `${pluginDir}/${this.CACHE_FILE}`;

    // The folder normally exists because settings are saved there
    const exists = await this.app.vault.adapter.exists(pluginDir);
    if (!exists) {
      await this.app.vault.adapter.mkdir(pluginDir);
    }

    await this.app.vault.adapter.write(filePath, JSON.stringify(cache));
  }

  /** Load the cache, or null when it is missing, unreadable or an older format (caller rebuilds). */
  public async loadIndex(): Promise<LoadedIndex | null> {
    const filePath = `${this.getPluginDir()}/${this.CACHE_FILE}`;

    try {
      const exists = await this.app.vault.adapter.exists(filePath);
      if (!exists) return null;
      const content = await this.app.vault.adapter.read(filePath);
      const cache = JSON.parse(content) as IndexCache;
      if (cache.version !== CACHE_VERSION || !Array.isArray(cache.files)) return null;
      return {
        files: cache.files,
        search: cache.search ?? null,
        parseSignature: cache.parseSignature ?? null
      };
    } catch {
      return null;
    }
  }

  public async clearIndex(): Promise<void> {
    const filePath = `${this.getPluginDir()}/${this.CACHE_FILE}`;
    try {
      const exists = await this.app.vault.adapter.exists(filePath);
      if (exists) {
        await this.app.vault.adapter.remove(filePath);
      }
    } catch {
      return;
    }
  }

  private getPluginDir(): string {
    return this.app.vault.configDir + '/plugins/multi-vault-navigator';
  }
}
