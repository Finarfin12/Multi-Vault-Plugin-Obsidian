import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { SearchEngine } from '../src/search-engine';
import { IndexedFile, IndexDelta } from '../src/types';
import { buildSnippet, loadSnippet } from '../src/search/snippet';
import { MarkdownParser, stripFrontmatter, truncateToBytes } from '../src/indexer/markdown-parser';
import { readText, readTextOrNull, statOrNull, pathExists, isDirectory } from '../src/fs-async';
import { makeVault, cleanup } from './helpers';

function file(rel: string, over: Partial<IndexedFile> = {}): IndexedFile {
  return {
    id: `v:${rel}`, vaultId: 'v', vaultName: 'V', absolutePath: `/x/${rel}`, relativePath: rel,
    basename: rel.replace(/\.md$/, ''), extension: '.md', mtime: 1, size: 1, ...over
  };
}

function delta(over: Partial<IndexDelta>): IndexDelta {
  return { vaultId: 'v', added: [], updated: [], removed: [], ...over };
}

// ---- SearchEngine: incremental updates and cache --------------------------------

test('applyDelta: add, update (replace) and remove change search results without a full rebuild', () => {
  const se = new SearchEngine();
  const a = file('a.md');
  const b = file('b.md');
  se.applyDelta(delta({ added: [a, b] }), new Map([[a.id, 'giraffeword'], [b.id, 'hippoword']]));
  assert.equal(se.search('giraffeword').length, 1);
  assert.equal(se.search('hippoword').length, 1);

  se.applyDelta(delta({ updated: [{ ...a, mtime: 2 }] }), new Map([[a.id, 'zebraword']]));
  assert.equal(se.search('giraffeword').length, 0);
  assert.equal(se.search('zebraword').length, 1);
  assert.equal(se.getFileById(a.id)?.mtime, 2);

  se.applyDelta(delta({ removed: [b.id] }));
  assert.equal(se.search('hippoword').length, 0);
  assert.equal(se.getFileById(b.id), undefined);
  assert.equal(se.documentCount, 1);
});

test('applyDelta is tolerant: removing an unknown id and "adding" an existing id do not throw', () => {
  const se = new SearchEngine();
  const a = file('a.md');
  se.applyDelta(delta({ added: [a] }), new Map([[a.id, 'firstword']]));
  assert.doesNotThrow(() => se.applyDelta(delta({ removed: ['v:nope.md'] })));
  assert.doesNotThrow(() => se.applyDelta(delta({ added: [a] }), new Map([[a.id, 'secondword']])));
  assert.equal(se.search('secondword').length, 1);
  assert.equal(se.search('firstword').length, 0);
});

test('body text is searchable but never kept on the file metadata objects', () => {
  const se = new SearchEngine();
  const a = file('a.md');
  se.applyDelta(delta({ added: [a] }), new Map([[a.id, 'confidentialbody']]));
  const hit = se.search('confidentialbody')[0];
  assert.equal(hit.file, a);
  assert.equal('body' in hit.file, false);
});

test('a title match outranks a body-only match', () => {
  const se = new SearchEngine();
  const t = file('quasar.md');
  const body = file('other.md');
  se.applyDelta(delta({ added: [t, body] }), new Map([[t.id, 'unrelated text'], [body.id, 'a long text about a quasar somewhere']]));
  assert.equal(se.search('quasar')[0].file.basename, 'quasar');
});

test('serialize -> loadFromCache restores identical results, also after discards (vacuumed)', async () => {
  const se = new SearchEngine();
  const files = [file('a.md'), file('b.md'), file('c.md')];
  se.applyDelta(delta({ added: files }), new Map([[files[0].id, 'alphaterm'], [files[1].id, 'betaterm'], [files[2].id, 'gammaterm']]));
  se.applyDelta(delta({ removed: [files[1].id] }));
  const json = JSON.parse(JSON.stringify(await se.serialize()));

  const restored = new SearchEngine();
  assert.equal(restored.loadFromCache([files[0], files[2]], json), true);
  assert.equal(restored.search('alphaterm').length, 1);
  assert.equal(restored.search('gammaterm').length, 1);
  assert.equal(restored.search('betaterm').length, 0);
  assert.equal(restored.documentCount, 2);
});

test('loadFromCache rejects garbage and a document-count mismatch, leaving the engine usable', async () => {
  const se = new SearchEngine();
  const a = file('a.md');
  se.applyDelta(delta({ added: [a] }), new Map([[a.id, 'someterm']]));
  const json = JSON.parse(JSON.stringify(await se.serialize()));

  const target = new SearchEngine();
  assert.equal(target.loadFromCache([a], 'not an index'), false);
  assert.equal(target.loadFromCache([a], null), false);
  assert.equal(target.loadFromCache([a, file('b.md')], json), false, 'count mismatch');
  assert.equal(target.loadFromCache([a], { documentCount: 1 }), false);
  target.applyDelta(delta({ added: [a] }), new Map([[a.id, 'freshterm']]));
  assert.equal(target.search('freshterm').length, 1);
});

test('clear() empties documents and metadata', () => {
  const se = new SearchEngine();
  const a = file('a.md');
  se.applyDelta(delta({ added: [a] }), new Map([[a.id, 'term']]));
  se.clear();
  assert.equal(se.search('term').length, 0);
  assert.equal(se.documentCount, 0);
  assert.deepEqual(se.getRecentFiles(5), []);
});

// ---- Snippets --------------------------------------------------------------------

test('T1: the excerpt is cut around the matching word and contains it', () => {
  const text = `${'filler words go here '.repeat(100)} the zyxwvuniqueword appears now ${'more filler '.repeat(100)}`;
  const s = buildSnippet(text, ['zyxwvuniqueword']);
  assert.equal(s.matched, true);
  assert.ok(s.text.includes('zyxwvuniqueword'));
  assert.ok(s.text.length < 260, `excerpt is short (${s.text.length})`);
  assert.ok(s.text.startsWith('…') && s.text.endsWith('…'));
});

test('excerpt terms match at the start of a word ("art" does not match inside "smart")', () => {
  assert.equal(buildSnippet('a smart idea about nothing', ['art']).matched, false);
  assert.equal(buildSnippet('an art project', ['art']).matched, true);
  assert.equal(buildSnippet('Artisan bread', ['artis']).matched, true, 'prefix + case-insensitive');
});

test('excerpt falls back to the beginning of the text when nothing matches, and strips heading markers', () => {
  const s = buildSnippet('# Title\n\nSome   body text', ['absent']);
  assert.equal(s.matched, false);
  assert.equal(s.text, 'Title Some body text');
});

test('excerpt tolerates regex metacharacters in terms and unicode words', () => {
  assert.equal(buildSnippet('price is (5+5)* ok', ['(5+5)*']).matched, true); // literal, not a regex
  assert.doesNotThrow(() => buildSnippet('anything', ['[', '\\', '.*']));
  assert.equal(buildSnippet('kopi café enak', ['café']).matched, true);
});

test('loadSnippet reads the note async, skips frontmatter, honours maxIndexedBytes and returns null when unreadable', async () => {
  const v = makeVault('s', { 'n.md': `---\ntags: [x]\n---\n${'pad '.repeat(500)} needleword tail` });
  try {
    const f = file('n.md', { absolutePath: path.join(v.path, 'n.md') });
    const hit = await loadSnippet(f, ['needleword'], 200000);
    assert.equal(hit?.matched, true);
    assert.ok(hit?.text.includes('needleword'));
    const cut = await loadSnippet(f, ['needleword'], 100);
    assert.equal(cut?.matched, false, 'beyond the indexed bytes');
    const fm = await loadSnippet(f, ['tags'], 200000);
    assert.equal(fm?.matched, false, 'frontmatter is not part of the body');
    assert.equal(await loadSnippet(file('missing.md', { absolutePath: path.join(v.path, 'missing.md') }), ['x'], 1000), null);
  } finally {
    cleanup(v);
  }
});

// ---- Parser body / helpers --------------------------------------------------------

test('parser: fullText returns the body without frontmatter; preview-only mode returns no body', async () => {
  const v = makeVault('p', { 'n.md': '---\ntitle: T\n---\n# Head\nbody words here' });
  try {
    const entry = { absolutePath: path.join(v.path, 'n.md'), relativePath: 'n.md', basename: 'n', extension: '.md', mtime: 1, size: 1 };
    const full = await new MarkdownParser(1000, { fullText: true, maxIndexedBytes: 100000 }).parseMarkdownFileWithBody(entry, v);
    assert.equal(full.body, '# Head\nbody words here');
    assert.equal('body' in full.file, false);
    const off = await new MarkdownParser(1000, { fullText: false }).parseMarkdownFileWithBody(entry, v);
    assert.equal(off.body, undefined);
  } finally {
    cleanup(v);
  }
});

test('truncateToBytes: cuts at a byte limit without splitting a multibyte character', () => {
  assert.equal(truncateToBytes('abcdef', 100), 'abcdef');
  assert.equal(truncateToBytes('abcdef', 3), 'abc');
  const cut = truncateToBytes('é'.repeat(10), 5); // 2 bytes each -> 2 whole chars (4 bytes)
  assert.equal(cut, 'éé');
  assert.equal(truncateToBytes('', 10), '');
});

test('stripFrontmatter removes a leading YAML block only', () => {
  assert.equal(stripFrontmatter('---\na: 1\n---\nbody'), 'body');
  assert.equal(stripFrontmatter('no front\n---\nx\n---\n'), 'no front\n---\nx\n---\n');
});

// ---- fs-async ----------------------------------------------------------------------

test('fs-async: readText / readTextOrNull / statOrNull / pathExists / isDirectory', async () => {
  const v = makeVault('f', { 'dir/a.txt': 'hello' });
  try {
    const p = path.join(v.path, 'dir', 'a.txt');
    assert.equal(await readText(p), 'hello');
    assert.equal(await readTextOrNull(p), 'hello');
    assert.equal(await readTextOrNull(p + '.missing'), null);
    await assert.rejects(readText(p + '.missing'));
    assert.equal((await statOrNull(p))?.isFile(), true);
    assert.equal(await statOrNull(p + '.missing'), null);
    assert.equal(await pathExists(p), true);
    assert.equal(await pathExists(p + '.missing'), false);
    assert.equal(await isDirectory(path.join(v.path, 'dir')), true);
    assert.equal(await isDirectory(p), false);
  } finally {
    cleanup(v);
  }
});
