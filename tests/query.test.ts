import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEmptyQuery, matchesFilters, parseModified, parseQuery, highlightTermsOf } from '../src/search/query-parser';
import { containsPhrase, filterByPhrases, runSearch } from '../src/search/run-search';
import { SearchEngine } from '../src/search-engine';
import { IndexedFile } from '../src/types';
import { makeVault, cleanup } from './helpers';
import * as path from 'path';

const NOW = new Date(2026, 10, 20, 12, 0, 0).getTime(); // 20 Nov 2026 12:00 local
const DAY = 86400000;

function file(vault: string, rel: string, over: Partial<IndexedFile> = {}): IndexedFile {
  return {
    id: `${vault}:${rel}`, vaultId: vault.toLowerCase(), vaultName: vault, absolutePath: `/x/${vault}/${rel}`,
    relativePath: rel, basename: (rel.split('/').pop() ?? rel).replace(/\.md$/, ''), extension: '.md', mtime: NOW, size: 1, ...over
  };
}

// ---- parser (T14) ------------------------------------------------------------------

test('T14: every operator in one query', () => {
  const q = parseQuery('vault:B path:proyek tag:ide -tag:draft -spam modified:>7d "frasa persis" kata', NOW);
  assert.deepEqual(q.vaults, ['B']);
  assert.deepEqual(q.paths, ['proyek']);
  assert.deepEqual(q.tags, ['ide']);
  assert.deepEqual(q.notTags, ['draft']);
  assert.deepEqual(q.notTerms, ['spam']);
  assert.deepEqual(q.phrases, ['frasa persis']);
  assert.equal(q.text, 'kata');
  assert.deepEqual(q.modified, [{ from: NOW - 7 * DAY }]);
  assert.deepEqual(q.problems, []);
});

test('T14: #tag is an alias of tag:, also negated; nested tags keep their slash', () => {
  const q = parseQuery('#idea -#draft #project/alpha tag:#x', NOW);
  assert.deepEqual(q.tags, ['idea', 'project/alpha', 'x']);
  assert.deepEqual(q.notTags, ['draft']);
  assert.equal(q.text, '');
});

test('T14: quoted values with spaces, negated phrases, operators are case-insensitive', () => {
  const q = parseQuery('VAULT:"My Vault" path:"a b" -"bad words" -vault:Old -path:tmp', NOW);
  assert.deepEqual(q.vaults, ['My Vault']);
  assert.deepEqual(q.paths, ['a b']);
  assert.deepEqual(q.notPhrases, ['bad words']);
  assert.deepEqual(q.notVaults, ['Old']);
  assert.deepEqual(q.notPaths, ['tmp']);
});

test('T14: modified accepts relative ages and dates with comparison operators', () => {
  assert.deepEqual(parseModified('>7d', NOW), { from: NOW - 7 * DAY });
  assert.deepEqual(parseModified('7d', NOW), { from: NOW - 7 * DAY });
  assert.deepEqual(parseModified('<30d', NOW), { to: NOW - 30 * DAY });
  assert.deepEqual(parseModified('>2w', NOW), { from: NOW - 14 * DAY });
  assert.deepEqual(parseModified('>12h', NOW), { from: NOW - 12 * 3600000 });
  const jan1 = new Date(2026, 0, 1).getTime();
  const jan2 = new Date(2026, 0, 2).getTime();
  assert.deepEqual(parseModified('<2026-01-01', NOW), { to: jan1 });
  assert.deepEqual(parseModified('>=2026-01-01', NOW), { from: jan1 });
  assert.deepEqual(parseModified('>2026-01-01', NOW), { from: jan2 });
  assert.deepEqual(parseModified('<=2026-01-01', NOW), { to: jan2 });
  assert.deepEqual(parseModified('2026-01-01', NOW), { from: jan1, to: jan2 });
});

test('T14: invalid input never throws and is reported, not silently dropped', () => {
  for (const bad of ['modified:soon', 'modified:2026-02-31', 'modified:>', 'vault:', 'tag:', '-modified:7d', '"unterminated phrase', '-', '--', '::', 'a:b:c', '""', ' \t\n']) {
    assert.doesNotThrow(() => parseQuery(bad, NOW), bad);
  }
  assert.equal(parseQuery('modified:soon', NOW).problems.length, 1);
  assert.equal(parseQuery('modified:2026-02-31', NOW).problems.length, 1);
  assert.equal(parseQuery('vault:', NOW).problems.length, 1);
  assert.equal(parseQuery('-modified:7d', NOW).problems.length, 1);
  assert.deepEqual(parseQuery('"unterminated phrase', NOW).phrases, ['unterminated phrase']);
  assert.doesNotThrow(() => parseQuery(undefined as unknown as string, NOW));
  assert.equal(isEmptyQuery(parseQuery('   ', NOW)), true);
});

test('unknown prefixes are ordinary words (http://x, note:abc)', () => {
  assert.equal(parseQuery('http://x note:abc', NOW).text, 'http://x note:abc');
});

test('isEmptyQuery / highlightTermsOf', () => {
  assert.equal(isEmptyQuery(parseQuery('vault:B', NOW)), false);
  assert.equal(isEmptyQuery(parseQuery('-word', NOW)), false);
  assert.deepEqual(highlightTermsOf(parseQuery('alpha "beta gamma" -nope vault:B', NOW)), ['alpha', 'beta', 'gamma']);
});

// ---- metadata filters --------------------------------------------------------------------

test('T14: matchesFilters applies vault, path, tags (nested), negations and modified windows', () => {
  const a = file('Work', 'proyek/alpha/note.md', { tags: ['ide', 'project/alpha'], mtime: NOW - 2 * DAY });
  const b = file('Home', 'journal/x.md', { tags: ['draft'], mtime: NOW - 40 * DAY });
  const m = (raw: string, f: IndexedFile) => matchesFilters(f, parseQuery(raw, NOW));
  assert.equal(m('vault:work', a), true);
  assert.equal(m('vault:Work vault:Home', b), true, 'several vault: = any of them');
  assert.equal(m('-vault:Work', a), false);
  assert.equal(m('path:PROYEK/alpha', a), true);
  assert.equal(m('path:proyek path:journal', a), false, 'several path: = all of them');
  assert.equal(m('tag:project', a), true, 'parent of a nested tag');
  assert.equal(m('tag:art', file('W', 'x.md', { tags: ['smart'] })), false, '#art never matches #smart');
  assert.equal(m('-tag:draft', b), false);
  assert.equal(m('-tag:draft', a), true);
  assert.equal(m('modified:>7d', a), true);
  assert.equal(m('modified:>7d', b), false);
  assert.equal(m('modified:<30d', b), true);
  assert.equal(m('modified:>30d modified:<3d', a), false, 'two windows must both hold');
  assert.equal(m('tag:ide path:alpha vault:Work modified:>7d', a), true, 'combination');
});

// ---- engine ---------------------------------------------------------------------------------

function engineWith(files: Array<[IndexedFile, string]>): SearchEngine {
  const se = new SearchEngine();
  se.applyDelta({ vaultId: 'v', added: files.map(([f]) => f), updated: [], removed: [] }, new Map(files.map(([f, body]) => [f.id, body])));
  return se;
}

test('T14: searchParsed combines words with vault/tag/path filters', () => {
  const se = engineWith([
    [file('Work', 'p/a.md', { tags: ['ide'] }), 'rocket launch plan'],
    [file('Work', 'q/b.md', { tags: ['draft'] }), 'rocket engine notes'],
    [file('Home', 'p/c.md', { tags: ['ide'] }), 'rocket recipe']
  ]);
  const ids = (raw: string) => se.searchParsed(parseQuery(raw, NOW)).map(r => r.file.relativePath + '@' + r.file.vaultName).sort();
  assert.deepEqual(ids('rocket vault:Work tag:ide'), ['p/a.md@Work']);
  assert.deepEqual(ids('rocket path:p/'), ['p/a.md@Work', 'p/c.md@Home']);
  assert.deepEqual(ids('rocket -tag:draft'), ['p/a.md@Work', 'p/c.md@Home']);
});

test('T14: a negated word removes notes that contain it anywhere in the text', () => {
  const se = engineWith([
    [file('W', 'a.md'), 'rocket launch'],
    [file('W', 'b.md'), 'rocket engine failure'],
    [file('W', 'c.md'), 'rocket recipe']
  ]);
  assert.deepEqual(se.searchParsed(parseQuery('rocket -failure', NOW)).map(r => r.file.relativePath).sort(), ['a.md', 'c.md']);
  assert.deepEqual(se.searchParsed(parseQuery('rocket -launch -recipe', NOW)).map(r => r.file.relativePath), ['b.md']);
});

test('T14: filters without words list matching notes newest first; limit applies', () => {
  const se = engineWith([
    [file('W', 'old.md', { tags: ['ide'], mtime: NOW - 5 * DAY }), 'x'],
    [file('W', 'new.md', { tags: ['ide'], mtime: NOW - 1 * DAY }), 'y'],
    [file('W', 'other.md', { tags: ['x'] }), 'z']
  ]);
  assert.deepEqual(se.searchParsed(parseQuery('tag:ide', NOW)).map(r => r.file.relativePath), ['new.md', 'old.md']);
  assert.equal(se.searchParsed(parseQuery('tag:ide', NOW), { limit: 1 }).length, 1);
  assert.deepEqual(se.searchParsed(parseQuery('vault:Nope', NOW)), []);
});

test('T22: plain text, #tag and vault-filter searches return the same files and order as the 2.4.0 search()', () => {
  const se = engineWith([
    [file('A', 'zebra.md', { tags: ['animal/wild'] }), 'a zebra runs'],
    [file('A', 'notes.md', { tags: ['smart'] }), 'zebra mentioned in the middle of a long text'],
    [file('B', 'garden.md', { tags: ['animal'] }), 'nothing about stripes'],
    [file('B', 'kuda.md'), 'zebrafish are not zebras']
  ]);
  const old = (q: string, o?: { vaultId?: string; tags?: string[] }) => se.search(q, o).map(r => r.file.id);
  const now = (raw: string, vaultId?: string) => se.searchParsed(parseQuery(raw, NOW), { vaultId }).map(r => r.file.id);
  assert.deepEqual(now('zebra'), old('zebra'));
  assert.deepEqual(now('zebra', 'b'), old('zebra', { vaultId: 'b' }));
  assert.deepEqual(now('zebra #animal'), old('zebra', { tags: ['#animal'] }));
  assert.deepEqual(now('#smart'), old('', { tags: ['#smart'] }));
  assert.deepEqual(now('#animal', 'a'), old('', { tags: ['#animal'], vaultId: 'a' }));
});

// ---- phrases ---------------------------------------------------------------------------------

test('containsPhrase is case- and whitespace-insensitive', () => {
  assert.equal(containsPhrase('The Quick\n  brown   fox', 'quick brown'), true);
  assert.equal(containsPhrase('brown quick', 'quick brown'), false);
  assert.equal(containsPhrase('anything', '   '), true);
});

test('T14: "exact phrase" keeps only notes with the words in that order (read from disk), and -"phrase" removes them', async () => {
  const v = makeVault('ph', {
    'a.md': 'the quick brown fox jumps',
    'b.md': 'brown quick: wrong order, fox',
    'c.md': '---\ntitle: quick brown\n---\nunrelated body',
    'd.md': 'quick brown fox but also lazy dog'
  });
  try {
    const mk = (rel: string): IndexedFile => file('PH', rel, { absolutePath: path.join(v.path, rel) });
    const files = ['a.md', 'b.md', 'c.md', 'd.md'].map(mk);
    const se = engineWith([[files[0], 'the quick brown fox jumps'], [files[1], 'brown quick: wrong order, fox'], [files[2], 'unrelated body'], [files[3], 'quick brown fox but also lazy dog']]);

    const run = await runSearch(se, '"quick brown"', { maxIndexedBytes: 100000 });
    assert.deepEqual(run.results.map(r => r.file.relativePath).sort(), ['a.md', 'd.md']);

    const combined = await runSearch(se, '"quick brown" fox -"lazy dog"', { maxIndexedBytes: 100000 });
    assert.deepEqual(combined.results.map(r => r.file.relativePath), ['a.md']);

    const filtered = await filterByPhrases(se.searchParsed(parseQuery('fox', NOW)), [], ['lazy dog'], 100000);
    assert.ok(filtered.every(r => r.file.relativePath !== 'd.md'));
  } finally {
    cleanup(v);
  }
});

test('runSearch: empty query returns nothing, limit is honoured, unreadable files are dropped for phrase queries', async () => {
  const se = engineWith([[file('W', 'a.md'), 'alpha'], [file('W', 'b.md'), 'alpha'], [file('W', 'c.md'), 'alpha']]);
  assert.deepEqual((await runSearch(se, '   ', { maxIndexedBytes: 1000 })).results, []);
  assert.equal((await runSearch(se, 'alpha', { limit: 2, maxIndexedBytes: 1000 })).results.length, 2);
  assert.equal((await runSearch(se, '"alpha"', { maxIndexedBytes: 1000 })).results.length, 0, 'files do not exist on disk');
});

test('T24: parsing and operator search stay fast on a 5,000-document engine (median well under 100 ms)', () => {
  const files: Array<[IndexedFile, string]> = [];
  for (let i = 0; i < 5000; i++) {
    files.push([file(i % 3 === 0 ? 'A' : 'B', `dir${i % 50}/note${i}.md`, { tags: [i % 2 ? 'idea' : 'draft'], mtime: NOW - (i % 90) * DAY }), `word${i % 700} common filler text number ${i}`]);
  }
  const se = engineWith(files);
  const queries = ['common', 'word12 vault:A', 'common tag:idea -draft', 'path:dir7 modified:>30d', 'word5 -word6 vault:B tag:idea', 'filler path:dir1/ modified:<60d'];
  const times: number[] = [];
  for (let round = 0; round < 4; round++) {
    for (const raw of queries) {
      const t = performance.now();
      se.searchParsed(parseQuery(raw, NOW), { limit: 20 });
      times.push(performance.now() - t);
    }
  }
  times.sort((a, b) => a - b);
  assert.ok(times[Math.floor(times.length / 2)] < 100, `median ${times[Math.floor(times.length / 2)]} ms`);
});
