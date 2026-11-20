import * as fs from 'fs';
import { VaultConfig } from '../types';
import { buildExcluder, normalizeRelativePath } from './path-matcher';

const DEBOUNCE_MS = 1500;
const POLL_MS = 60000;

/** The slice of fs.watch the watcher needs; injectable so tests can fake it. */
export type WatchFn = (
  path: string,
  options: { recursive?: boolean; persistent?: boolean },
  listener: (event: string, filename: string | null) => void
) => fs.FSWatcher;

export interface VaultWatcherHost {
  getVaults(): VaultConfig[];
  getGlobalExcludes(): string[];
  /** Called (debounced) with the vault-relative paths that changed; [''] = re-check the whole vault. */
  onChanged(vault: VaultConfig, relativePaths: string[]): void | Promise<void>;
}

interface Handle {
  vault: VaultConfig;
  watcher: fs.FSWatcher | null;
  pollTimer: number | null;
  debounceTimer: number | null;
  pending: Set<string>;
}

/**
 * Watches enabled vault folders and reports changed paths (F2).
 * Recursive `fs.watch` is used; when the platform or folder cannot be watched
 * the vault falls back to a once-a-minute full re-check. Folders in the
 * exclude list never trigger a report.
 */
export class VaultWatcher {
  private handles: Map<string, Handle> = new Map();
  private host: VaultWatcherHost;
  private watchFn: WatchFn;
  private debounceMs: number;
  private pollMs: number;

  constructor(host: VaultWatcherHost, options: { watchFn?: WatchFn; debounceMs?: number; pollMs?: number } = {}) {
    this.host = host;
    this.watchFn = options.watchFn ?? ((p, o, l) => fs.watch(p, o, l));
    this.debounceMs = options.debounceMs ?? DEBOUNCE_MS;
    this.pollMs = options.pollMs ?? POLL_MS;
  }

  /** Number of vaults currently watched (native or polling). */
  public get activeCount(): number {
    return this.handles.size;
  }

  /** Make the set of watched vaults equal to `vaults` (start new ones, stop the rest). */
  public sync(vaults: VaultConfig[]): void {
    const wanted = new Map(vaults.map(v => [v.id, v]));

    for (const id of Array.from(this.handles.keys())) {
      const existing = this.handles.get(id);
      const next = wanted.get(id);
      if (!next || (existing && existing.vault.path !== next.path)) this.stop(id);
    }

    wanted.forEach((vault, id) => {
      if (!this.handles.has(id)) this.start(vault);
      else {
        const h = this.handles.get(id);
        if (h) h.vault = vault; // pick up changed exclude patterns
      }
    });
  }

  /** Stop every watcher and timer. Safe to call repeatedly. */
  public dispose(): void {
    for (const id of Array.from(this.handles.keys())) this.stop(id);
  }

  private start(vault: VaultConfig): void {
    const handle: Handle = { vault, watcher: null, pollTimer: null, debounceTimer: null, pending: new Set() };
    this.handles.set(vault.id, handle);

    try {
      const watcher = this.watchFn(vault.path, { recursive: true, persistent: false }, (_event, filename) => {
        this.record(handle, filename);
      });
      watcher.on('error', () => this.fallBackToPolling(handle));
      handle.watcher = watcher;
    } catch {
      this.fallBackToPolling(handle);
    }
  }

  private stop(vaultId: string): void {
    const handle = this.handles.get(vaultId);
    if (!handle) return;
    this.handles.delete(vaultId);
    if (handle.debounceTimer !== null) window.clearTimeout(handle.debounceTimer);
    if (handle.pollTimer !== null) window.clearInterval(handle.pollTimer);
    handle.pending.clear();
    try {
      handle.watcher?.close();
    } catch {
      // already closed
    }
    handle.watcher = null;
  }

  private fallBackToPolling(handle: Handle): void {
    if (!this.handles.has(handle.vault.id) || handle.pollTimer !== null) return;
    try {
      handle.watcher?.close();
    } catch {
      // ignore
    }
    handle.watcher = null;
    handle.pollTimer = window.setInterval(() => {
      void this.host.onChanged(handle.vault, ['']);
    }, this.pollMs);
  }

  private record(handle: Handle, filename: string | null): void {
    // Some platforms report no file name: re-check the whole vault
    const rel = filename === null ? '' : normalizeRelativePath(filename);
    if (rel !== '') {
      const isExcluded = buildExcluder([...this.host.getGlobalExcludes(), ...(handle.vault.excludePatterns || [])]);
      if (isExcluded(rel)) return;
    }
    handle.pending.add(rel);

    if (handle.debounceTimer !== null) window.clearTimeout(handle.debounceTimer);
    handle.debounceTimer = window.setTimeout(() => {
      handle.debounceTimer = null;
      const paths = Array.from(handle.pending);
      handle.pending.clear();
      if (paths.length > 0 && this.handles.get(handle.vault.id) === handle) {
        void this.host.onChanged(handle.vault, paths);
      }
    }, this.debounceMs);
  }
}
