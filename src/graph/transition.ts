/**
 * Transitions between successive graphs (`setGraph(g, { animate: true })`): which nodes and edges
 * are new (they fade and grow in), which disappeared (they stay a moment as ghosts at their last
 * positions, fading and shrinking out), and which changed (a brief ring). This file holds the
 * bookkeeping only; the shaders compute every frame of an animation from a kind and a start time per
 * element, so a running transition costs the CPU nothing.
 *
 * A new call retargets what is in flight instead of queueing: a node fading in that disappears fades
 * out from where it got to, a ghost whose id comes back fades in from its ghost, and an element that
 * is still there keeps its animation. Ghosts expire after EXIT_MS and are capped in number.
 */
import { NONE } from './place.js';
import type { RenderEdge, RenderNode } from './types.js';

export const ENTER_MS = 300;
export const EXIT_MS = 300;
export const FLASH_MS = 600;
export const MAX_GHOST_NODES = 2048;
export const MAX_GHOST_EDGES = 4096;

export const ANIM_NONE = 0;
export const ANIM_ENTER = 1;
export const ANIM_EXIT = 2;
export const ANIM_FLASH = 3;

type Id = string | number;

export interface GhostNode {
  id: Id;
  /** The node as it was last given (for its colour and size). */
  node: RenderNode;
  /** Exit start time. */
  start: number;
  /** Its slot in the position buffer before the update that made this list. */
  at: number;
  /** CPU estimate of its position. */
  x: number;
  y: number;
  z: number;
}

export interface GhostEdge {
  key: string;
  source: Id;
  target: Id;
  start: number;
}

/** Linear progress of an enter that continues a fade-out begun at `exitStart`, as a start time. */
export function enterStartFromExit(now: number, exitStart: number): number {
  const tx = Math.min(1, Math.max(0, (now - exitStart) / EXIT_MS));
  return now - (1 - tx) * ENTER_MS;
}

/** The exit start that continues a fade-in begun at `enterStart`. */
export function exitStartFromEnter(now: number, enterStart: number): number {
  const te = Math.min(1, Math.max(0, (now - enterStart) / ENTER_MS));
  return now - (1 - te) * EXIT_MS;
}

export function durationOf(kind: number): number {
  return kind === ANIM_ENTER ? ENTER_MS : kind === ANIM_EXIT ? EXIT_MS : kind === ANIM_FLASH ? FLASH_MS : 0;
}

/**
 * Identity of each edge: its `id` when it has one, else `source id → target id : label`, with `#k`
 * appended to the k-th repeat so parallel edges stay distinct. Edges with an endpoint out of range
 * get an empty key (they are never drawn).
 */
export function edgeKeys(nodes: readonly RenderNode[], edges: readonly RenderEdge[]): string[] {
  const keys = new Array<string>(edges.length);
  const seen = new Map<string, number>();
  for (let k = 0; k < edges.length; k++) {
    const e = edges[k]!;
    let key: string;
    if (e.id !== undefined) key = `#${typeof e.id}:${e.id}`;
    else {
      const s = nodes[e.source], t = nodes[e.target];
      if (!s || !t) {
        keys[k] = '';
        continue;
      }
      key = `${typeof s.id}:${s.id}→${typeof t.id}:${t.id}→${e.label ?? ''}`;
    }
    const c = seen.get(key) ?? 0;
    seen.set(key, c + 1);
    keys[k] = c === 0 ? key : `${key}#${c}`;
  }
  return keys;
}

export interface UpdateResult {
  /** Old slot (live nodes first, then ghosts, as before this update) for each node, or NONE. */
  src: Uint32Array;
  added: number;
  removed: number;
  edgesAdded: number;
  edgesRemoved: number;
  /** Ghost edge endpoints as slots of the new buffer: [s0, t0, s1, t1, …]. */
  ghostEnds: Uint32Array;
  /** Nodes (new indices) next to a change: added nodes and the live ends of added and removed edges. */
  touched: number[];
}

export class Transitions {
  private ids: Id[] = [];
  private nodeRefs: RenderNode[] = [];
  private keys: string[] = [];
  private ends: Id[] = [];
  /** Per node of the current graph: transition kind and start time. */
  nodeKind = new Uint8Array(0);
  nodeStart = new Float32Array(0);
  /** Per edge of the current graph. */
  edgeKind = new Uint8Array(0);
  edgeStart = new Float32Array(0);
  ghosts: GhostNode[] = [];
  ghostEdges: GhostEdge[] = [];
  ghostEnds = new Uint32Array(0);
  /** When the last running animation ends (0 when none ran). */
  until = 0;

  /**
   * Move to a new graph. Without `animate`, nothing animates and the ghosts are dropped. `oldPos`
   * holds the CPU's xyzw estimate per old slot (live nodes, then ghosts), for the new ghosts.
   */
  update(
    nodes: readonly RenderNode[],
    edges: readonly RenderEdge[],
    now: number,
    opts: { animate: boolean; changed?: readonly Id[]; oldPos?: Float32Array },
  ): UpdateResult {
    const n = nodes.length, m = edges.length;
    const oldN = this.ids.length;
    const animate = opts.animate;
    const oldIndex = new Map<Id, number>();
    for (let i = 0; i < oldN; i++) if (!oldIndex.has(this.ids[i]!)) oldIndex.set(this.ids[i]!, i);
    const ghostIndex = new Map<Id, number>();
    if (animate) this.ghosts.forEach((g, k) => ghostIndex.set(g.id, k));
    const changed = animate && opts.changed && opts.changed.length > 0 ? new Set<Id>(opts.changed) : null;

    // Nodes.
    const ids = new Array<Id>(n);
    const index = new Map<Id, number>();
    const src = new Uint32Array(n);
    const kind = new Uint8Array(n);
    const start = new Float32Array(n);
    const revived = new Set<number>();
    let added = 0;
    const touched: number[] = [];
    for (let i = 0; i < n; i++) {
      const id = nodes[i]!.id;
      ids[i] = id;
      if (!index.has(id)) index.set(id, i);
      const old = oldIndex.get(id);
      if (old !== undefined) {
        src[i] = old;
        if (animate) {
          kind[i] = this.nodeKind[old]!;
          start[i] = this.nodeStart[old]!;
          if (changed?.has(id) && kind[i] !== ANIM_ENTER) {
            kind[i] = ANIM_FLASH;
            start[i] = now;
          }
        }
        continue;
      }
      const g = ghostIndex.get(id);
      if (g !== undefined && !revived.has(g)) {
        revived.add(g);
        src[i] = oldN + g;
        kind[i] = ANIM_ENTER;
        start[i] = enterStartFromExit(now, this.ghosts[g]!.start);
        continue;
      }
      src[i] = NONE;
      added++;
      touched.push(i);
      if (animate) {
        kind[i] = ANIM_ENTER;
        start[i] = now;
      }
    }

    // Ghost nodes: the ones still fading that did not come back, then the nodes that just went.
    let removed = 0;
    const ghosts: GhostNode[] = [];
    if (animate) {
      this.ghosts.forEach((g, k) => {
        if (revived.has(k) || index.has(g.id) || now - g.start >= EXIT_MS) return;
        ghosts.push({ ...g, at: oldN + k });
      });
    }
    const oldPos = opts.oldPos;
    for (let i = 0; i < oldN; i++) {
      const id = this.ids[i]!;
      if (index.has(id) || oldIndex.get(id) !== i) continue;
      removed++;
      if (!animate) continue;
      const k = this.nodeKind[i]!;
      const s = k === ANIM_ENTER ? exitStartFromEnter(now, this.nodeStart[i]!) : now;
      const o = i * 4;
      const has = !!oldPos && o + 3 < oldPos.length;
      ghosts.push({ id, node: this.nodeRefs[i]!, start: s, at: i, x: has ? oldPos[o]! : 0, y: has ? oldPos[o + 1]! : 0, z: has ? oldPos[o + 2]! : 0 });
    }
    // Keep the newest when there are too many.
    if (ghosts.length > MAX_GHOST_NODES) ghosts.splice(0, ghosts.length - MAX_GHOST_NODES);
    const ghostSlot = new Map<Id, number>();
    ghosts.forEach((g, k) => ghostSlot.set(g.id, n + k));

    // Edges.
    const keys = edgeKeys(nodes, edges);
    const ends = new Array<Id>(m * 2);
    const keySet = new Map<string, number>();
    for (let k = 0; k < m; k++) {
      keySet.set(keys[k]!, k);
      const e = edges[k]!;
      ends[k * 2] = nodes[e.source]?.id ?? '';
      ends[k * 2 + 1] = nodes[e.target]?.id ?? '';
    }
    const oldKeys = new Map<string, number>();
    for (let k = 0; k < this.keys.length; k++) oldKeys.set(this.keys[k]!, k);
    const ghostEdgeIndex = new Map<string, number>();
    if (animate) this.ghostEdges.forEach((g, k) => ghostEdgeIndex.set(g.key, k));
    const ekind = new Uint8Array(m);
    const estart = new Float32Array(m);
    let edgesAdded = 0;
    const revivedEdges = new Set<number>();
    for (let k = 0; k < m; k++) {
      const key = keys[k]!;
      const old = key === '' ? undefined : oldKeys.get(key);
      if (old !== undefined) {
        if (animate) {
          ekind[k] = this.edgeKind[old]!;
          estart[k] = this.edgeStart[old]!;
        }
        continue;
      }
      edgesAdded++;
      const e = edges[k]!;
      touched.push(e.source, e.target);
      if (!animate) continue;
      const g = ghostEdgeIndex.get(key);
      ekind[k] = ANIM_ENTER;
      if (g !== undefined) {
        revivedEdges.add(g);
        estart[k] = enterStartFromExit(now, this.ghostEdges[g]!.start);
      } else estart[k] = now;
    }
    let edgesRemoved = 0;
    const gedges: GhostEdge[] = [];
    if (animate) {
      this.ghostEdges.forEach((g, k) => {
        if (revivedEdges.has(k) || keySet.has(g.key) || now - g.start >= EXIT_MS) return;
        gedges.push(g);
      });
    }
    for (let k = 0; k < this.keys.length; k++) {
      const key = this.keys[k]!;
      if (key === '' || keySet.has(key) || oldKeys.get(key) !== k) continue;
      edgesRemoved++;
      const s0 = index.get(this.ends[k * 2]!), t0 = index.get(this.ends[k * 2 + 1]!);
      if (s0 !== undefined) touched.push(s0);
      if (t0 !== undefined) touched.push(t0);
      if (!animate) continue;
      const s = this.edgeKind[k] === ANIM_ENTER ? exitStartFromEnter(now, this.edgeStart[k]!) : now;
      gedges.push({ key, source: this.ends[k * 2]!, target: this.ends[k * 2 + 1]!, start: s });
    }
    // Resolve the ghost edges' endpoints to slots: a live node, else a ghost node; drop the rest.
    const kept: GhostEdge[] = [];
    const gends: number[] = [];
    for (const g of gedges) {
      const s = index.get(g.source) ?? ghostSlot.get(g.source);
      const t = index.get(g.target) ?? ghostSlot.get(g.target);
      if (s === undefined || t === undefined) continue;
      kept.push(g);
      gends.push(s, t);
    }
    if (kept.length > MAX_GHOST_EDGES) {
      const cut = kept.length - MAX_GHOST_EDGES;
      kept.splice(0, cut);
      gends.splice(0, cut * 2);
    }

    this.ids = ids;
    this.nodeRefs = nodes as RenderNode[];
    this.keys = keys;
    this.ends = ends;
    this.nodeKind = kind;
    this.nodeStart = start;
    this.edgeKind = ekind;
    this.edgeStart = estart;
    this.ghosts = ghosts;
    this.ghostEdges = kept;
    this.ghostEnds = Uint32Array.from(gends);

    let until = 0;
    if (animate) {
      for (let i = 0; i < n; i++) if (kind[i]) until = Math.max(until, start[i]! + durationOf(kind[i]!));
      for (let k = 0; k < m; k++) if (ekind[k]) until = Math.max(until, estart[k]! + durationOf(ekind[k]!));
      for (const g of ghosts) until = Math.max(until, g.start + EXIT_MS);
      for (const g of kept) until = Math.max(until, g.start + EXIT_MS);
    }
    this.until = until > now ? until : 0;
    return { src, added, removed, edgesAdded, edgesRemoved, ghostEnds: this.ghostEnds, touched };
  }

  /** Whether an animation is still running at `now`. */
  active(now: number): boolean {
    return this.until > now;
  }

  /** Forget the ghosts once every animation is over. */
  dropGhosts(): void {
    this.ghosts = [];
    this.ghostEdges = [];
    this.ghostEnds = new Uint32Array(0);
    this.until = 0;
  }

  get ghostCount(): number {
    return this.ghosts.length;
  }
}
