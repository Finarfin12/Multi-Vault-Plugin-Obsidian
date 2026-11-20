import * as fs from 'fs';

/**
 * Async wrappers around the few fs calls the UI layer needs, so a large
 * file or a slow disk never blocks Obsidian's main thread (F4).
 */

/** Read a UTF-8 text file. Rejects when the file cannot be read. */
export async function readText(absolutePath: string): Promise<string> {
  return fs.promises.readFile(absolutePath, 'utf8');
}

/** Read a UTF-8 text file, or return null when it is missing or unreadable. */
export async function readTextOrNull(absolutePath: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(absolutePath, 'utf8');
  } catch {
    return null;
  }
}

/** Stat a path, or return null when it does not exist. */
export async function statOrNull(absolutePath: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.stat(absolutePath);
  } catch {
    return null;
  }
}

export async function pathExists(absolutePath: string): Promise<boolean> {
  return (await statOrNull(absolutePath)) !== null;
}

export async function isDirectory(absolutePath: string): Promise<boolean> {
  const stats = await statOrNull(absolutePath);
  return stats !== null && stats.isDirectory();
}
