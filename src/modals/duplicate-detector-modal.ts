import { App, Modal, Notice } from 'obsidian';
import { readTextOrNull } from '../fs-async';
import { Indexer } from '../indexer/indexer';
import { IndexedFile, IndexOptions } from '../types';
import { FileOpener } from '../file-opener';
import { findSimilarNotes, MAX_FILES } from '../analysis/similarity';
import { stripFrontmatter, truncateToBytes } from '../indexer/markdown-parser';

export class DuplicateDetectorModal extends Modal {
  private indexer: Indexer;
  private fileOpener: FileOpener;
  private indexOptions?: Pick<IndexOptions, 'maxIndexedBytes'>;
  private cancelScan = false;
  private closed = false;

  constructor(app: App, indexer: Indexer, fileOpener: FileOpener, indexOptions?: Pick<IndexOptions, 'maxIndexedBytes'>) {
    super(app);
    this.indexer = indexer;
    this.fileOpener = fileOpener;
    this.indexOptions = indexOptions;
  }

  onOpen() {
    this.closed = false;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Duplicate note detector" });

    const modes = contentEl.createDiv({ cls: 'mvn-duplicate-modes' });
    const btnName = modes.createEl('button', { text: 'Same name' });
    const btnContent = modes.createEl('button', { text: 'Similar content' });
    const body = contentEl.createDiv({ cls: 'mvn-duplicate-body' });

    const show = (mode: 'name' | 'content') => {
      this.cancelScan = true; // stop a running scan when switching modes
      body.empty();
      btnName.toggleClass('mod-cta', mode === 'name');
      btnContent.toggleClass('mod-cta', mode === 'content');
      if (mode === 'name') this.renderNameMode(body);
      else this.renderContentMode(body);
    };
    btnName.onclick = () => show('name');
    btnContent.onclick = () => show('content');
    show('name');
  }

  /** Mode 1: notes that share the exact same name. */
  private renderNameMode(contentEl: HTMLElement) {
    contentEl.createEl("p", { text: "Detects files with the exact same name across different vaults." });

    const files = this.indexer.getIndexedFiles();
    const nameMap = new Map<string, IndexedFile[]>();

    files.forEach(f => {
       const key = f.basename.toLowerCase();
       if (!nameMap.has(key)) nameMap.set(key, []);
       nameMap.get(key)!.push(f);
    });

    const duplicates = Array.from(nameMap.entries()).filter(([_, arr]) => arr.length > 1);

    if (duplicates.length === 0) {
       contentEl.createEl("p", { text: "No duplicate names found across vaults! 🎉" });
       return;
    }

    const container = contentEl.createDiv({ cls: 'mvn-duplicates-container' });

    duplicates.forEach(([name, arr]) => {
       const group = container.createDiv({ cls: 'mvn-duplicate-group' });
       group.createEl("h3", { text: arr[0].basename });

       arr.forEach(file => {
          const item = group.createDiv({ cls: 'mvn-duplicate-item' });
          item.createSpan({ text: file.vaultName, cls: 'mvn-duplicate-vault-badge' });
          item.createSpan({ text: file.relativePath, cls: 'mvn-duplicate-path' });
          const btnOpen = item.createEl('button', { text: 'Open' });
          btnOpen.onclick = () => {
             void this.fileOpener.openFile(file);
          };
       });

       if (arr.length >= 2) {
          const compareBar = group.createDiv({ cls: 'mvn-duplicate-compare-bar' });
          const leftSelect = compareBar.createEl('select', { cls: 'mvn-duplicate-select' });
          const rightSelect = compareBar.createEl('select', { cls: 'mvn-duplicate-select' });
          arr.forEach((f, idx) => {
             leftSelect.createEl('option', { value: String(idx), text: `[${f.vaultName}] ${f.relativePath}` });
             rightSelect.createEl('option', { value: String(idx), text: `[${f.vaultName}] ${f.relativePath}` });
          });
          leftSelect.value = '0';
          rightSelect.value = '1';
          const btnCompare = compareBar.createEl('button', { text: 'Compare' });
          btnCompare.onclick = () => {
             void this.renderDiff(group, arr[Number(leftSelect.value)], arr[Number(rightSelect.value)]);
          };
       }
    });
  }

  /** Mode 2 (F11): notes whose content is mostly the same, whatever their names. */
  private renderContentMode(contentEl: HTMLElement) {
    contentEl.createEl("p", {
      text: "Finds notes whose text is mostly the same, even when their names differ. Short notes (under 8 words) are skipped. Nothing is changed or sent anywhere."
    });

    const bar = contentEl.createDiv({ cls: 'mvn-duplicate-compare-bar' });
    bar.createSpan({ text: 'Minimum similarity (%)' });
    const thresholdEl = bar.createEl('input', { type: 'number', value: '80', cls: 'mvn-duplicate-threshold' });
    thresholdEl.min = '50';
    thresholdEl.max = '100';
    const btnScan = bar.createEl('button', { text: 'Scan', cls: 'mod-cta' });
    const btnStop = bar.createEl('button', { text: 'Stop' });
    btnStop.disabled = true;

    const status = contentEl.createDiv({ cls: 'mvn-text-muted' });
    const results = contentEl.createDiv({ cls: 'mvn-duplicates-container' });

    btnStop.onclick = () => { this.cancelScan = true; };
    btnScan.onclick = () => {
      const percent = Math.min(100, Math.max(50, parseInt(thresholdEl.value, 10) || 80));
      thresholdEl.value = String(percent);
      void this.runContentScan(percent / 100, btnScan, btnStop, status, results);
    };
  }

  private async runContentScan(
    threshold: number,
    btnScan: HTMLButtonElement,
    btnStop: HTMLButtonElement,
    status: HTMLElement,
    results: HTMLElement
  ): Promise<void> {
    results.empty();
    this.cancelScan = false;
    btnScan.disabled = true;
    btnStop.disabled = false;
    status.setText('Reading notes…');

    const maxBytes = this.indexOptions?.maxIndexedBytes ?? 200000;
    const result = await findSimilarNotes(this.indexer.getIndexedFiles(), {
      threshold,
      read: async (file) => {
        const raw = await readTextOrNull(file.absolutePath);
        return raw === null ? null : truncateToBytes(stripFrontmatter(raw), maxBytes);
      },
      onProgress: (done, total, phase) => {
        if (!this.closed) status.setText(phase === 'reading' ? `Reading notes… ${done}/${total}` : `Comparing… ${done}/${total}`);
      },
      isCancelled: () => this.cancelScan || this.closed
    });

    if (this.closed) return;
    btnScan.disabled = false;
    btnStop.disabled = true;

    if (result.cancelled) {
      status.setText('Scan stopped.');
      return;
    }

    const notes: string[] = [`${result.pairs.length} similar pair${result.pairs.length === 1 ? '' : 's'} found`];
    if (result.skipped > 0) notes.push(`${result.skipped} short or unreadable notes skipped`);
    if (result.truncated) notes.push(`only the first ${MAX_FILES} notes were compared`);
    if (result.capped) notes.push('list cut at the first pairs; raise the minimum similarity to narrow it');
    status.setText(notes.join(' · '));

    result.pairs.slice(0, 200).forEach(pair => {
      const group = results.createDiv({ cls: 'mvn-duplicate-group' });
      group.createEl('h3', { text: `${Math.round(pair.similarity * 100)}% similar` });
      [pair.a, pair.b].forEach(file => {
        const item = group.createDiv({ cls: 'mvn-duplicate-item' });
        item.createSpan({ text: file.vaultName, cls: 'mvn-duplicate-vault-badge' });
        item.createSpan({ text: file.relativePath, cls: 'mvn-duplicate-path' });
        const btnOpen = item.createEl('button', { text: 'Open' });
        btnOpen.onclick = () => { void this.fileOpener.openFile(file); };
      });
      const btnCompare = group.createEl('button', { text: 'Compare' });
      btnCompare.onclick = () => { void this.renderDiff(group, pair.a, pair.b); };
    });
    if (result.pairs.length > 200) {
      results.createEl('p', { text: `Showing the 200 most similar of ${result.pairs.length}.`, cls: 'mvn-text-muted' });
    }
  }

  private async renderDiff(group: HTMLElement, a: IndexedFile, b: IndexedFile): Promise<void> {
    const existing = group.querySelector('.mvn-diff-output');
    if (existing) existing.remove();

    const output = group.createDiv({ cls: 'mvn-diff-output' });
    if (a.id === b.id) {
      output.createEl('p', { text: 'Select two different files to compare.', cls: 'mvn-text-muted' });
      return;
    }

    const [textA, textB] = await Promise.all([readTextOrNull(a.absolutePath), readTextOrNull(b.absolutePath)]);
    if (!output.isConnected) return; // a newer comparison replaced this one while reading
    if (textA === null) {
      output.createEl('p', { text: `Failed to read ${a.relativePath}`, cls: 'mvn-text-muted' });
      return;
    }
    if (textB === null) {
      output.createEl('p', { text: `Failed to read ${b.relativePath}`, cls: 'mvn-text-muted' });
      return;
    }

    if (textA === textB) {
      output.createEl('p', { text: 'Files are identical.', cls: 'mvn-diff-identical' });
      return;
    }

    const MAX_LINES = 400;
    let aLines = textA.split('\n');
    let bLines = textB.split('\n');
    let truncated = false;
    if (aLines.length > MAX_LINES || bLines.length > MAX_LINES) {
      aLines = aLines.slice(0, MAX_LINES);
      bLines = bLines.slice(0, MAX_LINES);
      truncated = true;
    }

    output.createEl('p', {
      text: `Diff: [${a.vaultName}] ${a.relativePath} ↔ [${b.vaultName}] ${b.relativePath}${truncated ? ` (truncated to first ${MAX_LINES} lines)` : ''}`,
      cls: 'mvn-text-muted'
    });

    const ops = this.lineDiff(aLines, bLines);
    const pre = output.createDiv({ cls: 'mvn-diff-lines' });
    for (const op of ops) {
      const line = pre.createDiv({ cls: `mvn-diff-line mvn-diff-${op.kind}` });
      line.createSpan({ text: op.kind === 'del' ? '− ' : op.kind === 'add' ? '+ ' : '  ', cls: 'mvn-diff-gutter' });
      line.createSpan({ text: op.text || ' ' });
    }
    new Notice('Diff rendered.');
  }

  private lineDiff(a: string[], b: string[]): { kind: 'same' | 'del' | 'add', text: string }[] {
    const n = a.length;
    const m = b.length;
    // LCS DP table (capped sizes keep this cheap)
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const ops: { kind: 'same' | 'del' | 'add', text: string }[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        ops.push({ kind: 'same', text: a[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ kind: 'del', text: a[i] });
        i++;
      } else {
        ops.push({ kind: 'add', text: b[j] });
        j++;
      }
    }
    while (i < n) {
      ops.push({ kind: 'del', text: a[i] });
      i++;
    }
    while (j < m) {
      ops.push({ kind: 'add', text: b[j] });
      j++;
    }
    return ops;
  }

  onClose() {
    this.closed = true;
    this.cancelScan = true;
    this.contentEl.empty();
  }
}
