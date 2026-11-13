/**
 * The fixed layout: no physics, every node in a slot of its group's cluster, computed on the CPU in
 * O(n log n).
 *
 * - A cluster is a sunflower (Vogel's golden-angle spiral) in 2D, or a ball of Fibonacci-sphere
 *   shells in 3D, with its highest-degree nodes in the innermost slots. Slots are at least
 *   `spacing` apart.
 * - Clusters, largest first, are placed one by one along golden-angle rays as close to the centre as
 *   they fit without overlapping the clusters already placed (a sunflower of cluster centres sized by
 *   radius); past MAX_GREEDY clusters the rest go on rings around them. In 3D too the centres lie in
 *   the screen's plane (z = 0), so that the clusters stand side by side in the default view.
 * - While the graph changes (`update`), nodes that stay keep their slot, new nodes take the innermost
 *   free slot of their group's cluster, removed nodes leave a hole. A cluster reserves a little more
 *   room than it needs; when it outgrows that, its room grows by half and the clusters are placed
 *   again (each keeps its slots, so a whole cluster moves at most).
 *
 * Positions are a base layout at spread 1; the view draws `pivot + (base − pivot) × spread`.
 */
import type { Csr } from './csr.js';
import type { RenderNode, ViewMode } from './types.js';

/** Minimum distance between the centres of neighbouring nodes at spread 1 (world units). */
export const FIXED_SPACING = 28;
/** Empty room between clusters, in multiples of the spacing. */
export const CLUSTER_GAP = 1.5;
/** Clusters placed greedily along rays; the rest (many tiny groups) go on rings or shells. */
export const MAX_GREEDY = 600;

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Vogel's spiral r = √(k + ½) has its closest pair 1.546 apart: scale it to 1. */
const VOGEL = 1 / 1.546;
/** Points of a Fibonacci sphere of N points are at least 2.68/√N apart (unit radius, N ≥ 2). */
const FIB_MIN_CHORD = 2.68;

// ---- slots of one cluster (unit spacing) ---------------------------------------------------------

/** Cumulative slot counts of the 3D shells: shell s (radius s) holds SHELL_START[s+1] − SHELL_START[s]. */
let SHELL_START = new Float64Array([0, 1]);

/** Slots on shell s ≥ 1 of radius s with neighbours at least 1 apart. */
function shellSlots(s: number): number {
  return s === 0 ? 1 : Math.max(2, Math.floor((FIB_MIN_CHORD * s) ** 2));
}

function ensureShells(k: number): void {
  if (SHELL_START[SHELL_START.length - 1]! > k) return;
  const list = Array.from(SHELL_START);
  while (list[list.length - 1]! <= k) list.push(list[list.length - 1]! + shellSlots(list.length - 1));
  SHELL_START = Float64Array.from(list);
}

/** The shell that holds slot k (3D). */
export function shellOf(k: number): number {
  ensureShells(k);
  let lo = 0, hi = SHELL_START.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (SHELL_START[mid]! <= k) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Slot k of a cluster with unit spacing, centred on 0: xyz into out[o..o+2]. */
export function slotPoint(k: number, mode: ViewMode, out: Float32Array | Float64Array, o: number): void {
  if (mode === '2d') {
    const r = VOGEL * Math.sqrt(k + 0.5);
    const a = k * GOLDEN;
    out[o] = r * Math.cos(a);
    out[o + 1] = r * Math.sin(a);
    out[o + 2] = 0;
    return;
  }
  const s = shellOf(k);
  if (s === 0) {
    out[o] = out[o + 1] = out[o + 2] = 0;
    return;
  }
  const N = SHELL_START[s + 1]! - SHELL_START[s]!;
  const j = k - SHELL_START[s]!;
  const y = 1 - (2 * j + 1) / N;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = j * GOLDEN + s * 1.3;
  out[o] = s * r * Math.cos(a);
  out[o + 1] = s * y;
  out[o + 2] = s * r * Math.sin(a);
}

/** Radius (unit spacing) of a cluster of `cap` slots, to the centre of its outermost slot. */
export function clusterExtent(cap: number, mode: ViewMode): number {
  if (cap <= 1) return 0;
  return mode === '2d' ? VOGEL * Math.sqrt(cap - 0.5) : shellOf(cap - 1);
}

// ---- placing clusters ---------------------------------------------------------------------------

/**
 * Centres in the plane (z = 0) for circles or balls of the given radii, in the order given (place
 * the largest first), so that any two are at least `gap` apart. Returns xyz per cluster.
 */
export function packClusters(radii: ArrayLike<number>, gap: number): Float64Array {
  const G = radii.length;
  const c = new Float64Array(G * 3);
  if (G === 0) return c;
  const greedy = Math.min(G, MAX_GREEDY);
  const u = [0, 0, 0];
  let outer = radii[0]!;
  for (let j = 1; j < greedy; j++) {
    // Ray j's direction does not depend on how many clusters there are, so earlier ones stay put;
    // the first points left, so that a few clusters lie side by side on a wide screen. Along it, the
    // distances at which this cluster would overlap cluster i form an interval: take the smallest
    // distance outside all of them.
    u[0] = Math.cos(Math.PI + (j - 1) * GOLDEN);
    u[1] = Math.sin(Math.PI + (j - 1) * GOLDEN);
    const rj = radii[j]!;
    const iv: [number, number][] = [];
    for (let i = 0; i < j; i++) {
      const cx = c[i * 3]!, cy = c[i * 3 + 1]!, cz = c[i * 3 + 2]!;
      const need = radii[i]! + rj + gap;
      const b = u[0]! * cx + u[1]! * cy + u[2]! * cz;
      const disc = need * need - (cx * cx + cy * cy + cz * cz - b * b);
      if (disc <= 0) continue;
      const s = Math.sqrt(disc);
      if (b + s > 0) iv.push([b - s, b + s]);
    }
    iv.sort((p, q) => p[0] - q[0]);
    let rho = 0;
    for (const [a, z] of iv) {
      if (a > rho) break;
      if (z > rho) rho = z;
    }
    // A hair further, so that rounding never leaves two clusters touching.
    rho = rho > 0 ? rho * (1 + 1e-9) + 1e-6 : 0;
    c[j * 3] = u[0]! * rho;
    c[j * 3 + 1] = u[1]! * rho;
    c[j * 3 + 2] = u[2]! * rho;
    outer = Math.max(outer, rho + rj);
  }
  // The rest on rings outside, each ring sized for its first (largest) cluster.
  let j = greedy;
  let ring = 0;
  while (j < G) {
    const rmax = radii[j]!;
    const rho = outer + gap + rmax;
    const half = rmax + gap / 2;
    const slots = Math.max(1, Math.floor(Math.PI / Math.asin(Math.min(1, half / rho))));
    const count = Math.min(slots, G - j);
    for (let k = 0; k < count; k++, j++) {
      const a = ring * GOLDEN + (2 * Math.PI * k) / count;
      c[j * 3] = rho * Math.cos(a);
      c[j * 3 + 1] = rho * Math.sin(a);
    }
    outer = rho + rmax;
    ring++;
  }
  return c;
}

// ---- the layout ---------------------------------------------------------------------------------

interface Cluster {
  key: string;
  /** Creation order: ties between equal capacities keep it, so clusters stay put. */
  seq: number;
  cap: number;
  count: number;
  occ: Uint8Array;
  /** Lowest slot that may be free. */
  low: number;
  x: number;
  y: number;
  z: number;
}

const groupKey = (n: RenderNode): string => n.group ?? '';

function reserve(count: number): number {
  return Math.max(count + 2, Math.ceil(count * 1.1));
}

export class FixedLayout {
  /** Base positions (spread 1), xyzw per node. */
  base = new Float32Array(0);
  /** The point spread scales around. */
  pivot: [number, number, number] = [0, 0, 0];
  n = 0;
  mode: ViewMode = '2d';
  private clusters: Cluster[] = [];
  private byKey = new Map<string, Cluster>();
  private clusterOf: Cluster[] = [];
  private slotOf = new Int32Array(0);
  private seq = 0;

  constructor(readonly spacing = FIXED_SPACING) {}

  /** Lay out the whole graph afresh. */
  compute(nodes: readonly RenderNode[], csr: Csr, mode: ViewMode): void {
    const n = nodes.length;
    this.mode = mode;
    this.n = n;
    this.clusters = [];
    this.byKey = new Map();
    this.seq = 0;
    const members: number[][] = [];
    const ci = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const key = groupKey(nodes[i]!);
      let c = this.byKey.get(key);
      if (!c) {
        c = this.newCluster(key, 0);
        members.push([]);
      }
      ci[i] = c.seq;
      members[c.seq]!.push(i);
    }
    const deg = (i: number) => csr.offsets[i + 1]! - csr.offsets[i]!;
    this.clusterOf = new Array<Cluster>(n);
    this.slotOf = new Int32Array(n);
    for (const c of this.clusters) {
      const list = members[c.seq]!;
      list.sort((a, b) => deg(b) - deg(a) || a - b);
      this.grow(c, reserve(list.length));
      for (let k = 0; k < list.length; k++) {
        const i = list[k]!;
        c.occ[k] = 1;
        this.clusterOf[i] = c;
        this.slotOf[i] = k;
      }
      c.count = list.length;
      c.low = list.length;
    }
    this.pack();
    this.base = new Float32Array(Math.max(n, 1) * 4);
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < n; i++) {
      this.slotBase(this.clusterOf[i]!, this.slotOf[i]!, i);
      sx += this.base[i * 4]!;
      sy += this.base[i * 4 + 1]!;
      sz += this.base[i * 4 + 2]!;
    }
    this.pivot = n ? [sx / n, sy / n, mode === '3d' ? sz / n : 0] : [0, 0, 0];
  }

  /**
   * Move to a new graph: `src[i]` is node i's index in the previous graph, or ≥ the previous node
   * count (or NONE) for a new node. Returns whether nodes that stay moved (a cluster outgrew its
   * room and the clusters were placed again).
   */
  update(nodes: readonly RenderNode[], csr: Csr, src: Uint32Array, mode: ViewMode): boolean {
    if (mode !== this.mode || this.n === 0) {
      this.compute(nodes, csr, mode);
      return false;
    }
    const n = nodes.length, oldN = this.n;
    const oldBase = this.base, oldCluster = this.clusterOf, oldSlot = this.slotOf;
    const claimed = new Uint8Array(oldN);
    const clusterOf = new Array<Cluster>(n);
    const slotOf = new Int32Array(n);
    const base = new Float32Array(Math.max(n, 1) * 4);
    const fresh: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = src[i]!;
      if (s < oldN && !claimed[s] && oldCluster[s]!.key === groupKey(nodes[i]!)) {
        claimed[s] = 1;
        clusterOf[i] = oldCluster[s]!;
        slotOf[i] = oldSlot[s]!;
        base.set(oldBase.subarray(s * 4, s * 4 + 4), i * 4);
      } else fresh.push(i);
    }
    // Holes where nodes went.
    for (let s = 0; s < oldN; s++) {
      if (claimed[s]) continue;
      const c = oldCluster[s]!, k = oldSlot[s]!;
      c.occ[k] = 0;
      c.count--;
      if (k < c.low) c.low = k;
    }
    this.clusterOf = clusterOf;
    this.slotOf = slotOf;
    this.base = base;
    this.n = n;
    if (fresh.length === 0) return false;

    // Room for the new nodes: new clusters, and clusters that outgrow theirs.
    const need = new Map<Cluster, number>();
    for (const i of fresh) {
      const key = groupKey(nodes[i]!);
      const c = this.byKey.get(key) ?? this.newCluster(key, 0);
      need.set(c, (need.get(c) ?? 0) + 1);
    }
    let repack = false;
    for (const [c, k] of need) {
      if (c.count + k <= c.cap) continue;
      this.grow(c, c.cap === 0 ? reserve(k) : Math.max(c.count + k, Math.ceil(c.cap * 1.5)));
      repack = true;
    }
    let moved = false;
    if (repack) {
      const before = this.clusters.map((c) => [c.x, c.y, c.z] as const);
      this.pack();
      for (let i = 0; i < n; i++) {
        if (src[i]! >= oldN || !clusterOf[i]) continue;
        const c = clusterOf[i]!;
        const b = before[c.seq]!;
        const dx = c.x - b[0], dy = c.y - b[1], dz = c.z - b[2];
        if (dx === 0 && dy === 0 && dz === 0) continue;
        moved = true;
        base[i * 4] = base[i * 4]! + dx;
        base[i * 4 + 1] = base[i * 4 + 1]! + dy;
        base[i * 4 + 2] = base[i * 4 + 2]! + dz;
      }
    }
    // Higher degree first, so that they take the inner free slots.
    const deg = (i: number) => csr.offsets[i + 1]! - csr.offsets[i]!;
    fresh.sort((a, b) => deg(b) - deg(a) || a - b);
    for (const i of fresh) {
      const c = this.byKey.get(groupKey(nodes[i]!))!;
      let k = c.low;
      while (c.occ[k]) k++;
      c.occ[k] = 1;
      c.count++;
      c.low = k + 1;
      clusterOf[i] = c;
      slotOf[i] = k;
      this.slotBase(c, k, i);
    }
    return moved;
  }

  /** Put node i's base where a node drawn at (x, y, z) with this spread sits. */
  moveNode(i: number, x: number, y: number, z: number, spread: number): void {
    if (i < 0 || i >= this.n) return;
    const p = this.pivot;
    this.base[i * 4] = p[0] + (x - p[0]) / spread;
    this.base[i * 4 + 1] = p[1] + (y - p[1]) / spread;
    this.base[i * 4 + 2] = this.mode === '3d' ? p[2] + (z - p[2]) / spread : 0;
  }

  /** Drawn positions at a spread, xyzw per node, into `out` (reused when big enough). */
  targets(spread: number, out?: Float32Array): Float32Array {
    const n = this.n;
    const t = out && out.length >= n * 4 ? out : new Float32Array(Math.max(n, 1) * 4);
    const [px, py, pz] = this.pivot, b = this.base;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      t[o] = px + (b[o]! - px) * spread;
      t[o + 1] = py + (b[o + 1]! - py) * spread;
      t[o + 2] = pz + (b[o + 2]! - pz) * spread;
      t[o + 3] = 1;
    }
    return t;
  }

  /** The cluster's key (group) and slot of node i, for tests. */
  slot(i: number): { group: string; slot: number } | null {
    const c = this.clusterOf[i];
    return c ? { group: c.key, slot: this.slotOf[i]! } : null;
  }

  /** Centre and radius (to the outermost slot's centre) of each cluster, for tests. */
  clusterShapes(): { group: string; x: number; y: number; z: number; radius: number; count: number }[] {
    return this.clusters.map((c) => ({ group: c.key, x: c.x, y: c.y, z: c.z, radius: this.radius(c), count: c.count }));
  }

  private newCluster(key: string, cap: number): Cluster {
    const c: Cluster = { key, seq: this.seq++, cap: 0, count: 0, occ: new Uint8Array(0), low: 0, x: 0, y: 0, z: 0 };
    this.grow(c, cap);
    this.clusters.push(c);
    this.byKey.set(key, c);
    return c;
  }

  private grow(c: Cluster, cap: number): void {
    if (cap <= c.cap) return;
    const occ = new Uint8Array(cap);
    occ.set(c.occ);
    c.occ = occ;
    c.cap = cap;
  }

  private radius(c: Cluster): number {
    return clusterExtent(c.cap, this.mode) * this.spacing;
  }

  /** Place the clusters, largest room first. */
  private pack(): void {
    const order = this.clusters.slice().sort((a, b) => b.cap - a.cap || a.seq - b.seq);
    // Each cluster's radius includes half a spacing, so nodes of two clusters are a full gap apart.
    const radii = order.map((c) => this.radius(c) + this.spacing / 2);
    const c = packClusters(radii, this.spacing * CLUSTER_GAP);
    order.forEach((cl, j) => {
      cl.x = c[j * 3]!;
      cl.y = c[j * 3 + 1]!;
      cl.z = c[j * 3 + 2]!;
    });
  }

  private readonly pt = new Float64Array(3);

  private slotBase(c: Cluster, k: number, i: number): void {
    slotPoint(k, this.mode, this.pt, 0);
    const s = this.spacing, b = this.base, o = i * 4;
    b[o] = c.x + this.pt[0]! * s;
    b[o + 1] = c.y + this.pt[1]! * s;
    b[o + 2] = this.mode === '3d' ? c.z + this.pt[2]! * s : 0;
    b[o + 3] = 1;
  }
}
