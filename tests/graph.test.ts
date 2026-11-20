import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { buildVaultGraph, circleLayout, edgeLine, nodeRadius } from '../src/analysis/vault-graph';
import { MarkdownParser } from '../src/indexer/markdown-parser';
import { IndexedFile } from '../src/types';
import { makeVault, cleanup } from './helpers';

function file(vault: string, rel: string, crossVaultLinks?: string[]): IndexedFile {
  return {
    id: `${vault}:${rel}`, vaultId: vault.toLowerCase(), vaultName: vault, absolutePath: `/x/${vault}/${rel}`,
    relativePath: rel, basename: (rel.split('/').pop() ?? rel).replace(/\.md$/, ''), extension: '.md', mtime: 1, size: 1, crossVaultLinks
  };
}

const VAULTS = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];

test('T17: parser records [[Vault::Note]] and embed targets (outside code, no duplicates) for the map', async () => {
  const v = makeVault('p', {
    'n.md': 'see [[B::One]] and [[B::One]] again, ![[C::dir/Two#Part]], `[[D::InCode]]`, [[Plain]]\n```\n[[E::Fenced]]\n```'
  });
  try {
    const entry = { absolutePath: path.join(v.path, 'n.md'), relativePath: 'n.md', basename: 'n', extension: '.md', mtime: 1, size: 1 };
    const parsed = await new MarkdownParser(1000).parseMarkdownFileAsync(entry, v);
    assert.deepEqual(parsed.crossVaultLinks?.slice().sort(), ['b::One', 'c::dir/Two']);
  } finally {
    cleanup(v);
  }
});

test('T17: edge A->B counts the links from A notes to B; B->A is a separate edge', () => {
  const files = [
    file('A', 'a1.md', ['b::Note1', 'b::Note2']),
    file('A', 'a2.md', ['b::Note1']),
    file('B', 'Note1.md', ['a::a1']),
    file('B', 'Note2.md'),
    file('C', 'c1.md')
  ];
  const g = buildVaultGraph(files, VAULTS);
  const ab = g.edges.find(e => e.from === 'a' && e.to === 'b');
  const ba = g.edges.find(e => e.from === 'b' && e.to === 'a');
  assert.equal(ab?.count, 3);
  assert.equal(ba?.count, 1);
  assert.equal(g.edges.length, 2, 'no edge for C');
  assert.deepEqual(g.nodes.map(n => [n.name, n.count]), [['A', 2], ['B', 2], ['C', 1]]);
  assert.equal(g.edges[0].count, 3, 'strongest edge first');
});

test('T17: the list behind an edge names the linking notes and resolves their targets', () => {
  const files = [
    file('A', 'src/a1.md', ['b::Note1', 'b::Missing']),
    file('B', 'Note1.md')
  ];
  const edge = buildVaultGraph(files, VAULTS).edges[0];
  assert.deepEqual(edge.links.map(l => [l.source.relativePath, l.target, l.resolved?.relativePath]), [
    ['src/a1.md', 'Note1', 'Note1.md'],
    ['src/a1.md', 'Missing', undefined]
  ]);
});

test('links inside one vault, to unknown vaults, or with a different letter case in the vault name are handled', () => {
  const files = [file('A', 'a.md', ['a::Self', 'zzz::Nowhere', 'B::Upper']), file('B', 'Upper.md')];
  const g = buildVaultGraph(files, VAULTS);
  assert.equal(g.edges.length, 1);
  assert.equal(g.edges[0].to, 'b');
  assert.equal(g.edges[0].count, 1);
});

test('a cache from before 2.5.0 (no crossVaultLinks) gives an empty, valid graph', () => {
  const g = buildVaultGraph([file('A', 'a.md'), file('B', 'b.md')], VAULTS);
  assert.equal(g.edges.length, 0);
  assert.equal(g.nodes.length, 3);
  assert.deepEqual(buildVaultGraph([], []), { nodes: [], edges: [] });
});

test('map geometry: circle layout inside the canvas, size grows with note count, A->B and B->A lines do not overlap', () => {
  const pts = circleLayout(4, 640, 420);
  assert.equal(pts.length, 4);
  assert.ok(pts.every(p => p.x > 0 && p.x < 640 && p.y > 0 && p.y < 420));
  assert.deepEqual(circleLayout(1, 640, 420), [{ x: 320, y: 210 }]);
  assert.deepEqual(circleLayout(0, 640, 420), []);

  assert.ok(nodeRadius(100, 100) > nodeRadius(25, 100));
  assert.ok(nodeRadius(0, 100) >= 16 && nodeRadius(100, 100) <= 44);
  assert.equal(nodeRadius(5, 0), 16);

  const p = { x: 0, y: 0 };
  const q = { x: 100, y: 0 };
  const forward = edgeLine(p, q, 20, 20);
  const back = edgeLine(q, p, 20, 20);
  assert.notEqual(forward.y1, back.y1, 'opposite arrows are offset');
  assert.ok(forward.x1 >= 20 && forward.x2 <= 80, 'stops at the node borders');
});
