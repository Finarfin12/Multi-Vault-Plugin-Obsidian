import { ItemView, WorkspaceLeaf, setIcon, Notice } from 'obsidian';
import MultiVaultNavigatorPlugin from '../main';
import { FileOpener } from '../file-opener';
import { VIEW_TYPE_SEARCH_PAGE, SearchPageView } from './search-page-view';

export const VIEW_TYPE_SIDEBAR = "mvn-sidebar-view";

export class SidebarView extends ItemView {
  private plugin: MultiVaultNavigatorPlugin;
  private fileOpener: FileOpener;

  constructor(leaf: WorkspaceLeaf, plugin: MultiVaultNavigatorPlugin, fileOpener: FileOpener) {
    super(leaf);
    this.plugin = plugin;
    this.fileOpener = fileOpener;
  }

  getViewType(): string {
    return VIEW_TYPE_SIDEBAR;
  }

  getDisplayText(): string {
    return "Multi-Vault Pins & Saves";
  }

  getIcon(): string {
    return "library"; // or 'bookmark', 'layers'
  }

  async onOpen() {
    this.render();
  }

  public render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('mvn-sidebar-container');

    // Pinned Notes
    const pinnedSection = container.createDiv({ cls: 'mvn-cc-section' });
    const pinnedHeader = pinnedSection.createDiv({ cls: 'mvn-cc-header-icon' });
    setIcon(pinnedHeader.createSpan(), 'pin');
    pinnedHeader.createSpan({ text: ' Pinned Notes' });
    
    const pinnedIds = this.plugin.settings.pinnedFiles || [];
    if (pinnedIds.length === 0) {
       pinnedSection.createEl('p', { text: 'No pinned notes yet. Right click a search result to pin it.', cls: 'mvn-text-muted' });
    } else {
       const files = this.plugin.indexer.getIndexedFiles();
       pinnedIds.forEach(id => {
          const file = files.find(f => f.id === id);
          if (file) {
             const el = pinnedSection.createDiv({ cls: 'mvn-cc-item' });
             el.createSpan({ text: file.vaultName, cls: 'mvn-cc-badge' });
             el.createSpan({ text: file.basename, cls: 'mvn-cc-title' });
             el.onclick = () => this.fileOpener.openFile(file);
             
             el.oncontextmenu = async (e) => {
                e.preventDefault();
                this.plugin.settings.pinnedFiles = this.plugin.settings.pinnedFiles.filter(pid => pid !== id);
                await this.plugin.saveSettings();
                this.plugin.refreshSidebar();
             };
          }
       });
    }

    container.createEl('hr');

    // Saved Searches
    const savedSection = container.createDiv({ cls: 'mvn-cc-section' });
    const savedHeader = savedSection.createDiv({ cls: 'mvn-cc-header-icon' });
    setIcon(savedHeader.createSpan(), 'save');
    savedHeader.createSpan({ text: ' Saved Searches' });

    const savedSearches = this.plugin.settings.savedSearches || [];
    if (savedSearches.length === 0) {
       savedSection.createEl('p', { text: 'No saved searches.', cls: 'mvn-text-muted' });
    } else {
       savedSearches.forEach(ss => {
          const el = savedSection.createDiv({ cls: 'mvn-cc-item' });
          const iconEl = el.createSpan({ cls: 'mvn-cc-icon' });
          setIcon(iconEl, 'search');
          el.createSpan({ text: ss.name, cls: 'mvn-cc-title' });
          
          el.onclick = () => {
             // Find SearchPageView and set query
             const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_SEARCH_PAGE);
             if (leaves.length > 0) {
                const view = leaves[0].view as SearchPageView;
                this.app.workspace.revealLeaf(leaves[0]);
                view.setSearchQuery(ss.query);
             } else {
                new Notice("Please open the Cross-Vault Command Center first.");
             }
          };
          
          el.oncontextmenu = async (e) => {
             e.preventDefault();
             this.plugin.settings.savedSearches = this.plugin.settings.savedSearches.filter(s => s.id !== ss.id);
             await this.plugin.saveSettings();
             this.plugin.refreshSidebar();
          };
       });
    }
  }
}
