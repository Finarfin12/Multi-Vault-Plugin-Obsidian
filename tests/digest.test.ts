import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDigest, formatDay, formatDigestMarkdown, insertSummaryBlock, linkFor, MAX_HISTORY, nextHistory, resolveRange,
  SUMMARY_MARKER_END, SUMMARY_MARKER_START
} from '../src/analysis/digest';
import { countWords } from '../src/indexer/markdown-parser';
import { IndexedFile } from '../src/types';
import { makeVault, writeFile, cleanup, makeEnv } from './helpers';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0).getTime();
const NOW = at(2026, 11, 20);

function file(vault: string, rel: string, over: Partial<IndexedFile> = {}): IndexedFile {
  return {
    id: `${vault}:${rel}`, vaultId: vault.toLowerCase(), vaultName: vault, absolutePath: `/x/${vault}/${rel}`,
    relativePath: rel, basename: rel.replace(/\.md$/, '').split('/').pop() ?? rel, extension: '.md', mtime: NOW, size: 1, ...over
  };
}

// ---- ranges --------------------------------------------------------------------------

test('T18: today = local midnight to next midnight; 7 days = last 7 calendar days including today', () => {
  const today = resolveRange('today', NOW);
  assert.deepEqual(today, { from: at(2026, 11, 20, 0), to: at(2026, 11, 21, 0), label: '2026-11-20' });
  const week = resolveRange('7d', NOW);
  assert.equal(week?.from, at(2026, 11, 14, 0));
  assert.equal(week?.to, at(2026, 11, 21, 0));
  assert.equal(week?.label, '2026-11-14 to 2026-11-20');
});

test('T18: custom range includes both end days; invalid, reversed or missing ranges give null', () => {
  const r = resolveRange('custom', NOW, { from: '2026-11-01', to: '2026-11-03' });
  assert.equal(r?.from, at(2026, 11, 1, 0));
  assert.equal(r?.to, at(2026, 11, 4, 0));
  assert.equal(resolveRange('custom', NOW, { from: '2026-11-05', to: '2026-11-05' })?.label, '2026-11-05');
  assert.equal(resolveRange('custom', NOW, { from: '2026-11-05', to: '2026-11-01' }), null);
  assert.equal(resolveRange('custom', NOW, { from: '2026-02-31', to: '2026-03-01' }), null);
  assert.equal(resolveRange('custom', NOW, { from: '', to: '' }), null);
  assert.equal(resolveRange('custom', NOW), null);
  assert.equal(formatDay(at(2026, 1, 5)), '2026-01-05');
});

test('across a month and year boundary the 7-day range is still correct', () => {
  const r = resolveRange('7d', at(2027, 1, 3));
  assert.equal(r?.label, '2026-12-28 to 2027-01-03');
});

// ---- digest --------------------------------------------------------------------------

test('T18: notes are grouped per vault and classified by ctime (created) or mtime (modified)', () => {
  const range = resolveRange('today', NOW)!;
  const files = [
    file('A', 'new.md', { ctime: at(2026, 11, 20, 9), mtime: at(2026, 11, 20, 10), wordCount: 120 }),
    file('A', 'edited.md', { ctime: at(2026, 10, 1), mtime: at(2026, 11, 20, 11), wordCount: 300, wordHistory: [[at(2026, 10, 1), 250], [at(2026, 11, 20, 11), 300]] }),
    file('B', 'other.md', { ctime: at(2026, 11, 20, 8), mtime: at(2026, 11, 20, 8), wordCount: 40 }),
    file('B', 'old.md', { ctime: at(2026, 9, 1), mtime: at(2026, 9, 2), wordCount: 999 }),
    file('C', 'untouched.md', { mtime: at(2026, 11, 19, 23) })
  ];
  const d = buildDigest(files, range);
  assert.deepEqual(d.map(v => [v.vaultName, v.created, v.modified]), [['A', 1, 1], ['B', 1, 0]]);
  const a = d[0];
  assert.equal(a.entries.length, 2);
  assert.equal(a.entries[0].file.basename, 'edited', 'newest first');
  assert.equal(a.wordsAdded, 170, '120 new + (300 - 250) growth');
  assert.equal(a.wordsComplete, true);
});

test('T18: each note counts once; a note created and edited today is "created"; ctime missing falls back to mtime', () => {
  const range = resolveRange('today', NOW)!;
  const files = [
    file('A', 'both.md', { ctime: at(2026, 11, 20, 1), mtime: at(2026, 11, 20, 2), wordCount: 10 }),
    file('A', 'noctime.md', { mtime: at(2026, 11, 20, 3), wordCount: 5, wordHistory: [[at(2026, 11, 1), 5]] })
  ];
  const [a] = buildDigest(files, range);
  assert.deepEqual(a.entries.map(e => e.kind).sort(), ['created', 'modified']);
});

test('T18: words added for a modified note is unknown (and flagged) when no earlier version was seen, and never negative', () => {
  const range = resolveRange('today', NOW)!;
  const files = [
    file('A', 'first-seen.md', { ctime: at(2026, 1, 1), mtime: at(2026, 11, 20, 5), wordCount: 500, wordHistory: [[at(2026, 11, 20, 5), 500]] }),
    file('A', 'shrunk.md', { ctime: at(2026, 1, 1), mtime: at(2026, 11, 20, 6), wordCount: 100, wordHistory: [[at(2026, 11, 1), 400], [at(2026, 11, 20, 6), 100]] })
  ];
  const [a] = buildDigest(files, range);
  assert.equal(a.wordsAdded, 0);
  assert.equal(a.wordsComplete, false);
  assert.equal(a.entries.find(e => e.file.basename === 'first-seen')?.wordsAdded, undefined);
  assert.equal(a.entries.find(e => e.file.basename === 'shrunk')?.wordsAdded, 0);
});

test('T18: a 7-day range sums edits across days using the word count before the period', () => {
  const range = resolveRange('7d', NOW)!;
  const f = file('A', 'n.md', {
    ctime: at(2026, 1, 1), mtime: at(2026, 11, 19), wordCount: 260,
    wordHistory: [[at(2026, 10, 30), 200], [at(2026, 11, 15), 230], [at(2026, 11, 19), 260]]
  });
  assert.equal(buildDigest([f], range)[0].entries[0].wordsAdded, 60);
  // the same note seen through a "today" range: only the last edit is before? none before today except 11-19 -> 0 growth today
  assert.equal(buildDigest([{ ...f, mtime: at(2026, 11, 20, 3), wordHistory: [...f.wordHistory!, [at(2026, 11, 20, 3), 270]], wordCount: 270 }], resolveRange('today', NOW)!)[0].entries[0].wordsAdded, 10);
});

test('empty period gives no groups', () => {
  assert.deepEqual(buildDigest([file('A', 'x.md', { mtime: at(2020, 1, 1) })], resolveRange('today', NOW)!), []);
});

// ---- word-count history (recorded by the indexer) --------------------------------------------------

test('nextHistory seeds from the previous version, appends, replaces same-mtime entries and caps the length', () => {
  const prev = file('A', 'n.md', { mtime: 100, wordCount: 10 });
  const upd = file('A', 'n.md', { mtime: 200, wordCount: 25 });
  assert.deepEqual(nextHistory(prev, upd), [[100, 10], [200, 25]]);
  assert.deepEqual(nextHistory(undefined, upd), [[200, 25]]);
  assert.deepEqual(nextHistory({ ...prev, wordHistory: [[100, 10], [200, 20]] }, upd), [[100, 10], [200, 25]], 'same mtime replaced');

  let h: Array<[number, number]> = [];
  for (let i = 1; i <= MAX_HISTORY + 10; i++) {
    h = nextHistory({ ...prev, wordHistory: h, mtime: i - 1 }, file('A', 'n.md', { mtime: i, wordCount: i }));
  }
  assert.equal(h.length, MAX_HISTORY);
  assert.deepEqual(h[h.length - 1], [MAX_HISTORY + 10, MAX_HISTORY + 10]);
});

test('countWords counts letters/digits runs in any script', () => {
  assert.equal(countWords('Hello, world! 42 café 日本語'), 5);
  assert.equal(countWords(''), 0);
});

test('the indexer records ctime, wordCount and a growing history across edits', async () => {
  const v = makeVault('h', { 'n.md': 'one two three' });
  const env = makeEnv([v]);
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);
    const first = env.indexer.getIndexedFiles()[0];
    assert.equal(first.wordCount, 3);
    assert.ok(first.ctime === undefined || first.ctime > 0);
    assert.equal(first.wordHistory?.length, 1);

    writeFile(v, 'n.md', 'one two three four five six', Date.now() + 5000);
    await env.indexer.buildFullIndex(false, true);
    const second = env.indexer.getIndexedFiles()[0];
    assert.equal(second.wordCount, 6);
    assert.deepEqual(second.wordHistory?.map(h => h[1]), [3, 6]);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});

// ---- markdown and insertion (T18: writes only the active note) ----------------------------------------------

test('formatDigestMarkdown: vault headings, counts, links (plain in the active vault, [[Vault::Note]] elsewhere), markers', () => {
  const range = resolveRange('today', NOW)!;
  const files = [
    file('A', 'dir/new.md', { ctime: at(2026, 11, 20, 9), mtime: at(2026, 11, 20, 9), wordCount: 50 }),
    file('B', 'edited.md', { ctime: at(2026, 1, 1), mtime: at(2026, 11, 20, 9), wordCount: 70, wordHistory: [[at(2026, 11, 1), 60], [at(2026, 11, 20, 9), 70]] })
  ];
  const md = formatDigestMarkdown(buildDigest(files, range), range, 'a');
  assert.ok(md.startsWith(SUMMARY_MARKER_START) && md.endsWith(SUMMARY_MARKER_END));
  assert.ok(md.includes('## Cross-vault summary: 2026-11-20'));
  assert.ok(md.includes('### A (1 created, 0 modified · about +50 words)'));
  assert.ok(md.includes('- Created: [[dir/new]] (+50 words)'), md);
  assert.ok(md.includes('- Modified: [[B::edited]] (+10 words)'), md);
  assert.equal(linkFor(files[1], 'a'), '[[B::edited]]');
  assert.ok(formatDigestMarkdown([], range, null).includes('No notes were created or changed'));
});

test('T18: insertSummaryBlock appends once and replaces the earlier block instead of duplicating it; other text is untouched', () => {
  const block1 = `${SUMMARY_MARKER_START}\nfirst\n${SUMMARY_MARKER_END}`;
  const block2 = `${SUMMARY_MARKER_START}\nsecond\n${SUMMARY_MARKER_END}`;
  const note = '# Daily\n\nmy own text\n';
  const once = insertSummaryBlock(note, block1);
  assert.equal(once, `# Daily\n\nmy own text\n\n${block1}\n`);
  const twice = insertSummaryBlock(once, block2);
  assert.equal(twice, `# Daily\n\nmy own text\n\n${block2}\n`);
  assert.equal(twice.split(SUMMARY_MARKER_START).length, 2);
  assert.equal(insertSummaryBlock('', block1), `${block1}\n`);
  const middle = `top\n${block1}\nbottom after`;
  assert.equal(insertSummaryBlock(middle, block2), `top\n${block2}\nbottom after`);
});
