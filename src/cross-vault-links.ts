import { MarkdownRenderChild, Notice } from 'obsidian';
import type MultiVaultNavigatorPlugin from './main';
import type { IndexedFile } from './types';
import { readTextOrNull } from './fs-async';
import {
  CrossVaultRef,
  findCrossVaultTarget as findTargetInFiles,
  parseCrossVaultRef
} from './links/link-parser';
import { sourceVaultUri } from './links/link-actions';
import { createLivePreviewExtension, LinkHost } from './links/live-preview-extension';
import { createLiveEmbedExtension } from './links/live-embed-extension';
import { embedDepth, EmbedHost, renderEmbed } from './links/embed-renderer';
import { VaultLinkSuggest } from './links/vault-link-suggest';

export { parseCrossVaultRef };
export type { CrossVaultRef };

function findCrossVaultTarget(
  plugin: MultiVaultNavigatorPlugin,
  ref: CrossVaultRef
): IndexedFile | undefined {
  return findTargetInFiles(plugin.indexer.getIndexedFiles(), ref);
}

function openCrossVaultRef(plugin: MultiVaultNavigatorPlugin, ref: CrossVaultRef, newTab = true): void {
  const target = findCrossVaultTarget(plugin, ref);
  if (target) {
    void plugin.fileOpener.openFile(target, { newTab });
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
    if (target) window.open(sourceVaultUri(target));
  });
}

/** Cross-vault link behaviour for the Live Preview / Source mode editor (F7). */
function editorLinkHost(plugin: MultiVaultNavigatorPlugin): LinkHost {
  return {
    isResolved: (link) => findCrossVaultTarget(plugin, link) !== undefined,
    // Plain click behaves like core: stay in the current tab; Ctrl/Cmd+click opens a new tab
    open: (link, newTab) => openCrossVaultRef(plugin, link, newTab),
    openInSourceVault: (link) => {
      const target = findCrossVaultTarget(plugin, link);
      if (target) window.open(sourceVaultUri(target));
      else new Notice(`File "${link.noteName}" not found in vault "${link.vaultName}".`);
    }
  };
}

/** Shared by Reading View and Live Preview embeds (F9). */
function embedHost(plugin: MultiVaultNavigatorPlugin): EmbedHost {
  return {
    app: plugin.app,
    findTarget: (ref) => findCrossVaultTarget(plugin, ref),
    read: (file) => readTextOrNull(file.absolutePath),
    open: (file) => { void plugin.fileOpener.openFile(file, { newTab: false }); }
  };
}

/**
 * Make [[Vault::Note]] links and ![[Vault::Note]] embeds work everywhere.
 *
 * Reading View: Obsidian core parses these into unresolved internal-link
 * anchors / embed placeholders *before* markdown postprocessors run, so the
 * postprocessor rewrites those elements instead of scanning raw text.
 *
 * Live Preview / Source mode: CodeMirror 6 extensions decorate the links and
 * show embeds as read-only blocks.
 */
export function registerCrossVaultLinks(plugin: MultiVaultNavigatorPlugin): void {
  plugin.registerMarkdownPostProcessor((element, context) => {
    const anchors = element.querySelectorAll<HTMLAnchorElement>('a.internal-link');
    anchors.forEach((anchor) => {
      const href =
        anchor.getAttribute('data-href') ?? anchor.getAttribute('href') ?? '';
      const ref = parseCrossVaultRef(href);
      if (!ref) return;
      rewriteReadingViewAnchor(plugin, anchor, ref, href);
    });

    // Embeds: ![[Vault::Note]] and ![[Vault::Note#Heading]]
    const host = embedHost(plugin);
    element.querySelectorAll<HTMLElement>('.internal-embed').forEach((embed) => {
      if (embed.classList.contains('mvn-embed')) return;
      const ref = parseCrossVaultRef(embed.getAttribute('src') ?? '');
      if (!ref) return;
      embed.removeClass('internal-embed', 'is-unresolved');
      const owner = new MarkdownRenderChild(embed);
      context.addChild(owner);
      void renderEmbed(host, embed, ref, embedDepth(embed), owner);
    });
  });

  plugin.registerEditorExtension([
    createLivePreviewExtension(editorLinkHost(plugin)),
    createLiveEmbedExtension(embedHost(plugin))
  ]);

  // Autocomplete for [[Vault::  (F8)
  plugin.registerEditorSuggest(new VaultLinkSuggest(plugin.app, plugin));
}
