import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BANDS, findSimilarNotes, jaccard, MAX_FILES, minHashSignature, ROWS, shingleHashes, SIGNATURE_SIZE, tokenizeWords
} from '../src/analysis/similarity';
import { IndexedFile } from '../src/types';

function file(name: string, vault = 'V'): IndexedFile {
  return {
    id: `${vault}:${name}.md`, vaultId: vault.toLowerCase(), vaultName: vault, absolutePath: `/x/${name}.md`,
    relativePath: `${name}.md`, basename: name, extension: '.md', mtime: 1, size: 1
  };
}

// deterministic pseudo-random text so tests do not depend on luck
function words(seed: number, count: number): string[] {
  let s = seed >>> 0;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out.push(`w${s % 5000}x`);
  }
  return out;
}

const textOf = (ws: string[]) => ws.join(' ');

async function scan(contents: Record<string, string>, threshold = 0.8, extra: Record<string, unknown> = {}) {
  const files = Object.keys(contents).map(n => file(n));
  return findSimilarNotes(files, {
    threshold,
    read: async (f) => (f.basename in contents ? contents[f.basename] : null),
    yieldFn: async () => undefined,
    ...extra
  });
}

test('constants: 64-value signature in 16 bands of 4 rows', () => {
  assert.equal(SIGNATURE_SIZE, 64);
  assert.equal(BANDS, 16);
  assert.equal(ROWS, 4);
  assert.equal(minHashSignature(shingleHashes(words(1, 50))).length, 64);
});

test('tokenizeWords: lower-cases and splits on anything that is not a letter or digit, any script', () => {
  assert.deepEqual(tokenizeWords('Hello, World! 42 café-au-lait 日本語'), ['hello', 'world', '42', 'café', 'au', 'lait', '日本語']);
  assert.deepEqual(tokenizeWords('  ...  '), []);
});

test('shingleHashes: sorted, unique, n-4 shingles for n words, one shingle for short texts, none for empty', () => {
  const s = shingleHashes(words(7, 20));
  assert.equal(s.length, 16);
  assert.deepEqual(Array.from(s), Array.from(s).slice().sort((a, b) => a - b));
  assert.equal(shingleHashes(['a', 'b']).length, 1);
  assert.equal(shingleHashes([]).length, 0);
  assert.equal(shingleHashes(['same', 'same', 'same', 'same', 'same', 'same', 'same']).length, 1, 'repeats collapse');
});

test('jaccard: identical = 1, disjoint = 0, partial overlap is exact', () => {
  const a = Uint32Array.from([1, 2, 3, 4]);
  assert.equal(jaccard(a, a), 1);
  assert.equal(jaccard(a, Uint32Array.from([5, 6])), 0);
  assert.equal(jaccard(a, Uint32Array.from([3, 4, 5, 6])), 2 / 6);
  assert.equal(jaccard(new Uint32Array(0), new Uint32Array(0)), 1);
});

test('MinHash signatures are deterministic and agree for equal sets', () => {
  const a = shingleHashes(words(3, 120));
  assert.deepEqual(Array.from(minHashSignature(a)), Array.from(minHashSignature(shingleHashes(words(3, 120)))));
  assert.notDeepEqual(Array.from(minHashSignature(a)), Array.from(minHashSignature(shingleHashes(words(4, 120)))));
});

test('T15: a note that is ~90% the same as another (different names) is found with its percentage; ~30% is not', async () => {
  const base = words(11, 500);
  const ninety = [...base, ...words(12, 50)]; // 500 of 550 words shared
  const thirty = [...base.slice(0, 150), ...words(13, 350)]; // 30% shared
  const r = await scan({ original: textOf(base), 'copy renamed': textOf(ninety), 'mostly different': textOf(thirty) });
  assert.equal(r.pairs.length, 1);
  const p = r.pairs[0];
  assert.deepEqual([p.a.basename, p.b.basename].sort(), ['copy renamed', 'original']);
  assert.ok(p.similarity > 0.88 && p.similarity < 0.95, `similarity ${p.similarity}`);
  assert.equal(Math.round(p.similarity * 100) >= 89, true);
});

test('T15: identical notes are 100% similar; completely different notes are not paired', async () => {
  const a = textOf(words(21, 200));
  const r = await scan({ one: a, two: a, other: textOf(words(22, 200)) });
  assert.equal(r.pairs.length, 1);
  assert.equal(r.pairs[0].similarity, 1);
});

test('the threshold decides: a 90% pair disappears at 95% and a 60% pair appears at 50%', async () => {
  const base = words(31, 400);
  const near = [...base, ...words(32, 40)];
  const half = [...base.slice(0, 250), ...words(33, 150)];
  const contents = { base: textOf(base), near: textOf(near), half: textOf(half) };
  assert.equal((await scan(contents, 0.95)).pairs.length, 0);
  assert.ok((await scan(contents, 0.8)).pairs.length >= 1);
  const loose = await scan(contents, 0.3);
  assert.ok(loose.pairs.length >= 2);
  assert.ok(loose.pairs.every((p, i, all) => i === 0 || all[i - 1].similarity >= p.similarity), 'best first');
});

test('markup, case and spacing do not hide a copy', async () => {
  const base = words(41, 150);
  const decorated = `# Title\n\n${base.map(w => w.toUpperCase()).join('   \n')}`;
  const r = await scan({ plain: textOf(base), decorated });
  assert.equal(r.pairs.length, 1);
  assert.ok(r.pairs[0].similarity > 0.95);
});

test('short and unreadable notes are skipped, not paired', async () => {
  const r = await scan({ tiny1: 'todo', tiny2: 'todo', long: textOf(words(51, 100)) }, 0.8);
  assert.equal(r.pairs.length, 0);
  assert.equal(r.skipped, 2);
  const missing = await findSimilarNotes([file('ghost')], { read: async () => null, yieldFn: async () => undefined });
  assert.equal(missing.skipped, 1);
});

test('T16: work is chunked: the UI gets control back regularly and progress reaches the total', async () => {
  const contents: Record<string, string> = {};
  for (let i = 0; i < 300; i++) contents[`n${i}`] = textOf(words(1000 + i, 120));
  let yields = 0;
  const progress: Array<[number, number, string]> = [];
  const r = await scan(contents, 0.8, {
    chunkSize: 25,
    yieldFn: async () => { yields++; },
    onProgress: (d: number, t: number, ph: string) => progress.push([d, t, ph])
  });
  assert.equal(r.pairs.length, 0);
  assert.ok(yields >= 300 / 25, `yielded ${yields} times`);
  const reading = progress.filter(p => p[2] === 'reading');
  assert.deepEqual(reading[reading.length - 1].slice(0, 2), [300, 300]);
  assert.ok(progress.some(p => p[2] === 'comparing'));
});

test('T16: cancelling stops early and reports it', async () => {
  const contents: Record<string, string> = {};
  for (let i = 0; i < 100; i++) contents[`n${i}`] = textOf(words(2000 + i, 60));
  let reads = 0;
  const files = Object.keys(contents).map(n => file(n));
  const r = await findSimilarNotes(files, {
    read: async (f) => { reads++; return contents[f.basename]; },
    yieldFn: async () => undefined,
    isCancelled: () => reads >= 10
  });
  assert.equal(r.cancelled, true);
  assert.deepEqual(r.pairs, []);
  assert.ok(reads <= 11);
});

test('more than maxFiles notes: only the first maxFiles are compared and the result says so', async () => {
  assert.equal(MAX_FILES, 20000);
  const contents: Record<string, string> = {};
  for (let i = 0; i < 10; i++) contents[`n${i}`] = textOf(words(3000 + i, 60));
  const r = await scan(contents, 0.8, { maxFiles: 4 });
  assert.equal(r.truncated, true);
  const full = await scan(contents, 0.8);
  assert.equal(full.truncated, false);
});

test('thousands of identical template notes do not explode: pairs are capped', async () => {
  const same = textOf(words(61, 40));
  const contents: Record<string, string> = {};
  for (let i = 0; i < 120; i++) contents[`t${i}`] = same;
  const r = await scan(contents, 0.8, { maxPairs: 50 });
  assert.equal(r.pairs.length, 50);
  assert.equal(r.capped, true);
});

test('T16: 5,000 notes finish, with the event loop free between chunks', async () => {
  const contents: Record<string, string> = {};
  const shared = words(70, 200);
  for (let i = 0; i < 5000; i++) {
    // every 500th note is a near copy of one shared text, the rest are unique
    contents[`n${i}`] = i % 500 === 0 ? textOf([...shared, ...words(5000 + i, 5)]) : textOf(words(10000 + i, 150));
  }
  let maxGap = 0;
  let last = performance.now();
  const r = await scan(contents, 0.8, {
    chunkSize: 20,
    yieldFn: () => new Promise<void>(resolve => setTimeout(() => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
      resolve();
    }, 0))
  });
  assert.equal(r.pairs.length, 45, '10 near-copies -> C(10,2) pairs');
  assert.ok(maxGap < 400, `longest stretch without yielding: ${maxGap.toFixed(0)} ms`);
});
