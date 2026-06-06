import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Indexer } from '../indexer/indexer';
import { FileOpener } from '../file-opener';
import { IndexedFile } from '../types';

export const VIEW_TYPE_DAILY_DASHBOARD = "mvn-daily-dashboard-view";

export class DailyDashboardView extends ItemView {
  private indexer: Indexer;
  private fileOpener: FileOpener;

  constructor(leaf: WorkspaceLeaf, indexer: Indexer, fileOpener: FileOpener) {
    super(leaf);
    this.indexer = indexer;
    this.fileOpener = fileOpener;
  }

  getViewType(): string {
    return VIEW_TYPE_DAILY_DASHBOARD;
  }

  getDisplayText(): string {
    return "Cross-Vault Daily Notes";
  }

  getIcon(): string {
    return "calendar-clock";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('mvn-daily-dashboard-container');

    container.createEl('h2', { text: 'Cross-Vault Daily Notes' });
    
    // Pattern for YYYY-MM-DD
    const dailyRegex = /^(\d{4}-\d{2}-\d{2})/;
    const files = this.indexer.getIndexedFiles();
    
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
       container.createEl('p', { text: 'No daily notes (YYYY-MM-DD) found.' });
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
             void this.fileOpener.openFile(file);
          });
       });
    });
  }
}
