import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VaultWatcher, VaultWatcherHost, WatchFn } from '../src/indexer/vault-watcher';
import { VaultConfig } from '../src/types';
import { VaultRegistry } from '../src/vault-registry';
import { FileSystemAdapter } from 'obsidian';
import { makeVault, writeFile, removeFile, cleanup, makeEnv, sleep, waitFor } from './helpers';

interface FakeWatcher {
  path: string;
  emit: (name: string | null) => void;
  fail: () => void;
  closed: boolean;
}

function fakeWatch(): { watchFn: WatchFn; watchers: FakeWatcher[] } {
  const watchers: FakeWatcher[] = [];
  const watchFn: WatchFn = (p, _o, listener) => {
    let onError: (e: Error) => void = () => undefined;
    const fw: FakeWatcher = {
      path: p, closed: false,
      emit: (name) => listener('change', name),
      fail: () => onError(new Error('boom'))
    };
    watchers.push(fw);
    return {
      close() { fw.closed = true; },
      on(_event: 'error', l: (e: Error) => void) { onError = l; return this; }
    } as unknown as ReturnType<WatchFn>;
  };
  return { watchFn, watchers };
}

function vault(id: string, extra: Partial<VaultConfig> = {}): VaultConfig {
  return { id, name: id, path: `/vaults/${id}`, enabled: true, ...extra };
}

function host(vaults: VaultConfig[], calls: { v: string; paths: string[] }[], globals: string[] = []): VaultWatcherHost {
  return { getVaults: () => vaults, getGlobalExcludes: () => globals, onChanged: (v, paths) => { calls.push({ v: v.id, paths: paths.slice().sort() }); } };
}

test('T4/F2: a burst of events is debounced into one report with the distinct paths', async () => {
  const { watchFn, watchers } = fakeWatch();
  const calls: { v: string; paths: string[] }[] = [];
  const a = vault('a');
  const w = new VaultWatcher(host([a], calls), { watchFn, debounceMs: 30 });
  w.sync([a]);
  watchers[0].emit('x/one.md');
  watchers[0].emit('x/one.md');
  watchers[0].emit('two.md');
  watchers[0].emit('x\\win-style.md');
  await sleep(120);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].paths, ['two.md', 'x/one.md', 'x/win-style.md']);
  w.dispose();
});

test('events inside excluded folders (global + per-vault + built-in) are ignored', async () => {
  const { watchFn, watchers } = fakeWatch();
  const calls: { v: string; paths: string[] }[] = [];
  const a = vault('a', { excludePatterns: ['drafts'] });
  const w = new VaultWatcher(host([a], calls, ['Private']), { watchFn, debounceMs: 20 });
  w.sync([a]);
  watchers[0].emit('Private/x.md');
  watchers[0].emit('drafts/y.md');
  watchers[0].emit('.obsidian/workspace.json');
  watchers[0].emit('smart/ok.md');
  await sleep(80);
  assert.deepEqual(calls.map(c => c.paths), [['smart/ok.md']]);
  w.dispose();
});

test('a null file name means "re-check the whole vault"', async () => {
  const { watchFn, watchers } = fakeWatch();
  const calls: { v: string; paths: string[] }[] = [];
  const a = vault('a');
  const w = new VaultWatcher(host([a], calls), { watchFn, debounceMs: 20 });
  w.sync([a]);
  watchers[0].emit(null);
  await sleep(70);
  assert.deepEqual(calls[0].paths, ['']);
  w.dispose();
});

test('T6: disabling/removing a vault closes its watcher; dispose leaves none behind and cancels pending reports', async () => {
  const { watchFn, watchers } = fakeWatch();
  const calls: { v: string; paths: string[] }[] = [];
  const a = vault('a');
  const b = vault('b');
  const w = new VaultWatcher(host([a, b], calls), { watchFn, debounceMs: 40 });
  w.sync([a, b]);
  assert.equal(w.activeCount, 2);

  w.sync([a]); // b disabled
  assert.equal(w.activeCount, 1);
  assert.equal(watchers.find(x => x.path === b.path)?.closed, true);
  assert.equal(watchers.find(x => x.path === a.path)?.closed, false);

  watchers.find(x => x.path === a.path)?.emit('pending.md');
  w.dispose();
  assert.equal(w.activeCount, 0);
  assert.ok(watchers.every(x => x.closed));
  await sleep(100);
  assert.equal(calls.length, 0, 'no report after dispose');
  assert.doesNotThrow(() => w.dispose());
});

test('sync() is idempotent and restarts a watcher when the vault path changes', () => {
  const { watchFn, watchers } = fakeWatch();
  const w = new VaultWatcher(host([], []), { watchFn, debounceMs: 20 });
  const a = vault('a');
  w.sync([a]);
  w.sync([a]);
  assert.equal(watchers.length, 1);
  w.sync([{ ...a, path: '/elsewhere/a' }]);
  assert.equal(watchers.length, 2);
  assert.equal(watchers[0].closed, true);
  w.dispose();
});

test('a watcher error or an unsupported platform falls back to periodic polling', async () => {
  const { watchFn, watchers } = fakeWatch();
  const calls: { v: string; paths: string[] }[] = [];
  const a = vault('a');
  const w = new VaultWatcher(host([a], calls), { watchFn, debounceMs: 20, pollMs: 40 });
  w.sync([a]);
  watchers[0].fail();
  assert.equal(watchers[0].closed, true);
  await sleep(130);
  assert.ok(calls.length >= 2, `polled ${calls.length}x`);
  assert.deepEqual(calls[0].paths, ['']);
  w.dispose();
  const before = calls.length;
  await sleep(100);
  assert.equal(calls.length, before, 'polling stops on dispose');

  const throwing: WatchFn = () => { throw new Error('ERR_FEATURE_UNAVAILABLE_ON_PLATFORM'); };
  const calls2: { v: string; paths: string[] }[] = [];
  const w2 = new VaultWatcher(host([a], calls2), { watchFn: throwing, pollMs: 30 });
  w2.sync([a]);
  await sleep(90);
  assert.ok(calls2.length >= 1);
  w2.dispose();
});

test('T4: with the real fs.watch, edits made outside the plugin reach search well within 5 seconds', async () => {
  const v = makeVault('real', { 'keep.md': 'keepword', 'edit.md': 'before', 'gone.md': 'goneword' });
  const env = makeEnv([v]);
  const watcher = new VaultWatcher(
    { getVaults: () => [v], getGlobalExcludes: () => [], onChanged: (vault, paths) => env.indexer.reconcilePaths(vault, paths) },
    { debounceMs: 150 }
  );
  try {
    await env.indexer.initialize();
    await env.indexer.buildFullIndex(false, true);
    watcher.sync([v]);
    await sleep(200); // let the OS watcher arm

    const t0 = Date.now();
    writeFile(v, 'edit.md', 'afterchange uniquemarkerone');
    writeFile(v, 'created.md', 'createdword');
    removeFile(v, 'gone.md');

    const ok = await waitFor(() =>
      env.engine.search('uniquemarkerone').length === 1 &&
      env.engine.search('createdword').length === 1 &&
      env.engine.search('goneword').length === 0, 5000);
    assert.equal(ok, true, 'index followed the disk');
    assert.ok(Date.now() - t0 <= 5000);
    assert.equal(env.engine.search('keepword').length, 1);
  } finally {
    watcher.dispose();
    env.indexer.dispose();
    cleanup(v);
  }
});

test('vault registry: validateVaultPath is async and needs the config folder; addVault rejects a plain folder', async () => {
  const good = makeVault('good', { '.obsidian/app.json': '{}' });
  const plain = makeVault('plain', { 'a.md': 'x' });
  try {
    class Adapter extends FileSystemAdapter { getBasePath() { return good.path; } }
    const app = { vault: { configDir: '.obsidian', adapter: new Adapter() } } as never;
    const settings = { vaults: [], ignoredVaultPaths: [] } as never;
    const reg = new VaultRegistry(app, settings);
    assert.equal(await reg.validateVaultPath(good.path), true);
    assert.equal(await reg.validateVaultPath(plain.path), false);
    assert.equal(await reg.validateVaultPath(good.path + '/does-not-exist'), false);
    assert.equal(await reg.addVault({ id: 'x', name: 'x', path: plain.path, enabled: true }), false);
    assert.equal(await reg.addVault({ id: 'g', name: 'g', path: good.path, enabled: true }), true);
    await reg.initialize();
    assert.equal(reg.getCurrentVaultId(), 'g');
  } finally {
    cleanup(good, plain);
  }
});
