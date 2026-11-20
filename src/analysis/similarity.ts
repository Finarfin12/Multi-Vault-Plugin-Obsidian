import type { IndexedFile } from '../types';

/**
 * Near-duplicate detection by content (F11).
 *
 * Each note becomes a set of 5-word shingles; a 64-value MinHash signature is
 * grouped into 16 bands of 4 rows (LSH) so only notes that share a band are ever
 * compared, and every candidate pair is then verified with the exact Jaccard
 * similarity of the two shingle sets. Nothing leaves the computer and nothing is stored.
 */

export const SHINGLE_WORDS = 5;
export const SIGNATURE_SIZE = 64;
export const BANDS = 16;
export const ROWS = SIGNATURE_SIZE / BANDS;
/** Notes with fewer words than this are skipped: tiny notes are "similar" by accident. */
export const MIN_WORDS = 8;
export const MAX_FILES = 20000;

export interface SimilarPair {
  a: IndexedFile;
  b: IndexedFile;
  /** Exact Jaccard similarity of the shingle sets, 0..1. */
  similarity: number;
}

export interface SimilarityResult {
  pairs: SimilarPair[];
  /** Notes too short to compare (or unreadable). */
  skipped: number;
  /** True when there were more than MAX_FILES notes and the rest was left out. */
  truncated: boolean;
  cancelled: boolean;
  /** True when more than `maxPairs` pairs qualified and only the first ones are listed. */
  capped: boolean;
}

export interface SimilarityOptions {
  /** Minimum similarity, 0..1 (default 0.8). */
  threshold?: number;
  maxFiles?: number;
  /** Stop after this many qualifying pairs (default 2000), e.g. when thousands of notes share one template. */
  maxPairs?: number;
  /** Returns the text to compare (without frontmatter), or null when unreadable. */
  read: (file: IndexedFile) => Promise<string | null>;
  onProgress?: (done: number, total: number, phase: 'reading' | 'comparing') => void;
  isCancelled?: () => boolean;
  /** Gives the UI a chance to paint; defaults to a macrotask yield. */
  yieldFn?: () => Promise<void>;
  /** How many notes to process between yields (default 20). */
  chunkSize?: number;
}

/** Lower-cased words (letters and digits of any script). */
export function tokenizeWords(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 0);
}

function hashWord(word: string): number {
  let h = 2166136261;
  for (let i = 0; i < word.length; i++) {
    h = Math.imul(h ^ word.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** Sorted, de-duplicated hashes of every run of 5 consecutive words (all words if fewer than 5). */
export function shingleHashes(words: string[], k: number = SHINGLE_WORDS): Uint32Array {
  if (words.length === 0) return new Uint32Array(0);
  const wh = words.map(hashWord);
  const out = new Set<number>();
  if (wh.length < k) {
    let h = 0;
    for (const w of wh) h = (Math.imul(h, 16777619) ^ w) >>> 0;
    out.add(h);
  } else {
    for (let i = 0; i + k <= wh.length; i++) {
      let h = 0;
      for (let j = 0; j < k; j++) h = (Math.imul(h, 16777619) ^ wh[i + j]) >>> 0;
      out.add(h);
    }
  }
  return Uint32Array.from(out).sort();
}

// Fixed pseudo-random multipliers/offsets so signatures are the same on every run
const COEFF_A = new Uint32Array(SIGNATURE_SIZE);
const COEFF_B = new Uint32Array(SIGNATURE_SIZE);
(() => {
  let s = 0x9e3779b9;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
  for (let i = 0; i < SIGNATURE_SIZE; i++) {
    COEFF_A[i] = next() | 1; // odd, so the mapping is a bijection on 32 bits
    COEFF_B[i] = next();
  }
})();

/** MinHash signature of a shingle set. */
export function minHashSignature(shingles: Uint32Array): Uint32Array {
  const sig = new Uint32Array(SIGNATURE_SIZE).fill(0xffffffff);
  for (let s = 0; s < shingles.length; s++) {
    const x = shingles[s];
    for (let i = 0; i < SIGNATURE_SIZE; i++) {
      const h = (Math.imul(COEFF_A[i], x) + COEFF_B[i]) >>> 0;
      if (h < sig[i]) sig[i] = h;
    }
  }
  return sig;
}

/** Exact Jaccard similarity of two sorted, de-duplicated hash arrays. */
export function jaccard(a: Uint32Array, b: Uint32Array): number {
  if (a.length === 0 && b.length === 0) return 1;
  let i = 0;
  let j = 0;
  let inter = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { inter++; i++; j++; }
    else if (a[i] < b[j]) i++;
    else j++;
  }
  return inter / (a.length + b.length - inter);
}

const defaultYield = () => new Promise<void>(resolve => window.setTimeout(resolve, 0));

/** Find pairs of notes whose content is at least `threshold` similar. Runs in small steps so the UI stays responsive. */
export async function findSimilarNotes(files: IndexedFile[], options: SimilarityOptions): Promise<SimilarityResult> {
  const threshold = options.threshold ?? 0.8;
  const maxFiles = options.maxFiles ?? MAX_FILES;
  const maxPairs = options.maxPairs ?? 2000;
  const chunk = Math.max(1, options.chunkSize ?? 20);
  const yieldNow = options.yieldFn ?? defaultYield;
  const cancelled = () => options.isCancelled?.() === true;

  const truncated = files.length > maxFiles;
  const subject = truncated ? files.slice(0, maxFiles) : files;

  const kept: IndexedFile[] = [];
  const sets: Uint32Array[] = [];
  const bandMaps: Map<string, number[]>[] = Array.from({ length: BANDS }, () => new Map<string, number[]>());
  let skipped = 0;

  // Phase 1: read, shingle, sign and bucket every note
  for (let i = 0; i < subject.length; i++) {
    if (cancelled()) return { pairs: [], skipped, truncated, cancelled: true, capped: false };
    const file = subject[i];
    const text = await options.read(file);
    const words = text === null ? [] : tokenizeWords(text);
    if (words.length < MIN_WORDS) {
      skipped++;
    } else {
      const shingles = shingleHashes(words);
      const sig = minHashSignature(shingles);
      const index = kept.length;
      kept.push(file);
      sets.push(shingles);
      for (let b = 0; b < BANDS; b++) {
        const key = Array.from(sig.subarray(b * ROWS, (b + 1) * ROWS)).join(',');
        const bucket = bandMaps[b].get(key);
        if (bucket) bucket.push(index);
        else bandMaps[b].set(key, [index]);
      }
    }
    if ((i + 1) % chunk === 0) {
      options.onProgress?.(i + 1, subject.length, 'reading');
      await yieldNow();
    }
  }
  options.onProgress?.(subject.length, subject.length, 'reading');

  // Phase 2: candidate pairs share at least one band; verify each with the exact Jaccard
  const seen = new Set<number>();
  const pairs: SimilarPair[] = [];
  let work = 0;
  let capped = false;
  const totalBuckets = bandMaps.reduce((n, m) => n + m.size, 0);
  let bucketsDone = 0;

  for (const bandMap of bandMaps) {
    if (capped) break;
    for (const bucket of bandMap.values()) {
      bucketsDone++;
      if (bucket.length < 2) continue;
      for (let x = 0; x < bucket.length; x++) {
        for (let y = x + 1; y < bucket.length; y++) {
          const i = bucket[x];
          const j = bucket[y];
          const key = i * kept.length + j; // i < j always, so the pair key is unique
          if (seen.has(key)) continue;
          seen.add(key);
          const similarity = jaccard(sets[i], sets[j]);
          if (similarity >= threshold) pairs.push({ a: kept[i], b: kept[j], similarity });
          if (pairs.length >= maxPairs) { capped = true; break; }
        }
        if (capped) break;
      }
      if (capped) break;
      if (++work % 500 === 0) {
        if (cancelled()) return { pairs: [], skipped, truncated, cancelled: true, capped: false };
        options.onProgress?.(bucketsDone, totalBuckets, 'comparing');
        await yieldNow();
      }
    }
  }
  options.onProgress?.(totalBuckets, totalBuckets, 'comparing');

  pairs.sort((p, q) => q.similarity - p.similarity);
  return { pairs, skipped, truncated, cancelled: false, capped };
}
