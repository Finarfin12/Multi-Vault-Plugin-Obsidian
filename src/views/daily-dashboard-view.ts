import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type MultiVaultNavigatorPlugin from '../main';
import { IndexedFile } from '../types';
import {
  buildDigest, DigestRange, formatDigestMarkdown, formatDay, insertSummaryBlock, RangeKey, resolveRange, VaultDigest
} from '../analysis/digest';

export const VIEW_TYPE_DAILY_DASHBOARD = "mvn-daily-dashboard-view";

export class DailyDashboardView extends ItemView {
  private plugin: MultiVaultNavigatorPlugin;

  private rangeKey: RangeKey = 'today';
  private customFrom = formatDay(Date.now());
  private customTo = formatDay(Date.now());

  constructor(leaf: WorkspaceLeaf, plugin: MultiVaultNavigatorPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_DAILY_DASHBOARD;
  }

  getDisplayText(): string {
    return "Cross-vault daily notes";
  }

  getIcon(): string {
    return "calendar-clock";
  }

  async onOpen() {
    this.render();
  }

  public render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('mvn-daily-dashboard-container');

    container.createEl('h2', { text: 'Cross-vault daily notes' });
    this.renderSummary(container.createDiv({ cls: 'mvn-summary' }));
    container.createEl('h3', { text: 'Daily notes' });
    this.renderDailyList(container);
  }

  // ---- Summary of changes (F13) ------------------------------------------------------

  private renderSummary(parent: HTMLElement) {
    parent.createEl('h3', { text: 'What changed' });

    const bar = parent.createDiv({ cls: 'mvn-summary-bar' });
    const select = bar.createEl('select', { cls: 'mvn-sp-select' });
    ([['today', 'Today'], ['7d', 'Last 7 days'], ['custom', 'Custom range']] as Array<[RangeKey, string]>).forEach(([value, text]) => {
      select.createEl('option', { value, text });
    });
    select.value = this.rangeKey;

    const body = parent.createDiv({ cls: 'mvn-summary-body' });

    const customBar = bar.createDiv({ cls: 'mvn-summary-custom' });
    const fromEl = customBar.createEl('input', { type: 'date', value: this.customFrom });
    customBar.createSpan({ text: ' to ' });
    const toEl = customBar.createEl('input', { type: 'date', value: this.customTo });
    customBar.toggle(this.rangeKey === 'custom');

    const redraw = () => this.drawSummaryBody(body);
    select.addEventListener('change', () => {
      this.rangeKey = select.value as RangeKey;
      customBar.toggle(this.rangeKey === 'custom');
      redraw();
    });
    fromEl.addEventListener('change', () => { this.customFrom = fromEl.value; redraw(); });
    toEl.addEventListener('change', () => { this.customTo = toEl.value; redraw(); });

    redraw();
  }

  private currentRange(): DigestRange | null {
    return resolveRange(this.rangeKey, Date.now(), { from: this.customFrom, to: this.customTo });
  }

  private drawSummaryBody(body: HTMLElement) {
    body.empty();
    const range = this.currentRange();
    if (!range) {
      body.createEl('p', { text: 'Pick a valid range: the first day cannot be after the last day.', cls: 'mvn-text-muted' });
      return;
    }

    const digests = buildDigest(this.plugin.indexer.getIndexedFiles(), range);
    const total = digests.reduce((n, d) => n + d.created + d.modified, 0);

    const head = body.createDiv({ cls: 'mvn-summary-head' });
    head.createSpan({ text: `${range.label}: ${total} note${total === 1 ? '' : 's'} created or changed`, cls: 'mvn-text-muted' });
    const insert = head.createEl('button', { text: 'Insert summary into active note' });
    insert.onclick = () => { void this.insertIntoActiveNote(digests, range); };

    if (digests.length === 0) {
      body.createEl('p', { text: 'No notes were created or changed in this period.', cls: 'mvn-text-muted' });
      return;
    }
    digests.forEach(d => this.renderVaultDigest(body, d));
  }

  private renderVaultDigest(parent: HTMLElement, d: VaultDigest) {
    const group = parent.createDiv({ cls: 'mvn-daily-group' });
    const words = d.wordsComplete || d.wordsAdded > 0 ? `, about +${d.wordsAdded} words${d.wordsComplete ? '' : ' or more'}` : '';
    group.createEl('h4', { text: `${d.vaultName}: ${d.created} created, ${d.modified} modified${words}`, cls: 'mvn-daily-date-header' });

    d.entries.forEach(entry => {
      const item = group.createDiv({ cls: 'mvn-daily-item' });
      item.createSpan({ text: entry.kind === 'created' ? 'New' : 'Edited', cls: 'mvn-daily-vault-badge' });
      item.createSpan({ text: entry.file.basename, cls: 'mvn-daily-title' });
      if (entry.wordsAdded !== undefined && entry.wordsAdded > 0) {
        item.createSpan({ text: ` +${entry.wordsAdded} words`, cls: 'mvn-text-muted' });
      }
      item.addEventListener('click', () => { void this.plugin.fileOpener.openFile(entry.file); });
    });
  }

  /**
   * Writes the summary into the note that is open in the current vault, through the
   * Vault API. Nothing is ever written to another vault; running it again replaces the earlier summary.
   */
  private async insertIntoActiveNote(digests: VaultDigest[], range: DigestRange): Promise<void> {
    const active = this.app.workspace.getActiveFile();
    if (!(active instanceof TFile) || active.extension !== 'md') {
      new Notice('Open the note that should receive the summary (usually today\'s daily note), then try again.');
      return;
    }
    const block = formatDigestMarkdown(digests, range, this.plugin.vaultRegistry.getCurrentVaultId());
    await this.app.vault.process(active, (content) => insertSummaryBlock(content, block));
    new Notice(`Summary inserted into "${active.basename}".`);
  }

  // ---- Daily notes list (unchanged behaviour) ---------------------------------------------

  private renderDailyList(container: Element) {
    // Pattern for YYYY-MM-DD
    const dailyRegex = /^(\d{4}-\d{2}-\d{2})/;
    const files = this.plugin.indexer.getIndexedFiles();

    const dailyNotes = new Map<string, IndexedFile[]>();

    files.forEach(f => {
       const match = f.basename.match(dailyRegex);
       if (match) {
          const dateStr = match[1];
          if (!dailyNotes.has(dateStr)) {
             dailyNotes.set(dateStr, []);
          }
          dailyNotes.get(dateStr)!.push(f);
       }
    });

    if (dailyNotes.size === 0) {
       container.createEl('p', { text: 'No daily notes (yyyy-mm-dd) found.' });
       return;
    }

    // Sort dates descending
    const sortedDates = Array.from(dailyNotes.keys()).sort((a, b) => b.localeCompare(a));

    const listContainer = container.createDiv({ cls: 'mvn-daily-list' });

    sortedDates.forEach(date => {
       const group = listContainer.createDiv({ cls: 'mvn-daily-group' });
       group.createEl('h3', { text: date, cls: 'mvn-daily-date-header' });

       const items = dailyNotes.get(date)!;
       items.forEach(file => {
          const item = group.createDiv({ cls: 'mvn-daily-item' });
          item.createSpan({ text: file.vaultName, cls: 'mvn-daily-vault-badge' });
          item.createSpan({ text: file.basename, cls: 'mvn-daily-title' });

          item.addEventListener('click', () => {
             void this.plugin.fileOpener.openFile(file);
          });
       });
    });
  }
}
