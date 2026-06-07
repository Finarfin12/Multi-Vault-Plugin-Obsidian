/* eslint-disable obsidianmd/no-unsupported-api */
import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Indexer } from '../indexer/indexer';
import { VIEW_TYPE_SEARCH_PAGE, SearchPageView } from './search-page-view';

export const VIEW_TYPE_TAG_EXPLORER = "mvn-tag-explorer-view";

export class TagExplorerView extends ItemView {
  private indexer: Indexer;

  constructor(leaf: WorkspaceLeaf, indexer: Indexer) {
    super(leaf);
    this.indexer = indexer;
  }

  getViewType(): string {
    return VIEW_TYPE_TAG_EXPLORER;
  }

  getDisplayText(): string {
    return "Global Tag Explorer";
  }

  getIcon(): string {
    return "hashtag";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('mvn-tag-explorer-container');

    container.createEl('h2', { text: 'Global Tag Explorer' });
    container.createEl('p', { text: 'All tags across your configured vaults:', cls: 'mvn-text-muted' });

    const tagCounts = new Map<string, number>();
    const files = this.indexer.getIndexedFiles();

    files.forEach(f => {
      if (f.tags && f.tags.length > 0) {
        f.tags.forEach(tag => {
          const t = tag.toLowerCase();
          tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
        });
      }
    });

    const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);

    if (sortedTags.length === 0) {
       container.createEl('p', { text: 'No tags found in any indexed vault.' });
       return;
    }

    const tagCloud = container.createDiv({ cls: 'mvn-tag-cloud' });
    sortedTags.forEach(([tag, count]) => {
       const tagEl = tagCloud.createDiv({ cls: 'mvn-tag-item' });
       tagEl.createSpan({ text: `#${tag}`, cls: 'mvn-tag-name' });
       tagEl.createSpan({ text: `${count}`, cls: 'mvn-tag-count' });
       
       tagEl.addEventListener('click', () => {
         void (async () => {
           const leaf = this.app.workspace.getLeaf(true);
           await leaf.setViewState({ type: VIEW_TYPE_SEARCH_PAGE, active: true });
           const view = leaf.view;
           if (view instanceof SearchPageView) {
              view.setSearchQuery(`#${tag}`);
           }
            await this.app.workspace.revealLeaf(leaf);
         })();
       });
    });
  }
}
