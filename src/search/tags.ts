import type { IndexedFile } from '../types';

export const normalizeTag = (tag: string) => tag.toLowerCase().replace(/^#+/, '');

/**
 * True when the file has every target tag, either exactly or as a parent of
 * a nested tag (#project matches #project/alpha, but #art never matches #smart).
 */
export function hasAllTags(file: IndexedFile, targets: string[]): boolean {
  if (!file.tags) return false;
  const fileTags = file.tags.map(normalizeTag);
  return targets.map(normalizeTag).every(tt => fileTags.some(ft => ft === tt || ft.startsWith(`${tt}/`)));
}

/** True when the file has at least one of the tags (same matching rule as hasAllTags). */
export function hasAnyTag(file: IndexedFile, targets: string[]): boolean {
  return targets.some(t => hasAllTags(file, [t]));
}
