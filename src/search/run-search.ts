import type { IndexedFile } from '../types';
import { MultiVaultSearchResult, SearchEngine } from '../search-engine';
import { readTextOrNull } from '../fs-async';
import { stripFrontmatter, truncateToBytes } from '../indexer/markdown-parser';
import { highlightTermsOf, isEmptyQuery, ParsedQuery, parseQuery } from './query-parser';

/** At most this many candidates are read from disk to verify exact phrases. */
export const MAX_PHRASE_CANDIDATES = 300;
const READ_CONCURRENCY = 8;

const squash = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();

/** True when `phrase` occurs in `text` (case-insensitive, whitespace-insensitive). */
export function containsPhrase(text: string, phrase: string): boolean {
  const p = squash(phrase).trim();
  return p.length === 0 || squash(text).includes(p);
}

/**
 * Keep only the results whose note text contains every phrase in `phrases` and none in
 * `notPhrases`. The note is read from disk (async, bounded concurrency) and cut at
 * `maxBytes`, the same part the index covers; title and headings count as text too.
 */
export async function filterByPhrases(
  results: MultiVaultSearchResult[],
  phrases: string[],
  notPhrases: string[],
  maxBytes: number
): Promise<MultiVaultSearchResult[]> {
  if (phrases.length === 0 && notPhrases.length === 0) return results;

  const keep: boolean[] = new Array<boolean>(results.length).fill(false);
  let next = 0;
  const worker = async () => {
    while (next < results.length) {
      const i = next++;
      const file: IndexedFile = results[i].file;
      const raw = await readTextOrNull(file.absolutePath);
      const body = raw === null ? '' : truncateToBytes(stripFrontmatter(raw), maxBytes);
      const haystack = `${file.basename}\n${(file.headings ?? []).join('\n')}\n${body}`;
      keep[i] = phrases.every(p => containsPhrase(haystack, p)) && !notPhrases.some(p => containsPhrase(haystack, p));
    }
  };
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, results.length) }, worker));
  return results.filter((_, i) => keep[i]);
}

export interface SearchRun {
  parsed: ParsedQuery;
  results: MultiVaultSearchResult[];
  /** Words to highlight in excerpts. */
  highlightTerms: string[];
}

/**
 * The one entry point for every search UI: parse operators, search, verify
 * exact phrases. An empty query returns no results.
 */
export async function runSearch(
  engine: SearchEngine,
  rawQuery: string,
  options: { vaultId?: string; limit?: number; maxIndexedBytes: number }
): Promise<SearchRun> {
  const parsed = parseQuery(rawQuery);
  const highlightTerms = highlightTermsOf(parsed);
  if (isEmptyQuery(parsed)) return { parsed, results: [], highlightTerms };

  const needsPhraseCheck = parsed.phrases.length > 0 || parsed.notPhrases.length > 0;
  const candidates = engine.searchParsed(parsed, {
    vaultId: options.vaultId,
    limit: needsPhraseCheck ? MAX_PHRASE_CANDIDATES : options.limit
  });

  let results = needsPhraseCheck
    ? await filterByPhrases(candidates, parsed.phrases, parsed.notPhrases, options.maxIndexedBytes)
    : candidates;
  if (options.limit && options.limit > 0) results = results.slice(0, options.limit);
  return { parsed, results, highlightTerms };
}
