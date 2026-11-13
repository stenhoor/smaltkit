/**
 * Query results to a graph the view draws. The renderer doesn't depend on the engine: these types describe the shape
 * of graph database result values (`{ kind: 'node', … }`), so any source of nodes and relationships in that shape works.
 */
import type { RenderGraph } from './types.js';

export interface ResultNodeLike {
  readonly kind: 'node';
  readonly id: number | string;
  readonly labels: readonly string[];
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface ResultRelLike {
  readonly kind: 'relationship';
  readonly id: number | string;
  readonly type: string;
  readonly start: number | string;
  readonly end: number | string;
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface ResultsGraphOptions {
  /** A node's caption (default: its `name`, `title`, `label` or `code` property, else its first label and id). */
  readonly caption?: (node: ResultNodeLike) => string;
  /** A node's colour group (default: its first label). */
  readonly group?: (node: ResultNodeLike) => string;
}

export interface ResultsGraph {
  /** For `view.setGraph`. */
  readonly graph: RenderGraph;
  /** The nodes in drawing order: `graph.nodes[i]` is `nodes[i]`, so a hit's `index` finds its node. */
  readonly nodes: readonly ResultNodeLike[];
  /** The relationships in drawing order, likewise for edge hits. */
  readonly relationships: readonly ResultRelLike[];
}

const CAPTION_KEYS = ['name', 'title', 'label', 'code'];

export function defaultCaption(n: ResultNodeLike): string {
  for (const k of CAPTION_KEYS) if (n.properties[k] !== undefined && n.properties[k] !== null) return String(n.properties[k]);
  return n.labels[0] ? `${n.labels[0]} ${n.id}` : String(n.id);
}

/**
 * Every node, relationship and path in the values (rows, lists, maps, nested at any depth), as a graph to draw.
 * Relationships whose ends aren't in the values bring their ends as bare nodes. Returns an empty graph when there are
 * none.
 *
 * ```ts
 * const { graph, nodes } = resultsToGraph(db.run('MATCH p = (:Person)-[:KNOWS*1..2]->() RETURN p').rows);
 * view.setGraph(graph);
 * view.onClick((hit) => hit?.kind === 'node' && console.log(nodes[hit.index]));
 * ```
 */
export function resultsToGraph(values: unknown, options: ResultsGraphOptions = {}): ResultsGraph {
  const caption = options.caption ?? defaultCaption;
  const group = options.group ?? ((n: ResultNodeLike) => n.labels[0] ?? '');
  const nodes = new Map<number | string, ResultNodeLike>();
  const rels = new Map<number | string, ResultRelLike>();
  const visit = (v: unknown): void => {
    if (v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(visit);
    const o = v as { kind?: unknown };
    if (o.kind === 'node') nodes.set((v as ResultNodeLike).id, v as ResultNodeLike);
    else if (o.kind === 'relationship') rels.set((v as ResultRelLike).id, v as ResultRelLike);
    else if (o.kind === 'path') {
      const p = v as { nodes?: unknown; relationships?: unknown };
      visit(p.nodes);
      visit(p.relationships);
    } else Object.values(v).forEach(visit);
  };
  visit(values);
  for (const r of rels.values()) {
    for (const id of [r.start, r.end]) if (!nodes.has(id)) nodes.set(id, { kind: 'node', id, labels: [], properties: {} });
  }
  const nodeList = [...nodes.values()];
  const relList = [...rels.values()];
  const index = new Map(nodeList.map((n, i) => [n.id, i]));
  return {
    graph: {
      nodes: nodeList.map((n) => ({ id: n.id, label: caption(n), group: group(n) })),
      edges: relList.map((r) => ({ source: index.get(r.start)!, target: index.get(r.end)!, label: r.type, group: r.type })),
    },
    nodes: nodeList,
    relationships: relList,
  };
}
