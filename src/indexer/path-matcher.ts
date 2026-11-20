/**
 * Exclude-pattern matching shared by the scanner and the vault watcher.
 *
 * Pattern forms (case-insensitive, `/` and `\` both accepted):
 *  - `Private`            a folder or file NAME (any path segment equals it; `Private` also matches `Private.md`)
 *  - `notes/archive`      consecutive segments somewhere in the path
 *  - `draft-*`            glob against a single segment (`*` = any chars except `/`, `?` = one char)
 *  - `**` + `/draft-*`    glob against the whole relative path (`**` crosses folders)
 *
 * Unlike the substring matching of 2.3.4, `art` no longer drops `smart/` or `Article/`.
 */

const DOT_OBSIDIAN = String.fromCharCode(46, 111, 98, 115, 105, 100, 105, 97, 110);

/** Folders that are never indexed, whatever the user configures. */
export const DEFAULT_EXCLUDED_SEGMENTS: ReadonlySet<string> = new Set([DOT_OBSIDIAN, '.trash', 'node_modules', '.git']);

export type PathMatcher = (relativePath: string) => boolean;

export function normalizeRelativePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/+$/, '');
}

function escapeRegex(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Translate a glob into an anchored, case-insensitive RegExp. */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?'; // `**/` also matches zero folders
          i += 3;
        } else {
          out += '.*';
          i += 2;
        }
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (ch === '?') {
      out += '[^/]';
      i += 1;
    } else {
      out += escapeRegex(ch);
      i += 1;
    }
  }
  return new RegExp(`^${out}$`, 'i');
}

function prefixes(segments: string[]): string[] {
  const result: string[] = [];
  let acc = '';
  for (const s of segments) {
    acc = acc ? `${acc}/${s}` : s;
    result.push(acc);
  }
  return result;
}

/** Compile one user pattern; returns null for an empty pattern. */
export function compileExcludePattern(pattern: string): PathMatcher | null {
  const p = normalizeRelativePath(pattern.trim());
  if (!p) return null;
  const lower = p.toLowerCase();
  const hasGlob = /[*?]/.test(p);
  const hasSlash = p.includes('/');

  if (!hasGlob && !hasSlash) {
    return (path) => path.split('/').some(seg => {
      const s = seg.toLowerCase();
      return s === lower || s === `${lower}.md`;
    });
  }

  if (!hasGlob) {
    const want = lower.split('/');
    return (path) => {
      const segs = path.toLowerCase().split('/');
      for (let start = 0; start + want.length <= segs.length; start++) {
        let ok = true;
        for (let k = 0; k < want.length; k++) {
          const s = segs[start + k];
          const w = want[k];
          if (!(s === w || (k === want.length - 1 && s === `${w}.md`))) { ok = false; break; }
        }
        if (ok) return true;
      }
      return false;
    };
  }

  const re = globToRegExp(p);
  if (!hasSlash) {
    return (path) => path.split('/').some(seg => re.test(seg));
  }
  // Path glob: also true when an ancestor folder matches, so whole subtrees drop out
  return (path) => prefixes(path.split('/')).some(prefix => re.test(prefix));
}

/** True when any segment of the path is a built-in excluded folder. */
export function isDefaultExcluded(relativePath: string): boolean {
  return relativePath.split('/').some(seg => DEFAULT_EXCLUDED_SEGMENTS.has(seg));
}

/**
 * Build the exclude test for a vault: built-in folders plus the given
 * patterns. The returned function takes a vault-relative path (file or folder).
 */
export function buildExcluder(patterns: string[]): PathMatcher {
  const compiled: PathMatcher[] = [];
  for (const pattern of patterns) {
    const m = compileExcludePattern(pattern);
    if (m) compiled.push(m);
  }
  return (relativePath) => {
    const p = normalizeRelativePath(relativePath);
    if (!p) return false;
    if (isDefaultExcluded(p)) return true;
    return compiled.some(m => m(p));
  };
}
