import type { IndexedFile } from '../types';
import { hasAllTags, hasAnyTag } from './tags';

/**
 * Search operators (F10):
 *
 *   vault:Work            only notes of that vault (several vault: = any of them)
 *   path:projects/alpha   path contains that text (case-insensitive)
 *   tag:idea  or  #idea   has the tag (exact or a parent of a nested tag)
 *   -tag:draft            does not have the tag      (also -vault:, -path:)
 *   -word  /  -"a phrase" must not contain the word / phrase
 *   modified:>7d          modified after "7 days ago"   (units h d w m y; m = 30 days)
 *   modified:<2026-01-01  modified before that date     (also >=, <=, a plain date = that day)
 *   "exact phrase"        the words in that exact order
 *
 * Values with spaces go in quotes: vault:"My Vault". Anything that is not a valid
 * operator is ignored and reported in `problems`; parsing never throws.
 */

/** Half-open time window [from, to) in epoch ms; a missing bound is open. */
export interface TimeRange {
  from?: number;
  to?: number;
}

export interface ParsedQuery {
  /** Plain search words, space separated. */
  text: string;
  /** Exact phrases that must appear. */
  phrases: string[];
  vaults: string[];
  notVaults: string[];
  paths: string[];
  notPaths: string[];
  tags: string[];
  notTags: string[];
  /** Words that must not appear. */
  notTerms: string[];
  /** Phrases that must not appear. */
  notPhrases: string[];
  modified: TimeRange[];
  /** Human-readable notes about parts of the input that were ignored. */
  problems: string[];
}

interface Token {
  neg: boolean;
  key?: string;
  value: string;
  quoted: boolean;
}

const KEYS = new Set(['vault', 'path', 'tag', 'modified']);
const DAY = 86400000;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  const readValue = (): { value: string; quoted: boolean } => {
    if (input[i] === '"') {
      i++;
      const start = i;
      while (i < n && input[i] !== '"') i++;
      const value = input.slice(start, i);
      if (i < n) i++; // closing quote (an unterminated quote runs to the end)
      return { value, quoted: true };
    }
    const start = i;
    while (i < n && !/\s/.test(input[i])) i++;
    return { value: input.slice(start, i), quoted: false };
  };

  while (i < n) {
    if (/\s/.test(input[i])) { i++; continue; }

    let neg = false;
    if (input[i] === '-' && i + 1 < n && !/\s/.test(input[i + 1])) {
      neg = true;
      i++;
    }

    if (input[i] === '#' ) {
      i++;
      const { value } = readValue();
      tokens.push({ neg, key: 'tag', value, quoted: false });
      continue;
    }

    const keyMatch = /^([A-Za-z]+):/.exec(input.slice(i));
    if (keyMatch && KEYS.has(keyMatch[1].toLowerCase())) {
      i += keyMatch[0].length;
      const { value, quoted } = readValue();
      tokens.push({ neg, key: keyMatch[1].toLowerCase(), value, quoted });
      continue;
    }

    const { value, quoted } = readValue();
    tokens.push({ neg, value, quoted });
  }
  return tokens;
}

function startOfDay(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getTime();
}

/** Parse the value of `modified:` into a time window, or null when it is not understood. */
export function parseModified(value: string, now: number): TimeRange | null {
  const m = /^(>=|<=|>|<|=)?\s*(.+)$/.exec(value.trim());
  if (!m) return null;
  const op = m[1] ?? '';
  const body = m[2].trim();

  const rel = /^(\d+)\s*([hdwmy])$/i.exec(body);
  if (rel) {
    const unit = { h: 3600000, d: DAY, w: 7 * DAY, m: 30 * DAY, y: 365 * DAY }[rel[2].toLowerCase() as 'h' | 'd' | 'w' | 'm' | 'y'];
    const cutoff = now - Number(rel[1]) * unit;
    return op === '<' || op === '<=' ? { to: cutoff } : { from: cutoff };
  }

  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(body);
  if (date) {
    const y = Number(date[1]);
    const mo = Number(date[2]);
    const d = Number(date[3]);
    const start = startOfDay(y, mo, d);
    const check = new Date(start);
    if (check.getFullYear() !== y || check.getMonth() !== mo - 1 || check.getDate() !== d) return null; // e.g. 2026-02-31
    const next = startOfDay(y, mo, d + 1);
    switch (op) {
      case '>': return { from: next };
      case '>=': return { from: start };
      case '<': return { to: start };
      case '<=': return { to: next };
      default: return { from: start, to: next };
    }
  }
  return null;
}

export function parseQuery(input: string, now: number = Date.now()): ParsedQuery {
  const q: ParsedQuery = {
    text: '', phrases: [], vaults: [], notVaults: [], paths: [], notPaths: [], tags: [], notTags: [],
    notTerms: [], notPhrases: [], modified: [], problems: []
  };
  const words: string[] = [];

  for (const t of tokenize(typeof input === 'string' ? input : '')) {
    const value = t.value.trim();

    if (t.key) {
      if (!value) {
        q.problems.push(`"${t.key}:" needs a value`);
        continue;
      }
      switch (t.key) {
        case 'vault': (t.neg ? q.notVaults : q.vaults).push(value); break;
        case 'path': (t.neg ? q.notPaths : q.paths).push(value); break;
        case 'tag': (t.neg ? q.notTags : q.tags).push(value.replace(/^#+/, '')); break;
        case 'modified': {
          if (t.neg) {
            q.problems.push('"-modified:" is not supported; use modified:< or modified:>');
            break;
          }
          const range = parseModified(value, now);
          if (range) q.modified.push(range);
          else q.problems.push(`"modified:${value}" is not a valid date or age (try 7d or 2026-01-31)`);
          break;
        }
      }
      continue;
    }

    if (!value) continue;
    if (t.quoted) {
      (t.neg ? q.notPhrases : q.phrases).push(value);
    } else if (t.neg) {
      q.notTerms.push(value);
    } else {
      words.push(value);
    }
  }

  q.text = words.join(' ');
  return q;
}

/** True when the query has nothing to search or filter by. */
export function isEmptyQuery(q: ParsedQuery): boolean {
  return !q.text && q.phrases.length === 0 && q.vaults.length === 0 && q.notVaults.length === 0
    && q.paths.length === 0 && q.notPaths.length === 0 && q.tags.length === 0 && q.notTags.length === 0
    && q.notTerms.length === 0 && q.notPhrases.length === 0 && q.modified.length === 0;
}

/** The metadata part of a query (vault, path, tags, modified); text and phrases are checked elsewhere. */
export function matchesFilters(file: IndexedFile, q: ParsedQuery): boolean {
  const vaultMatches = (name: string) => {
    const n = name.toLowerCase();
    return file.vaultName.toLowerCase() === n || file.vaultId.toLowerCase() === n;
  };
  if (q.vaults.length > 0 && !q.vaults.some(vaultMatches)) return false;
  if (q.notVaults.some(vaultMatches)) return false;

  const rel = file.relativePath.toLowerCase();
  if (!q.paths.every(p => rel.includes(p.toLowerCase()))) return false;
  if (q.notPaths.some(p => rel.includes(p.toLowerCase()))) return false;

  if (q.tags.length > 0 && !hasAllTags(file, q.tags)) return false;
  if (q.notTags.length > 0 && hasAnyTag(file, q.notTags)) return false;

  return q.modified.every(r => (r.from === undefined || file.mtime >= r.from) && (r.to === undefined || file.mtime < r.to));
}

/** Words to highlight in results (plain words and the words of phrases). */
export function highlightTermsOf(q: ParsedQuery): string[] {
  const words: string[] = q.text.split(/\s+/);
  for (const phrase of q.phrases) words.push(...phrase.split(/\s+/));
  return Array.from(new Set(words.filter(w => w.length > 0)));
}

/** Short help shown in the Command Center. */
export const OPERATOR_HELP: ReadonlyArray<{ syntax: string; meaning: string }> = [
  { syntax: 'vault:Work', meaning: 'only notes of that vault (quote names with spaces: vault:"My Vault")' },
  { syntax: 'path:projects', meaning: 'the path contains that text' },
  { syntax: 'tag:idea  or  #idea', meaning: 'notes with that tag (nested tags included)' },
  { syntax: '-tag:draft', meaning: 'leave out notes with that tag (also -vault: and -path:)' },
  { syntax: '-word  or  -"a phrase"', meaning: 'leave out notes containing it' },
  { syntax: 'modified:>7d', meaning: 'changed in the last 7 days (h, d, w, m, y)' },
  { syntax: 'modified:<2026-01-01', meaning: 'last changed before that date (also > <= >=, or a plain date)' },
  { syntax: '"exact phrase"', meaning: 'the words in exactly that order' }
];
