import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { VaultRegistry } from './vault-registry';
import { Indexer } from './indexer/indexer';
import MultiVaultNavigatorPlugin from './main';
import { ExcludeSuggestModal } from './modals/exclude-suggest-modal';

export class MultiVaultSettingsTab extends PluginSettingTab {
  plugin: MultiVaultNavigatorPlugin;
  vaultRegistry: VaultRegistry;
  indexer: Indexer;
  private newVaultPath = "";
  private excludeTimeout: number | null = null;

  constructor(app: App, plugin: MultiVaultNavigatorPlugin, vaultRegistry: VaultRegistry, indexer: Indexer) {
    super(app, plugin);
    this.plugin = plugin;
    this.vaultRegistry = vaultRegistry;
    this.indexer = indexer;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h3', { text: 'Auto-detect Vaults' });
    new Setting(containerEl)
      .setName('Auto-detect Vaults')
      .setDesc('Vaults are automatically detected from Obsidian global settings upon plugin start. You can also manually add them below.');

    containerEl.createEl('h3', { text: 'Configured Vaults' });
    const vaults = this.vaultRegistry.getVaults();
    if (vaults.length === 0) {
      new Setting(containerEl).setName('No vaults configured.');
    } else {
      vaults.forEach(vault => {
        const isCurrent = this.vaultRegistry.getCurrentVaultId() === vault.id;
        const nameText = isCurrent ? `${vault.name} (Current)` : vault.name;
        const setting = new Setting(containerEl)
          .setName(nameText)
          .setDesc(vault.path)
          .addToggle(toggle => toggle
            .setValue(vault.enabled)
            .onChange(async (value) => {
              this.vaultRegistry.updateVault(vault.id, { enabled: value });
              await this.plugin.saveSettings();
            })
          )
          .addButton(button => {
            button.setButtonText("Remove");
            if ((button as any).setWarning) {
               (button as any).setWarning();
            } else {
               button.setTooltip("Warning: Destructive action");
            }
            return button.onClick(async () => {
              this.vaultRegistry.removeVault(vault.id);
              await this.plugin.saveSettings();
              this.display();
            });
          });
      });
    }

    containerEl.createEl('h3', { text: 'Add Manual Vault' });
    new Setting(containerEl)
      .setName("Vault Path")
      .setDesc("Absolute path to the vault folder")
      .addText(text => text
        .setPlaceholder("C:/My/Vault")
        .setValue(this.newVaultPath)
        .onChange(value => {
          this.newVaultPath = value;
        })
      )
      .addButton(btn => btn
        .setButtonText("Add")
        .setCta()
        .onClick(async () => {
          if (this.newVaultPath) {
            const name = this.newVaultPath.split(/[/\\]/).pop() || "Unnamed Vault";
            const success = this.vaultRegistry.addVault({
              id: `vault-${Date.now()}`,
              name,
              path: this.newVaultPath,
              enabled: true
            });
            if (success) {
              this.newVaultPath = "";
              await this.plugin.saveSettings();
              this.display();
            }
          }
        })
      );

    containerEl.createEl('h3', { text: 'Indexing' });
    
    new Setting(containerEl)
      .setName("Refresh Index")
      .setDesc("Re-scan all enabled vaults and rebuild the cross-vault index.")
      .addButton(btn => btn
        .setButtonText("Refresh Now")
        .setCta()
        .onClick(async () => {
          await this.indexer.buildFullIndex(true);
          this.plugin.refreshSearchEngine();
        })
      );

    new Setting(containerEl)
      .setName("Max Preview Characters")
      .setDesc("Maximum length of content snippet to index per file.")
      .addText(text => text
        .setValue(this.plugin.settings.indexOptions.maxPreviewChars.toString())
        .onChange(async (value) => {
          const parsed = parseInt(value, 10);
          if (!isNaN(parsed) && parsed > 0) {
            this.plugin.settings.indexOptions.maxPreviewChars = parsed;
            await this.plugin.saveSettings();
          }
        })
      );

    new Setting(containerEl)
      .setName("Store Snippets in Cache")
      .setDesc("Warning: If enabled, note previews from all vaults are saved to a local JSON file in your active vault. Disable this if you regularly push your active vault's config folder to public repos, as it may leak cross-vault contents.")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.indexOptions.storeSnippetsInCache !== false)
        .onChange(async (value) => {
          this.plugin.settings.indexOptions.storeSnippetsInCache = value;
          await this.plugin.saveSettings();
          await this.indexer.buildFullIndex(true);
        })
      );

    new Setting(containerEl)
      .setName("Global Exclude Patterns")
      .setDesc("Comma-separated list of folder or file names to ignore across all vaults (e.g. 'Private, diary.md').")
      .addTextArea(text => text
        .setPlaceholder("Private, Secrets, hidden")
        .setValue((this.plugin.settings.indexOptions.globalExcludePatterns || []).join(', '))
        .onChange(async (value) => {
          const patterns = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
          this.plugin.settings.indexOptions.globalExcludePatterns = patterns;
          await this.plugin.saveSettings();

          if (this.excludeTimeout !== null) {
            window.clearTimeout(this.excludeTimeout);
          }
          this.excludeTimeout = window.setTimeout(() => {
            void this.refreshIndexFromSettings();
          }, 1500);
        })
      )
      .addButton(btn => btn
        .setButtonText("Select File/Folder")
        .onClick(() => {
          new ExcludeSuggestModal(this.app, this.indexer, (selectedItem) => {
            void this.addExcludePattern(selectedItem);
          }).open();
        })
      );
  }

  private async addExcludePattern(selectedItem: string): Promise<void> {
    const patterns = this.plugin.settings.indexOptions.globalExcludePatterns || [];
    if (!patterns.includes(selectedItem)) {
      patterns.push(selectedItem);
      this.plugin.settings.indexOptions.globalExcludePatterns = patterns;
      await this.plugin.saveSettings();
      this.display();

      await this.indexer.buildFullIndex(true);
      this.plugin.refreshSearchEngine();
    }
  }

  private async refreshIndexFromSettings(): Promise<void> {
    try {
      await this.indexer.buildFullIndex(true);
      this.plugin.refreshSearchEngine();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to refresh index: ${message}`);
    }
  }
}
