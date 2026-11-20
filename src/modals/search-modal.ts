import { App, SuggestModal } from 'obsidian';
import { IndexedFile, IndexOptions } from '../types';
import { SearchEngine } from '../search-engine';
import { FileOpener } from '../file-opener';
import { buildSnippet, loadSnippet } from '../search/snippet';
import { runSearch } from '../search/run-search';

type SnippetOptions = Pick<IndexOptions, 'fullText' | 'maxIndexedBytes'>;

export class SearchModal extends SuggestModal<IndexedFile> {
  private searchEngine: SearchEngine;
  private fileOpener: FileOpener;
  private indexOptions: SnippetOptions;
  private lastQuery: string = '';
  /** Matched index terms per file id for the current query (drives the excerpt). */
  private matchedTerms: Map<string, string[]> = new Map();

  constructor(app: App, searchEngine: SearchEngine, fileOpener: FileOpener, indexOptions?: SnippetOptions) {
    super(app);
    this.searchEngine = searchEngine;
    this.fileOpener = fileOpener;
    this.indexOptions = indexOptions ?? { fullText: true, maxIndexedBytes: 200000 };
    this.setPlaceholder("Search all vaults...");
  }

  async getSuggestions(query: string): Promise<IndexedFile[]> {
    this.lastQuery = query;
    this.matchedTerms.clear();
    if (!query.trim()) {
      return this.searchEngine.getRecentFiles(10);
    }
    // Operators (vault:, path:, tag:, modified:, "phrase", -word) are understood here too
    const run = await runSearch(this.searchEngine, query, { limit: 50, maxIndexedBytes: this.indexOptions.maxIndexedBytes });
    if (query !== this.lastQuery) return []; // the user kept typing; a newer call answers
    run.results.forEach(r => this.matchedTerms.set(r.file.id, r.terms.length > 0 ? r.terms : run.highlightTerms));
    return run.results.map(r => r.file);
  }

  renderSuggestion(file: IndexedFile, el: HTMLElement) {
    el.addClass('mvn-search-result');

    const headerEl = el.createDiv({ cls: 'mvn-result-header' });
    headerEl.createSpan({ text: `[${file.vaultName}]`, cls: 'mvn-vault-badge' });
    headerEl.createSpan({ text: file.basename, cls: 'mvn-result-title' });

    el.createDiv({ text: file.relativePath, cls: 'mvn-result-path' });

    const previewEl = file.contentPreview ? el.createDiv({ text: file.contentPreview, cls: 'mvn-result-preview' }) : null;

    // Full-text hit outside the preview: replace it with the part of the note that matched
    const terms = this.matchedTerms.get(file.id);
    if (this.indexOptions.fullText !== false && terms && terms.length > 0
      && !buildSnippet(file.contentPreview ?? '', terms).matched) {
      void loadSnippet(file, terms, this.indexOptions.maxIndexedBytes).then(snippet => {
        if (!snippet || !snippet.matched || !el.isConnected) return;
        if (previewEl) previewEl.setText(snippet.text);
        else el.createDiv({ text: snippet.text, cls: 'mvn-result-preview' });
      });
    }
  }

  onChooseSuggestion(file: IndexedFile, evt: MouseEvent | KeyboardEvent) {
    void this.fileOpener.openFile(file);
  }
}
