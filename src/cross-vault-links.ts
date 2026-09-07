import { Notice } from 'obsidian';
import type MultiVaultNavigatorPlugin from './main';
import type { IndexedFile } from './types';

export interface CrossVaultRef {
  vaultName: string;
  noteName: string;
}

/**
 * Parse a "Vault::Note" link target. Returns null for normal wikilinks so
 * they are never touched. Alias ("|..."), heading ("#..."), ".md" suffix,
 * and folder prefixes are stripped before matching.
 */
export function parseCrossVaultRef(href: string): CrossVaultRef | null {
  if (!href) return null;
  const idx = href.indexOf('::');
  if (idx <= 0) return null;
  const vaultName = href.slice(0, idx).trim();
  let noteName = href.slice(idx + 2).split('|')[0].split('#')[0].trim();
  noteName = noteName.replace(/\.md$/i, '').split('/').pop()?.trim() ?? '';
  if (!vaultName || !noteName) return null;
  return { vaultName, noteName };
}

function findCrossVaultTarget(
  plugin: MultiVaultNavigatorPlugin,
  ref: CrossVaultRef
): IndexedFile | undefined {
  const vault = ref.vaultName.toLowerCase();
  const note = ref.noteName.toLowerCase();
  return plugin.indexer.getIndexedFiles().find((f) => {
    if (f.vaultName.toLowerCase() !== vault) return false;
    if (f.basename.toLowerCase() === note) return true;
    const rel = f.relativePath.toLowerCase();
    return (
      rel === note ||
      rel === `${note}.md` ||
      rel.endsWith(`/${note}`) ||
      rel.endsWith(`/${note}.md`)
    );
  });
}

function openCrossVaultRef(plugin: MultiVaultNavigatorPlugin, ref: CrossVaultRef): void {
  const target = findCrossVaultTarget(plugin, ref);
  if (target) {
    void plugin.fileOpener.openFile(target);
  } else {
    new Notice(`File "${ref.noteName}" not found in vault "${ref.vaultName}".`);
  }
}

function rewriteReadingViewAnchor(
  plugin: MultiVaultNavigatorPlugin,
  anchor: HTMLAnchorElement,
  ref: CrossVaultRef,
  href: string
): void {
  const rawText = (anchor.textContent ?? '').trim();
  const label = rawText && rawText !== href ? rawText : ref.noteName;

  anchor.empty();
  // Detach from core link handling so Obsidian never tries to create a note
  // named "Vault::Note" (":" is illegal in filenames).
  anchor.removeClass('internal-link', 'is-unresolved');
  anchor.addClass('mvn-cross-vault-link');
  anchor.removeAttribute('data-href');
  anchor.removeAttribute('href');
  anchor.createSpan({ text: label });

  anchor.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openCrossVaultRef(plugin, ref);
  });

  anchor.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const target = findCrossVaultTarget(plugin, ref);
    if (target) {
      window.open(
        `obsidian://open?vault=${encodeURIComponent(target.vaultName)}&file=${encodeURIComponent(target.relativePath)}`
      );
    }
  });
}

/**
 * Make [[Vault::Note]] links work in Reading View.
 *
 * Obsidian core parses cross-vault wikilinks into unresolved internal-link
 * anchors *before* markdown postprocessors run, so the previous approach of
 * scanning raw text nodes for "[[" never matched. Instead, rewrite the
 * anchors core already produced.
 *
 * Note: Live Preview is intentionally out of scope — intercepting editor
 * clicks there needs token/position APIs absent from the typed Obsidian
 * API surface, and an untyped workaround would risk breaking normal links.
 */
export function registerCrossVaultLinks(plugin: MultiVaultNavigatorPlugin): void {
  plugin.registerMarkdownPostProcessor((element) => {
    const anchors = element.querySelectorAll<HTMLAnchorElement>('a.internal-link');
    anchors.forEach((anchor) => {
      const href =
        anchor.getAttribute('data-href') ?? anchor.getAttribute('href') ?? '';
      const ref = parseCrossVaultRef(href);
      if (!ref) return;
      rewriteReadingViewAnchor(plugin, anchor, ref, href);
    });
  });
}
