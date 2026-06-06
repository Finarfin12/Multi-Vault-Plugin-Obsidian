import { App, PluginSettingTab, Setting } from 'obsidian';
import { VaultRegistry } from './vault-registry';
import { Indexer } from './indexer/indexer';
import MultiVaultNavigatorPlugin from './main';
import { ExcludeSuggestModal } from './modals/exclude-suggest-modal';

export class MultiVaultSettingsTab extends PluginSettingTab {
  plugin: MultiVaultNavigatorPlugin;
  vaultRegistry: VaultRegistry;
  indexer: Indexer;

  constructor(app: App, plugin: MultiVaultNavigatorPlugin, vaultRegistry: VaultRegistry, indexer: Indexer) {
    super(app, plugin);
    this.plugin = plugin;
    this.vaultRegistry = vaultRegistry;
    this.indexer = indexer;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Auto-detect Vaults')
      .setDesc('Vaults are automatically detected from Obsidian global settings upon plugin start. You can also manually add them below.')
      .setHeading();

    new Setting(containerEl).setName('Configured Vaults').setHeading();

    const vaults = this.vaultRegistry.getVaults();
    if (vaults.length === 0) {
      containerEl.createEl('p', { text: 'No vaults configured.' });
    }

    for (const vault of vaults) {
      const isCurrent = this.vaultRegistry.getCurrentVaultId() === vault.id;
      const nameText = isCurrent ? `${vault.name} (Current)` : vault.name;
      
      new Setting(containerEl)
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
          // @ts-ignore
          if (typeof button.setDestructive === 'function') button.setDestructive(); else button.setWarning();
          return button.onClick(async () => {
             this.vaultRegistry.removeVault(vault.id);
             await this.plugin.saveSettings();
             this.display();
          });
        });
    }

    new Setting(containerEl).setName('Add Manual Vault').setHeading();

    let newVaultPath = "";
    new Setting(containerEl)
      .setName("Vault Path")
      .setDesc("Absolute path to the vault folder")
      .addText(text => text
        .setPlaceholder("C:/My/Vault")
        .onChange(value => {
          newVaultPath = value;
        })
      )
      .addButton(btn => btn
        .setButtonText("Add")
        .setCta()
        .onClick(async () => {
          if (newVaultPath) {
            // Very simple path to name conversion
            const name = newVaultPath.split(/[/\\]/).pop() || "Unnamed Vault";
            const success = this.vaultRegistry.addVault({
              id: `vault-${Date.now()}`,
              name,
              path: newVaultPath,
              enabled: true
            });
            if (success) {
              await this.plugin.saveSettings();
              this.display();
            }
          }
        })
      );

    new Setting(containerEl).setName('Indexing Options').setHeading();

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

    let excludeTimeout: number;

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
           
           window.clearTimeout(excludeTimeout);
           excludeTimeout = window.setTimeout(() => {
             this.indexer.buildFullIndex(true).then(() => {
               this.plugin.refreshSearchEngine();
             }).catch(console.error);
           }, 1500);
        })
      )
      .addButton(btn => btn
        .setButtonText("Select File/Folder")
        .onClick(() => {
          new ExcludeSuggestModal(this.app, this.indexer, async (selectedItem) => {
             const patterns = this.plugin.settings.indexOptions.globalExcludePatterns || [];
             if (!patterns.includes(selectedItem)) {
               patterns.push(selectedItem);
               this.plugin.settings.indexOptions.globalExcludePatterns = patterns;
               await this.plugin.saveSettings();
               this.display(); // Refresh the settings UI
               
               // Auto-refresh the index so the file immediately disappears from search
               await this.indexer.buildFullIndex(true);
               this.plugin.refreshSearchEngine();
             }
          }).open();
        })
      );
  }
}
