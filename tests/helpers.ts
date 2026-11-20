import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { App } from 'obsidian';
import { DEFAULT_SETTINGS, MultiVaultSettings, VaultConfig } from '../src/types';
import { Indexer } from '../src/indexer/indexer';
import { SearchEngine } from '../src/search-engine';
import { VaultRegistry } from '../src/vault-registry';

/** Create a temp vault directory with the given files (relative path -> content). */
export function makeVault(id: string, files: Record<string, string>, extra: Partial<VaultConfig> = {}): VaultConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mvn-${id}-`));
  for (const rel of Object.keys(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, files[rel]);
  }
  return { id, name: id.toUpperCase(), path: root, enabled: true, ...extra };
}

export function writeFile(vault: VaultConfig, rel: string, content: string, mtimeMs?: number): void {
  const full = path.join(vault.path, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  if (mtimeMs !== undefined) fs.utimesSync(full, new Date(mtimeMs), new Date(mtimeMs));
}

export function removeFile(vault: VaultConfig, rel: string): void {
  fs.rmSync(path.join(vault.path, rel), { recursive: true, force: true });
}

export function cleanup(...vaults: VaultConfig[]): void {
  for (const v of vaults) fs.rmSync(v.path, { recursive: true, force: true });
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Poll until `check` is true or the timeout elapses; returns the last result. */
export async function waitFor(check: () => boolean, timeoutMs = 5000, stepMs = 25): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (check()) return true;
    await sleep(stepMs);
  }
  return check();
}

/** In-memory stand-in for Obsidian's vault adapter (only what IndexStore uses). */
export class MemoryAdapter {
  public files = new Map<string, string>();
  public dirs = new Set<string>();
  async exists(p: string) { return this.files.has(p) || this.dirs.has(p); }
  async mkdir(p: string) { this.dirs.add(p); }
  async read(p: string) {
    const v = this.files.get(p);
    if (v === undefined) throw new Error('ENOENT');
    return v;
  }
  async write(p: string, data: string) { this.files.set(p, data); }
  async remove(p: string) { this.files.delete(p); }
}

export const CACHE_PATH = '.obsidian/plugins/multi-vault-navigator/index-cache.json';

export function makeApp(adapter: MemoryAdapter = new MemoryAdapter()): App {
  return { vault: { configDir: '.obsidian', adapter } } as unknown as App;
}

export function makeSettings(over: Partial<MultiVaultSettings['indexOptions']> = {}): MultiVaultSettings {
  const s = structuredClone(DEFAULT_SETTINGS);
  s.indexOptions = { ...s.indexOptions, ...over };
  return s;
}

export function fakeRegistry(vaults: VaultConfig[]): VaultRegistry {
  return {
    getEnabledVaults: () => vaults.filter(v => v.enabled),
    getVaultById: (id: string) => vaults.find(v => v.id === id),
    getVaults: () => vaults
  } as unknown as VaultRegistry;
}

export interface Env {
  adapter: MemoryAdapter;
  settings: MultiVaultSettings;
  engine: SearchEngine;
  indexer: Indexer;
  updates: { count: number };
}

/** Build an Indexer + SearchEngine over the given vaults, sharing one in-memory cache adapter. */
export function makeEnv(vaults: VaultConfig[], opts: { adapter?: MemoryAdapter; settings?: MultiVaultSettings } = {}): Env {
  const adapter = opts.adapter ?? new MemoryAdapter();
  const settings = opts.settings ?? makeSettings();
  const engine = new SearchEngine();
  const updates = { count: 0 };
  const indexer = new Indexer(makeApp(adapter), fakeRegistry(vaults), settings, engine, () => { updates.count++; });
  return { adapter, settings, engine, indexer, updates };
}
