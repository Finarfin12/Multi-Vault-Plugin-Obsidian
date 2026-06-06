import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, MultiVaultSettings } from './types';
import { VaultRegistry } from './vault-registry';
import { Indexer } from './indexer/indexer';
import { SearchEngine } from './search-engine';
import { FileOpener } from './file-opener';
import { MultiVaultSettingsTab } from './settings-tab';
import { SearchModal } from './modals/search-modal';
import { SwitchVaultModal } from './modals/switch-vault-modal';
import { RecentFilesModal } from './modals/recent-files-modal';
import { FileOperationModal } from './modals/file-operation-modal';
import { DuplicateDetectorModal } from './modals/duplicate-detector-modal';
import { VIEW_TYPE_EXTERNAL_FILE, ExternalFileView } from './views/external-file-view';
import { VIEW_TYPE_SEARCH_PAGE, SearchPageView } from './views/search-page-view';
import { VIEW_TYPE_TAG_EXPLORER, TagExplorerView } from './views/tag-explorer-view';
import { VIEW_TYPE_DAILY_DASHBOARD, DailyDashboardView } from './views/daily-dashboard-view';
import { VIEW_TYPE_SIDEBAR, SidebarView } from './views/sidebar-view';
import { Notice, WorkspaceLeaf } from 'obsidian';

export default class MultiVaultNavigatorPlugin extends Plugin {
  settings: MultiVaultSettings = Object.assign({}, DEFAULT_SETTINGS);
  vaultRegistry: VaultRegistry;
  indexer: Indexer;
  searchEngine: SearchEngine;
  fileOpener: FileOpener;

  async onload() {
    await this.loadSettings();

    // Initialize core modules
    this.vaultRegistry = new VaultRegistry(this.app, this.settings);
    
    // Save settings right away in case auto-detect added vaults
    this.settings.vaults = this.vaultRegistry.getVaults();
    await this.saveSettings();

    this.indexer = new Indexer(this.app, this.vaultRegistry, this.settings);
    this.searchEngine = new SearchEngine();
    this.fileOpener = new FileOpener(this.app, this.vaultRegistry);

    // Initialize indexer (load cache)
    await this.indexer.initialize();
    this.refreshSearchEngine();

    // Register custom views
    this.registerView(
      VIEW_TYPE_EXTERNAL_FILE,
      (leaf) => new ExternalFileView(leaf, this.searchEngine, this.fileOpener)
    );
    this.registerView(
      VIEW_TYPE_SEARCH_PAGE,
      (leaf) => new SearchPageView(leaf, this, this.searchEngine, this.fileOpener)
    );
    this.registerView(
      VIEW_TYPE_TAG_EXPLORER,
      (leaf) => new TagExplorerView(leaf, this.indexer)
    );
    this.registerView(
      VIEW_TYPE_DAILY_DASHBOARD,
      (leaf) => new DailyDashboardView(leaf, this.indexer, this.fileOpener)
    );
    this.registerView(
      VIEW_TYPE_SIDEBAR,
      (leaf) => new SidebarView(leaf, this, this.fileOpener)
    );

    this.addRibbonIcon('library', 'Multi-Vault Sidebar', async () => {
       await this.activateSidebar();
    });

    // Register Modals Commands
    this.addCommand({
      id: 'multi-vault-search-page',
      name: 'Open Search Page',
      callback: async () => {
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({ type: VIEW_TYPE_SEARCH_PAGE, active: true });
        void this.app.workspace.revealLeaf(leaf);
      }
    });

    this.addCommand({
      id: 'multi-vault-tag-explorer',
      name: 'Open Global Tag Explorer',
      callback: async () => {
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({ type: VIEW_TYPE_TAG_EXPLORER, active: true });
        void this.app.workspace.revealLeaf(leaf);
      }
    });

    this.addCommand({
      id: 'multi-vault-daily-dashboard',
      name: 'Open Cross-Vault Daily Notes',
      callback: async () => {
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({ type: VIEW_TYPE_DAILY_DASHBOARD, active: true });
        void this.app.workspace.revealLeaf(leaf);
      }
    });

    this.addCommand({
      id: 'multi-vault-search',
      name: 'Search All Vaults',
      callback: () => {
        new SearchModal(this.app, this.searchEngine, this.fileOpener).open();
      }
    });

    this.addCommand({
      id: 'multi-vault-recent',
      name: 'Recent Files',
      callback: () => {
        new RecentFilesModal(this.app, this.searchEngine, this.fileOpener).open();
      }
    });

    this.addCommand({
      id: 'multi-vault-switch',
      name: 'Switch Vault',
      callback: () => {
        new SwitchVaultModal(this.app, this.vaultRegistry, this.fileOpener).open();
      }
    });

    this.addCommand({
      id: 'multi-vault-refresh-index',
      name: 'Refresh Index',
      callback: async () => {
        await this.indexer.buildFullIndex(true);
        this.refreshSearchEngine();
      }
    });

    this.addCommand({
      id: 'multi-vault-move-copy',
      name: 'Move/Copy Current File to Vault',
      callback: () => {
        new FileOperationModal(this.app, this.vaultRegistry, this.indexer).open();
      }
    });

    this.addCommand({
      id: 'multi-vault-duplicates',
      name: 'Find Duplicate Notes Across Vaults',
      callback: () => {
         new DuplicateDetectorModal(this.app, this.indexer, this.fileOpener).open();
      }
    });

    this.addCommand({
      id: 'multi-vault-copy-link',
      name: 'Copy Cross-Vault Link for Current File',
      callback: async () => {
         const activeFile = this.app.workspace.getActiveFile();
         if (!activeFile) {
            new Notice("No active file");
            return;
         }
         const vaultId = this.vaultRegistry.getCurrentVaultId();
         const link = `[${activeFile.basename}](obsidian://mvn-open?vaultId=${vaultId}&file=${encodeURIComponent(activeFile.path)})`;
         await navigator.clipboard.writeText(link);
         new Notice("Cross-vault link copied to clipboard!");
      }
    });

    // Register protocol handler
    this.registerObsidianProtocolHandler("mvn-open", async (params) => {
       const vaultId = params.vaultId;
       const filePath = params.file;
       if (!vaultId || !filePath) return;
       
       const files = this.indexer.getIndexedFiles();
       const target = files.find(f => f.vaultId === vaultId && f.relativePath === filePath);
       
       if (target) {
          await this.fileOpener.openFile(target);
       } else {
          new Notice("Cross-vault file not found in index. Please refresh index.");
       }
    });

    // Register Natural Cross-Vault Links Post Processor
    this.registerMarkdownPostProcessor((element, context) => {
       const walker = activeDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
       let node;
       const nodesToReplace: { node: Node, parent: Node, replacements: Node[] }[] = [];

       const regex = /\[\[(.*?)::(.*?)\]\]/g;

       while ((node = walker.nextNode()) !== null) {
          const text = node.textContent || '';
          let match;
          let lastIndex = 0;
          const replacements: Node[] = [];
          
          let found = false;
          while ((match = regex.exec(text)) !== null) {
             found = true;
             const vaultName = match[1].trim();
             const noteName = match[2].trim();
             
             if (match.index > lastIndex) {
                replacements.push(activeDocument.createTextNode(text.substring(lastIndex, match.index)));
             }
             
             const a = activeDocument.createElement('a');
             a.addClass('internal-link');
             a.addClass('mvn-cross-vault-link');
             a.innerText = noteName;
             a.onclick = (e) => {
                e.preventDefault();
                const files = this.indexer.getIndexedFiles();
                const target = files.find(f => f.vaultName.toLowerCase() === vaultName.toLowerCase() && f.basename.toLowerCase() === noteName.toLowerCase());
                if (target) {
                   void this.fileOpener.openFile(target);
                } else {
                   new Notice(`File "${noteName}" not found in vault "${vaultName}".`);
                }
             };
             
             a.oncontextmenu = (e) => {
                e.preventDefault();
                const files = this.indexer.getIndexedFiles();
                const target = files.find(f => f.vaultName.toLowerCase() === vaultName.toLowerCase() && f.basename.toLowerCase() === noteName.toLowerCase());
                if (target) {
                   window.open(`obsidian://open?vault=${encodeURIComponent(target.vaultName)}&file=${encodeURIComponent(target.relativePath)}`);
                }
             };

             replacements.push(a);
             lastIndex = regex.lastIndex;
          }

          if (found) {
             if (lastIndex < text.length) {
                replacements.push(activeDocument.createTextNode(text.substring(lastIndex)));
             }
             if (node.parentNode) {
                nodesToReplace.push({ node, parent: node.parentNode, replacements });
             }
          }
       }

       for (const { node, parent, replacements } of nodesToReplace) {
          replacements.forEach(r => parent.insertBefore(r, node));
          parent.removeChild(node);
       }
    });

    // Add settings tab
    this.addSettingTab(new MultiVaultSettingsTab(this.app, this, this.vaultRegistry, this.indexer));

    // Add ribbon icon
    this.addRibbonIcon('search', 'Multi-Vault Navigator', async () => {
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_SEARCH_PAGE, active: true });
      void this.app.workspace.revealLeaf(leaf);
    });

    // Auto refresh index if needed (in a realistic app we would probably do it lazily or on a timer)
    if (this.settings.indexOptions.autoRefreshOnStartup) {
       // Using setTimeout to not block Obsidian startup
       window.setTimeout(() => {
         void this.indexer.buildFullIndex(false).then(() => {
           this.refreshSearchEngine();
         }).catch(console.error);
       }, 5000);
    }
  }

  onunload() {
    // Cleanup if needed
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<MultiVaultSettings>);
  }

  async saveSettings() {
    this.settings.vaults = this.vaultRegistry.getVaults();
    await this.saveData(this.settings);
  }

  public refreshSidebar() {
     const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR);
     leaves.forEach(leaf => {
        if (leaf.view instanceof SidebarView) {
           leaf.view.render();
        }
     });
  }

  private async activateSidebar() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR);
    
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      await leaf?.setViewState({ type: VIEW_TYPE_SIDEBAR, active: true });
    }
    
    if (leaf) void workspace.revealLeaf(leaf);
  }

  refreshSearchEngine() {
    this.searchEngine.indexFiles(this.indexer.getIndexedFiles());
  }
}
