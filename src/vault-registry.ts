import { App, FileSystemAdapter, Notice } from 'obsidian';
import * as path from 'path';
import * as os from 'os';
import { isDirectory, pathExists, readTextOrNull } from './fs-async';
import { VaultConfig, MultiVaultSettings } from './types';

export class VaultRegistry {
  private vaults: Map<string, VaultConfig> = new Map();
  private app: App;
  private settings: MultiVaultSettings;

  constructor(app: App, settings: MultiVaultSettings) {
    this.app = app;
    this.settings = settings;

    // Load from settings
    if (settings.vaults) {
      settings.vaults.forEach(v => this.vaults.set(v.id, v));
    }
  }

  /**
   * Detect the current vault and the other vaults known to Obsidian.
   * Async so reading obsidian.json and checking vault folders never blocks
   * the UI thread; call once after construction.
   */
  public async initialize(): Promise<void> {
    // Vaults known to Obsidian, keyed by Obsidian's own vault id
    const globalVaults = await this.readGlobalVaults();

    // Auto-detect current vault if not in list
    await this.detectCurrentVault(globalVaults);

    // Auto-detect other vaults from Obsidian global config
    await this.autoDetectGlobalVaults(globalVaults);
  }

  public getVaults(): VaultConfig[] {
    return Array.from(this.vaults.values());
  }

  public getEnabledVaults(): VaultConfig[] {
    return this.getVaults().filter(v => v.enabled);
  }

  public getVaultById(id: string): VaultConfig | undefined {
    return this.vaults.get(id);
  }

  /**
   * Resolve a vault referenced by a cross-vault link. Ids of manually added
   * vaults differ between each vault's copy of this plugin, so fall back to
   * the vault name.
   */
  public findVault(id?: string, name?: string): VaultConfig | undefined {
    if (id) {
      const byId = this.vaults.get(id);
      if (byId) return byId;
    }
    if (name) {
      const lower = name.toLowerCase();
      return this.getVaults().find(v => v.name.toLowerCase() === lower);
    }
    return undefined;
  }

  public async addVault(config: VaultConfig): Promise<boolean> {
    if (!(await this.validateVaultPath(config.path))) {
      new Notice(`Invalid vault path: ${config.path}`);
      return false;
    }
    this.vaults.set(config.id, config);
    // Manually re-adding a vault lifts any earlier removal
    const resolved = path.resolve(config.path);
    this.settings.ignoredVaultPaths = (this.settings.ignoredVaultPaths || []).filter(p => p !== resolved);
    return true;
  }

  public updateVault(id: string, partial: Partial<VaultConfig>) {
    const existing = this.vaults.get(id);
    if (existing) {
      this.vaults.set(id, { ...existing, ...partial });
    }
  }

  public removeVault(id: string) {
    const vault = this.vaults.get(id);
    if (vault) {
      // Remember the removal so auto-detect does not re-add it on next start
      const resolved = path.resolve(vault.path);
      const ignored = this.settings.ignoredVaultPaths || [];
      if (!ignored.includes(resolved)) ignored.push(resolved);
      this.settings.ignoredVaultPaths = ignored;
    }
    this.vaults.delete(id);
  }

  public async validateVaultPath(vaultPath: string): Promise<boolean> {
    if (!(await isDirectory(vaultPath))) return false;
    return isDirectory(path.join(vaultPath, this.app.vault.configDir));
  }

  public getCurrentVaultId(): string | null {
    if (this.app.vault.adapter instanceof FileSystemAdapter) {
      const basePath = this.app.vault.adapter.getBasePath();
      for (const [id, v] of this.vaults.entries()) {
        // Normalize paths for comparison
        if (path.resolve(v.path) === path.resolve(basePath)) {
          return id;
        }
      }
    }
    return null;
  }

  private async detectCurrentVault(globalVaults: Map<string, string>): Promise<void> {
    if (this.app.vault.adapter instanceof FileSystemAdapter) {
      const basePath = this.app.vault.adapter.getBasePath();
      const existing = Array.from(this.vaults.values()).find(v => path.resolve(v.path) === path.resolve(basePath));

      if (!existing) {
        const name = path.basename(basePath);
        // Prefer Obsidian's own vault id so this vault has the same id
        // here as in every other vault's copy of this plugin
        let globalId: string | undefined;
        for (const [key, vaultPath] of globalVaults) {
          if (path.resolve(vaultPath) === path.resolve(basePath)) {
            globalId = key;
            break;
          }
        }
        await this.addVault({
          id: globalId ?? `vault-${Date.now()}`,
          name: name,
          path: basePath,
          enabled: true
        });
      }
    }
  }

  private async autoDetectGlobalVaults(globalVaults: Map<string, string>): Promise<void> {
    const ignored = this.settings.ignoredVaultPaths || [];
    for (const [key, vaultPath] of globalVaults) {
      const resolved = path.resolve(vaultPath);
      if (ignored.includes(resolved)) continue;

      // Check if already in our registry
      const existing = Array.from(this.vaults.values()).find(v => path.resolve(v.path) === resolved);

      if (!existing && await this.validateVaultPath(vaultPath)) {
        const name = path.basename(vaultPath);
        this.vaults.set(key, {
          id: key,
          name: name,
          path: vaultPath,
          enabled: true
        });
      }
    }
  }

  private async readGlobalVaults(): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const obsidianJsonPath = this.getGlobalObsidianConfigPath();
    if (!obsidianJsonPath || !(await pathExists(obsidianJsonPath))) {
      return result;
    }

    try {
      const data = await readTextOrNull(obsidianJsonPath);
      if (data === null) return result;
      interface ObsidianJson {
        vaults?: Record<string, { path?: string }>;
      }
      const json = JSON.parse(data) as ObsidianJson;
      if (json && json.vaults) {
        for (const key in json.vaults) {
          const vaultPath = json.vaults[key].path;
          if (vaultPath) result.set(key, vaultPath);
        }
      }
    } catch {
      // Unreadable or malformed config: nothing to auto-detect
    }
    return result;
  }

  private getGlobalObsidianConfigPath(): string | null {
    const platform = os.platform();
    if (platform === 'win32') {
      return process.env.APPDATA ? path.join(process.env.APPDATA, 'Obsidian', 'obsidian.json') : null;
    } else if (platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json');
    } else if (platform === 'linux') {
      // Could be in flatpak or snap, but normally in .config
      return path.join(os.homedir(), '.config', 'obsidian', 'obsidian.json');
    }
    return null;
  }
}
