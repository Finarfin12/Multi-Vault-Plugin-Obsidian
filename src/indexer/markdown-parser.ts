import * as fs from 'fs';
import { IndexedFile, VaultConfig } from '../types';
import { FileEntry } from './file-scanner';

export class MarkdownParser {
  private maxPreviewChars: number;

  constructor(maxPreviewChars: number = 1000) {
    this.maxPreviewChars = maxPreviewChars;
  }

  public async parseMarkdownFileAsync(file: FileEntry, vault: VaultConfig): Promise<IndexedFile> {
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
    const headings = [];
    const headingRegex = /^#{1,6}\s+(.+)$/gm;
    let match;
    while ((match = headingRegex.exec(textContent)) !== null) {
      headings.push(match[1].trim());
    }

    // Extract inline tags
    const inlineTags = [];
    const tagRegex = /(?<=^|\s)#([a-zA-Z0-9_-]+)/g;
    while ((match = tagRegex.exec(textContent)) !== null) {
      inlineTags.push(match[1]);
    }

    // Extract tags from frontmatter
    let frontmatterTags: string[] = [];
    if (frontmatter && Array.isArray(frontmatter.tags)) {
      frontmatterTags = frontmatter.tags;
    } else if (frontmatter && typeof frontmatter.tags === 'string') {
      frontmatterTags = (frontmatter.tags as string).split(',').map(t => t.trim());
    } else if (frontmatter && frontmatter.tag) {
       // support 'tag' singular
       if (Array.isArray(frontmatter.tag)) {
         frontmatterTags = frontmatter.tag;
       } else if (typeof frontmatter.tag === 'string') {
         frontmatterTags = (frontmatter.tag as string).split(',').map(t => t.trim());
       }
    }

    const tags = Array.from(new Set([...inlineTags, ...frontmatterTags]));

    // Generate preview
    const preview = textContent
      .replace(/^#{1,6}\s+/gm, '') // remove heading markers
      .replace(/\s+/g, ' ') // collapse whitespace
      .trim()
      .substring(0, this.maxPreviewChars);

    return {
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
      mtime: file.mtime,
      size: file.size,
      contentPreview: preview
    };
  }

  private extractFrontmatter(content: string): { frontmatter: Record<string, unknown> | undefined, textContent: string } {
    const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
    const match = content.match(yamlRegex);
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
}
