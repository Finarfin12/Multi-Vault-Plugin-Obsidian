import { ItemView, WorkspaceLeaf, MarkdownRenderer, Notice } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { IndexedFile } from '../types';
import { SearchEngine } from '../search-engine';
import { FileOpener } from '../file-opener';

export const VIEW_TYPE_EXTERNAL_FILE = "mvn-external-file-view";

export class ExternalFileView extends ItemView {
  private file: IndexedFile | null = null;
  private content: string = "";
  private searchEngine: SearchEngine;
  private fileOpener: FileOpener;

  constructor(leaf: WorkspaceLeaf, searchEngine: SearchEngine, fileOpener: FileOpener) {
    super(leaf);
    this.searchEngine = searchEngine;
    this.fileOpener = fileOpener;
  }

  getViewType(): string {
    return VIEW_TYPE_EXTERNAL_FILE;
  }

  getDisplayText(): string {
    if (this.file) {
      return `[${this.file.vaultName}] ${this.file.basename}`;
    }
    return "External File";
  }

  getIcon(): string {
    return "document";
  }

  async onOpen() {
    this.addAction("external-link", "Open in Source Vault", () => {
      if (this.file) {
        window.open(`obsidian://open?vault=${encodeURIComponent(this.file.vaultName)}&file=${encodeURIComponent(this.file.relativePath)}`);
      }
    });

    this.addAction("link", "Copy Cross-Vault Link", async () => {
      if (this.file) {
        const linkText = `[[${this.file.vaultName}::${this.file.basename}]]`;
        await navigator.clipboard.writeText(linkText);
        new Notice("Cross-Vault Link copied to clipboard!");
      }
    });
  }

  public async setFile(file: IndexedFile) {
    this.file = file;
    try {
      this.content = fs.readFileSync(file.absolutePath, 'utf8');
    } catch (e) {
      this.content = `> [!ERROR] Failed to read file from path: ${file.absolutePath}`;
    }
    this.render();
  }

  private async render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClasses(['markdown-reading-view', 'mvn-external-view']);

    if (!this.file) {
      container.createEl("p", { text: "No file selected." });
      return;
    }

    const sizer = container.createDiv({ cls: 'markdown-preview-view markdown-rendered' });
    const sizerInner = sizer.createDiv({ cls: 'markdown-preview-sizer markdown-preview-section' });

    // Inline title
    sizerInner.createDiv({ cls: 'markdown-preview-pusher', attr: { style: 'width: 1px; height: 0.1px; margin-bottom: 0px;' } });
    sizerInner.createEl('h1', { cls: 'inline-title', text: this.file.basename });
    
    // Metadata badge
    const metaDiv = sizerInner.createDiv({ cls: 'mvn-external-meta', attr: { style: 'margin-bottom: 30px; margin-top: -10px;' } });
    metaDiv.createEl('span', { text: `Read-Only • [${this.file.vaultName}]`, cls: 'mvn-text-muted', attr: { style: 'font-size: 0.85em; opacity: 0.7;' } });

    const contentDiv = sizerInner.createDiv();
    // Render the markdown content
    await MarkdownRenderer.renderMarkdown(this.content, contentDiv, '', this);
    
    // Smart Image & Link Resolver
    this.resolveMediaAndLinks(contentDiv);
  }

  private resolveMediaAndLinks(container: HTMLElement) {
    if (!this.file) return;
    const basePath = path.dirname(this.file.absolutePath);

    // 1. Resolve Images
    const imgs = container.querySelectorAll('img');
    imgs.forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('app://') && !src.startsWith('data:')) {
        const decodedSrc = decodeURIComponent(src);
        const absPath = path.join(basePath, decodedSrc);
        const localUri = `app://local/${absPath.replace(/\\/g, '/')}`;
        img.src = localUri;
      }
    });

    // 2. Resolve Internal Links
    const links = container.querySelectorAll('a.internal-link');
    links.forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const href = a.getAttribute('href');
        if (!href) return;
        
        // Coba cari di indexer lintas vault
        // Kita menggunakan pencarian judul yang akurat (prefix/fuzzy)
        const results = this.searchEngine.search(href.replace('.md', ''), { limit: 5 });
        if (results.length > 0) {
           this.fileOpener.openFile(results[0]);
        } else {
           // Fallback if not found
           new Notice(`File "${href}" not found in any indexed vault.`);
        }
      });
    });
  }
}
