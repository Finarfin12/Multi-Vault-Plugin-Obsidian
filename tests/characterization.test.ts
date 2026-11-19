// Characterization tests: pin the observable behaviour of 2.3.4 BEFORE the 2.4.0 refactor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { MarkdownParser } from '../src/indexer/markdown-parser';
import { FileScanner, FileEntry } from '../src/indexer/file-scanner';
import { SearchEngine } from '../src/search-engine';
import { IndexedFile } from '../src/types';
import { makeVault, cleanup } from './helpers';

async function parse(content: string, maxPreview = 1000): Promise<IndexedFile> {
  const vault = makeVault('p', { 'Note.md': content });
  try {
    const entry: FileEntry = {
      absolutePath: path.join(vault.path, 'Note.md'),
      relativePath: 'Note.md',
      basename: 'Note',
      extension: '.md',
      mtime: 1,
      size: content.length
    };
    return await new MarkdownParser(maxPreview).parseMarkdownFileAsync(entry, vault);
  } finally {
    cleanup(vault);
  }
}

function fakeFile(over: Partial<IndexedFile>): IndexedFile {
  return {
    id: `v:${over.relativePath ?? 'a.md'}`,
    vaultId: 'v',
    vaultName: 'V',
    absolutePath: '/x/a.md',
    relativePath: 'a.md',
    basename: 'a',
    extension: '.md',
    mtime: 1,
    size: 1,
    ...over
  };
}

test('parser: id is vaultId:relativePath and metadata is carried over', async () => {
  const f = await parse('hello');
  assert.equal(f.id, 'p:Note.md');
  assert.equal(f.vaultName, 'P');
  assert.equal(f.basename, 'Note');
  assert.equal(f.extension, '.md');
});

test('parser: headings of all levels are extracted', async () => {
  const f = await parse('# One\ntext\n## Two\n### Three\n####### not a heading\n');
  assert.deepEqual(f.headings, ['One', 'Two', 'Three']);
});

test('parser: inline tags, nested tags, unicode tags; numeric-only ignored', async () => {
  const f = await parse('#idea and #project/alpha plus #café but #123 is not a tag, nor a#b');
  assert.deepEqual(f.tags?.slice().sort(), ['café', 'idea', 'project/alpha']);
});

test('parser: frontmatter tags (list, inline list, comma string) merge with inline tags without duplicates', async () => {
  const f = await parse('---\ntags:\n  - alpha\n  - #beta\ntag: gamma, delta\n---\nbody #alpha #epsilon\n');
  assert.deepEqual(f.tags?.slice().sort(), ['alpha', 'beta', 'delta', 'epsilon', 'gamma']);
});

test('parser: frontmatter key/value and inline array are parsed, and removed from preview', async () => {
  const f = await parse('---\ntitle: "My Title"\nlist: [a, b]\n---\nBody text here\n');
  assert.equal(f.frontmatter?.title, 'My Title');
  assert.deepEqual(f.frontmatter?.list, ['a', 'b']);
  assert.equal(f.contentPreview, 'Body text here');
});

test('parser: outgoing links are lowercased basenames, strip alias/heading/folders/.md, vault prefix', async () => {
  const f = await parse('[[Alpha]] [[Beta|alias]] [[Gamma#Head]] [[Vault::Delta]] [[dir/Epsilon.md]] [[Alpha]]');
  assert.deepEqual(f.outgoingLinks?.slice().sort(), ['alpha', 'beta', 'delta', 'epsilon', 'gamma']);
});

test('parser: preview strips heading markers, collapses whitespace and honours maxPreviewChars', async () => {
  const f = await parse('# Title\n\nsome    spaced\n\n\ntext', 12);
  assert.equal(f.contentPreview, 'Title some s');
});

test('scanner: skips .obsidian/.trash/node_modules/.git, only .md files, forward-slash relative paths', async () => {
  const vault = makeVault('s', {
    'a.md': '1', 'dir/b.md': '2', 'img.png': 'x', '.trash/t.md': '3', 'node_modules/n.md': '4', '.git/g.md': '5',
    '.obsidian/o.md': '6'
  });
  try {
    const entries = await new FileScanner([]).scanVaultAsync(vault);
    assert.deepEqual(entries.map(e => e.relativePath).sort(), ['a.md', 'dir/b.md']);
  } finally {
    cleanup(vault);
  }
});

test('scanner (2.3.4 behaviour): exclude is a case-insensitive SUBSTRING match, so "art" also drops smart/ and Article/', async () => {
  const vault = makeVault('s2', { 'smart/x.md': '1', 'Article/y.md': '2', 'art/z.md': '3', 'keep/k.md': '4' });
  try {
    const entries = await new FileScanner(['art']).scanVaultAsync(vault);
    assert.deepEqual(entries.map(e => e.relativePath), ['keep/k.md']);
  } finally {
    cleanup(vault);
  }
});

test('scanner: per-vault excludePatterns are applied together with the global ones', async () => {
  const vault = makeVault('s3', { 'Private/a.md': '1', 'Drafts/b.md': '2', 'ok/c.md': '3' }, { excludePatterns: ['drafts'] });
  try {
    const entries = await new FileScanner(['private']).scanVaultAsync(vault);
    assert.deepEqual(entries.map(e => e.relativePath), ['ok/c.md']);
  } finally {
    cleanup(vault);
  }
});

test('scanner: includePatterns restrict which files are listed', async () => {
  const vault = makeVault('s4', { 'proj/a.md': '1', 'other/b.md': '2' }, { includePatterns: ['proj'] });
  try {
    const entries = await new FileScanner([]).scanVaultAsync(vault);
    assert.deepEqual(entries.map(e => e.relativePath), ['proj/a.md']);
  } finally {
    cleanup(vault);
  }
});

test('search: basic ranking prefers basename over body preview, and returns [] for empty query', () => {
  const se = new SearchEngine();
  se.indexFiles([
    fakeFile({ relativePath: 'zebra.md', basename: 'zebra', contentPreview: 'nothing relevant' }),
    fakeFile({ relativePath: 'notes.md', basename: 'notes', contentPreview: 'a story about a zebra' })
  ]);
  const r = se.search('zebra');
  assert.equal(r[0].file.basename, 'zebra');
  assert.equal(r.length, 2);
  assert.deepEqual(se.search('   '), []);
});

test('search: vaultId filter and limit are honoured', () => {
  const se = new SearchEngine();
  se.indexFiles([
    fakeFile({ vaultId: 'a', id: 'a:1.md', relativePath: '1.md', basename: 'apple one' }),
    fakeFile({ vaultId: 'b', id: 'b:2.md', relativePath: '2.md', basename: 'apple two' }),
    fakeFile({ vaultId: 'b', id: 'b:3.md', relativePath: '3.md', basename: 'apple three' })
  ]);
  assert.equal(se.search('apple', { vaultId: 'b' }).length, 2);
  assert.equal(se.search('apple', { limit: 1 }).length, 1);
});

test('search: tag filter matches exact or parent of nested tag, never a substring (#art vs #smart)', () => {
  const se = new SearchEngine();
  se.indexFiles([
    fakeFile({ id: 'v:1.md', relativePath: '1.md', basename: 'one', tags: ['project/alpha'] }),
    fakeFile({ id: 'v:2.md', relativePath: '2.md', basename: 'two', tags: ['smart'] }),
    fakeFile({ id: 'v:3.md', relativePath: '3.md', basename: 'three', tags: ['art'] })
  ]);
  assert.deepEqual(se.search('', { tags: ['project'] }).map(r => r.file.basename), ['one']);
  assert.deepEqual(se.search('', { tags: ['#art'] }).map(r => r.file.basename), ['three']);
  assert.equal(se.search('', { tags: ['art', 'smart'] }).length, 0);
});

test('search: findBacklinks matches basename and Vault::basename links', () => {
  const se = new SearchEngine();
  const target = fakeFile({ id: 'v:t.md', relativePath: 't.md', basename: 'Target', vaultName: 'V' });
  se.indexFiles([
    target,
    fakeFile({ id: 'v:a.md', relativePath: 'a.md', basename: 'a', outgoingLinks: ['target'] }),
    fakeFile({ id: 'v:b.md', relativePath: 'b.md', basename: 'b', outgoingLinks: ['v::target'] }),
    fakeFile({ id: 'v:c.md', relativePath: 'c.md', basename: 'c', outgoingLinks: ['other'] })
  ]);
  assert.deepEqual(se.findBacklinks(target).map(f => f.basename).sort(), ['a', 'b']);
});

test('search: getRecentFiles sorts by mtime desc without mutating the source array', () => {
  const se = new SearchEngine();
  const files = [fakeFile({ id: 'v:1.md', relativePath: '1.md', mtime: 1 }), fakeFile({ id: 'v:2.md', relativePath: '2.md', mtime: 9 })];
  se.indexFiles(files);
  assert.deepEqual(se.getRecentFiles(5).map(f => f.mtime), [9, 1]);
  assert.deepEqual(files.map(f => f.mtime), [1, 9]);
});
