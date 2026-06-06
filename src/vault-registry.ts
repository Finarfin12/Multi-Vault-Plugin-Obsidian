import { App, FileSystemAdapter, Notice } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VaultConfig, MultiVaultSettings } from './types';

export class VaultRegistry {
  private vaults: Map<string, VaultConfig> = new Map();
  private app: App;

  constructor(app: App, settings: MultiVaultSettings) {
    this.app = app;
    
    // Load from settings
    if (settings.vaults) {
      settings.vaults.forEach(v => this.vaults.set(v.id, v));
    }

    // Auto-detect current vault if not in list
    this.detectCurrentVault();
    
    // Auto-detect other vaults from Obsidian global config
    this.autoDetectGlobalVaults();
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

  public addVault(config: VaultConfig): boolean {
    if (!this.validateVaultPath(config.path)) {
      new Notice(`Invalid vault path: ${config.path}`);
      return false;
    }
    this.vaults.set(config.id, config);
    return true;
  }

  public updateVault(id: string, partial: Partial<VaultConfig>) {
    const existing = this.vaults.get(id);
    if (existing) {
      this.vaults.set(id, { ...existing, ...partial });
    }
  }

  public removeVault(id: string) {
    this.vaults.delete(id);
  }

  public validateVaultPath(vaultPath: string): boolean {
    try {
      const stats = fs.statSync(vaultPath);
      if (!stats.isDirectory()) return false;
      const obsidianFolder = path.join(vaultPath, this.app.vault.configDir);
      return fs.existsSync(obsidianFolder) && fs.statSync(obsidianFolder).isDirectory();
    } catch {
      return false;
    }
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

  private detectCurrentVault() {
    if (this.app.vault.adapter instanceof FileSystemAdapter) {
      const basePath = this.app.vault.adapter.getBasePath();
      const existing = Array.from(this.vaults.values()).find(v => path.resolve(v.path) === path.resolve(basePath));
      
      if (!existing) {
        const name = path.basename(basePath);
        this.addVault({
          id: `vault-${Date.now()}`,
          name: name,
          path: basePath,
          enabled: true
        });
      }
    }
  }

  private autoDetectGlobalVaults() {
    const obsidianJsonPath = this.getGlobalObsidianConfigPath();
    if (!obsidianJsonPath || !fs.existsSync(obsidianJsonPath)) {
      return;
    }

    try {
      const data = fs.readFileSync(obsidianJsonPath, 'utf8');
      interface ObsidianJson {
        vaults?: Record<string, { path?: string }>;
      }
      const json = JSON.parse(data) as ObsidianJson;
      if (json && json.vaults) {
        for (const key in json.vaults) {
          const vaultInfo = json.vaults[key];
          if (vaultInfo.path) {
            const vaultPath = vaultInfo.path;
            
            // Check if already in our registry
            const existing = Array.from(this.vaults.values()).find(v => path.resolve(v.path) === path.resolve(vaultPath));
            
            if (!existing && this.validateVaultPath(vaultPath)) {
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
      }
    } catch (_e) {
      console.error("Failed to parse global obsidian.json", _e);
    }
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
