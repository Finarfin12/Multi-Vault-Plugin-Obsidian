import { ItemView, WorkspaceLeaf, MarkdownRenderer, Notice, setIcon } from 'obsidian';
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
    // Actions are now rendered inline next to the metadata badge
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
    const sizerInner = sizer.createDiv({ cls: 'markdown-preview-sizer markdown-preview-section', attr: { style: 'max-width: var(--file-line-width, 700px); margin: 0 auto;' } });

    // Inline title
    sizerInner.createDiv({ cls: 'markdown-preview-pusher', attr: { style: 'width: 1px; height: 0.1px; margin-bottom: 0px;' } });
    sizerInner.createEl('h1', { cls: 'inline-title', text: this.file.basename });
    
    // Metadata badge & actions
    const metaDiv = sizerInner.createDiv({ cls: 'mvn-external-meta', attr: { style: 'display: flex; align-items: center; gap: 10px; margin-bottom: 30px; margin-top: -10px;' } });
    metaDiv.createEl('span', { text: `Read-Only • [${this.file.vaultName}]`, cls: 'mvn-text-muted', attr: { style: 'font-size: 0.85em; opacity: 0.7;' } });

    const inlineActions = metaDiv.createDiv({ cls: 'mvn-external-inline-actions', attr: { style: 'display: flex; gap: 5px;' } });
    
    const btnOpen = inlineActions.createEl('span', { cls: 'clickable-icon', attr: { 'aria-label': 'Open in Source Vault' } });
    setIcon(btnOpen, "external-link");
    btnOpen.onclick = () => {
      window.open(`obsidian://open?vault=${encodeURIComponent(this.file!.vaultName)}&file=${encodeURIComponent(this.file!.relativePath)}`);
    };

    const btnLink = inlineActions.createEl('span', { cls: 'clickable-icon', attr: { 'aria-label': 'Copy Cross-Vault Link' } });
    setIcon(btnLink, "link");
    btnLink.onclick = async () => {
      const linkText = `[[${this.file!.vaultName}::${this.file!.basename}]]`;
      await navigator.clipboard.writeText(linkText);
      new Notice("Cross-Vault Link copied to clipboard!");
    };

    const contentDiv = sizerInner.createDiv();
    // Render the markdown content
    await MarkdownRenderer.renderMarkdown(this.content, contentDiv, '', this);
    
    // Smart Image & Link Resolver
    this.resolveMediaAndLinks(contentDiv);
  }

  private resolveMediaAndLinks(container: HTMLElement) {
    if (!this.file) return;
    const basePath = path.dirname(this.file.absolutePath);
    const vaultRoot = this.file.absolutePath.substring(0, this.file.absolutePath.length - this.file.relativePath.length);

    // 1. Resolve Images
    const imgs = container.querySelectorAll('img');
    imgs.forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('app://') && !src.startsWith('data:')) {
        const decodedSrc = decodeURIComponent(src);
        const absPath = path.normalize(path.join(basePath, decodedSrc));
        
        // Security: Prevent path traversal outside the vault boundary
        if (!absPath.startsWith(path.normalize(vaultRoot))) {
           console.warn("Multi-Vault Navigator: Blocked image path traversal outside vault boundary.", absPath);
           return;
        }

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
