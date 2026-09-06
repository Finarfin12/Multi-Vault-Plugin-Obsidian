import { App, Modal, Notice } from 'obsidian';
import * as fs from 'fs';
import { Indexer } from '../indexer/indexer';
import { IndexedFile } from '../types';
import { FileOpener } from '../file-opener';

export class DuplicateDetectorModal extends Modal {
  private indexer: Indexer;
  private fileOpener: FileOpener;

  constructor(app: App, indexer: Indexer, fileOpener: FileOpener) {
    super(app);
    this.indexer = indexer;
    this.fileOpener = fileOpener;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Duplicate note detector" });
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
             this.renderDiff(group, arr[Number(leftSelect.value)], arr[Number(rightSelect.value)]);
          };
       }
    });
  }

  private renderDiff(group: HTMLElement, a: IndexedFile, b: IndexedFile): void {
    const existing = group.querySelector('.mvn-diff-output');
    if (existing) existing.remove();

    const output = group.createDiv({ cls: 'mvn-diff-output' });
    if (a.id === b.id) {
      output.createEl('p', { text: 'Select two different files to compare.', cls: 'mvn-text-muted' });
      return;
    }

    let textA = '';
    let textB = '';
    try {
      textA = fs.readFileSync(a.absolutePath, 'utf8');
    } catch {
      output.createEl('p', { text: `Failed to read ${a.relativePath}`, cls: 'mvn-text-muted' });
      return;
    }
    try {
      textB = fs.readFileSync(b.absolutePath, 'utf8');
    } catch {
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
    this.contentEl.empty();
  }
}
