// Performance run for 2.4.0 (bundled and executed by scripts/bench.mjs; not shipped).
// Measures the Test Plan items T1, T4, T5, T7, T8 and K1 on the synthetic 5,000-note fixture.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Indexer } from '../src/indexer/indexer';
import { SearchEngine } from '../src/search-engine';
import { VaultWatcher } from '../src/indexer/vault-watcher';
import { loadSnippet } from '../src/search/snippet';
import { readText } from '../src/fs-async';
import { DEFAULT_SETTINGS, MultiVaultSettings, VaultConfig } from '../src/types';
import { VaultRegistry } from '../src/vault-registry';
import { App } from 'obsidian';

declare const gc: undefined | (() => void);

// src/node-types.d.ts declares only a minimal `process`; this script needs a few more members
const proc = (globalThis as unknown as { process: { argv: string[]; version: string; memoryUsage(): { heapUsed: number }; exit(code?: number): never } }).process;

const fixture = proc.argv[2];
if (!fixture) throw new Error('usage: bench.mjs <fixtureDir>');

class MemoryAdapter {
  files = new Map<string, string>();
  dirs = new Set<string>();
  async exists(p: string) { return this.files.has(p) || this.dirs.has(p); }
  async mkdir(p: string) { this.dirs.add(p); }
  async read(p: string) { const v = this.files.get(p); if (v === undefined) throw new Error('ENOENT'); return v; }
  async write(p: string, d: string) { this.files.set(p, d); }
  async remove(p: string) { this.files.delete(p); }
}

const vaults: VaultConfig[] = ['A', 'B', 'C'].map(n => ({ id: n.toLowerCase(), name: n, path: path.join(fixture, n), enabled: true }));
const registry = {
  getEnabledVaults: () => vaults.filter(v => v.enabled),
  getVaultById: (id: string) => vaults.find(v => v.id === id),
  getVaults: () => vaults
} as unknown as VaultRegistry;

const adapter = new MemoryAdapter();
const app = { vault: { configDir: '.obsidian', adapter } } as unknown as App;
const settings: MultiVaultSettings = structuredClone(DEFAULT_SETTINGS);

const results: Record<string, unknown> = {};
const ms = (n: number) => Math.round(n * 10) / 10;
const median = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const heapMb = () => { if (gc) gc(); return proc.memoryUsage().heapUsed / 1048576; };
const sleep = (t: number) => new Promise<void>(r => setTimeout(r, t));

async function main() {
  results.node = proc.version;
  results.platform = `${os.platform()} ${os.arch()}, ${os.cpus().length} cores`;
  results.fixtureNotes = vaults.length;

  const baseHeap = heapMb();

  // --- cold build ----------------------------------------------------------------
  const engine = new SearchEngine();
  const indexer = new Indexer(app, registry, settings, engine, () => undefined);
  await indexer.initialize();
  let t = performance.now();
  await indexer.buildFullIndex(false, true);
  results.coldBuildMs = ms(performance.now() - t);
  results.coldBuildParsed = indexer.stats.parsedLastRun;
  results.indexedFiles = indexer.getIndexedFiles().length;
  results.heapAfterIndexMb = ms(heapMb() - baseHeap);

  // --- T5: refresh without changes ------------------------------------------------
  const refresh: number[] = [];
  for (let i = 0; i < 3; i++) {
    t = performance.now();
    await indexer.buildFullIndex(false, true);
    refresh.push(performance.now() - t);
  }
  results.T5_refreshUnchangedMs = refresh.map(ms);
  results.T5_parsedOnRefresh = indexer.stats.parsedLastRun;
  results.T5_scannedOnRefresh = indexer.stats.scannedLastRun;

  // --- T1: unique word at ~char 5000 ----------------------------------------------
  const probe = engine.search('quasarfixtureword');
  results.T1_found = probe.length === 1 ? probe[0].file.relativePath.replace(/\\/g, '/') : probe.length;
  if (probe.length === 1) {
    const sn = await loadSnippet(probe[0].file, probe[0].terms, settings.indexOptions.maxIndexedBytes);
    results.T1_excerptContainsWord = !!sn && sn.matched && sn.text.includes('quasarfixtureword');
    results.T1_excerptLength = sn?.text.length;
  }

  // --- K1: search latency ---------------------------------------------------------
  const files = indexer.getIndexedFiles();
  const queries: string[] = [];
  for (let i = 0; i < 12; i++) queries.push(files[(i * 397) % files.length].basename.split('-')[0]);
  for (let i = 0; i < 4; i++) queries.push(files[(i * 811 + 5) % files.length].basename.split('-').slice(0, 2).join(' '));
  queries.push('project alpha', 'meeting notes', 'quasarfixtureword', 'roadmap glossary');
  const timings: number[] = [];
  for (const q of queries) {
    t = performance.now();
    engine.search(q, { limit: 20 });
    timings.push(performance.now() - t);
  }
  results.K1_queries = queries.length;
  results.K1_searchMedianMs = ms(median(timings));
  results.K1_searchMaxMs = ms(Math.max(...timings));

  // --- cache write / T7 warm start --------------------------------------------------
  const raw = adapter.files.get('.obsidian/plugins/multi-vault-navigator/index-cache.json') ?? '';
  results.cacheSizeMb = ms(raw.length / 1048576);
  indexer.dispose();

  const baseHeap2 = heapMb();
  t = performance.now();
  const engine2 = new SearchEngine();
  const indexer2 = new Indexer(app, registry, settings, engine2, () => undefined);
  await indexer2.initialize();
  const warm = performance.now() - t;
  results.T7_warmStartMs = ms(warm);
  results.T7_searchReadyAfterLoad = engine2.search('quasarfixtureword').length === 1;
  results.heapWarmStartMb = ms(heapMb() - baseHeap2);
  t = performance.now();
  await indexer2.buildFullIndex(false, true);
  results.T7_refreshAfterWarmMs = ms(performance.now() - t);
  results.T7_parsedAfterWarm = indexer2.stats.parsedLastRun;

  // --- T4: watcher latency (default 1.5 s debounce, real fs.watch) ------------------
  const watcher = new VaultWatcher({
    getVaults: () => vaults,
    getGlobalExcludes: () => [],
    onChanged: (vault, paths) => indexer2.reconcilePaths(vault, paths)
  });
  watcher.sync(vaults);
  await sleep(500);
  const target = path.join(fixture, 'B', 'inbox', 'watcher-probe.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  t = performance.now();
  fs.writeFileSync(target, '# probe\nwatcherlatencyword');
  let seen = false;
  while (performance.now() - t < 10000) {
    if (engine2.search('watcherlatencyword').length === 1) { seen = true; break; }
    await sleep(20);
  }
  results.T4_createdVisible = seen;
  results.T4_createLatencyMs = seen ? ms(performance.now() - t) : null;

  fs.writeFileSync(target, '# probe\nwatcheredited');
  t = performance.now();
  seen = false;
  while (performance.now() - t < 10000) {
    if (engine2.search('watcheredited').length === 1 && engine2.search('watcherlatencyword').length === 0) { seen = true; break; }
    await sleep(20);
  }
  results.T4_editLatencyMs = seen ? ms(performance.now() - t) : null;

  fs.rmSync(target);
  t = performance.now();
  seen = false;
  while (performance.now() - t < 10000) {
    if (engine2.search('watcheredited').length === 0) { seen = true; break; }
    await sleep(20);
  }
  results.T4_deleteLatencyMs = seen ? ms(performance.now() - t) : null;
  watcher.dispose();
  indexer2.dispose();
  fs.rmSync(path.join(fixture, 'B', 'inbox', 'watcher-probe.md'), { force: true });

  // --- T8: UI responsiveness while reading a 5 MB note -------------------------------
  const big = path.join(os.tmpdir(), `mvn-big-${Date.now()}.md`);
  fs.writeFileSync(big, 'x'.repeat(5 * 1048576));
  const lagOf = async (read: () => Promise<unknown> | unknown): Promise<number> => {
    let last = performance.now();
    let maxGap = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
    }, 4);
    await sleep(30);
    last = performance.now();
    await read();
    await sleep(30);
    clearInterval(timer);
    return maxGap;
  };
  const asyncGaps: number[] = [];
  const syncGaps: number[] = [];
  for (let i = 0; i < 5; i++) {
    asyncGaps.push(await lagOf(() => readText(big)));
    syncGaps.push(await lagOf(() => fs.readFileSync(big, 'utf8')));
  }
  results.T8_maxLoopGapAsyncMs = asyncGaps.map(ms);
  results.T8_maxLoopGapSyncMs = syncGaps.map(ms);
  fs.rmSync(big, { force: true });

  console.log(JSON.stringify(results, null, 2));
}

main().then(() => proc.exit(0), (e) => { console.error(e); proc.exit(1); });
