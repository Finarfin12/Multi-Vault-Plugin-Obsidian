import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import type MultiVaultNavigatorPlugin from '../main';
import type { IndexedFile } from '../types';
import {
  buildInsertion,
  detectTrigger,
  LinkTrigger,
  suggestHeadings,
  suggestNotes,
  targetForTrigger
} from './link-suggest-core';

export interface LinkSuggestion {
  file: IndexedFile;
  /** Set when a heading of `file` is suggested. */
  heading?: string;
  vaultName: string;
}

/**
 * Autocomplete for `[[Vault::` (F8). It only wakes up once the text before the
 * cursor is `[[<known vault name>::...`, so Obsidian's own `[[` suggestions are untouched.
 */
export class VaultLinkSuggest extends EditorSuggest<LinkSuggestion> {
  private plugin: MultiVaultNavigatorPlugin;
  private trigger: LinkTrigger | null = null;

  constructor(app: App, plugin: MultiVaultNavigatorPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
    const before = editor.getLine(cursor.line).slice(0, cursor.ch);
    const trigger = detectTrigger(before);
    if (!trigger) return null;
    const vault = this.plugin.vaultRegistry.findVault(undefined, trigger.vaultTyped);
    if (!vault) return null; // "[[Foo::" where Foo is not a registered vault: not ours
    this.trigger = { ...trigger, vaultTyped: vault.name };
    return { start: { line: cursor.line, ch: trigger.startCh }, end: cursor, query: trigger.query };
  }

  getSuggestions(_context: EditorSuggestContext): LinkSuggestion[] {
    const trigger = this.trigger;
    if (!trigger) return [];
    const files = this.plugin.indexer.getIndexedFiles();

    if (trigger.kind === 'heading') {
      const file = targetForTrigger(files, trigger);
      if (!file) return [];
      return suggestHeadings(file, trigger.query).map(heading => ({ file, heading, vaultName: trigger.vaultTyped }));
    }
    return suggestNotes(files, trigger.vaultTyped, trigger.query).map(file => ({ file, vaultName: trigger.vaultTyped }));
  }

  renderSuggestion(suggestion: LinkSuggestion, el: HTMLElement): void {
    if (suggestion.heading) {
      el.createDiv({ text: suggestion.heading, cls: 'mvn-suggest-title' });
      el.createDiv({ text: `${suggestion.file.basename} › headings`, cls: 'mvn-suggest-path' });
    } else {
      el.createDiv({ text: suggestion.file.basename, cls: 'mvn-suggest-title' });
      el.createDiv({ text: `[${suggestion.file.vaultName}] ${suggestion.file.relativePath}`, cls: 'mvn-suggest-path' });
    }
  }

  selectSuggestion(suggestion: LinkSuggestion, _evt: MouseEvent | KeyboardEvent): void {
    const context = this.context;
    if (!context) return;
    const { editor, start, end } = context;

    const text = buildInsertion(suggestion.vaultName, suggestion.file, this.plugin.indexer.getIndexedFiles(), suggestion.heading);
    // Obsidian auto-closes brackets: swallow a "]]" that already follows the cursor
    const after = editor.getLine(end.line).slice(end.ch);
    const stop: EditorPosition = after.startsWith(']]') ? { line: end.line, ch: end.ch + 2 } : end;

    editor.replaceRange(text, start, stop);
    editor.setCursor({ line: start.line, ch: start.ch + text.length });
  }
}
