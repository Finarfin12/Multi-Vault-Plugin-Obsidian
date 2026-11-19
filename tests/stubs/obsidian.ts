// Minimal stand-in for the `obsidian` module so core logic can run under node --test.
(globalThis as unknown as { window: unknown }).window = globalThis;

export const notices: string[] = [];

export class Notice {
  constructor(message: string) {
    notices.push(message);
  }
}

export class FileSystemAdapter {
  getBasePath(): string {
    return '';
  }
}

export class Plugin {}
export class Modal {}
export class ItemView {}
export class SuggestModal {}
export class FuzzySuggestModal {}
export class PluginSettingTab {}
export class Setting {}
export const MarkdownRenderer = {};
export const setIcon = () => undefined;
export const sanitizeHTMLToDom = (s: string) => s;
