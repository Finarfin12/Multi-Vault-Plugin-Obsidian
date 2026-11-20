import { App, Notice } from 'obsidian';
import { VaultRegistry } from '../vault-registry';
import { SearchEngine } from '../search-engine';
import { FileEntry, FileScanner } from './file-scanner';
import { MarkdownParser } from './markdown-parser';
import { IndexStore } from './index-store';
import { normalizeRelativePath } from './path-matcher';
import { nextHistory } from '../analysis/digest';
import { IndexDelta, IndexedFile, MultiVaultSettings, VaultConfig } from '../types';

/** Counters of the last run, mainly so tests and the benchmark can prove that unchanged files are not re-parsed. */
export interface IndexerStats {
  /** Files read and parsed in the last run. */
  parsedLastRun: number;
  /** Files seen on disk in the last run. */
  scannedLastRun: number;
}

const SAVE_DEBOUNCE_MS = 10000;
const PARSE_BATCH = 16;

export class Indexer {
  private app: App;
  private vaultRegistry: VaultRegistry;
  private settings: MultiVaultSettings;
  private searchEngine: SearchEngine;
  private onUpdate: () => void;

  private store: IndexStore;

  private files: Map<string, IndexedFile> = new Map();
  private listCache: IndexedFile[] | null = null;
  private isIndexing: boolean = false;
  private rerunRequested: boolean = false;
  private lastIndexTime: number = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private saveTimer: number | null = null;
  private disposed = false;

  /** True when the cache could not be used at all, so a first full build is needed. */
  private initialBuildNeeded = true;
  /** True when file metadata is known but the search index must be rebuilt from the notes. */
  private needsReparse = false;
  private lastSignature: string | null = null;

  public stats: IndexerStats = { parsedLastRun: 0, scannedLastRun: 0 };

  constructor(app: App, vaultRegistry: VaultRegistry, settings: MultiVaultSettings, searchEngine: SearchEngine, onUpdate: () => void) {
    this.app = app;
    this.vaultRegistry = vaultRegistry;
    this.settings = settings;
    this.searchEngine = searchEngine;
    this.onUpdate = onUpdate;

    this.store = new IndexStore(this.app);
  }

  /**
   * Load the cache and make search ready from it. With a usable v3 cache the
   * search index is restored without reading any note.
   */
  public async initialize(): Promise<void> {
    const loaded = await this.store.loadIndex();
    if (!loaded) {
      // Missing, unreadable or old-format (v2) cache: rebuild from the notes
      this.initialBuildNeeded = true;
      return;
    }

    this.initialBuildNeeded = false;
    this.files = new Map(loaded.files.map(f => [f.id, f]));
    this.listCache = null;
    this.lastSignature = loaded.parseSignature;

    const restored = loaded.search !== null
      && loaded.parseSignature === this.parseSignature()
      && this.searchEngine.loadFromCache(loaded.files, loaded.search);

    if (!restored) {
      // Metadata is still useful (recent files, sidebar): search by name/tag/preview until the notes are re-read
      this.searchEngine.indexFiles(loaded.files);
      this.needsReparse = true;
    }
  }

  /** True when nothing usable was cached, so an index build should run soon even if auto-refresh is off. */
  public needsInitialBuild(): boolean {
    return this.initialBuildNeeded || this.needsReparse;
  }

  public getIndexedFiles(): IndexedFile[] {
    if (!this.listCache) this.listCache = Array.from(this.files.values());
    return this.listCache;
  }

  /** Stop timers; call on plugin unload. Pending cache writes are flushed best-effort. */
  public dispose(): void {
    this.disposed = true;
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
      void this.saveNow();
    }
  }

  /**
   * Bring the index in line with the disk. Only files whose modification
   * time or size changed are re-read; vanished files are dropped. `force`
   * skips the cooldown; use it when settings or files changed. A request that
   * arrives mid-build is queued and run once the current build ends.
   */
  public async buildFullIndex(showNotice = false, force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastIndexTime < 15000) {
      if (showNotice) new Notice("Indexing is on cooldown. Please wait a few seconds.");
      return;
    }

    if (this.isIndexing) {
      this.rerunRequested = true;
      if (showNotice) new Notice("Indexing is already in progress; it will run again when done.");
      return;
    }

    this.isIndexing = true;
    if (showNotice) new Notice("Starting cross-vault index build...");

    try {
      const enabledVaults = this.vaultRegistry.getEnabledVaults();
      await this.runExclusive(() => this.reconcileAll(enabledVaults));
      this.lastIndexTime = Date.now();

      if (showNotice) {
        new Notice(`Index built successfully! ${this.files.size} files indexed across ${enabledVaults.length} vaults.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (showNotice) new Notice(`Failed to build index: ${message}`);
    } finally {
      this.isIndexing = false;
    }

    if (this.rerunRequested) {
      this.rerunRequested = false;
      await this.buildFullIndex(false, true);
    }
  }

  /**
   * Re-check only the given vault-relative paths (files or folders) of one
   * vault. Used by the file watcher; an empty path means the whole vault.
   */
  public reconcilePaths(vault: VaultConfig, relativePaths: string[]): Promise<void> {
    return this.runExclusive(async () => {
      if (this.disposed) return;
      const current = this.vaultRegistry.getVaultById(vault.id);
      if (!current || !current.enabled) return;

      const scanner = this.newScanner();
      const parser = this.newParser();
      const targets = Array.from(new Set(relativePaths.map(normalizeRelativePath)));
      // A parent folder already covers its children
      const roots = targets.filter(t => !targets.some(o => o !== t && (o === '' || t.startsWith(`${o}/`))));

      let changed = false;
      let parsed = 0;
      let scanned = 0;
      for (const rel of roots) {
        const entries = await scanner.scanPath(current, rel);
        scanned += entries.length;
        const inScope = rel === '' ? () => true : (p: string) => p === rel || p.startsWith(`${rel}/`);
        const result = await this.applyScan(current, entries, inScope, parser, false);
        parsed += result.parsed;
        changed = changed || result.changed;
      }

      this.stats = { parsedLastRun: parsed, scannedLastRun: scanned };
      if (changed) {
        this.listCache = null;
        this.onUpdate();
        this.scheduleSave();
      }
    });
  }

  public async clearIndex(): Promise<void> {
    await this.runExclusive(async () => {
      this.files.clear();
      this.listCache = null;
      this.searchEngine.clear();
      this.lastSignature = null;
      this.initialBuildNeeded = true;
      this.needsReparse = false;
    });
    this.onUpdate();
    await this.store.clearIndex();
    new Notice("Index cleared.");
  }

  /** Settings that decide what is read from a note; a change forces every note to be re-read. */
  private parseSignature(): string {
    const o = this.settings.indexOptions;
    // The trailing tag changes whenever the parser starts extracting something new, so old caches are re-read once
    return `${o.maxPreviewChars}|${o.fullText !== false ? o.maxIndexedBytes : 'preview'}|xv1`;
  }

  private newScanner(): FileScanner {
    return new FileScanner(this.settings.indexOptions.globalExcludePatterns || []);
  }

  private newParser(): MarkdownParser {
    const o = this.settings.indexOptions;
    return new MarkdownParser(o.maxPreviewChars, { fullText: o.fullText !== false, maxIndexedBytes: o.maxIndexedBytes });
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn);
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  private async reconcileAll(enabledVaults: VaultConfig[]): Promise<void> {
    const scanner = this.newScanner();
    const parser = this.newParser();
    const signature = this.parseSignature();
    const reparseAll = this.needsReparse || this.initialBuildNeeded || this.lastSignature !== signature;

    let changed = false;
    let parsed = 0;
    let scanned = 0;

    // Files of vaults that are gone or disabled
    const enabledIds = new Set(enabledVaults.map(v => v.id));
    const orphans = new Map<string, string[]>();
    for (const f of this.files.values()) {
      if (!enabledIds.has(f.vaultId)) {
        const list = orphans.get(f.vaultId) ?? [];
        list.push(f.id);
        orphans.set(f.vaultId, list);
      }
    }
    orphans.forEach((ids, vaultId) => {
      this.applyDelta({ vaultId, added: [], updated: [], removed: ids }, new Map());
      changed = true;
    });

    for (const vault of enabledVaults) {
      const entries = await scanner.scanVaultAsync(vault);
      scanned += entries.length;
      const result = await this.applyScan(vault, entries, () => true, parser, reparseAll);
      parsed += result.parsed;
      changed = changed || result.changed;
    }

    this.stats = { parsedLastRun: parsed, scannedLastRun: scanned };
    this.lastSignature = signature;
    this.initialBuildNeeded = false;
    this.needsReparse = false;

    if (changed) {
      this.listCache = null;
      this.onUpdate();
    }
    // Always persist after a full run: settings (e.g. snippets in cache) may have changed what is written
    await this.saveNow();
  }

  /**
   * Diff `entries` (what is on disk) against the indexed files in `inScope`,
   * parse only the new/changed ones and apply the resulting delta.
   */
  private async applyScan(
    vault: VaultConfig,
    entries: FileEntry[],
    inScope: (relativePath: string) => boolean,
    parser: MarkdownParser,
    reparseAll: boolean
  ): Promise<{ changed: boolean; parsed: number }> {
    const onDisk = new Map(entries.map(e => [e.relativePath, e]));
    const existing = new Map<string, IndexedFile>();
    for (const f of this.files.values()) {
      if (f.vaultId === vault.id && inScope(f.relativePath)) existing.set(f.relativePath, f);
    }

    const removed: string[] = [];
    existing.forEach((f, rel) => {
      if (!onDisk.has(rel)) removed.push(f.id);
    });

    const toParse = entries.filter(e => {
      const old = existing.get(e.relativePath);
      return reparseAll || !old || old.mtime !== e.mtime || old.size !== e.size;
    });

    const added: IndexedFile[] = [];
    const updated: IndexedFile[] = [];
    const bodies = new Map<string, string>();

    for (let i = 0; i < toParse.length; i += PARSE_BATCH) {
      const batch = toParse.slice(i, i + PARSE_BATCH);
      const results = await Promise.all(batch.map(e => parser.parseMarkdownFileWithBody(e, vault)));
      results.forEach(r => {
        // Keep the word-count history so a period summary can estimate words added
        r.file.wordHistory = nextHistory(existing.get(r.file.relativePath), r.file);
        (existing.has(r.file.relativePath) ? updated : added).push(r.file);
        if (r.body !== undefined) bodies.set(r.file.id, r.body);
      });
      // Yield to the UI between batches
      await new Promise<void>(resolve => window.setTimeout(resolve, 0));
    }

    if (added.length === 0 && updated.length === 0 && removed.length === 0) {
      return { changed: false, parsed: 0 };
    }

    this.applyDelta({ vaultId: vault.id, added, updated, removed }, bodies);
    return { changed: true, parsed: toParse.length };
  }

  private applyDelta(delta: IndexDelta, bodies: Map<string, string>): void {
    for (const id of delta.removed) this.files.delete(id);
    for (const f of delta.added) this.files.set(f.id, f);
    for (const f of delta.updated) this.files.set(f.id, f);
    this.searchEngine.applyDelta(delta, bodies);
    this.listCache = null;
  }

  private scheduleSave(): void {
    if (this.disposed) return;
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.saveNow();
    }, SAVE_DEBOUNCE_MS);
  }

  private async saveNow(): Promise<void> {
    try {
      const storeSnippets = this.settings.indexOptions.storeSnippetsInCache !== false;
      // A metadata-only engine (notes not re-read yet) must not be saved as if it held the note text
      const search = storeSnippets && !this.needsReparse ? await this.searchEngine.serialize() : null;
      await this.store.saveIndex(this.getIndexedFiles(), search, storeSnippets, this.lastSignature ?? this.parseSignature());
    } catch {
      // A failed cache write only costs a slower next start
    }
  }
}
