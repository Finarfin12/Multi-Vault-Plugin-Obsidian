import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeVault, writeFile, removeFile, cleanup, makeEnv, makeSettings, MemoryAdapter, CACHE_PATH } from './helpers';

const filler = (n: number) => 'lorem ipsum dolor sit amet '.repeat(Math.ceil(n / 27)).slice(0, n);

test('T1: a word far beyond the preview (char ~6000) is found by full-text search', async () => {
  const v = makeVault('a', { 'deep.md': `${filler(6000)} zyxwvuniqueword ${filler(100)}`, 'other.md': 'nothing here' });
  const env = makeEnv([v]);
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);
    const r = env.engine.search('zyxwvuniqueword');
    assert.equal(r.length, 1);
    assert.equal(r[0].file.basename, 'deep');
    // the cached metadata never carries the body
    assert.equal('body' in r[0].file, false);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});

test('T2: fullText off hides the deep word; switching it on and refreshing finds it again', async () => {
  const v = makeVault('a', { 'deep.md': `${filler(6000)} zyxwvuniqueword` });
  const env = makeEnv([v], { settings: makeSettings({ fullText: false }) });
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);
    assert.equal(env.engine.search('zyxwvuniqueword').length, 0);

    env.settings.indexOptions.fullText = true;
    await env.indexer.buildFullIndex(false, true);
    assert.equal(env.indexer.stats.parsedLastRun, 1, 'the changed setting forces a re-read');
    assert.equal(env.engine.search('zyxwvuniqueword').length, 1);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});

test('T3: a 1 MB note is indexed only up to maxIndexedBytes, without error', async () => {
  const big = `earlymarker ${filler(1_000_000)} latemarker`;
  const v = makeVault('a', { 'big.md': big });
  const env = makeEnv([v], { settings: makeSettings({ maxIndexedBytes: 100000 }) });
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);
    assert.equal(env.engine.search('earlymarker').length, 1);
    assert.equal(env.engine.search('latemarker').length, 0);
    assert.equal(env.indexer.getIndexedFiles().length, 1);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});

test('T5: refresh with no changes re-parses nothing', async () => {
  const files: Record<string, string> = {};
  for (let i = 0; i < 60; i++) files[`dir${i % 5}/note${i}.md`] = `note number ${i} #tag${i % 3}`;
  const v = makeVault('a', files);
  const env = makeEnv([v]);
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);
    assert.equal(env.indexer.stats.parsedLastRun, 60);

    await env.indexer.buildFullIndex(false, true);
    assert.equal(env.indexer.stats.scannedLastRun, 60);
    assert.equal(env.indexer.stats.parsedLastRun, 0);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});

test('only the changed file is re-parsed; its new word is searchable and the old one is gone', async () => {
  const v = makeVault('a', { 'a.md': 'alphaword', 'b.md': 'bravoword', 'c.md': 'charlieword' });
  const env = makeEnv([v]);
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);

    writeFile(v, 'b.md', 'deltaword replaced content', Date.now() + 5000);
    await env.indexer.buildFullIndex(false, true);

    assert.equal(env.indexer.stats.parsedLastRun, 1);
    assert.equal(env.engine.search('bravoword').length, 0);
    assert.equal(env.engine.search('deltaword').length, 1);
    assert.equal(env.engine.search('alphaword').length, 1);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});

test('added and deleted files show up in the index and in search', async () => {
  const v = makeVault('a', { 'a.md': 'alphaword', 'gone.md': 'goneword' });
  const env = makeEnv([v]);
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);

    writeFile(v, 'new/added.md', 'addedword');
    removeFile(v, 'gone.md');
    await env.indexer.buildFullIndex(false, true);

    assert.deepEqual(env.indexer.getIndexedFiles().map(f => f.relativePath).sort(), ['a.md', 'new/added.md']);
    assert.equal(env.engine.search('addedword').length, 1);
    assert.equal(env.engine.search('goneword').length, 0);
    assert.equal(env.indexer.stats.parsedLastRun, 1);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});

test('changing the global exclude patterns drops/restores files without re-parsing the rest', async () => {
  const v = makeVault('a', { 'Private/p.md': 'privword', 'smart/s.md': 'smartword', 'ok.md': 'okword' });
  const env = makeEnv([v]);
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);
    assert.equal(env.indexer.getIndexedFiles().length, 3);

    env.settings.indexOptions.globalExcludePatterns = ['Private'];
    await env.indexer.buildFullIndex(false, true);
    assert.deepEqual(env.indexer.getIndexedFiles().map(f => f.relativePath).sort(), ['ok.md', 'smart/s.md']);
    assert.equal(env.indexer.stats.parsedLastRun, 0);
    assert.equal(env.engine.search('privword').length, 0);

    env.settings.indexOptions.globalExcludePatterns = [];
    await env.indexer.buildFullIndex(false, true);
    assert.equal(env.engine.search('privword').length, 1);
    assert.equal(env.indexer.stats.parsedLastRun, 1);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});

test('disabling a vault removes its files from the index and from search', async () => {
  const va = makeVault('a', { 'a.md': 'pineapplesauce' });
  const vb = makeVault('b', { 'b.md': 'zucchinibread' });
  const env = makeEnv([va, vb]);
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);
    assert.equal(env.indexer.getIndexedFiles().length, 2);

    vb.enabled = false;
    await env.indexer.buildFullIndex(false, true);
    assert.deepEqual(env.indexer.getIndexedFiles().map(f => f.vaultId), ['a']);
    assert.equal(env.engine.search('zucchinibread').length, 0);
  } finally {
    env.indexer.dispose();
    cleanup(va, vb);
  }
});

test('T7: a v3 cache restores search without reading any note', async () => {
  const v = makeVault('a', { 'a.md': 'persistedword in note a', 'b.md': 'second' });
  const adapter = new MemoryAdapter();
  const first = makeEnv([v], { adapter });
  try {
    await first.indexer.initialize();
    await first.indexer.buildFullIndex(false, true);
    assert.ok(adapter.files.has(CACHE_PATH), 'cache written');
    first.indexer.dispose();

    const second = makeEnv([v], { adapter });
    await second.indexer.initialize();
    assert.equal(second.indexer.needsInitialBuild(), false);
    // search works immediately, before any refresh
    assert.equal(second.engine.search('persistedword').length, 1);
    assert.equal(second.indexer.getIndexedFiles().length, 2);

    await second.indexer.buildFullIndex(false, true);
    assert.equal(second.indexer.stats.parsedLastRun, 0, 'nothing re-read after a warm start');
    second.indexer.dispose();
  } finally {
    cleanup(v);
  }
});

test('T7: a v2 cache is ignored and rebuilt automatically, no crash', async () => {
  const v = makeVault('a', { 'a.md': 'rebuiltword' });
  const adapter = new MemoryAdapter();
  adapter.dirs.add('.obsidian/plugins/multi-vault-navigator');
  adapter.files.set(CACHE_PATH, JSON.stringify({ version: 2, generatedAt: 'x', files: [{ id: 'a:old.md', vaultId: 'a' }] }));
  const env = makeEnv([v], { adapter });
  try {
    await env.indexer.initialize();
    assert.equal(env.indexer.needsInitialBuild(), true);
    assert.equal(env.indexer.getIndexedFiles().length, 0);
    await env.indexer.buildFullIndex(false, true);
    assert.equal(env.engine.search('rebuiltword').length, 1);
    assert.equal(JSON.parse(adapter.files.get(CACHE_PATH) as string).version, 3);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});

test('a corrupt cache file is treated like a missing one', async () => {
  const v = makeVault('a', { 'a.md': 'someword' });
  const adapter = new MemoryAdapter();
  adapter.files.set(CACHE_PATH, '{not json');
  const env = makeEnv([v], { adapter });
  try {
    await env.indexer.initialize();
    assert.equal(env.indexer.needsInitialBuild(), true);
    await env.indexer.buildFullIndex(false, true);
    assert.equal(env.engine.search('someword').length, 1);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});

test('storeSnippetsInCache=false writes neither previews nor the search index; next start re-reads the notes', async () => {
  const v = makeVault('a', { 'a.md': 'secretbodyword in the note' });
  const adapter = new MemoryAdapter();
  const settings = makeSettings({ storeSnippetsInCache: false });
  const first = makeEnv([v], { adapter, settings });
  try {
    await first.indexer.initialize();
    await first.indexer.buildFullIndex(false, true);
    const raw = adapter.files.get(CACHE_PATH) as string;
    assert.equal(raw.includes('secretbodyword'), false, 'no note text in the cache');
    const cache = JSON.parse(raw);
    assert.equal(cache.search, undefined);
    assert.equal(cache.files[0].contentPreview, undefined);
    first.indexer.dispose();

    const second = makeEnv([v], { adapter, settings });
    await second.indexer.initialize();
    assert.equal(second.indexer.needsInitialBuild(), true);
    await second.indexer.buildFullIndex(false, true);
    assert.equal(second.indexer.stats.parsedLastRun, 1);
    assert.equal(second.engine.search('secretbodyword').length, 1);
    second.indexer.dispose();
  } finally {
    cleanup(v);
  }
});

test('changing maxIndexedBytes between runs forces a full re-read (parse signature)', async () => {
  const v = makeVault('a', { 'a.md': 'one', 'b.md': 'two' });
  const env = makeEnv([v]);
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);
    env.settings.indexOptions.maxIndexedBytes = 5000;
    await env.indexer.buildFullIndex(false, true);
    assert.equal(env.indexer.stats.parsedLastRun, 2);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});

test('reconcilePaths re-parses only the named files; a removed folder drops its children', async () => {
  const v = makeVault('a', { 'x/1.md': 'oneword', 'x/2.md': 'twoword', 'y/3.md': 'threeword' });
  const env = makeEnv([v]);
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);

    writeFile(v, 'y/3.md', 'threeword changed', Date.now() + 9000);
    await env.indexer.reconcilePaths(v, ['y/3.md']);
    assert.equal(env.indexer.stats.parsedLastRun, 1);
    assert.equal(env.engine.search('changed').length, 1);

    removeFile(v, 'x');
    await env.indexer.reconcilePaths(v, ['x']);
    assert.deepEqual(env.indexer.getIndexedFiles().map(f => f.relativePath), ['y/3.md']);
    assert.equal(env.engine.search('oneword').length, 0);

    // A parent path covers its children; an excluded path changes nothing
    writeFile(v, 'y/new.md', 'brandnewword');
    await env.indexer.reconcilePaths(v, ['y', 'y/new.md']);
    assert.equal(env.engine.search('brandnewword').length, 1);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});

test('reconcilePaths ignores vaults that are disabled or unknown', async () => {
  const v = makeVault('a', { 'a.md': 'word' });
  const env = makeEnv([v]);
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);
    v.enabled = false;
    writeFile(v, 'late.md', 'lateword');
    await env.indexer.reconcilePaths(v, ['late.md']);
    assert.equal(env.engine.search('lateword').length, 0);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});

test('concurrent reconcile calls are serialised and leave a consistent index', async () => {
  const v = makeVault('a', { 'a.md': 'one' });
  const env = makeEnv([v]);
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);
    writeFile(v, 'b.md', 'quokkamarker');
    writeFile(v, 'c.md', 'wombatmarker');
    await Promise.all([
      env.indexer.reconcilePaths(v, ['b.md']),
      env.indexer.reconcilePaths(v, ['c.md']),
      env.indexer.buildFullIndex(false, true)
    ]);
    assert.equal(env.indexer.getIndexedFiles().length, 3);
    assert.equal(env.engine.search('quokkamarker').length, 1);
    assert.equal(env.engine.search('wombatmarker').length, 1);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});

test('clearIndex empties the index and search, and a later build restores them', async () => {
  const v = makeVault('a', { 'a.md': 'clearword' });
  const env = makeEnv([v]);
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);
    await env.indexer.clearIndex();
    assert.equal(env.indexer.getIndexedFiles().length, 0);
    assert.equal(env.engine.search('clearword').length, 0);
    await env.indexer.buildFullIndex(false, true);
    assert.equal(env.engine.search('clearword').length, 1);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});

test('the onUpdate callback fires when the index changes, not when nothing changed', async () => {
  const v = makeVault('a', { 'a.md': 'x' });
  const env = makeEnv([v]);
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);
    const afterFirst = env.updates.count;
    assert.ok(afterFirst >= 1);
    await env.indexer.buildFullIndex(false, true);
    assert.equal(env.updates.count, afterFirst);
  } finally {
    env.indexer.dispose();
    cleanup(v);
  }
});
