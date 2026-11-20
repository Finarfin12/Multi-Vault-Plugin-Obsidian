import type { IndexedFile } from '../types';
import { CrossVaultRef, findCrossVaultTarget, formatCrossVaultLink } from './link-parser';

/** What the user is typing: `[[Vault::query` (notes) or `[[Vault::Note#query` (headings). */
export interface LinkTrigger {
  kind: 'note' | 'heading';
  /** The vault name as typed, before `::`. */
  vaultTyped: string;
  /** Note name typed before `#` (heading mode only). */
  noteTyped?: string;
  query: string;
  /** Column of the opening `[[` in the line. */
  startCh: number;
}

/**
 * Decide whether the text before the cursor is a cross-vault link being typed.
 * Plain `[[Note` (no `::`) returns null so Obsidian's own suggestions are left alone.
 */
export function detectTrigger(textBeforeCursor: string): LinkTrigger | null {
  const open = textBeforeCursor.lastIndexOf('[[');
  if (open === -1) return null;
  const inner = textBeforeCursor.slice(open + 2);
  if (inner.includes(']') || inner.includes('[')) return null;

  const sep = inner.indexOf('::');
  if (sep <= 0) return null;
  const vaultTyped = inner.slice(0, sep);
  if (/[#|]/.test(vaultTyped) || !vaultTyped.trim()) return null;

  const rest = inner.slice(sep + 2);
  if (rest.includes('|')) return null; // typing an alias: nothing to suggest

  const hash = rest.indexOf('#');
  if (hash === -1) return { kind: 'note', vaultTyped: vaultTyped.trim(), query: rest, startCh: open };
  return {
    kind: 'heading',
    vaultTyped: vaultTyped.trim(),
    noteTyped: rest.slice(0, hash).trim(),
    query: rest.slice(hash + 1),
    startCh: open
  };
}

/** 0 = no match; larger = better. Empty query matches everything weakly. */
export function scoreMatch(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  const idx = t.indexOf(q);
  if (idx !== -1) {
    // a word boundary before the match beats a match in the middle of a word
    return /[\s\-_/.]/.test(t[idx - 1] ?? ' ') ? 60 : 40;
  }
  // subsequence ("mtgnts" ~ "meeting notes")
  let pos = 0;
  for (const ch of q) {
    pos = t.indexOf(ch, pos);
    if (pos === -1) return 0;
    pos++;
  }
  return 20;
}

/** Notes of `vaultName` matching `query`, best first (recent first on ties), at most `limit`. */
export function suggestNotes(files: IndexedFile[], vaultName: string, query: string, limit = 20): IndexedFile[] {
  const vault = vaultName.toLowerCase();
  return files
    .filter(f => f.vaultName.toLowerCase() === vault)
    .map(f => ({ f, score: Math.max(scoreMatch(query, f.basename), scoreMatch(query, f.relativePath) - 10) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || b.f.mtime - a.f.mtime)
    .slice(0, limit)
    .map(x => x.f);
}

/** Headings of a note matching `query`, in document order. */
export function suggestHeadings(file: IndexedFile, query: string, limit = 20): string[] {
  return (file.headings ?? []).filter(h => scoreMatch(query, h) > 0).slice(0, limit);
}

/**
 * The name to put in the link: the plain note name when it is unique in its
 * vault, otherwise the path (without `.md`) so the link stays unambiguous.
 */
export function linkNameFor(file: IndexedFile, files: IndexedFile[]): string {
  const same = files.filter(f => f.vaultId === file.vaultId && f.basename.toLowerCase() === file.basename.toLowerCase());
  return same.length > 1 ? file.relativePath.replace(/\.md$/i, '') : file.basename;
}

/** The text that replaces what the user typed when a suggestion is chosen. */
export function buildInsertion(vaultName: string, file: IndexedFile, files: IndexedFile[], heading?: string): string {
  const name = linkNameFor(file, files);
  const ref: CrossVaultRef = { vaultName, noteName: file.basename };
  if (name.includes('/')) ref.notePath = name;
  if (heading) ref.heading = heading;
  return formatCrossVaultLink(ref);
}

/** Resolve the note a heading trigger refers to. */
export function targetForTrigger(files: IndexedFile[], trigger: LinkTrigger): IndexedFile | undefined {
  if (trigger.kind !== 'heading' || !trigger.noteTyped) return undefined;
  return findCrossVaultTarget(files, { vaultName: trigger.vaultTyped, noteName: trigger.noteTyped });
}
