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

  public async openFile(file: IndexedFile) {
    const currentVaultId = this.vaultRegistry.getCurrentVaultId();
    
    if (currentVaultId === file.vaultId) {
      // Same vault, open directly
      this.app.workspace.openLinkText(file.relativePath, '', true);
    } else {
      // Other vault, open in our custom read-only tab
      const leaf = this.app.workspace.getLeaf(true); // true = open in new tab
      await leaf.setViewState({ type: VIEW_TYPE_EXTERNAL_FILE, active: true });
      const view = leaf.view;
      if (view instanceof ExternalFileView) {
         view.setFile(file);
      }
      this.app.workspace.revealLeaf(leaf);
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
