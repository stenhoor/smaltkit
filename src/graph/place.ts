/**
 * Where nodes start: kept nodes where they were, new nodes next to a neighbour that already has a
 * position (pointing away from that neighbour's other neighbours, about a link length out), and the
 * rest on a seed spiral. The result is both a CPU estimate of every position and, for the GPU, a
 * gather recipe: slot i takes old slot `src[i]` plus `offset[i]` (or `offset[i]` alone when `src[i]`
 * is NONE), so kept and anchored nodes start from the exact positions on the GPU, not from the CPU's
 * last read-back.
 */
import type { Csr } from './csr.js';
import type { ViewMode } from './types.js';

export const NONE = 0xffffffff;

/** Deterministic hash in 0..1. */
export function hash01(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** d3-style phyllotaxis seed (a sphere spiral in 3D). */
export function seedPosition(i: number, mode: ViewMode, out: Float32Array, o: number): void {
  if (mode === '2d') {
    const r = 10 * Math.sqrt(0.5 + i);
    const a = i * Math.PI * (3 - Math.sqrt(5));
    out[o] = r * Math.cos(a);
    out[o + 1] = r * Math.sin(a);
    out[o + 2] = 0;
  } else {
    const r = 10 * Math.cbrt(0.5 + i);
    const yaw = i * Math.PI * (3 - Math.sqrt(5));
    const roll = i * ((Math.PI * 20) / (9 + Math.sqrt(221)));
    out[o] = r * Math.sin(roll) * Math.cos(yaw);
    out[o + 1] = r * Math.cos(roll);
    out[o + 2] = r * Math.sin(roll) * Math.sin(yaw);
  }
  out[o + 3] = 1;
}

export interface Placement {
  /** CPU estimate, xyzw per node. */
  pos: Float32Array;
  /** Old slot to start from, or NONE. */
  src: Uint32Array;
  /** Added to the old slot's position (xyzw, w unused), or the position itself when src is NONE. */
  offset: Float32Array;
  /** How many nodes went on the seed spiral. */
  seeded: number;
}

/**
 * Place `n` nodes. `keep[i]` is the old slot of node i or NONE; `oldPos` holds xyzw per old slot (the
 * CPU's estimate). Nodes without an old slot are anchored breadth-first to placed neighbours; those
 * with none go on the spiral from index `seedFrom`. `out` arrays are reused when big enough.
 */
export function placeNodes(
  n: number,
  csr: Csr,
  keep: Uint32Array,
  oldPos: Float32Array,
  mode: ViewMode,
  linkDistance: number,
  seedFrom: number,
  out?: Partial<Placement>,
): Placement {
  const len = Math.max(n, 1) * 4;
  const pos = out?.pos && out.pos.length >= len ? out.pos : new Float32Array(len);
  const offset = out?.offset && out.offset.length >= len ? out.offset : new Float32Array(len);
  const src = out?.src && out.src.length >= n ? out.src : new Uint32Array(Math.max(n, 1));
  const placed = new Uint8Array(n);
  const queue = new Uint32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) {
    const s = keep[i]!;
    if (s !== NONE && s * 4 + 3 < oldPos.length) {
      pos[i * 4] = oldPos[s * 4]!;
      pos[i * 4 + 1] = oldPos[s * 4 + 1]!;
      pos[i * 4 + 2] = mode === '3d' ? oldPos[s * 4 + 2]! : 0;
      pos[i * 4 + 3] = 1;
      src[i] = s;
      offset[i * 4] = offset[i * 4 + 1] = offset[i * 4 + 2] = offset[i * 4 + 3] = 0;
      placed[i] = 1;
      queue[tail++] = i;
    } else {
      src[i] = NONE;
    }
  }
  // Breadth-first from the placed nodes: each new neighbour goes about a link length out from its anchor.
  const { offsets, neighbors } = csr;
  const drain = () => {
  while (head < tail) {
    const a = queue[head++]!;
    const ax = pos[a * 4]!, ay = pos[a * 4 + 1]!, az = pos[a * 4 + 2]!;
    // Centroid of the anchor's placed neighbours: new nodes go out the other way.
    let cx = 0, cy = 0, cz = 0, c = 0;
    for (let k = offsets[a]!; k < offsets[a + 1]!; k++) {
      const j = neighbors[k]!;
      if (!placed[j]) continue;
      cx += pos[j * 4]!;
      cy += pos[j * 4 + 1]!;
      cz += pos[j * 4 + 2]!;
      c++;
    }
    let dx = 0, dy = 0, dz = 0;
    if (c > 0) {
      dx = ax - cx / c;
      dy = ay - cy / c;
      dz = mode === '3d' ? az - cz / c : 0;
    }
    let dl = Math.hypot(dx, dy, dz);
    let k2 = 0;
    for (let k = offsets[a]!; k < offsets[a + 1]!; k++) {
      const j = neighbors[k]!;
      if (placed[j]) continue;
      // Spread siblings around the outward direction (or all the way round without one).
      const base = dl > 1e-6 ? Math.atan2(dy, dx) : hash01(a) * Math.PI * 2;
      const spread = dl > 1e-6 ? 1.2 : Math.PI * 2;
      const ang = base + (hash01(j * 31 + k2) - 0.5) * spread + (dl > 1e-6 ? 0 : k2 * 2.399);
      k2++;
      const r = linkDistance * (0.7 + 0.3 * hash01(j + 7919));
      let ox = Math.cos(ang), oy = Math.sin(ang), oz = 0;
      if (mode === '3d') {
        const zz = dl > 1e-6 ? dz / dl : 0;
        oz = zz + (hash01(j + 104729) - 0.5) * 0.8;
        const s = Math.sqrt(Math.max(0, 1 - Math.min(oz * oz, 0.81)));
        ox *= s;
        oy *= s;
        const l = Math.hypot(ox, oy, oz);
        ox /= l;
        oy /= l;
        oz /= l;
      }
      pos[j * 4] = ax + ox * r;
      pos[j * 4 + 1] = ay + oy * r;
      pos[j * 4 + 2] = az + oz * r;
      pos[j * 4 + 3] = 1;
      src[j] = src[a]!;
      offset[j * 4] = offset[a * 4]! + ox * r;
      offset[j * 4 + 1] = offset[a * 4 + 1]! + oy * r;
      offset[j * 4 + 2] = offset[a * 4 + 2]! + oz * r;
      offset[j * 4 + 3] = 0;
      placed[j] = 1;
      queue[tail++] = j;
    }
    dl = 0;
  }
  };
  drain();
  // The rest: one node of each unplaced component on the spiral, its component around it.
  let seed = seedFrom;
  let seeded = 0;
  for (let i = 0; i < n; i++) {
    if (placed[i]) continue;
    seedPosition(seed++, mode, pos, i * 4);
    offset.set(pos.subarray(i * 4, i * 4 + 4), i * 4);
    offset[i * 4 + 3] = 0;
    src[i] = NONE;
    placed[i] = 1;
    seeded++;
    queue[tail++] = i;
    drain();
  }
  return { pos, src, offset, seeded };
}

/** Mobility of nodes this many hops or more from a change. */
export const MOBILITY_FLOOR = 0.08;

/**
 * Mobility after a small change: the nodes in `touched` take the full force, and it halves with
 * every hop further out, down to MOBILITY_FLOOR, so the layout settles the change locally and the
 * rest of the drawing holds still.
 */
export function mobilityAround(n: number, csr: Csr, touched: readonly number[], out?: Float32Array): Float32Array {
  const mob = out && out.length >= n ? out : new Float32Array(n);
  const hops = new Int32Array(n).fill(-1);
  const queue = new Uint32Array(n);
  let head = 0, tail = 0;
  for (const i of touched) {
    if (i >= 0 && i < n && hops[i] < 0) {
      hops[i] = 0;
      queue[tail++] = i;
    }
  }
  const { offsets, neighbors } = csr;
  const maxHops = Math.ceil(Math.log2(1 / MOBILITY_FLOOR)) + 1;
  while (head < tail) {
    const a = queue[head++]!;
    if (hops[a]! >= maxHops) continue;
    for (let k = offsets[a]!; k < offsets[a + 1]!; k++) {
      const j = neighbors[k]!;
      if (hops[j]! >= 0) continue;
      hops[j] = hops[a]! + 1;
      queue[tail++] = j;
    }
  }
  for (let i = 0; i < n; i++) {
    const h = hops[i]!;
    mob[i] = h < 0 ? MOBILITY_FLOOR : Math.max(MOBILITY_FLOOR, Math.pow(0.5, h));
  }
  return mob;
}
