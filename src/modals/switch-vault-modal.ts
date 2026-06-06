import { App, FuzzySuggestModal, FuzzyMatch } from 'obsidian';
import { VaultConfig } from '../types';
import { VaultRegistry } from '../vault-registry';
import { FileOpener } from '../file-opener';

export class SwitchVaultModal extends FuzzySuggestModal<VaultConfig> {
  private vaultRegistry: VaultRegistry;
  private fileOpener: FileOpener;

  constructor(app: App, vaultRegistry: VaultRegistry, fileOpener: FileOpener) {
    super(app);
    this.vaultRegistry = vaultRegistry;
    this.fileOpener = fileOpener;
    this.setPlaceholder("Switch vault...");
  }

  getItems(): VaultConfig[] {
    return this.vaultRegistry.getEnabledVaults();
  }

  getItemText(vault: VaultConfig): string {
    return vault.name;
  }

  renderSuggestion(item: FuzzyMatch<VaultConfig>, el: HTMLElement) {
    super.renderSuggestion(item, el);
    const vault = item.item;
    const isCurrent = this.vaultRegistry.getCurrentVaultId() === vault.id;
    if (isCurrent) {
      el.createSpan({ text: ' (Current)', cls: 'mvn-current-vault' });
    }
  }

  onChooseItem(vault: VaultConfig, evt: MouseEvent | KeyboardEvent) {
    void this.fileOpener.openVault(vault);
  }
}
