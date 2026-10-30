import { ItemView, WorkspaceLeaf, MarkdownRenderer, Notice, setIcon, ViewStateResult } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { IndexedFile } from '../types';
import { SearchEngine } from '../search-engine';
import { FileOpener } from '../file-opener';

export const VIEW_TYPE_EXTERNAL_FILE = "mvn-external-file-view";

// Fields needed to re-render the view after Obsidian restores the workspace
type PersistedFile = Pick<IndexedFile, 'id' | 'vaultId' | 'vaultName' | 'absolutePath' | 'relativePath' | 'basename' | 'extension' | 'mtime' | 'size'>;

interface ExternalFileViewState {
  file?: PersistedFile;
}

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
    return "External file";
  }

  getIcon(): string {
    return "document";
  }

  async onOpen() {
    // Actions are now rendered inline next to the metadata badge
  }

  getState(): Record<string, unknown> {
    const state = super.getState();
    if (this.file) {
      const { id, vaultId, vaultName, absolutePath, relativePath, basename, extension, mtime, size } = this.file;
      const file: PersistedFile = { id, vaultId, vaultName, absolutePath, relativePath, basename, extension, mtime, size };
      state.file = file;
    }
    return state;
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const saved = (state as ExternalFileViewState | null)?.file;
    if (saved?.absolutePath) {
      // Prefer the current index entry (fresh tags/links), else the saved copy
      await this.setFile(this.searchEngine.getFileById(saved.id) ?? saved);
    }
    await super.setState(state, result);
  }

  public async setFile(file: IndexedFile) {
    this.file = file;
    try {
      this.content = fs.readFileSync(file.absolutePath, 'utf8');
    } catch {
      this.content = `> [!ERROR] Failed to read file from path: ${file.absolutePath}`;
    }
    // Persist the new file so the tab survives a restart
    this.app.workspace.requestSaveLayout();
    void this.render();
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
    metaDiv.createSpan({ text: `Read-Only • [${this.file.vaultName}]`, cls: 'mvn-text-muted', attr: { style: 'font-size: 0.85em; opacity: 0.7;' } });

    const inlineActions = metaDiv.createDiv({ cls: 'mvn-external-inline-actions', attr: { style: 'display: flex; gap: 5px;' } });
    
    const btnOpen = inlineActions.createSpan({ cls: 'clickable-icon', attr: { 'aria-label': 'Open in source vault' } });
    setIcon(btnOpen, "external-link");
    btnOpen.onclick = () => {
      window.open(`obsidian://open?vault=${encodeURIComponent(this.file!.vaultName)}&file=${encodeURIComponent(this.file!.relativePath)}`);
    };

    const btnLink = inlineActions.createSpan({ cls: 'clickable-icon', attr: { 'aria-label': 'Copy cross-vault link' } });
    setIcon(btnLink, "link");
    btnLink.onclick = async () => {
      const linkText = `[[${this.file!.vaultName}::${this.file!.basename}]]`;
      await navigator.clipboard.writeText(linkText);
      new Notice("Cross-vault link copied to clipboard!");
    };

    const btnCopyEdit = inlineActions.createSpan({ cls: 'clickable-icon', attr: { 'aria-label': 'Copy to current vault & edit' } });
    setIcon(btnCopyEdit, "pencil");
    btnCopyEdit.onclick = () => {
      void this.copyToCurrentVaultAndEdit();
    };

    const contentDiv = sizerInner.createDiv();
    // Render the markdown content
    await MarkdownRenderer.render(this.app, this.content, contentDiv, '', this);
    
    // Smart Image & Link Resolver
    this.resolveMediaAndLinks(contentDiv);

    // Cross-vault backlinks (what links here)
    this.renderBacklinks(sizerInner);
  }

  /**
   * Copy the external note into the ACTIVE vault via the Vault API
   * and open it for editing. Writes never target other vaults directly,
   * which keeps this compliant with Obsidian review expectations
   * (no silent external writes, no bypass of Sync/conflict handling).
   */
  private async copyToCurrentVaultAndEdit(): Promise<void> {
    if (!this.file) return;
    if (this.content.startsWith('> [!ERROR]')) {
      new Notice('Cannot copy: failed to read source file.');
      return;
    }

    const base = this.file.basename.replace(/[\\/:*?"<>|]/g, '').trim() || 'Untitled';
    const candidates = [
      `${base}.md`,
      `${base} (from ${this.file.vaultName}).md`,
    ];
    for (let i = 2; i <= 50; i++) {
      candidates.push(`${base} (from ${this.file.vaultName} ${i}).md`);
    }

    let targetPath: string | null = null;
    for (const c of candidates) {
      if (!this.app.vault.getAbstractFileByPath(c)) {
        targetPath = c;
        break;
      }
    }
    if (!targetPath) {
      new Notice('Could not find a free filename in the current vault.');
      return;
    }

    try {
      const created = await this.app.vault.create(targetPath, this.content);
      await this.app.workspace.openLinkText(created.path, '', true);
      new Notice(`Copied to current vault as ${targetPath}. Source vault untouched.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice(`Failed to copy file: ${msg}`);
    }
  }

  private renderBacklinks(parent: HTMLElement): void {
    if (!this.file) return;
    const backlinks = this.searchEngine.findBacklinks(this.file, 20);

    const section = parent.createDiv({ cls: 'mvn-backlinks' });
    section.createEl('h3', { text: `Backlinks (${backlinks.length})`, cls: 'mvn-backlinks-header' });

    if (backlinks.length === 0) {
      section.createEl('p', {
        text: 'No cross-vault links to this note found in the index. Refresh the index if you recently added links.',
        cls: 'mvn-text-muted mvn-backlinks-empty'
      });
      return;
    }

    const list = section.createDiv({ cls: 'mvn-backlinks-list' });
    for (const b of backlinks) {
      const item = list.createDiv({ cls: 'mvn-backlinks-item' });
      item.createSpan({ text: `[${b.vaultName}]`, cls: 'mvn-backlinks-badge' });
      item.createSpan({ text: ` ${b.basename}`, cls: 'mvn-backlinks-title' });
      item.createEl('small', { text: ` ${b.relativePath}`, cls: 'mvn-text-muted' });
      item.addEventListener('click', () => {
        void this.fileOpener.openFile(b);
      });
    }
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
        if (!absPath.startsWith(path.normalize(vaultRoot))) return;

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
           void this.fileOpener.openFile(results[0].file);
        } else {
           // Fallback if not found
           new Notice(`File "${href}" not found in any indexed vault.`);
        }
      });
    });
  }
}
