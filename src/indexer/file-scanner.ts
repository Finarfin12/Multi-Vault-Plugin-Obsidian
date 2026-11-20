import * as fs from 'fs';
import * as path from 'path';
import { VaultConfig } from '../types';
import { buildExcluder, normalizeRelativePath, PathMatcher } from './path-matcher';

export interface FileEntry {
  absolutePath: string;
  relativePath: string;
  basename: string;
  extension: string;
  mtime: number;
  size: number;
  /** Creation time, when the file system reports one. */
  ctime?: number;
}

export class FileScanner {
  private globalExcludes: string[];

  constructor(globalExcludes: string[] = []) {
    this.globalExcludes = globalExcludes;
  }

  /** The exclude test for one vault (global + per-vault patterns + built-in folders). */
  public excluderFor(vault: VaultConfig): PathMatcher {
    return buildExcluder([...this.globalExcludes, ...(vault.excludePatterns || [])]);
  }

  /** True when the vault-relative path passes the vault's include patterns (none = everything). */
  public isIncluded(vault: VaultConfig, relativePath: string): boolean {
    const includePatterns = (vault.includePatterns || []).filter(p => p.trim().length > 0);
    if (includePatterns.length === 0) return true;
    const lowerPath = relativePath.toLowerCase();
    const name = lowerPath.split('/').pop() ?? lowerPath;
    return includePatterns.some(pattern => {
      const p = pattern.trim().toLowerCase();
      return lowerPath.includes(p) || name.includes(p);
    });
  }

  public async scanVaultAsync(vault: VaultConfig): Promise<FileEntry[]> {
    return this.scanPath(vault, '');
  }

  /**
   * Scan one file or one folder (vault-relative, '' = whole vault).
   * Returns the markdown files found, already filtered by exclude/include rules.
   */
  public async scanPath(vault: VaultConfig, relative: string): Promise<FileEntry[]> {
    const files: FileEntry[] = [];
    const rootPath = vault.path;
    const rel = normalizeRelativePath(relative);
    const isExcluded = this.excluderFor(vault);

    try {
      await fs.promises.access(rootPath, fs.constants.F_OK);
    } catch {
      return files;
    }

    if (rel && isExcluded(rel)) return files;

    const makeEntry = async (fullPath: string, relativePath: string): Promise<FileEntry | null> => {
      if (!this.isIncluded(vault, relativePath)) return null;
      try {
        const stats = await fs.promises.stat(fullPath);
        const name = path.basename(fullPath);
        return {
          absolutePath: fullPath,
          relativePath,
          basename: path.basename(name, '.md'),
          extension: '.md',
          mtime: stats.mtimeMs,
          size: stats.size,
          ctime: stats.birthtimeMs > 0 ? stats.birthtimeMs : undefined
        };
      } catch {
        return null; // vanished or unreadable
      }
    };

    const walk = async (dir: string) => {
      let entries;
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        return; // permission error or missing
      }

      const pending: Promise<FileEntry | null>[] = [];
      const subDirs: string[] = [];

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');
        if (isExcluded(relativePath)) continue;

        if (entry.isDirectory()) {
          subDirs.push(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          pending.push(makeEntry(fullPath, relativePath));
        }
      }

      for (const e of await Promise.all(pending)) {
        if (e) files.push(e);
      }
      for (const sub of subDirs) {
        await walk(sub);
      }
    };

    if (!rel) {
      await walk(rootPath);
      return files;
    }

    const target = path.join(rootPath, rel);
    let stats;
    try {
      stats = await fs.promises.stat(target);
    } catch {
      return files; // gone
    }
    if (stats.isDirectory()) {
      await walk(target);
    } else if (stats.isFile() && target.endsWith('.md')) {
      const e = await makeEntry(target, rel);
      if (e) files.push(e);
    }
    return files;
  }
}
