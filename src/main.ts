import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, MultiVaultSettings } from './types';
import { VaultRegistry } from './vault-registry';
import { Indexer } from './indexer/indexer';
import { VaultWatcher } from './indexer/vault-watcher';
import { SearchEngine } from './search-engine';
import { FileOpener } from './file-opener';
import { registerCrossVaultLinks } from './cross-vault-links';
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
  vaultWatcher: VaultWatcher;

  async onload() {
    await this.loadSettings();

    // Initialize core modules
    this.vaultRegistry = new VaultRegistry(this.app, this.settings);
    await this.vaultRegistry.initialize();

    // Save settings right away in case auto-detect added vaults
    this.settings.vaults = this.vaultRegistry.getVaults();
    await this.saveSettings();

    this.searchEngine = new SearchEngine();
    this.indexer = new Indexer(this.app, this.vaultRegistry, this.settings, this.searchEngine, () => this.onIndexUpdated());
    this.fileOpener = new FileOpener(this.app, this.vaultRegistry);

    // Initialize indexer (load cache; search is ready right after this when the cache is usable)
    await this.indexer.initialize();

    // Watch enabled vaults so search follows changes made anywhere
    this.vaultWatcher = new VaultWatcher({
      getVaults: () => this.vaultRegistry.getVaults(),
      getGlobalExcludes: () => this.settings.indexOptions.globalExcludePatterns || [],
      onChanged: (vault, paths) => this.indexer.reconcilePaths(vault, paths)
    });
    this.syncWatchers();

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

    this.addRibbonIcon('library', 'Multi-vault sidebar', async () => {
       await this.activateSidebar();
    });

    // Register Modals Commands
    this.addCommand({
      id: 'multi-vault-search-page',
      name: 'Open search page',
      callback: async () => {
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({ type: VIEW_TYPE_SEARCH_PAGE, active: true });
        await this.app.workspace.revealLeaf(leaf);
      }
    });

    this.addCommand({
      id: 'multi-vault-tag-explorer',
      name: 'Open global tag explorer',
      callback: async () => {
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({ type: VIEW_TYPE_TAG_EXPLORER, active: true });
        await this.app.workspace.revealLeaf(leaf);
      }
    });

    this.addCommand({
      id: 'multi-vault-daily-dashboard',
      name: 'Open cross-vault daily notes',
      callback: async () => {
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({ type: VIEW_TYPE_DAILY_DASHBOARD, active: true });
        await this.app.workspace.revealLeaf(leaf);
      }
    });

    this.addCommand({
      id: 'multi-vault-search',
      name: 'Search all vaults',
      callback: () => {
        new SearchModal(this.app, this.searchEngine, this.fileOpener, this.settings.indexOptions).open();
      }
    });

    this.addCommand({
      id: 'multi-vault-recent',
      name: 'Recent files',
      callback: () => {
        new RecentFilesModal(this.app, this.searchEngine, this.fileOpener).open();
      }
    });

    this.addCommand({
      id: 'multi-vault-switch',
      name: 'Switch vault',
      callback: () => {
        new SwitchVaultModal(this.app, this.vaultRegistry, this.fileOpener).open();
      }
    });

    this.addCommand({
      id: 'multi-vault-refresh-index',
      name: 'Refresh index',
      callback: async () => {
        await this.indexer.buildFullIndex(true);
      }
    });

    this.addCommand({
      id: 'multi-vault-move-copy',
      name: 'Move/copy current file to vault',
      callback: () => {
        new FileOperationModal(this.app, this.vaultRegistry, this.indexer).open();
      }
    });

    this.addCommand({
      id: 'multi-vault-duplicates',
      name: 'Find duplicate notes across vaults',
      callback: () => {
         new DuplicateDetectorModal(this.app, this.indexer, this.fileOpener, this.settings.indexOptions).open();
      }
    });

    this.addCommand({
      id: 'multi-vault-copy-link',
      name: 'Copy cross-vault link for current file',
      callback: async () => {
         const activeFile = this.app.workspace.getActiveFile();
         if (!activeFile) {
            new Notice("No active file");
            return;
         }
         const vaultId = this.vaultRegistry.getCurrentVaultId();
         const vault = vaultId ? this.vaultRegistry.getVaultById(vaultId) : undefined;
         if (!vaultId || !vault) {
            new Notice("Current vault is not registered with the plugin.");
            return;
         }
         // Include the name too: other vaults may know this vault under a different id
         const link = `[${activeFile.basename}](obsidian://mvn-open?vaultId=${encodeURIComponent(vaultId)}&vault=${encodeURIComponent(vault.name)}&file=${encodeURIComponent(activeFile.path)})`;
         await navigator.clipboard.writeText(link);
         new Notice("Cross-vault link copied to clipboard!");
      }
    });

    this.addCommand({
      id: 'multi-vault-clear-index',
      name: 'Clear cross-vault index',
      callback: async () => {
        await this.indexer.clearIndex();
      }
    });

    // Register protocol handler
    this.registerObsidianProtocolHandler("mvn-open", async (params) => {
       const filePath = params.file;
       const vault = this.vaultRegistry.findVault(params.vaultId, params.vault);
       if (!vault || !filePath) {
          new Notice("Cross-vault link points to an unknown vault.");
          return;
       }
       
       const files = this.indexer.getIndexedFiles();
       const target = files.find(f => f.vaultId === vault.id && f.relativePath === filePath);
       
       if (target) {
          await this.fileOpener.openFile(target);
       } else {
          new Notice("Cross-vault file not found in index. Please refresh index.");
       }
    });

    // Cross-vault [[Vault::Note]] links (Reading View anchor rewrite).
    // Core parses these into unresolved internal-link anchors before
    // postprocessors run, so rewrite those anchors instead of scanning
    // raw text (which never matches).
    registerCrossVaultLinks(this);

    // Add settings tab
    this.addSettingTab(new MultiVaultSettingsTab(this.app, this, this.vaultRegistry, this.indexer));

    // Add ribbon icon
    this.addRibbonIcon('search', 'Multi-vault navigator', async () => {
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_SEARCH_PAGE, active: true });
      await this.app.workspace.revealLeaf(leaf);
    });

    // Auto refresh index if needed (in a realistic app we would probably do it lazily or on a timer)
    // With a usable v3 cache search already works; the refresh only re-reads changed notes.
    // A missing/old cache is rebuilt even when auto-refresh is off, otherwise search would stay empty.
    if (this.indexer.needsInitialBuild()) {
       window.setTimeout(() => {
         void this.refreshIndexInBackground();
       }, 1000);
    } else if (this.settings.indexOptions.autoRefreshOnStartup) {
       // Using setTimeout to not block Obsidian startup
       window.setTimeout(() => {
         void this.refreshIndexInBackground();
       }, 5000);
    }
  }

  onunload() {
    // No watcher or timer may outlive the plugin
    this.vaultWatcher?.dispose();
    this.indexer?.dispose();
  }

  /** Start/stop vault watchers to match the setting and the enabled vaults. */
  public syncWatchers(): void {
    if (!this.vaultWatcher) return;
    if (this.settings.indexOptions.watchVaults === false) {
      this.vaultWatcher.dispose();
      return;
    }
    this.vaultWatcher.sync(this.vaultRegistry.getEnabledVaults());
  }

  async loadSettings() {
    const loaded = ((await this.loadData()) ?? {}) as Partial<MultiVaultSettings>;
    // Clone defaults so pushing to arrays never mutates DEFAULT_SETTINGS,
    // and merge indexOptions so keys added in later versions get defaults
    const defaults = structuredClone(DEFAULT_SETTINGS);
    this.settings = Object.assign(defaults, loaded, {
      indexOptions: Object.assign(defaults.indexOptions, loaded.indexOptions)
    });
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
    
    if (leaf) await workspace.revealLeaf(leaf);
  }

  /** Called by the indexer whenever its file list changes (search is updated by the indexer itself). */
  private onIndexUpdated() {
    this.refreshSidebar();
  }

  private async refreshIndexInBackground(): Promise<void> {
    try {
      await this.indexer.buildFullIndex(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to refresh cross-vault index: ${message}`);
    }
  }
}
