import { Extension, Range } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';
import { CrossVaultLink, findCrossVaultLinks, linkAt } from './link-parser';
import { decideClick } from './link-actions';

/** Above this size the document is not scanned (keeps typing smooth in huge notes). */
const MAX_SCAN_CHARS = 2_000_000;

export interface LinkHost {
  /** True when the link points at a note that is in the index. */
  isResolved(link: CrossVaultLink): boolean;
  open(link: CrossVaultLink, newTab: boolean): void;
  openInSourceVault(link: CrossVaultLink): void;
}

/** Visual states of a link, exported for tests. */
export const CLASS_LINK = 'mvn-cross-vault-link';
export const CLASS_UNRESOLVED = 'mvn-cross-vault-link-unresolved';

/**
 * Marks `[[Vault::Note]]` in the editor (F7) and makes it clickable.
 *
 * - Valid links get the link look; links to unknown notes keep the "unresolved" look.
 * - Click opens the read-only view, Ctrl/Cmd+click a new tab, right-click the source vault.
 * - Only the pattern `[[X::Y]]` (outside code) is touched; every other link is left to Obsidian.
 */
export function createLivePreviewExtension(host: LinkHost): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      links: CrossVaultLink[] = [];

      constructor(private view: EditorView) {
        this.scan();
        this.decorate();
        view.dom.addEventListener('mousedown', this.onMouseDown, true);
        view.dom.addEventListener('click', this.onClick, true);
        view.dom.addEventListener('contextmenu', this.onContextMenu, true);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) this.scan();
        if (update.docChanged || update.viewportChanged || update.selectionSet) this.decorate();
      }

      destroy() {
        this.view.dom.removeEventListener('mousedown', this.onMouseDown, true);
        this.view.dom.removeEventListener('click', this.onClick, true);
        this.view.dom.removeEventListener('contextmenu', this.onContextMenu, true);
      }

      private scan() {
        const doc = this.view.state.doc;
        this.links = doc.length > MAX_SCAN_CHARS ? [] : findCrossVaultLinks(doc.toString()).filter(l => !l.embed);
      }

      private decorate() {
        const ranges: Range<Decoration>[] = [];
        for (const link of this.links) {
          if (!this.inViewport(link)) continue;
          const cls = host.isResolved(link) ? CLASS_LINK : `${CLASS_LINK} ${CLASS_UNRESOLVED}`;
          ranges.push(Decoration.mark({ class: cls }).range(link.start, link.end));
        }
        this.decorations = Decoration.set(ranges, true);
      }

      private inViewport(link: CrossVaultLink): boolean {
        return this.view.visibleRanges.some(r => link.start <= r.to && link.end >= r.from);
      }

      private linkFromEvent(event: MouseEvent): CrossVaultLink | undefined {
        const target = event.target;
        if (!(target instanceof Element) || !target.closest(`.${CLASS_LINK}`)) return undefined;
        const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
        return pos === null ? undefined : linkAt(this.links, pos);
      }

      private cursorInside(link: CrossVaultLink): boolean {
        return this.view.state.selection.ranges.some(r => r.from <= link.end && r.to >= link.start);
      }

      private actionFor(event: MouseEvent, link: CrossVaultLink) {
        return decideClick({
          livePreview: this.view.state.field(editorLivePreviewField, false) === true,
          modifier: event.ctrlKey || event.metaKey,
          cursorInsideLink: this.cursorInside(link)
        });
      }

      // Swallow the press so the cursor does not jump into the link we are about to open
      private onMouseDown = (event: MouseEvent) => {
        if (event.button !== 0) return;
        const link = this.linkFromEvent(event);
        if (link && this.actionFor(event, link) !== 'none') {
          event.preventDefault();
          event.stopPropagation();
        }
      };

      private onClick = (event: MouseEvent) => {
        if (event.button !== 0) return;
        const link = this.linkFromEvent(event);
        if (!link) return;
        const action = this.actionFor(event, link);
        if (action === 'none') return;
        // Stop Obsidian core from treating "Vault::Note" as a note to create
        event.preventDefault();
        event.stopPropagation();
        host.open(link, action === 'open-new-tab');
      };

      private onContextMenu = (event: MouseEvent) => {
        const link = this.linkFromEvent(event);
        if (!link) return;
        event.preventDefault();
        event.stopPropagation();
        host.openInSourceVault(link);
      };
    },
    { decorations: (v) => v.decorations }
  );
  return plugin;
}
