import { App, FuzzySuggestModal } from 'obsidian';
import { Indexer } from '../indexer/indexer';

export class ExcludeSuggestModal extends FuzzySuggestModal<string> {
  private items: string[] = [];
  private onChoose: (item: string) => void;

  constructor(app: App, indexer: Indexer, onChoose: (item: string) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("Search for a file or folder to exclude...");
    
    // Extract unique files and their parent folders
    const paths = new Set<string>();
    indexer.getIndexedFiles().forEach(f => {
      paths.add(f.relativePath);
      const parts = f.relativePath.split('/');
      if (parts.length > 1) {
        paths.add(parts[0]); // top level folder
      }
    });
    this.items = Array.from(paths).sort();
  }

  getItems(): string[] {
    return this.items;
  }

  getItemText(item: string): string {
    return item;
  }

  onChooseItem(item: string, evt: MouseEvent | KeyboardEvent) {
    this.onChoose(item);
  }
}
