import { readTextOrNull } from '../fs-async';
import { stripFrontmatter, truncateToBytes } from '../indexer/markdown-parser';
import { IndexedFile } from '../types';

export interface Snippet {
  text: string;
  /** True when one of the search terms was found in the text. */
  matched: boolean;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a short excerpt around the first search term found in `text`.
 * Terms match at the start of a word (so "art" does not match inside "smart"),
 * which mirrors how the search index tokenises and prefix-matches.
 */
export function buildSnippet(text: string, terms: string[], radius: number = 80): Snippet {
  const clean = text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  const usable = terms.map(t => t.trim()).filter(t => t.length >= 2);
  if (usable.length > 0) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${usable.map(escapeRegex).join('|')})`, 'iu');
    const m = pattern.exec(clean);
    if (m) {
      let start = Math.max(0, m.index - radius);
      let end = Math.min(clean.length, m.index + m[0].length + radius);
      // Do not start or end in the middle of a word
      if (start > 0) {
        const space = clean.indexOf(' ', start);
        if (space !== -1 && space < m.index) start = space + 1;
      }
      if (end < clean.length) {
        const space = clean.lastIndexOf(' ', end);
        if (space > m.index + m[0].length) end = space;
      }
      return {
        text: `${start > 0 ? '… ' : ''}${clean.substring(start, end)}${end < clean.length ? ' …' : ''}`,
        matched: true
      };
    }
  }

  const head = clean.substring(0, radius * 2);
  return { text: head + (clean.length > head.length ? ' …' : ''), matched: false };
}

/**
 * Read the note from disk (async) and build a snippet from the part that matched.
 * Returns null when the file cannot be read. Only the text the index covers is searched.
 */
export async function loadSnippet(file: IndexedFile, terms: string[], maxIndexedBytes: number): Promise<Snippet | null> {
  const content = await readTextOrNull(file.absolutePath);
  if (content === null) return null;
  return buildSnippet(truncateToBytes(stripFrontmatter(content), maxIndexedBytes), terms);
}
