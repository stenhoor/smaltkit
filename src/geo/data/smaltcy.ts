/**
 * smaltcy (Cypher) as a data source: `graphLayers` turns a result's nodes into points and its relationships and paths
 * into arcs, placed by the nodes' longitude and latitude. Only `graph.query` is used, so this module doesn't import
 * smaltcy.
 */
interface CyNode {
  readonly kind: 'node';
  readonly id: number;
  readonly labels: readonly string[];
  readonly properties: Readonly<Record<string, unknown>>;
}
interface CyRel {
  readonly kind: 'relationship';
  readonly id: number;
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly properties: Readonly<Record<string, unknown>>;
}
interface CyPath {
  readonly kind: 'path';
  readonly nodes: readonly CyNode[];
  readonly relationships: readonly CyRel[];
}

/** What `graphLayers` needs from a smaltcy `Graph`. */
export interface CypherLike {
  query(cypher: string, params?: Record<string, unknown>): Record<string, unknown>[];
}

/** A Cypher result as map data: nodes as points, relationships as arcs between their nodes. */
export interface GraphMapData {
  readonly nodes: {
    readonly count: number;
    readonly lng: Float64Array;
    readonly lat: Float64Array;
    /** The first label of each node, as a code into `labels`. */
    readonly label: Float32Array;
    readonly labels: readonly string[];
    readonly properties: Record<string, unknown[]>;
  };
  readonly edges: {
    readonly count: number;
    readonly sourceLng: Float64Array;
    readonly sourceLat: Float64Array;
    readonly targetLng: Float64Array;
    readonly targetLat: Float64Array;
    /** The relationship type, as a code into `types`. */
    readonly type: Float32Array;
    readonly types: readonly string[];
    readonly properties: Record<string, unknown[]>;
  };
  readonly ms: number;
}

/**
 * Runs Cypher on smaltcy and collects every node, relationship and path in the result. Nodes need longitude and
 * latitude properties (`lng` and `lat` by default); relationships are kept when both their nodes are in the result
 * (return paths, or both ends, to draw them).
 */
export function graphLayers(graph: CypherLike, cypher: string, params: Record<string, unknown> = {}, keys: { lng?: string; lat?: string } = {}): GraphMapData {
  const lngKey = keys.lng ?? 'lng', latKey = keys.lat ?? 'lat';
  const t0 = performance.now();
  const rows = graph.query(cypher, params);
  const ms = performance.now() - t0;
  const nodes = new Map<number, CyNode>();
  const rels = new Map<number, CyRel>();
  const visit = (v: unknown): void => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(visit);
    const k = (v as { kind?: string }).kind;
    if (k === 'node') nodes.set((v as CyNode).id, v as CyNode);
    else if (k === 'relationship') rels.set((v as CyRel).id, v as CyRel);
    else if (k === 'path') {
      for (const n of (v as CyPath).nodes) nodes.set(n.id, n);
      for (const r of (v as CyPath).relationships) rels.set(r.id, r);
    }
  };
  for (const row of rows) for (const v of Object.values(row)) visit(v);

  const placed = [...nodes.values()].filter((n) => typeof n.properties[lngKey] === 'number' && typeof n.properties[latKey] === 'number');
  const at = new Map(placed.map((n) => [n.id, n]));
  const labels = [...new Set(placed.map((n) => n.labels[0] ?? ''))];
  const nodeProps: Record<string, unknown[]> = {};
  for (const n of placed) for (const key of Object.keys(n.properties)) nodeProps[key] ??= [];
  placed.forEach((n, i) => {
    for (const key of Object.keys(nodeProps)) nodeProps[key][i] = n.properties[key] ?? null;
  });
  const edges = [...rels.values()].filter((r) => at.has(r.start) && at.has(r.end));
  const types = [...new Set(edges.map((r) => r.type))];
  const relProps: Record<string, unknown[]> = { type: edges.map((r) => r.type) };
  for (const r of edges) for (const key of Object.keys(r.properties)) relProps[key] ??= [];
  edges.forEach((r, i) => {
    for (const key of Object.keys(relProps)) if (key !== 'type') relProps[key][i] = r.properties[key] ?? null;
  });
  return {
    nodes: {
      count: placed.length,
      lng: Float64Array.from(placed, (n) => n.properties[lngKey] as number),
      lat: Float64Array.from(placed, (n) => n.properties[latKey] as number),
      label: Float32Array.from(placed, (n) => labels.indexOf(n.labels[0] ?? '')),
      labels,
      properties: nodeProps,
    },
    edges: {
      count: edges.length,
      sourceLng: Float64Array.from(edges, (r) => at.get(r.start)!.properties[lngKey] as number),
      sourceLat: Float64Array.from(edges, (r) => at.get(r.start)!.properties[latKey] as number),
      targetLng: Float64Array.from(edges, (r) => at.get(r.end)!.properties[lngKey] as number),
      targetLat: Float64Array.from(edges, (r) => at.get(r.end)!.properties[latKey] as number),
      type: Float32Array.from(edges, (r) => types.indexOf(r.type)),
      types,
      properties: relProps,
    },
    ms,
  };
}

/** A generated supply chain (datasets `supplyChain`) as smaltcy's graph JSON, for `graph.load(...)`. */
export function supplyChainJSON(g: {
  readonly nodes: readonly { readonly id: number; readonly label: string; readonly name: string; readonly lng: number; readonly lat: number; readonly capacity: number }[];
  readonly edges: readonly { readonly from: number; readonly to: number; readonly type: string; readonly volume: number; readonly days: number }[];
}): { nodes: { id: number; labels: string[]; properties: Record<string, string | number> }[]; relationships: { start: number; end: number; type: string; properties: Record<string, number> }[] } {
  return {
    nodes: g.nodes.map((n) => ({ id: n.id, labels: [n.label], properties: { name: n.name, lng: n.lng, lat: n.lat, capacity: n.capacity } })),
    relationships: g.edges.map((e) => ({ start: e.from, end: e.to, type: e.type, properties: { volume: e.volume, days: e.days } })),
  };
}
