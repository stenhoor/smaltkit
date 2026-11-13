import { describe, it } from 'node:test';
import { expect } from './helpers/expect.ts';
import { buildCsr, edgeEndpoints } from '../dist/graph/csr.js';
import { FIXED_SPACING, FixedLayout, packClusters, slotPoint } from '../dist/graph/fixed.js';
import { NONE } from '../dist/graph/place.js';
import type { RenderEdge, RenderNode, ViewMode } from '../dist/graph/types.js';

/** A graph of `groups` communities with a hub per community and some random edges. */
function graph(n: number, groups: number, seed = 1): { nodes: RenderNode[]; edges: RenderEdge[] } {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const nodes: RenderNode[] = [];
  for (let i = 0; i < n; i++) nodes.push({ id: `n${i}`, group: groups > 0 ? `g${Math.floor(rnd() * rnd() * groups)}` : undefined });
  const edges: RenderEdge[] = [];
  for (let i = 1; i < n; i++) edges.push({ source: i, target: Math.floor(rnd() * Math.min(i, 20)) });
  return { nodes, edges };
}

function csrOf(g: { nodes: RenderNode[]; edges: RenderEdge[] }) {
  const n = g.nodes.length;
  return buildCsr(n, edgeEndpoints(n, g.edges), g.edges.length);
}

/** The smallest distance between any two of the first n points (xyzw), through a grid. */
function minDistance(p: Float32Array, n: number, cell: number): number {
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  for (let i = 0; i < n; i++) {
    const k = key(Math.floor(p[i * 4]! / cell), Math.floor(p[i * 4 + 1]! / cell), Math.floor(p[i * 4 + 2]! / cell));
    const l = grid.get(k);
    if (l) l.push(i);
    else grid.set(k, [i]);
  }
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(p[i * 4]! / cell), cy = Math.floor(p[i * 4 + 1]! / cell), cz = Math.floor(p[i * 4 + 2]! / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of grid.get(key(cx + dx, cy + dy, cz + dz)) ?? []) {
        if (j <= i) continue;
        best = Math.min(best, Math.hypot(p[i * 4]! - p[j * 4]!, p[i * 4 + 1]! - p[j * 4 + 1]!, p[i * 4 + 2]! - p[j * 4 + 2]!));
      }
    }
  }
  return best;
}

for (const mode of ['2d', '3d'] as ViewMode[]) describe(`fixed layout, ${mode}`, () => {
  it('slots of one cluster are at least one spacing apart', () => {
    const k = 5000;
    const p = new Float32Array(k * 4);
    for (let i = 0; i < k; i++) slotPoint(i, mode, p, i * 4);
    expect(minDistance(p, k, 1)).toBeGreaterThanOrEqual(0.999);
  });

  it('is deterministic, spaced, and keeps clusters apart', () => {
    const g = graph(3000, 7);
    const csr = csrOf(g);
    const a = new FixedLayout();
    a.compute(g.nodes, csr, mode);
    const b = new FixedLayout();
    b.compute(g.nodes, csr, mode);
    expect(Array.from(a.base)).toEqual(Array.from(b.base));
    expect(minDistance(a.base, 3000, FIXED_SPACING)).toBeGreaterThanOrEqual(FIXED_SPACING * 0.999);
    let zMax = 0;
    for (let i = 0; i < 3000; i++) zMax = Math.max(zMax, Math.abs(a.base[i * 4 + 2]!));
    if (mode === '2d') expect(zMax).toBe(0);
    else expect(zMax).toBeGreaterThan(FIXED_SPACING);
    const shapes = a.clusterShapes();
    expect(shapes.length).toBe(7);
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const p = shapes[i]!, q = shapes[j]!;
        const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
        expect(d).toBeGreaterThan(p.radius + q.radius + FIXED_SPACING);
      }
    }
    // Every node sits in its own group's cluster, within its radius.
    for (let i = 0; i < 3000; i++) {
      const s = a.slot(i)!;
      expect(s.group).toBe(g.nodes[i]!.group);
      const c = shapes.find((x) => x.group === s.group)!;
      const d = Math.hypot(a.base[i * 4]! - c.x, a.base[i * 4 + 1]! - c.y, a.base[i * 4 + 2]! - c.z);
      expect(d).toBeLessThanOrEqual(c.radius + 1e-3);
    }
  });

  it('puts the highest-degree nodes at the centre of their cluster', () => {
    const nodes: RenderNode[] = [];
    for (let i = 0; i < 40; i++) nodes.push({ id: i, group: 'a' });
    const edges: RenderEdge[] = [];
    for (let i = 0; i < 39; i++) edges.push({ source: 39, target: i });
    for (let i = 1; i < 20; i++) edges.push({ source: 20, target: i });
    const f = new FixedLayout();
    f.compute(nodes, buildCsr(40, edgeEndpoints(40, edges), edges.length), mode);
    expect(f.slot(39)!.slot).toBe(0);
    expect(f.slot(20)!.slot).toBe(1);
  });

  it('with one group or none, one cluster', () => {
    const g = graph(500, 0);
    const f = new FixedLayout();
    f.compute(g.nodes, csrOf(g), mode);
    expect(f.clusterShapes().length).toBe(1);
    expect(minDistance(f.base, 500, FIXED_SPACING)).toBeGreaterThanOrEqual(FIXED_SPACING * 0.999);
  });

  it('keeps slots while nodes come and go; new ones fill holes in their cluster', () => {
    const g = graph(400, 4, 3);
    const f = new FixedLayout();
    f.compute(g.nodes, csrOf(g), mode);
    const before = f.base.slice();
    // Remove every 10th node.
    const keepIdx = g.nodes.map((_, i) => i).filter((i) => i % 10 !== 0);
    const nodes2 = keepIdx.map((i) => g.nodes[i]!);
    const src2 = Uint32Array.from(keepIdx);
    const csr2 = buildCsr(nodes2.length, new Uint32Array(0), 0);
    expect(f.update(nodes2, csr2, src2, mode)).toBe(false);
    for (let k = 0; k < keepIdx.length; k++) {
      for (let c = 0; c < 3; c++) expect(f.base[k * 4 + c]).toBe(before[keepIdx[k]! * 4 + c]);
    }
    // Add five nodes to group g0: they take holes (or reserved room) of g0's cluster, the rest stay.
    const n2 = nodes2.length;
    const nodes3 = [...nodes2];
    for (let k = 0; k < 5; k++) nodes3.push({ id: `new${k}`, group: 'g0' });
    const src3 = new Uint32Array(nodes3.length);
    for (let i = 0; i < nodes3.length; i++) src3[i] = i < n2 ? i : NONE;
    const keptBase = f.base.slice(0, n2 * 4);
    expect(f.update(nodes3, buildCsr(nodes3.length, new Uint32Array(0), 0), src3, mode)).toBe(false);
    expect(Array.from(f.base.subarray(0, n2 * 4))).toEqual(Array.from(keptBase));
    const shapes = f.clusterShapes();
    const g0 = shapes.find((s) => s.group === 'g0')!;
    for (let i = n2; i < nodes3.length; i++) {
      expect(f.slot(i)!.group).toBe('g0');
      const d = Math.hypot(f.base[i * 4]! - g0.x, f.base[i * 4 + 1]! - g0.y, f.base[i * 4 + 2]! - g0.z);
      expect(d).toBeLessThanOrEqual(g0.radius + 1e-3);
    }
    expect(minDistance(f.base, nodes3.length, FIXED_SPACING)).toBeGreaterThanOrEqual(FIXED_SPACING * 0.999);
  });

  it('grows a cluster and a new group without overlaps, moving whole clusters only', () => {
    const g = graph(300, 3, 5);
    const f = new FixedLayout();
    f.compute(g.nodes, csrOf(g), mode);
    const nodes = [...g.nodes];
    for (let k = 0; k < 400; k++) nodes.push({ id: `x${k}`, group: k % 2 ? 'g0' : 'brand new' });
    const src = new Uint32Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) src[i] = i < 300 ? i : NONE;
    const before = f.base.slice();
    const beforeShapes = f.clusterShapes();
    f.update(nodes, buildCsr(nodes.length, new Uint32Array(0), 0), src, mode);
    expect(minDistance(f.base, nodes.length, FIXED_SPACING)).toBeGreaterThanOrEqual(FIXED_SPACING * 0.999);
    const shapes = f.clusterShapes();
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const p = shapes[i]!, q = shapes[j]!;
        expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)).toBeGreaterThan(p.radius + q.radius + FIXED_SPACING);
      }
    }
    // A kept node moved exactly as far as its cluster's centre.
    for (let i = 0; i < 300; i++) {
      const grp = g.nodes[i]!.group!;
      const b0 = beforeShapes.find((s) => s.group === grp)!, b1 = shapes.find((s) => s.group === grp)!;
      expect(f.base[i * 4]! - before[i * 4]!).toBeCloseTo(b1.x - b0.x, 2);
      expect(f.base[i * 4 + 1]! - before[i * 4 + 1]!).toBeCloseTo(b1.y - b0.y, 2);
    }
  });

  it('spreads around the pivot', () => {
    const g = graph(200, 3);
    const f = new FixedLayout();
    f.compute(g.nodes, csrOf(g), mode);
    const t1 = f.targets(1).slice(), t2 = f.targets(2);
    const [px, py, pz] = f.pivot;
    for (let i = 0; i < 200; i++) {
      expect(t2[i * 4]! - px).toBeCloseTo(2 * (t1[i * 4]! - px), 3);
      expect(t2[i * 4 + 1]! - py).toBeCloseTo(2 * (t1[i * 4 + 1]! - py), 3);
      expect(t2[i * 4 + 2]! - pz).toBeCloseTo(2 * (t1[i * 4 + 2]! - pz), 3);
    }
    // The pivot is the centroid of the base layout.
    let sx = 0, sy = 0;
    for (let i = 0; i < 200; i++) {
      sx += f.base[i * 4]!;
      sy += f.base[i * 4 + 1]!;
    }
    expect(sx / 200).toBeCloseTo(px, 2);
    expect(sy / 200).toBeCloseTo(py, 2);
    // A node moved by hand at spread 2 keeps its drawn place.
    f.moveNode(5, 100, 50, mode === '3d' ? 20 : 0, 2);
    const t = f.targets(2);
    expect(t[20]).toBeCloseTo(100, 3);
    expect(t[21]).toBeCloseTo(50, 3);
  });

  it('lays out 100,000 nodes quickly', () => {
    const g = graph(100_000, 12);
    const csr = csrOf(g);
    const f = new FixedLayout();
    f.compute(g.nodes, csr, mode); // warm up
    const t0 = performance.now();
    f.compute(g.nodes, csr, mode);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(500);
    expect(minDistance(f.base, 100_000, FIXED_SPACING)).toBeGreaterThanOrEqual(FIXED_SPACING * 0.999);
    console.log(`fixed layout ${mode}, 100k nodes: ${ms.toFixed(0)} ms`);
  });
});

describe('packing clusters', () => {
  it('many tiny groups go on rings without overlap', () => {
    {
      const radii = Array.from({ length: 2000 }, (_, i) => (i < 5 ? 200 - i * 20 : 10 + (2000 - i) / 400));
      const c = packClusters(radii, 5);
      // Brute force over all pairs.
      let ok = true;
      for (let i = 0; i < radii.length && ok; i++) {
        for (let j = i + 1; j < radii.length; j++) {
          const d = Math.hypot(c[i * 3]! - c[j * 3]!, c[i * 3 + 1]! - c[j * 3 + 1]!, c[i * 3 + 2]! - c[j * 3 + 2]!);
          if (d < radii[i]! + radii[j]! + 5 - 1e-6) {
            ok = false;
            break;
          }
        }
      }
      expect(ok).toBe(true);
    }
  });
});
