import { App, Notice } from 'obsidian';
import { IndexedFile, VaultConfig } from './types';
import { VaultRegistry } from './vault-registry';
import { VIEW_TYPE_EXTERNAL_FILE, ExternalFileView } from './views/external-file-view';

export class FileOpener {
  private app: App;
  private vaultRegistry: VaultRegistry;

  constructor(app: App, vaultRegistry: VaultRegistry) {
    this.app = app;
    this.vaultRegistry = vaultRegistry;
  }

  /**
   * Open a note. `newTab` (default true) opens a new tab. With `newTab: false`
   * a note of this vault replaces the current tab (like a normal link click) and
   * a note of another vault reuses an already open read-only tab when there is one.
   */
  public async openFile(file: IndexedFile, options: { newTab?: boolean } = {}) {
    const newTab = options.newTab !== false;
    const currentVaultId = this.vaultRegistry.getCurrentVaultId();

    if (currentVaultId === file.vaultId) {
      // Same vault, open directly
      await this.app.workspace.openLinkText(file.relativePath, '', newTab);
    } else {
      // Other vault, open in our custom read-only tab
      const existing = newTab ? undefined : this.app.workspace.getLeavesOfType(VIEW_TYPE_EXTERNAL_FILE)[0];
      const leaf = existing ?? this.app.workspace.getLeaf(true); // true = open in new tab
      if (!existing) await leaf.setViewState({ type: VIEW_TYPE_EXTERNAL_FILE, active: true });
      const view = leaf.view;
      if (view instanceof ExternalFileView) {
         await view.setFile(file);
      }
      await this.app.workspace.revealLeaf(leaf);
    }
  }

  public openVault(vault: VaultConfig) {
    const currentVaultId = this.vaultRegistry.getCurrentVaultId();
    if (currentVaultId === vault.id) {
      new Notice("You are already in this vault.");
      return;
    }

    const vaultNameEnc = encodeURIComponent(vault.name);
    const uri = `obsidian://open?vault=${vaultNameEnc}`;
    window.open(uri);
  }
}
