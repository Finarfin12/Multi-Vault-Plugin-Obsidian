/**
 * Minimal ambient declarations for Node.js built-in modules.
 *
 * The Obsidian community-plugin review bot lints without @types/node,
 * which causes every `import * as fs from 'fs'` (and path, os) to
 * collapse to `any`, cascading into hundreds of `no-unsafe-*` warnings.
 *
 * These declarations give the build and the review bot the exact types
 * they need without pulling in the full @types/node surface.
 */

type BufferEncoding = 'utf8' | 'ascii' | 'latin1' | 'binary';

declare module 'fs' {
  interface Stats {
    isDirectory(): boolean;
    isFile(): boolean;
    mtimeMs: number;
    size: number;
  }

  interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }

  namespace promises {
    function access(path: string, mode?: number): Promise<void>;
    function readdir(
      path: string,
      options: { withFileTypes: true }
    ): Promise<Dirent[]>;
    function stat(path: string): Promise<Stats>;
    function readFile(
      path: string,
      encoding: BufferEncoding
    ): Promise<string>;
  }

  interface FSWatcher {
    close(): void;
    on(event: 'error', listener: (err: Error) => void): this;
  }

  function watch(
    path: string,
    options: { recursive?: boolean; persistent?: boolean },
    listener: (event: string, filename: string | null) => void
  ): FSWatcher;

  function statSync(path: string): Stats;
  function existsSync(path: string): boolean;
  function readFileSync(path: string, encoding: BufferEncoding): string;
  function copyFileSync(src: string, dest: string): void;

  const constants: { F_OK: number };
}

declare module 'path' {
  function join(...paths: string[]): string;
  function resolve(...paths: string[]): string;
  function basename(p: string, ext?: string): string;
  function dirname(p: string): string;
  function relative(from: string, to: string): string;
  function normalize(p: string): string;
}

declare module 'os' {
  type Platform = 'aix' | 'darwin' | 'freebsd' | 'linux' | 'openbsd' | 'sunos' | 'win32';
  function platform(): Platform;
  function homedir(): string;
}

declare const process: {
  env: Record<string, string | undefined>;
};
