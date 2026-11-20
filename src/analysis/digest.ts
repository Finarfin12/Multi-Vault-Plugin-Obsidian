import type { IndexedFile } from '../types';

/** Cross-vault change summary (F13): what was created or changed in a period, per vault. */

export const MAX_HISTORY = 20;

export interface DigestRange {
  /** Inclusive start (epoch ms). */
  from: number;
  /** Exclusive end (epoch ms). */
  to: number;
  label: string;
}

export type RangeKey = 'today' | '7d' | 'custom';

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in local time. */
export function formatDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDay(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(y, mo - 1, d);
  if (t.getFullYear() !== y || t.getMonth() !== mo - 1 || t.getDate() !== d) return null;
  return t.getTime();
}

/**
 * Today = local midnight to next midnight; 7 days = the last 7 calendar days including
 * today; custom = two `YYYY-MM-DD` days, both included. Returns null for an invalid custom range.
 */
export function resolveRange(key: RangeKey, now: number, custom?: { from: string; to: string }): DigestRange | null {
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfTomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();

  if (key === 'today') return { from: startOfToday, to: startOfTomorrow, label: formatDay(startOfToday) };
  if (key === '7d') {
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6).getTime();
    return { from, to: startOfTomorrow, label: `${formatDay(from)} to ${formatDay(startOfToday)}` };
  }
  if (!custom) return null;
  const from = parseDay(custom.from);
  const lastDay = parseDay(custom.to);
  if (from === null || lastDay === null || lastDay < from) return null;
  const end = new Date(lastDay);
  const to = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
  return { from, to, label: from === lastDay ? formatDay(from) : `${formatDay(from)} to ${formatDay(lastDay)}` };
}

/**
 * The word-count history of a file after it was parsed again: the earlier
 * observations (kept, or seeded from the old entry) plus the new one. Oldest dropped beyond MAX_HISTORY.
 */
export function nextHistory(previous: IndexedFile | undefined, next: IndexedFile): Array<[number, number]> {
  const history: Array<[number, number]> = previous?.wordHistory ? previous.wordHistory.map(h => [h[0], h[1]]) : [];
  if (history.length === 0 && previous && previous.wordCount !== undefined) history.push([previous.mtime, previous.wordCount]);
  if (next.wordCount !== undefined) {
    const last = history[history.length - 1];
    if (!last || last[0] !== next.mtime) history.push([next.mtime, next.wordCount]);
    else last[1] = next.wordCount;
  }
  return history.slice(-MAX_HISTORY);
}

/** Word count the note had just before `time`, or undefined when no earlier observation exists. */
function wordsBefore(file: IndexedFile, time: number): number | undefined {
  let found: number | undefined;
  for (const [t, words] of file.wordHistory ?? []) {
    if (t < time) found = words;
  }
  return found;
}

export interface DigestEntry {
  file: IndexedFile;
  kind: 'created' | 'modified';
  /** Estimated words added in the period; undefined when no earlier version was ever seen. */
  wordsAdded?: number;
}

export interface VaultDigest {
  vaultId: string;
  vaultName: string;
  entries: DigestEntry[];
  created: number;
  modified: number;
  /** Sum of the known estimates (never negative per note). */
  wordsAdded: number;
  /** False when some modified notes have no earlier version to compare with, so the total is a lower bound. */
  wordsComplete: boolean;
}

/**
 * Group the notes created or modified in `range` by vault. A note counts once: as
 * "created" when its creation time is in the range, otherwise as "modified" when
 * its modification time is. Words added are an estimate: all words for created
 * notes, and the growth since the last version the plugin saw before the period
 * for modified notes.
 */
export function buildDigest(files: IndexedFile[], range: DigestRange): VaultDigest[] {
  const byVault = new Map<string, VaultDigest>();
  const inRange = (t: number | undefined): t is number => t !== undefined && t >= range.from && t < range.to;

  for (const file of files) {
    let kind: DigestEntry['kind'] | null = null;
    if (inRange(file.ctime)) kind = 'created';
    else if (inRange(file.mtime)) kind = 'modified';
    if (!kind) continue;

    let wordsAdded: number | undefined;
    if (kind === 'created') {
      wordsAdded = file.wordCount;
    } else if (file.wordCount !== undefined) {
      const before = wordsBefore(file, range.from);
      wordsAdded = before === undefined ? undefined : Math.max(0, file.wordCount - before);
    }

    let digest = byVault.get(file.vaultId);
    if (!digest) {
      digest = { vaultId: file.vaultId, vaultName: file.vaultName, entries: [], created: 0, modified: 0, wordsAdded: 0, wordsComplete: true };
      byVault.set(file.vaultId, digest);
    }
    digest.entries.push({ file, kind, wordsAdded });
    if (kind === 'created') digest.created++;
    else digest.modified++;
    if (wordsAdded === undefined) digest.wordsComplete = false;
    else digest.wordsAdded += wordsAdded;
  }

  const result = Array.from(byVault.values());
  for (const d of result) d.entries.sort((a, b) => b.file.mtime - a.file.mtime);
  result.sort((a, b) => (b.created + b.modified) - (a.created + a.modified) || a.vaultName.localeCompare(b.vaultName));
  return result;
}

export const SUMMARY_MARKER_START = '<!-- mvn-summary:start -->';
export const SUMMARY_MARKER_END = '<!-- mvn-summary:end -->';

/** Link text for a note: a plain link inside the active vault, `[[Vault::Note]]` for other vaults. */
export function linkFor(file: IndexedFile, currentVaultId: string | null): string {
  if (file.vaultId === currentVaultId) return `[[${file.relativePath.replace(/\.md$/i, '')}]]`;
  return `[[${file.vaultName}::${file.basename}]]`;
}

/** Markdown for the summary, wrapped in markers so inserting again replaces it instead of duplicating it. */
export function formatDigestMarkdown(digests: VaultDigest[], range: DigestRange, currentVaultId: string | null): string {
  const lines: string[] = [SUMMARY_MARKER_START, `## Cross-vault summary: ${range.label}`, ''];
  if (digests.length === 0) {
    lines.push('No notes were created or changed in this period.');
  }
  for (const d of digests) {
    const words = d.wordsAdded > 0 || d.wordsComplete ? ` · about +${d.wordsAdded} words${d.wordsComplete ? '' : ' or more'}` : '';
    lines.push(`### ${d.vaultName} (${d.created} created, ${d.modified} modified${words})`);
    for (const e of d.entries) {
      const extra = e.wordsAdded !== undefined && e.wordsAdded > 0 ? ` (+${e.wordsAdded} words)` : '';
      lines.push(`- ${e.kind === 'created' ? 'Created' : 'Modified'}: ${linkFor(e.file, currentVaultId)}${extra}`);
    }
    lines.push('');
  }
  lines.push(SUMMARY_MARKER_END);
  return lines.join('\n');
}

/**
 * Put `block` at the end of `content`, or replace the previous summary block
 * (found by its markers) so repeated inserts never pile up.
 */
export function insertSummaryBlock(content: string, block: string): string {
  const start = content.indexOf(SUMMARY_MARKER_START);
  const end = content.indexOf(SUMMARY_MARKER_END);
  if (start !== -1 && end > start) {
    return content.slice(0, start) + block + content.slice(end + SUMMARY_MARKER_END.length);
  }
  const trimmed = content.replace(/\s+$/, '');
  return `${trimmed}${trimmed ? '\n\n' : ''}${block}\n`;
}
