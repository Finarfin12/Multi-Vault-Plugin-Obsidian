import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExcluder, compileExcludePattern, globToRegExp, isDefaultExcluded, normalizeRelativePath } from '../src/indexer/path-matcher';
import { FileScanner } from '../src/indexer/file-scanner';
import { makeVault, cleanup } from './helpers';

test('T9: "art" does not exclude smart/ or Article/, but excludes a folder literally named art', () => {
  const ex = buildExcluder(['art']);
  assert.equal(ex('smart/note.md'), false);
  assert.equal(ex('Article/note.md'), false);
  assert.equal(ex('art/note.md'), true);
  assert.equal(ex('Art'), true);
  assert.equal(ex('deep/ART/n.md'), true);
});

test('T9: "Private" excludes Private/ at any depth, case-insensitively', () => {
  const ex = buildExcluder(['Private']);
  assert.equal(ex('Private/a.md'), true);
  assert.equal(ex('x/private/a.md'), true);
  assert.equal(ex('Privateer/a.md'), false);
});

test('T9: glob **/draft-* matches at any depth, including the root', () => {
  const ex = buildExcluder(['**/draft-*']);
  assert.equal(ex('draft-1.md'), true);
  assert.equal(ex('a/b/draft-2.md'), true);
  assert.equal(ex('a/mydraft-3.md'), false);
  assert.equal(ex('a/draft/x.md'), false);
});

test('a bare name also matches the .md file of that name (diary excludes diary.md)', () => {
  const ex = buildExcluder(['diary', 'secret.md']);
  assert.equal(ex('diary.md'), true);
  assert.equal(ex('x/secret.md'), true);
  assert.equal(ex('diaryx.md'), false);
});

test('segment glob without slash (draft-*) matches any single segment, also folders', () => {
  const ex = buildExcluder(['draft-*']);
  assert.equal(ex('draft-a/x.md'), true);
  assert.equal(ex('y/draft-b.md'), true);
  assert.equal(ex('y/redraft-b.md'), false);
});

test('multi-segment literal (notes/archive) matches consecutive segments anywhere', () => {
  const ex = buildExcluder(['notes/archive']);
  assert.equal(ex('notes/archive/a.md'), true);
  assert.equal(ex('x/notes/archive/a.md'), true);
  assert.equal(ex('notes/other/archive/a.md'), false);
  assert.equal(ex('notes/archived/a.md'), false);
});

test('path glob with a folder prefix drops the whole subtree', () => {
  const ex = buildExcluder(['proj/*/old']);
  assert.equal(ex('proj/a/old'), true);
  assert.equal(ex('proj/a/old/n.md'), true);
  assert.equal(ex('proj/a/new/n.md'), false);
});

test('? matches exactly one character and * does not cross folders', () => {
  assert.equal(globToRegExp('a?c.md').test('abc.md'), true);
  assert.equal(globToRegExp('a?c.md').test('ac.md'), false);
  assert.equal(globToRegExp('a*c.md').test('a/c.md'), false);
  assert.equal(globToRegExp('a**c.md').test('a/x/c.md'), true);
});

test('regex metacharacters in a pattern are literal (c++ (1).md)', () => {
  const ex = buildExcluder(['c++ (1).md']);
  assert.equal(ex('c++ (1).md'), true);
  assert.equal(ex('c (1).md'), false);
});

test('backslashes, leading ./ and trailing / are normalised; empty patterns are ignored', () => {
  assert.equal(normalizeRelativePath('.\\a\\b/'), 'a/b');
  const ex = buildExcluder(['  ', '', 'notes\\archive/']);
  assert.equal(ex('notes/archive/x.md'), true);
  assert.equal(compileExcludePattern('   '), null);
});

test('built-in folders are always excluded and the empty path never is', () => {
  const ex = buildExcluder([]);
  assert.equal(isDefaultExcluded('a/node_modules/x.md'), true);
  assert.equal(ex('.git/config.md'), true);
  assert.equal(ex('.trash/x.md'), true);
  assert.equal(ex(''), false);
  assert.equal(ex('plain/x.md'), false);
});

test('scanner (2.4.0): "art" keeps smart/ and Article/, drops art/', async () => {
  const vault = makeVault('m1', { 'smart/x.md': '1', 'Article/y.md': '2', 'art/z.md': '3', 'keep/k.md': '4' });
  try {
    const entries = await new FileScanner(['art']).scanVaultAsync(vault);
    assert.deepEqual(entries.map(e => e.relativePath).sort(), ['Article/y.md', 'keep/k.md', 'smart/x.md']);
  } finally {
    cleanup(vault);
  }
});

test('scanner (2.4.0): Private drops Private/ and **/draft-* drops drafts at depth', async () => {
  const vault = makeVault('m2', { 'Private/a.md': '1', 'a/draft-1.md': '2', 'a/final.md': '3', 'top.md': '4' });
  try {
    const entries = await new FileScanner(['Private', '**/draft-*']).scanVaultAsync(vault);
    assert.deepEqual(entries.map(e => e.relativePath).sort(), ['a/final.md', 'top.md']);
  } finally {
    cleanup(vault);
  }
});

test('scanner.scanPath: single file, sub-folder, excluded path and missing path', async () => {
  const vault = makeVault('m3', { 'a/one.md': '1', 'a/two.md': '2', 'b/three.md': '3', 'Private/p.md': '4' });
  try {
    const scanner = new FileScanner(['Private']);
    assert.deepEqual((await scanner.scanPath(vault, 'a/one.md')).map(e => e.relativePath), ['a/one.md']);
    assert.deepEqual((await scanner.scanPath(vault, 'a')).map(e => e.relativePath).sort(), ['a/one.md', 'a/two.md']);
    assert.deepEqual(await scanner.scanPath(vault, 'Private/p.md'), []);
    assert.deepEqual(await scanner.scanPath(vault, 'nope/x.md'), []);
  } finally {
    cleanup(vault);
  }
});
