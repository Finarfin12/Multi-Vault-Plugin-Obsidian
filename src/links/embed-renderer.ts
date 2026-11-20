import { App, Component, MarkdownRenderer } from 'obsidian';
import type { IndexedFile } from '../types';
import { CrossVaultRef, formatCrossVaultLink } from './link-parser';
import { stripFrontmatter, truncateToBytes } from '../indexer/markdown-parser';

/** An embed inside an embed inside a note is the deepest one rendered (stops A -> B -> A loops). */
export const MAX_EMBED_DEPTH = 2;
export const CLASS_EMBED = 'mvn-embed';

/** Notes longer than this are cut when embedded, so one huge note cannot freeze the editor. */
const MAX_EMBED_BYTES = 200000;

const normalizeHeading = (h: string) => h.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * The part of a note under `heading`: from that heading line up to (not
 * including) the next heading of the same or a higher level. Returns null when
 * the heading does not exist. Headings inside fenced code are ignored.
 */
export function extractSection(markdown: string, heading: string): string | null {
  const wanted = normalizeHeading(heading);
  const lines = markdown.split('\n');
  let inFence = false;
  let start = -1;
  let level = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^ {0,3}(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    if (start === -1) {
      if (normalizeHeading(m[2]) === wanted) {
        start = i;
        level = m[1].length;
      }
    } else if (m[1].length <= level) {
      return lines.slice(start, i).join('\n').trimEnd();
    }
  }
  return start === -1 ? null : lines.slice(start).join('\n').trimEnd();
}

/** Nesting depth of an embed element: 1 for an embed in a normal note, 2 inside another embed, ... */
export function embedDepth(el: Element): number {
  let depth = 1;
  let parent = el.parentElement;
  while (parent) {
    if (parent.classList.contains(CLASS_EMBED)) depth++;
    parent = parent.parentElement;
  }
  return depth;
}

export interface EmbedHost {
  app: App;
  findTarget(ref: CrossVaultRef): IndexedFile | undefined;
  read(file: IndexedFile): Promise<string | null>;
  open(file: IndexedFile): void;
}

/**
 * Render a read-only embed of another vault's note (or one heading of it)
 * into `container`. `depth` is the nesting level of this embed; beyond
 * MAX_EMBED_DEPTH only a notice is shown. `owner` controls the lifetime of the
 * rendered content.
 */
export async function renderEmbed(host: EmbedHost, container: HTMLElement, ref: CrossVaultRef, depth: number, owner: Component): Promise<void> {
  container.empty();
  container.addClass(CLASS_EMBED);

  const label = formatCrossVaultLink(ref).slice(2, -2);

  if (depth > MAX_EMBED_DEPTH) {
    container.addClass('mvn-embed-notice');
    container.setText(`Embed depth limit reached: ${label}`);
    return;
  }

  const target = host.findTarget(ref);
  if (!target) {
    container.addClass('mvn-embed-notice');
    container.setText(`Note not found: ${label}`);
    return;
  }

  const header = container.createDiv({ cls: 'mvn-embed-header' });
  header.createSpan({ text: `[${target.vaultName}] ${ref.heading ? `${target.basename} > ${ref.heading}` : target.basename}`, cls: 'mvn-embed-title' });
  const openBtn = header.createEl('button', { text: 'Open', cls: 'mvn-embed-open' });
  openBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    host.open(target);
  });

  const body = container.createDiv({ cls: 'mvn-embed-body markdown-rendered' });
  body.setText('Loading…');

  const raw = await host.read(target);
  body.empty();
  if (raw === null) {
    body.addClass('mvn-embed-notice');
    body.setText('Could not read the note.');
    return;
  }

  let markdown = truncateToBytes(stripFrontmatter(raw), MAX_EMBED_BYTES);
  if (ref.heading) {
    const section = extractSection(markdown, ref.heading);
    if (section === null) {
      body.addClass('mvn-embed-notice');
      body.setText(`Heading not found: ${ref.heading}`);
      return;
    }
    markdown = section;
  }

  await MarkdownRenderer.render(host.app, markdown, body, '', owner);
}
