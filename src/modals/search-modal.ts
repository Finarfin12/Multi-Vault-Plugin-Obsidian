import { App, SuggestModal } from 'obsidian';
import { IndexedFile } from '../types';
import { SearchEngine } from '../search-engine';
import { FileOpener } from '../file-opener';

export class SearchModal extends SuggestModal<IndexedFile> {
  private searchEngine: SearchEngine;
  private fileOpener: FileOpener;
  private lastQuery: string = '';

  constructor(app: App, searchEngine: SearchEngine, fileOpener: FileOpener) {
    super(app);
    this.searchEngine = searchEngine;
    this.fileOpener = fileOpener;
    this.setPlaceholder("Search all vaults...");
  }

  getSuggestions(query: string): IndexedFile[] {
    this.lastQuery = query;
    if (!query.trim()) {
      return this.searchEngine.getRecentFiles(10);
    }
    return this.searchEngine.search(query, { limit: 50 });
  }

  renderSuggestion(file: IndexedFile, el: HTMLElement) {
    el.addClass('mvn-search-result');
    
    const headerEl = el.createDiv({ cls: 'mvn-result-header' });
    headerEl.createSpan({ text: `[${file.vaultName}]`, cls: 'mvn-vault-badge' });
    headerEl.createSpan({ text: file.basename, cls: 'mvn-result-title' });
    
    el.createDiv({ text: file.relativePath, cls: 'mvn-result-path' });
    
    if (file.contentPreview) {
       el.createDiv({ text: file.contentPreview, cls: 'mvn-result-preview' });
    }
  }

  onChooseSuggestion(file: IndexedFile, evt: MouseEvent | KeyboardEvent) {
    this.fileOpener.openFile(file);
  }
}
