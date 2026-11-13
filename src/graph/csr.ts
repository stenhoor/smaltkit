/**
 * Compressed sparse row adjacency for the layout: for node i, its neighbours are
 * `neighbors[offsets[i] .. offsets[i + 1])`. Edges count in both directions, so each node gathers
 * its own spring forces without atomics. Self-loops and edges with an endpoint out of range are
 * left out (they exert no force).
 */
export interface Csr {
  offsets: Uint32Array;
  neighbors: Uint32Array;
}

export const NO_NODE = 0xffffffff;

/** Endpoints as a flat [s0, t0, s1, t1, ...] array; invalid endpoints become NO_NODE. */
export function edgeEndpoints(
  nodeCount: number,
  edges: readonly { source: number; target: number }[],
  out?: Uint32Array,
): Uint32Array {
  const pairs = out && out.length >= edges.length * 2 ? out : new Uint32Array(edges.length * 2);
  for (let k = 0; k < edges.length; k++) {
    const { source: s, target: t } = edges[k]!;
    const ok = Number.isInteger(s) && Number.isInteger(t) && s >= 0 && t >= 0 && s < nodeCount && t < nodeCount;
    pairs[2 * k] = ok ? s : NO_NODE;
    pairs[2 * k + 1] = ok ? t : NO_NODE;
  }
  return pairs;
}

export function buildCsr(nodeCount: number, pairs: Uint32Array, edgeCount = pairs.length >> 1): Csr {
  const offsets = new Uint32Array(nodeCount + 1);
  for (let k = 0; k < edgeCount; k++) {
    const s = pairs[2 * k]!;
    const t = pairs[2 * k + 1]!;
    if (s === NO_NODE || s === t) continue;
    offsets[s + 1]!++;
    offsets[t + 1]!++;
  }
  for (let i = 0; i < nodeCount; i++) offsets[i + 1]! += offsets[i]!;
  const neighbors = new Uint32Array(offsets[nodeCount]!);
  const fill = offsets.slice(0, nodeCount);
  for (let k = 0; k < edgeCount; k++) {
    const s = pairs[2 * k]!;
    const t = pairs[2 * k + 1]!;
    if (s === NO_NODE || s === t) continue;
    neighbors[fill[s]!++] = t;
    neighbors[fill[t]!++] = s;
  }
  return { offsets, neighbors };
}

export function degree(csr: Csr, i: number): number {
  return csr.offsets[i + 1]! - csr.offsets[i]!;
}

/** Node indices sorted by descending degree (ties by index), used to pick which labels to show. */
export function degreeOrder(csr: Csr): Uint32Array {
  const n = csr.offsets.length - 1;
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  return order.sort((a, b) => degree(csr, b) - degree(csr, a) || a - b);
}
