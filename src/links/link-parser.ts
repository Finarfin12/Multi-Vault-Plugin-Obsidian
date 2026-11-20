import type { IndexedFile } from '../types';

/**
 * Single source of truth for `[[Vault::Note#Heading|alias]]` and
 * `![[Vault::Note]]` syntax, shared by the Reading View post-processor, the
 * Live Preview extension, the autocomplete and the embed renderer so they
 * never disagree about what a cross-vault link is.
 */

export interface CrossVaultRef {
  vaultName: string;
  noteName: string;
  /** Folder path of the note (without `.md`) when the link spelled one, to tell same-named notes apart. */
  notePath?: string;
  /** Text after `#`, when the link points at a heading. */
  heading?: string;
}

export interface CrossVaultLink extends CrossVaultRef {
  /** Offset of the first `[` (or of the `!` of an embed) in the scanned text. */
  start: number;
  /** Offset just after the closing `]]`. */
  end: number;
  embed: boolean;
  alias?: string;
  /** The whole matched source text. */
  raw: string;
}

/**
 * Parse the inside of a link ("Vault::Note#Heading|alias") or an href.
 * Returns null for normal wikilinks so they are never touched. A ".md"
 * suffix and folder prefixes are stripped from the note name.
 */
export function parseCrossVaultRef(target: string): (CrossVaultRef & { alias?: string }) | null {
  if (!target) return null;
  const idx = target.indexOf('::');
  if (idx <= 0) return null;

  const vaultName = target.slice(0, idx).trim();
  const rest = target.slice(idx + 2);
  const pipe = rest.indexOf('|');
  const alias = pipe === -1 ? undefined : rest.slice(pipe + 1).trim() || undefined;
  const beforeAlias = pipe === -1 ? rest : rest.slice(0, pipe);
  const hash = beforeAlias.indexOf('#');
  const heading = hash === -1 ? undefined : beforeAlias.slice(hash + 1).trim() || undefined;
  const notePart = hash === -1 ? beforeAlias : beforeAlias.slice(0, hash);
  const cleaned = notePart.trim().replace(/\.md$/i, '');
  const noteName = cleaned.split('/').pop()?.trim() ?? '';

  if (!vaultName || !noteName) return null;
  const ref: CrossVaultRef & { alias?: string } = { vaultName, noteName };
  if (cleaned.includes('/')) ref.notePath = cleaned.replace(/^\/+/, '');
  if (heading) ref.heading = heading;
  if (alias) ref.alias = alias;
  return ref;
}

/** Same-length copy of `text` in which fenced code blocks and inline code are blanked out. */
export function maskCode(text: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');

  // Fenced blocks: a line starting with ``` or ~~~ opens; a line with the same fence character closes
  let out = '';
  let fence: { ch: string; len: number } | null = null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence === null) {
      if (m) {
        fence = { ch: m[1][0], len: m[1].length };
        out += blank(line);
      } else {
        out += line;
      }
    } else {
      out += blank(line);
      if (m && m[1][0] === fence.ch && m[1].length >= fence.len && /^ {0,3}[`~]+\s*$/.test(line)) fence = null;
    }
    if (i < lines.length - 1) out += '\n';
  }

  // Inline code spans (do not cross a blank line)
  return out.replace(/(`+)(?:(?!\n[ \t]*\n)[\s\S])*?\1(?!`)/g, (span) => blank(span));
}

const LINK_REGEX = /(!?)\[\[([^[\]\n]+)\]\]/g;

/** Find every `[[Vault::Note]]` / `![[Vault::Note]]` in `text`, ignoring code. */
export function findCrossVaultLinks(text: string): CrossVaultLink[] {
  const masked = text.includes('`') || text.includes('~~~') ? maskCode(text) : text;
  const links: CrossVaultLink[] = [];
  LINK_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK_REGEX.exec(masked)) !== null) {
    const ref = parseCrossVaultRef(m[2]);
    if (!ref) continue;
    links.push({
      ...ref,
      start: m.index,
      end: m.index + m[0].length,
      embed: m[1] === '!',
      raw: text.slice(m.index, m.index + m[0].length)
    });
  }
  return links;
}

/** The link whose range contains `pos` (start inclusive, end exclusive). */
export function linkAt(links: CrossVaultLink[], pos: number): CrossVaultLink | undefined {
  return links.find(l => pos >= l.start && pos < l.end);
}

/** Find the indexed note a reference points at (vault by name, note by basename or path ending). */
export function findCrossVaultTarget(files: IndexedFile[], ref: CrossVaultRef): IndexedFile | undefined {
  const vault = ref.vaultName.toLowerCase();
  const note = ref.noteName.toLowerCase();
  if (ref.notePath) {
    // A spelled-out path wins, so same-named notes in different folders stay distinguishable
    const path = ref.notePath.toLowerCase();
    const exact = files.find((f) => {
      if (f.vaultName.toLowerCase() !== vault) return false;
      const rel = f.relativePath.toLowerCase();
      return rel === `${path}.md` || rel.endsWith(`/${path}.md`);
    });
    if (exact) return exact;
  }
  return files.find((f) => {
    if (f.vaultName.toLowerCase() !== vault) return false;
    if (f.basename.toLowerCase() === note) return true;
    const rel = f.relativePath.toLowerCase();
    return (
      rel === note ||
      rel === `${note}.md` ||
      rel.endsWith(`/${note}`) ||
      rel.endsWith(`/${note}.md`)
    );
  });
}

/**
 * Same answers as findCrossVaultTarget, but looks notes up in a map built once, so
 * resolving thousands of links stays fast. Use it when resolving many references.
 */
export function createTargetResolver(files: IndexedFile[]): (ref: CrossVaultRef) => IndexedFile | undefined {
  const byName = new Map<string, IndexedFile>();
  for (const f of files) {
    const key = `${f.vaultName.toLowerCase()}\u0000${f.basename.toLowerCase()}`;
    if (!byName.has(key)) byName.set(key, f);
  }
  return (ref) => {
    if (ref.notePath) return findCrossVaultTarget(files, ref); // rare: needs the path comparison
    return byName.get(`${ref.vaultName.toLowerCase()}\u0000${ref.noteName.toLowerCase()}`);
  };
}

/** Rebuild link text for a reference (used by autocomplete). */
export function formatCrossVaultLink(ref: CrossVaultRef, embed = false): string {
  return `${embed ? '!' : ''}[[${ref.vaultName}::${ref.notePath ?? ref.noteName}${ref.heading ? `#${ref.heading}` : ''}]]`;
}
