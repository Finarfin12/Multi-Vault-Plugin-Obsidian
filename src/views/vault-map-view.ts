import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type MultiVaultNavigatorPlugin from '../main';
import { buildVaultGraph, circleLayout, edgeLine, GraphEdge, nodeRadius, VaultGraph } from '../analysis/vault-graph';

export const VIEW_TYPE_VAULT_MAP = 'mvn-vault-map-view';

const WIDTH = 640;
const HEIGHT = 420;

/**
 * Cross-vault map (F12): vaults as circles (size = number of notes) joined by
 * arrows that count the [[Vault::Note]] links between them. Click an arrow to
 * list the notes that make the connection. Plain SVG, no graphics library.
 */
export class VaultMapView extends ItemView {
  private plugin: MultiVaultNavigatorPlugin;
  private selected: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: MultiVaultNavigatorPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_VAULT_MAP;
  }

  getDisplayText(): string {
    return 'Cross-vault map';
  }

  getIcon(): string {
    return 'git-fork';
  }

  async onOpen() {
    this.render();
  }

  public render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('mvn-vault-map');

    const header = container.createDiv({ cls: 'mvn-map-header' });
    header.createEl('h2', { text: 'Cross-vault map' });
    const refresh = header.createEl('button', { cls: 'mvn-btn-icon' });
    setIcon(refresh.createSpan(), 'refresh-cw');
    refresh.createSpan({ text: 'Refresh' });
    refresh.onclick = () => this.render();

    const vaults = this.plugin.vaultRegistry.getEnabledVaults().map(v => ({ id: v.id, name: v.name }));
    const graph = buildVaultGraph(this.plugin.indexer.getIndexedFiles(), vaults);

    if (graph.nodes.length === 0) {
      container.createEl('p', { text: 'No vaults are indexed yet.', cls: 'mvn-text-muted' });
      return;
    }
    if (graph.edges.length === 0) {
      container.createEl('p', {
        text: 'No links between vaults found yet. A link looks like [[vault::note]].',
        cls: 'mvn-text-muted'
      });
    }

    this.drawGraph(container, graph);
    container.createDiv({ cls: 'mvn-map-details' });
    this.showDetails(container, graph);
  }

  private drawGraph(container: Element, graph: VaultGraph) {
    const svg = container.createSvg('svg', { cls: 'mvn-map-svg', attr: { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, role: 'img', 'aria-label': 'Links between vaults' } });

    const defs = svg.createSvg('defs');
    const marker = defs.createSvg('marker', { attr: { id: 'mvn-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' } });
    marker.createSvg('path', { attr: { d: 'M 0 0 L 10 5 L 0 10 z' }, cls: 'mvn-map-arrowhead' });

    const maxCount = Math.max(1, ...graph.nodes.map(n => n.count));
    const points = circleLayout(graph.nodes.length, WIDTH, HEIGHT);
    const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
    const radius = graph.nodes.map(n => nodeRadius(n.count, maxCount));

    graph.edges.forEach(edge => {
      const i = index.get(edge.from);
      const j = index.get(edge.to);
      if (i === undefined || j === undefined) return;
      const line = edgeLine(points[i], points[j], radius[i], radius[j]);
      const key = this.edgeKey(edge);
      const group = svg.createSvg('g', { cls: `mvn-map-edge${this.selected === key ? ' is-selected' : ''}` });
      // A wide transparent stroke makes thin arrows easy to click
      const hit = group.createSvg('line', { cls: 'mvn-map-edge-hit', attr: { x1: String(line.x1), y1: String(line.y1), x2: String(line.x2), y2: String(line.y2) } });
      group.createSvg('line', { cls: 'mvn-map-edge-line', attr: { x1: String(line.x1), y1: String(line.y1), x2: String(line.x2), y2: String(line.y2), 'marker-end': 'url(#mvn-arrow)' } });
      const label = group.createSvg('text', { cls: 'mvn-map-edge-label', attr: { x: String((line.x1 + line.x2) / 2), y: String((line.y1 + line.y2) / 2 - 4), 'text-anchor': 'middle' } });
      label.textContent = String(edge.count);
      group.createSvg('title').textContent = `${this.nameOf(graph, edge.from)} → ${this.nameOf(graph, edge.to)}: ${edge.count} link${edge.count === 1 ? '' : 's'}`;

      const select = () => {
        this.selected = key;
        this.render();
      };
      hit.addEventListener('click', select);
      group.setAttribute('tabindex', '0');
      group.setAttribute('role', 'button');
      group.addEventListener('keydown', (e: Event) => {
        const key2 = (e as KeyboardEvent).key;
        if (key2 === 'Enter' || key2 === ' ') select();
      });
    });

    graph.nodes.forEach((node, i) => {
      const g = svg.createSvg('g', { cls: 'mvn-map-node' });
      g.createSvg('circle', { attr: { cx: String(points[i].x), cy: String(points[i].y), r: String(radius[i]) } });
      const name = g.createSvg('text', { cls: 'mvn-map-node-name', attr: { x: String(points[i].x), y: String(points[i].y + 4), 'text-anchor': 'middle' } });
      name.textContent = node.name;
      const count = g.createSvg('text', { cls: 'mvn-map-node-count', attr: { x: String(points[i].x), y: String(points[i].y + radius[i] + 14), 'text-anchor': 'middle' } });
      count.textContent = `${node.count} note${node.count === 1 ? '' : 's'}`;
    });
  }

  private showDetails(container: Element, graph: VaultGraph) {
    const details = container.querySelector('.mvn-map-details');
    if (!details) return;
    const edge = graph.edges.find(e => this.edgeKey(e) === this.selected);
    if (!edge) {
      if (graph.edges.length > 0) details.createEl('p', { text: 'Click an arrow to see the notes behind it.', cls: 'mvn-text-muted' });
      return;
    }

    details.createEl('h3', { text: `${this.nameOf(graph, edge.from)} → ${this.nameOf(graph, edge.to)} (${edge.count})` });
    const list = details.createEl('ul', { cls: 'mvn-map-links' });
    edge.links.forEach(link => {
      const li = list.createEl('li');
      const from = li.createEl('a', { text: link.source.basename, cls: 'mvn-map-link' });
      from.title = link.source.relativePath;
      from.onclick = (e) => { e.preventDefault(); void this.plugin.fileOpener.openFile(link.source); };
      li.appendText(' → ');
      const to = link.resolved;
      if (to) {
        const a = li.createEl('a', { text: link.target, cls: 'mvn-map-link' });
        a.title = to.relativePath;
        a.onclick = (e) => { e.preventDefault(); void this.plugin.fileOpener.openFile(to); };
      } else {
        li.createSpan({ text: `${link.target} (not found)`, cls: 'mvn-text-muted' });
      }
    });
  }

  private edgeKey(edge: GraphEdge): string {
    return `${edge.from}>${edge.to}`;
  }

  private nameOf(graph: VaultGraph, id: string): string {
    return graph.nodes.find(n => n.id === id)?.name ?? id;
  }
}
