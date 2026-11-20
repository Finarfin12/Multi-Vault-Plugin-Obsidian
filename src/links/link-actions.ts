import type { IndexedFile } from '../types';

/** What a click on a rendered cross-vault link should do (pure, so it can be tested without an editor). */
export type ClickAction = 'none' | 'open' | 'open-new-tab';

export interface ClickContext {
  /** True in Live Preview, false in Source mode. */
  livePreview: boolean;
  /** Ctrl (Windows/Linux) or Cmd (macOS) held. */
  modifier: boolean;
  /** The editor cursor/selection touches the link text, i.e. the raw `[[...]]` is being edited. */
  cursorInsideLink: boolean;
}

/**
 * Live Preview: a plain click opens the note (the link is rendered), unless the
 * cursor is inside the raw link, where a click edits text. Ctrl/Cmd+click always
 * opens in a new tab. Source mode shows raw text, so only Ctrl/Cmd+click opens.
 */
export function decideClick(ctx: ClickContext): ClickAction {
  if (ctx.modifier) return 'open-new-tab';
  if (ctx.livePreview && !ctx.cursorInsideLink) return 'open';
  return 'none';
}

/** URI that opens a note in its own vault in Obsidian (the "open in source vault" action). */
export function sourceVaultUri(file: Pick<IndexedFile, 'vaultName' | 'relativePath'>): string {
  return `obsidian://open?vault=${encodeURIComponent(file.vaultName)}&file=${encodeURIComponent(file.relativePath)}`;
}
