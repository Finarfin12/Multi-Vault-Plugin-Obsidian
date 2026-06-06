import { ItemView, WorkspaceLeaf, setIcon, Notice, sanitizeHTMLToDom } from 'obsidian';
import { SearchEngine } from '../search-engine';
import { FileOpener } from '../file-opener';

import MultiVaultNavigatorPlugin from '../main';
import { PromptModal } from '../modals/prompt-modal';

export const VIEW_TYPE_SEARCH_PAGE = "mvn-search-page-view";

interface AppWithCommands {
    commands: {
        executeCommandById(id: string): void;
    };
}

export class SearchPageView extends ItemView {
  private plugin: MultiVaultNavigatorPlugin;
  private searchEngine: SearchEngine;
  private fileOpener: FileOpener;
  private searchInputEl!: HTMLInputElement;
  private resultsContainerEl!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, plugin: MultiVaultNavigatorPlugin, searchEngine: SearchEngine, fileOpener: FileOpener) {
    super(leaf);
    this.plugin = plugin;
    this.searchEngine = searchEngine;
    this.fileOpener = fileOpener;
  }

  getViewType(): string {
    return VIEW_TYPE_SEARCH_PAGE;
  }

  getDisplayText(): string {
    return "Cross-Vault Command Center";
  }

  getIcon(): string {
    return "search";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('mvn-command-center');

    // Layout: Sidebar (left) + Main (right)
    // Main Area
    const mainEl = container.createDiv({ cls: 'mvn-cc-main' });

    const searchHeader = mainEl.createDiv({ cls: 'mvn-sp-header' });
    searchHeader.createEl('h1', { text: 'Multi-Vault Navigator' });
    searchHeader.createEl('p', { text: 'Search across all your vaults instantly.' });

    const searchBox = searchHeader.createDiv({ cls: 'mvn-sp-search-box' });
    this.searchInputEl = searchBox.createEl('input', {
      type: 'text',
      placeholder: 'Search notes, #tags, or paths...',
      cls: 'mvn-sp-input'
    });

    // Quick Actions
    const quickActions = searchHeader.createDiv({ cls: 'mvn-cc-quick-actions' });
    
    const btnSearchAll = quickActions.createEl('button', { cls: 'mvn-btn-icon' });
    setIcon(btnSearchAll.createSpan(), 'search');
    btnSearchAll.createSpan({ text: 'Search Vaults' });
    btnSearchAll.onclick = () => (this.app as unknown as AppWithCommands).commands.executeCommandById('multi-vault-navigator:multi-vault-search');

    const btnRecent = quickActions.createEl('button', { cls: 'mvn-btn-icon' });
    setIcon(btnRecent.createSpan(), 'clock');
    btnRecent.createSpan({ text: 'Recent Files' });
    btnRecent.onclick = () => (this.app as unknown as AppWithCommands).commands.executeCommandById('multi-vault-navigator:multi-vault-recent');
    
    const btnSwitch = quickActions.createEl('button', { cls: 'mvn-btn-icon' });
    setIcon(btnSwitch.createSpan(), 'folder-open');
    btnSwitch.createSpan({ text: 'Switch Vault' });
    btnSwitch.onclick = () => (this.app as unknown as AppWithCommands).commands.executeCommandById('multi-vault-navigator:multi-vault-switch');

    const btnTags = quickActions.createEl('button', { cls: 'mvn-btn-icon' });
    setIcon(btnTags.createSpan(), 'tags');
    btnTags.createSpan({ text: 'Tag Explorer' });
    btnTags.onclick = () => (this.app as unknown as AppWithCommands).commands.executeCommandById('multi-vault-navigator:multi-vault-tag-explorer');

    const btnDaily = quickActions.createEl('button', { cls: 'mvn-btn-icon' });
    setIcon(btnDaily.createSpan(), 'calendar-days');
    btnDaily.createSpan({ text: 'Daily Notes' });
    btnDaily.onclick = () => (this.app as unknown as AppWithCommands).commands.executeCommandById('multi-vault-navigator:multi-vault-daily-dashboard');

    const btnDupes = quickActions.createEl('button', { cls: 'mvn-btn-icon' });
    setIcon(btnDupes.createSpan(), 'copy');
    btnDupes.createSpan({ text: 'Duplicates' });
    btnDupes.onclick = () => (this.app as unknown as AppWithCommands).commands.executeCommandById('multi-vault-navigator:multi-vault-duplicates');

    const btnMove = quickActions.createEl('button', { cls: 'mvn-btn-icon' });
    setIcon(btnMove.createSpan(), 'arrow-right-left');
    btnMove.createSpan({ text: 'Move/Copy' });
    btnMove.onclick = () => (this.app as unknown as AppWithCommands).commands.executeCommandById('multi-vault-navigator:multi-vault-move-copy');

    this.resultsContainerEl = mainEl.createDiv({ cls: 'mvn-sp-results' });

    this.searchInputEl.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value;
      this.performSearch(query);
    });

    this.performSearch('');
  }



  public setSearchQuery(query: string) {
    if (this.searchInputEl) {
       this.searchInputEl.value = query;
       this.performSearch(query);
    }
  }

  private performSearch(rawQuery: string) {
    this.resultsContainerEl.empty();

    const tags: string[] = [];
    const queryParts: string[] = [];

    rawQuery.split(/\s+/).forEach(part => {
      if (part.startsWith('#')) {
        tags.push(part);
      } else if (part.length > 0) {
        queryParts.push(part);
      }
    });

    const query = queryParts.join(' ');

    if (!query.trim() && tags.length === 0) {
      const emptyState = this.resultsContainerEl.createDiv({ cls: 'mvn-sp-empty' });
      emptyState.createEl('div', { text: 'Mulai mengetik untuk mencari file atau filter dengan #tag...', cls: 'mvn-text-muted' });
      return;
    }

    const results = this.searchEngine.search(query, { limit: 20, tags });

    if (results.length === 0) {
      const emptyState = this.resultsContainerEl.createDiv({ cls: 'mvn-sp-empty' });
      emptyState.createEl('div', { text: 'No matching results found.', cls: 'mvn-text-muted' });
      const btnSave = emptyState.createEl('button', { cls: 'mvn-btn-icon' });
      setIcon(btnSave.createSpan(), 'save');
      btnSave.createSpan({ text: 'Save this search' });
      btnSave.onclick = () => {
         new PromptModal(this.app, "Enter a name for this saved search:", query, (name) => {
            if (name) {
               this.plugin.settings.savedSearches.push({ id: Date.now().toString(), name, query });
               this.plugin.saveSettings().then(() => {
                 this.plugin.refreshSidebar();
               }).catch(console.error);
            }
         }).open();
      };
      return;
    }

    const resultHeader = this.resultsContainerEl.createDiv({ cls: 'mvn-sp-result-header' });
    resultHeader.createEl('span', { text: `Showing ${results.length} top results` });
    
    // Add Save Search Button
    const btnSave = resultHeader.createEl('button', { cls: 'mvn-btn-small mvn-btn-icon' });
    setIcon(btnSave.createSpan(), 'save');
    btnSave.createSpan({ text: 'Save search' });
    btnSave.onclick = () => {
       new PromptModal(this.app, "Enter a name for this saved search:", query, (name) => {
          if (name) {
             this.plugin.settings.savedSearches.push({ id: Date.now().toString(), name, query });
             this.plugin.saveSettings().then(() => {
                this.plugin.refreshSidebar();
             }).catch(console.error);
          }
       }).open();
    };

    results.forEach(result => {
      const file = result.file;
      const itemEl = this.resultsContainerEl.createDiv({ cls: 'mvn-sp-result-item' });
      
      const titleEl = itemEl.createDiv({ cls: 'mvn-sp-title' });
      titleEl.innerText = file.basename;

      const pathEl = itemEl.createDiv({ cls: 'mvn-sp-path' });
      pathEl.innerText = `[${file.vaultName}] ${file.relativePath}`;

      if (file.contentPreview) {
        const snippetEl = itemEl.createDiv({ cls: 'mvn-sp-snippet' });
        const matchTerms = Object.keys(result.match || {});
        const highlightTerms = [...new Set([...matchTerms, ...queryParts])];
        snippetEl.appendChild(sanitizeHTMLToDom(this.getHighlightedSnippet(file.contentPreview, highlightTerms)));
      }

      if (file.tags && file.tags.length > 0) {
        const tagsContainer = itemEl.createDiv({ cls: 'mvn-sp-tags-container' });
        file.tags.forEach(tag => {
           tagsContainer.createSpan({ cls: 'mvn-sp-tag', text: tag });
        });
      }

      itemEl.addEventListener('click', () => {
        void this.fileOpener.openFile(file);
      });
      
      itemEl.oncontextmenu = async (e) => {
         e.preventDefault();
         if (this.plugin.settings.pinnedFiles.includes(file.id)) {
            this.plugin.settings.pinnedFiles = this.plugin.settings.pinnedFiles.filter(id => id !== file.id);
            new Notice(`Unpinned ${file.basename}`);
         } else {
            this.plugin.settings.pinnedFiles.push(file.id);
            new Notice(`Pinned ${file.basename}`);
         }
         await this.plugin.saveSettings();
         this.plugin.refreshSidebar();
      };
    });
  }

  private getHighlightedSnippet(preview: string, terms: string[]): string {
    if (!preview) return '';
    
    const escapeHtml = (unsafe: string) => {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    };

    if (terms.length === 0) {
       return escapeHtml(preview.substring(0, 200)) + "...";
    }

    const lowerPreview = preview.toLowerCase();
    let firstMatchIdx = -1;
    let matchedTerm = "";

    for (const term of terms) {
      if (term.length < 2) continue;
      const idx = lowerPreview.indexOf(term.toLowerCase());
      if (idx !== -1 && (firstMatchIdx === -1 || idx < firstMatchIdx)) {
        firstMatchIdx = idx;
        matchedTerm = term;
      }
    }

    if (firstMatchIdx === -1) {
       return escapeHtml(preview.substring(0, 200)) + "...";
    }

    const contextRadius = 80;
    let start = Math.max(0, firstMatchIdx - contextRadius);
    let end = Math.min(preview.length, firstMatchIdx + matchedTerm.length + contextRadius);

    let snippet = preview.substring(start, end);
    let prefix = start > 0 ? "..." : "";
    let suffix = end < preview.length ? "..." : "";

    let escapedSnippet = escapeHtml(snippet);

    for (const term of terms) {
       if (term.length < 2) continue;
       const escapedTerm = escapeHtml(term);
       // Escape special regex chars
       const safeRegexTerm = escapedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
       const regex = new RegExp(`(${safeRegexTerm})`, 'gi');
       escapedSnippet = escapedSnippet.replace(regex, '<mark>$1</mark>');
    }

    return prefix + escapedSnippet + suffix;
  }
}
