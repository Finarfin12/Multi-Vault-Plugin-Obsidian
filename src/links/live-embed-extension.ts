import { EditorState, Extension, Range, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { Component } from 'obsidian';
import { CrossVaultLink, findCrossVaultLinks } from './link-parser';
import { embedDepth, EmbedHost, renderEmbed } from './embed-renderer';

const MAX_SCAN_CHARS = 2_000_000;

class EmbedWidget extends WidgetType {
  private owner: Component | null = null;

  constructor(private host: EmbedHost, private link: CrossVaultLink) {
    super();
  }

  eq(other: EmbedWidget): boolean {
    return other.link.raw === this.link.raw;
  }

  toDOM(): HTMLElement {
    const container = createDiv({ cls: 'mvn-embed-widget' });
    const owner = new Component();
    owner.load();
    this.owner = owner;
    // Widgets in the editor are top-level embeds; nested ones are handled by the post-processor
    void renderEmbed(this.host, container, this.link, embedDepth(container), owner);
    return container;
  }

  destroy(): void {
    this.owner?.unload();
    this.owner = null;
  }

  ignoreEvent(): boolean {
    // The widget handles its own clicks (the "Open" button, links inside the embedded note)
    return true;
  }
}

/**
 * Live Preview embeds (F9): a line that consists of just `![[Vault::Note]]`
 * (optionally `#Heading`) is shown as a read-only embedded block while the
 * cursor is elsewhere. With the cursor on the line the raw text is shown so
 * it stays editable. Embeds that share a line with other text are left alone.
 */
export function createLiveEmbedExtension(host: EmbedHost): Extension {
  const build = (state: EditorState): DecorationSet => {
    const doc = state.doc;
    if (doc.length > MAX_SCAN_CHARS) return Decoration.none;
    const ranges: Range<Decoration>[] = [];
    for (const link of findCrossVaultLinks(doc.toString())) {
      if (!link.embed) continue;
      const line = doc.lineAt(link.start);
      if (line.text.trim() !== link.raw || line.from + line.text.indexOf(link.raw) !== link.start) continue;
      if (state.selection.ranges.some(r => r.from <= line.to && r.to >= line.from)) continue;
      ranges.push(Decoration.replace({ widget: new EmbedWidget(host, link), block: true }).range(line.from, line.to));
    }
    return Decoration.set(ranges, true);
  };

  const field = StateField.define<DecorationSet>({
    create: (state) => build(state),
    update: (value, tr) => (tr.docChanged || tr.selection ? build(tr.state) : value),
    provide: (f) => EditorView.decorations.from(f)
  });
  return field;
}
