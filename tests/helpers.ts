import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VaultConfig } from '../src/types';

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
