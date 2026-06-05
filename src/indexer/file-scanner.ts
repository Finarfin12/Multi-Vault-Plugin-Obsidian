import * as fs from 'fs';
import * as path from 'path';
import { VaultConfig } from '../types';

export interface FileEntry {
  absolutePath: string;
  relativePath: string;
  basename: string;
  extension: string;
  mtime: number;
  size: number;
}

export class FileScanner {
  private defaultExcludes = new Set(['.obsidian', '.trash', 'node_modules', '.git']);
  private globalExcludes: string[];

  constructor(globalExcludes: string[] = []) {
    this.globalExcludes = globalExcludes;
  }

  public async scanVaultAsync(vault: VaultConfig): Promise<FileEntry[]> {
    const files: FileEntry[] = [];
    const rootPath = vault.path;

    try {
      await fs.promises.access(rootPath, fs.constants.F_OK);
    } catch {
      return files;
    }

    const walk = async (dir: string) => {
      let entries;
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch (e) {
        return; // permission error or missing
      }

      for (const entry of entries) {
        if (this.defaultExcludes.has(entry.name)) continue;
        
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

        // Apply vault.excludePatterns & global excludes
        let excluded = false;
        const allExcludes = [...this.globalExcludes, ...(vault.excludePatterns || [])];
        for (const pattern of allExcludes) {
          if (!pattern.trim()) continue;
          const p = pattern.trim().toLowerCase();
          if (relativePath.toLowerCase().includes(p) || entry.name.toLowerCase().includes(p)) {
            excluded = true;
            break;
          }
        }
        if (excluded) continue;
        
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          try {
            const stats = await fs.promises.stat(fullPath);
            files.push({
              absolutePath: fullPath,
              relativePath,
              basename: path.basename(entry.name, '.md'),
              extension: '.md',
              mtime: stats.mtimeMs,
              size: stats.size
            });
          } catch (e) {
            // ignore
          }
        }
      }
    };

    await walk(rootPath);
    return files;
  }
}
