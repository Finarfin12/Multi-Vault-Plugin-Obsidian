import * as fs from 'fs';
import { IndexedFile, VaultConfig } from '../types';
import { FileEntry } from './file-scanner';
import { findCrossVaultLinks } from '../links/link-parser';

export interface ParserOptions {
  /** Return the note body so it can be full-text indexed. */
  fullText: boolean;
  /** Only the first N bytes of the body are returned. */
  maxIndexedBytes: number;
}

export interface ParsedMarkdown {
  file: IndexedFile;
  /** Text after the frontmatter, cut to maxIndexedBytes. Present only in full-text mode; never stored in the cache. */
  body?: string;
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

/** The note text without its YAML frontmatter. */
export function stripFrontmatter(content: string): string {
  const match = content.match(FRONTMATTER_REGEX);
  return match ? content.substring(match[0].length) : content;
}

/** Cut text to at most `maxBytes` UTF-8 bytes without leaving a broken character at the end. */
export function truncateToBytes(text: string, maxBytes: number): string {
  // One UTF-16 unit takes at most 3 UTF-8 bytes, so a short string cannot exceed the limit
  if (text.length * 3 <= maxBytes) return text;
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return text;
  return new TextDecoder('utf-8').decode(bytes.subarray(0, maxBytes)).replace(/�+$/, '');
}

export class MarkdownParser {
  private maxPreviewChars: number;
  private options: ParserOptions;

  constructor(maxPreviewChars: number = 1000, options: Partial<ParserOptions> = {}) {
    this.maxPreviewChars = maxPreviewChars;
    this.options = { fullText: options.fullText ?? false, maxIndexedBytes: options.maxIndexedBytes ?? 200000 };
  }

  public async parseMarkdownFileAsync(file: FileEntry, vault: VaultConfig): Promise<IndexedFile> {
    return (await this.parseMarkdownFileWithBody(file, vault)).file;
  }

  public async parseMarkdownFileWithBody(file: FileEntry, vault: VaultConfig): Promise<ParsedMarkdown> {
    let content = '';
    try {
      content = await fs.promises.readFile(file.absolutePath, 'utf8');
    } catch {
      // return without content if read fails
    }

    const extracted = this.extractFrontmatter(content);
    const frontmatter = extracted.frontmatter;
    const textContent = extracted.textContent;
    
    // Extract headings
    const headings: string[] = [];
    const headingRegex = /^#{1,6}\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(textContent)) !== null) {
      headings.push(match[1].trim());
    }

    // Extract inline tags
    const inlineTags: string[] = [];
    // Unicode letters and nested tags (#parent/child); purely numeric tags are not tags in Obsidian
    const tagRegex = /(?<=^|\s)#([\p{L}\p{N}_\-/]+)/gu;
    while ((match = tagRegex.exec(textContent)) !== null) {
      const tag = match[1].replace(/\/+$/, '');
      if (tag && !/^\d+$/.test(tag)) inlineTags.push(tag);
    }

    // Extract tags from frontmatter
    const frontmatterTags = frontmatter
      ? [
        ...this.normalizeFrontmatterTags(frontmatter.tags),
        ...this.normalizeFrontmatterTags(frontmatter.tag)
      ]
      : [];

    const tags = Array.from(new Set([...inlineTags, ...frontmatterTags]));

    // Extract outgoing wikilinks (for cross-vault backlinks).
    // Supports [[Note]], [[Note|alias]], [[Note#heading]], [[Vault::Note]].
    const outgoingLinks = this.extractOutgoingLinks(textContent);
    const crossVaultLinks = this.extractCrossVaultLinks(textContent);

    // Generate preview
    const preview = textContent
      .replace(/^#{1,6}\s+/gm, '') // remove heading markers
      .replace(/\s+/g, ' ') // collapse whitespace
      .trim()
      .substring(0, this.maxPreviewChars);

    const indexed: IndexedFile = {
      id: `${vault.id}:${file.relativePath}`,
      vaultId: vault.id,
      vaultName: vault.name,
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      basename: file.basename,
      extension: file.extension,
      frontmatter,
      headings,
      tags,
      outgoingLinks,
      crossVaultLinks,
      mtime: file.mtime,
      size: file.size,
      contentPreview: preview
    };

    if (!this.options.fullText) return { file: indexed };
    return { file: indexed, body: truncateToBytes(textContent, this.options.maxIndexedBytes) };
  }

  private extractFrontmatter(content: string): { frontmatter: Record<string, unknown> | undefined, textContent: string } {
    const match = content.match(FRONTMATTER_REGEX);
    let frontmatter: Record<string, unknown> | undefined = undefined;
    let textContent = content;

    if (match) {
      textContent = content.substring(match[0].length);
      const yamlString = match[1];
      frontmatter = this.parseSimpleYaml(yamlString);
    }

    return { frontmatter, textContent };
  }

  private parseSimpleYaml(yaml: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = yaml.split('\n');
    let currentArrayKey: string | null = null;
    let currentArray: string[] = [];

    for (let line of lines) {
      line = line.replace(/\r/g, '');
      if (!line.trim()) continue;

      // Handle array items
      if (line.trim().startsWith('- ') && currentArrayKey) {
        currentArray.push(line.trim().substring(2).trim());
        continue;
      }

      // Handle key-value
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();

        if (!value) {
          currentArrayKey = key;
          currentArray = [];
          result[key] = currentArray;
        } else {
          currentArrayKey = null;
          
          // Try parse array inline
          if (value.startsWith('[') && value.endsWith(']')) {
             result[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/^['"](.*)['"]$/, '$1'));
          } else {
             result[key] = value.replace(/^['"](.*)['"]$/, '$1');
          }
        }
      }
    }
    return result;
  }

  private normalizeFrontmatterTags(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.trim().replace(/^#+/, ''))
        .filter(Boolean);
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map(item => item.trim().replace(/^#+/, ''))
        .filter(Boolean);
    }

    return [];
  }

  /** `vaultname::Note` for every [[Vault::Note]] / ![[Vault::Note]] link outside code, without duplicates. */
  private extractCrossVaultLinks(text: string): string[] {
    const targets = new Set<string>();
    for (const link of findCrossVaultLinks(text)) {
      targets.add(`${link.vaultName.toLowerCase()}::${link.notePath ?? link.noteName}`);
    }
    return Array.from(targets);
  }

  private extractOutgoingLinks(text: string): string[] {
    const links = new Set<string>();
    const linkRegex = /\[\[([^\][]+?)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(text)) !== null) {
      let inner = m[1].trim();
      if (!inner) continue;
      // Strip alias (|alias) and heading (#heading)
      inner = inner.split('|')[0].split('#')[0].trim();
      if (!inner) continue;
      // Cross-vault syntax [[Vault::Note]] -> take Note part
      if (inner.includes('::')) {
        const parts = inner.split('::');
        inner = parts[parts.length - 1].trim();
      }
      // Strip .md suffix and folders, keep basename
      inner = inner.replace(/\.md$/i, '').split('/').pop()?.trim() ?? '';
      if (inner) links.add(inner.toLowerCase());
    }
    return Array.from(links);
  }
}
