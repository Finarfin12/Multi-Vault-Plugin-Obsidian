import { App, SuggestModal } from 'obsidian';
import { IndexedFile } from '../types';
import { SearchEngine } from '../search-engine';
import { FileOpener } from '../file-opener';

export class RecentFilesModal extends SuggestModal<IndexedFile> {
  private searchEngine: SearchEngine;
  private fileOpener: FileOpener;

  constructor(app: App, searchEngine: SearchEngine, fileOpener: FileOpener) {
    super(app);
    this.searchEngine = searchEngine;
    this.fileOpener = fileOpener;
    this.setPlaceholder("Recent files across vaults... (type to filter by vault)");
  }

  getSuggestions(query: string): IndexedFile[] {
    const files = this.searchEngine.getRecentFiles(50);
    if (!query.trim()) {
      return files;
    }
    const lowerQuery = query.toLowerCase();
    return files.filter(f => f.vaultName.toLowerCase().includes(lowerQuery));
  }

  renderSuggestion(file: IndexedFile, el: HTMLElement) {
    el.addClass('mvn-search-result');
    
    const headerEl = el.createDiv({ cls: 'mvn-result-header' });
    headerEl.createSpan({ text: `[${file.vaultName}]`, cls: 'mvn-vault-badge' });
    headerEl.createSpan({ text: file.basename, cls: 'mvn-result-title' });
    
    const date = new Date(file.mtime).toLocaleString();
    el.createDiv({ text: `${file.relativePath} - Last edited: ${date}`, cls: 'mvn-result-path' });
  }

  onChooseSuggestion(file: IndexedFile, evt: MouseEvent | KeyboardEvent) {
    void this.fileOpener.openFile(file);
  }
}
