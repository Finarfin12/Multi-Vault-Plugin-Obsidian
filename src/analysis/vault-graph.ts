import type { IndexedFile } from '../types';
import { createTargetResolver, parseCrossVaultRef } from '../links/link-parser';

/** The vault-to-vault link graph behind the cross-vault map (F12). */

export interface GraphVault {
  id: string;
  name: string;
}

export interface GraphNode {
  id: string;
  name: string;
  /** Number of indexed notes in the vault. */
  count: number;
}

export interface GraphLink {
  source: IndexedFile;
  /** What the link points at, as written: `Note` or `folder/Note`. */
  target: string;
  /** The note it resolves to, when that note is in the index. */
  resolved?: IndexedFile;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Number of links: a note that links to two different notes counts twice, repeated links to one note count once. */
  count: number;
  links: GraphLink[];
}

export interface VaultGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Count the `[[Vault::Note]]` links between vaults. One edge per ordered pair
 * (A -> B), counting each distinct target of each note once. Links inside the
 * same vault and links to vaults that are not indexed are not part of the map.
 */
export function buildVaultGraph(files: IndexedFile[], vaults: GraphVault[]): VaultGraph {
  const byName = new Map(vaults.map(v => [v.name.toLowerCase(), v]));
  const counts = new Map<string, number>();
  for (const f of files) counts.set(f.vaultId, (counts.get(f.vaultId) ?? 0) + 1);

  const resolve = createTargetResolver(files);
  const nodes: GraphNode[] = vaults.map(v => ({ id: v.id, name: v.name, count: counts.get(v.id) ?? 0 }));
  const edges = new Map<string, GraphEdge>();

  for (const file of files) {
    for (const raw of file.crossVaultLinks ?? []) {
      const ref = parseCrossVaultRef(raw);
      if (!ref) continue;
      const target = byName.get(ref.vaultName.toLowerCase());
      if (!target || target.id === file.vaultId) continue;

      const key = `${file.vaultId}\u0000${target.id}`;
      let edge = edges.get(key);
      if (!edge) {
        edge = { from: file.vaultId, to: target.id, count: 0, links: [] };
        edges.set(key, edge);
      }
      const label = ref.notePath ?? ref.noteName;
      const resolved = resolve(ref);
      edge.count++;
      edge.links.push({ source: file, target: label, resolved });
    }
  }

  return {
    nodes,
    edges: Array.from(edges.values()).sort((a, b) => b.count - a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
  };
}

export interface Point {
  x: number;
  y: number;
}

/** Place `n` nodes evenly on a circle (a single node sits in the middle). */
export function circleLayout(n: number, width: number, height: number): Point[] {
  const cx = width / 2;
  const cy = height / 2;
  if (n <= 0) return [];
  if (n === 1) return [{ x: cx, y: cy }];
  const radius = Math.min(width, height) / 2 - 70;
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

/** Node radius from its note count: area grows with the count, within 16..44 px. */
export function nodeRadius(count: number, maxCount: number): number {
  if (maxCount <= 0) return 16;
  return 16 + 28 * Math.sqrt(Math.max(0, count) / maxCount);
}

/**
 * Line for an edge between two nodes, shifted sideways so A->B and B->A do not
 * overlap, and shortened to stop at the node borders.
 */
export function edgeLine(from: Point, to: Point, rFrom: number, rTo: number, offset = 6): { x1: number; y1: number; x2: number; y2: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular, always on the right of the direction of travel
  const px = -uy * offset;
  const py = ux * offset;
  return {
    x1: from.x + ux * rFrom + px,
    y1: from.y + uy * rFrom + py,
    x2: to.x - ux * (rTo + 6) + px,
    y2: to.y - uy * (rTo + 6) + py
  };
}
