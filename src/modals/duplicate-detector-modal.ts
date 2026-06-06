import { App, Modal } from 'obsidian';
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
    contentEl.createEl("h2", { text: "Duplicate Note Detector" });
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
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
