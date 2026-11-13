import { describe, it } from 'node:test';
import { expect } from './helpers/expect.ts';
import { buildCsr, edgeEndpoints } from '../dist/graph/csr.js';
import { MOBILITY_FLOOR, NONE, mobilityAround, placeNodes } from '../dist/graph/place.js';
import {
  ANIM_ENTER, ANIM_FLASH, ANIM_NONE, ENTER_MS, EXIT_MS, MAX_GHOST_NODES, Transitions, edgeKeys,
  enterStartFromExit, exitStartFromEnter,
} from '../dist/graph/transition.js';
import type { RenderEdge, RenderNode } from '../dist/graph/types.js';

const nodes = (...ids: (string | number)[]): RenderNode[] => ids.map((id) => ({ id }));

describe('edge identity', () => {
  it('uses the id, else source id, target id and label; repeats stay distinct', () => {
    const ns = nodes('a', 'b', 1);
    const keys = edgeKeys(ns, [
      { source: 0, target: 1 },
      { source: 0, target: 1 },
      { source: 0, target: 1, label: 'KNOWS' },
      { source: 1, target: 2, id: 7 },
      { source: 0, target: 9 },
    ]);
    expect(new Set(keys.slice(0, 4)).size).toBe(4);
    expect(keys[4]).toBe('');
    // The numeric id 1 and the string id '1' are different nodes.
    expect(edgeKeys(nodes('1', 'x'), [{ source: 0, target: 1 }])[0]).not.toBe(edgeKeys(nodes(1, 'x'), [{ source: 0, target: 1 }])[0]);
    // The same edge with its endpoints at other indices keeps its key.
    expect(edgeKeys(nodes('b', 'a'), [{ source: 1, target: 0 }])).toEqual(edgeKeys(nodes('a', 'b'), [{ source: 0, target: 1 }]));
  });
});

describe('transitions', () => {
  it('marks new nodes and edges, keeps the old slots of the others', () => {
    const t = new Transitions();
    t.update(nodes('a', 'b'), [{ source: 0, target: 1 }], 0, { animate: true });
    const r = t.update(nodes('b', 'c', 'a'), [{ source: 2, target: 0 }, { source: 1, target: 0 }], 1000, { animate: true });
    expect([...r.src]).toEqual([1, NONE, 0]);
    expect(r.added).toBe(1);
    expect(r.edgesAdded).toBe(1);
    // a and b came in at 0 and keep that transition (long over); c comes in now.
    expect([...t.nodeKind]).toEqual([ANIM_ENTER, ANIM_ENTER, ANIM_ENTER]);
    expect([...t.nodeStart]).toEqual([0, 1000, 0]);
    expect([...t.edgeKind]).toEqual([ANIM_ENTER, ANIM_ENTER]);
    expect([...t.edgeStart]).toEqual([0, 1000]);
    expect(r.touched).toContain(1);
    expect(t.active(1000 + ENTER_MS - 1)).toBe(true);
    expect(t.active(1000 + ENTER_MS + 1)).toBe(false);
  });

  it('keeps removed nodes as ghosts at their old slot, with their edges, until they have faded', () => {
    const t = new Transitions();
    t.update(nodes('a', 'b', 'c'), [{ source: 0, target: 1 }, { source: 1, target: 2 }], 0, { animate: false });
    const oldPos = new Float32Array([0, 0, 0, 1, 10, 0, 0, 1, 20, 5, 0, 1]);
    const r = t.update(nodes('a', 'b'), [{ source: 0, target: 1 }], 1000, { animate: true, oldPos });
    expect(r.removed).toBe(1);
    expect(r.edgesRemoved).toBe(1);
    expect(t.ghosts.map((g) => [g.id, g.at, g.x, g.y])).toEqual([['c', 2, 20, 5]]);
    // The ghost edge b → c runs from live node 1 to ghost slot n + 0 = 2.
    expect([...r.ghostEnds]).toEqual([1, 2]);
    expect(r.touched).toContain(1);
    // Still fading 100 ms later: the ghost moves to its new old slot (live count 2 + index 0).
    t.update(nodes('a', 'b'), [{ source: 0, target: 1 }], 1100, { animate: true });
    expect(t.ghosts.map((g) => g.at)).toEqual([2]);
    // Gone after EXIT_MS.
    t.update(nodes('a', 'b'), [{ source: 0, target: 1 }], 1000 + EXIT_MS + 1, { animate: true });
    expect(t.ghosts).toEqual([]);
    expect(t.ghostEdges).toEqual([]);
  });

  it('retargets: a ghost that comes back fades in from where it got to', () => {
    const t = new Transitions();
    t.update(nodes('a', 'b'), [], 0, { animate: false });
    t.update(nodes('a'), [], 1000, { animate: true });
    const r = t.update(nodes('a', 'b'), [], 1000 + EXIT_MS / 3, { animate: true });
    expect(r.src[1]).toBe(1); // its ghost slot (1 live + ghost 0)
    expect(r.added).toBe(0);
    expect(t.ghosts).toEqual([]);
    expect(t.nodeKind[1]).toBe(ANIM_ENTER);
    // A third of the way out is two thirds of the way in.
    const now = 1000 + EXIT_MS / 3;
    expect((now - t.nodeStart[1]!) / ENTER_MS).toBeCloseTo(2 / 3, 5);
  });

  it('continues a fade-in as a fade-out, and back', () => {
    expect(exitStartFromEnter(100, 100)).toBe(100 - EXIT_MS);
    expect(exitStartFromEnter(100 + ENTER_MS, 100)).toBe(100 + ENTER_MS);
    const s = exitStartFromEnter(1000, 1000 - ENTER_MS / 4);
    expect(enterStartFromExit(1000, s)).toBeCloseTo(1000 - ENTER_MS / 4, 5);
  });

  it('flashes changed nodes, not new ones; nothing animates without animate', () => {
    const t = new Transitions();
    t.update(nodes('a', 'b'), [], 0, { animate: false });
    t.update(nodes('a', 'b', 'c'), [], 1000, { animate: true, changed: ['a', 'c'] });
    expect([...t.nodeKind]).toEqual([ANIM_FLASH, ANIM_NONE, ANIM_ENTER]);
    t.update(nodes('a', 'b'), [], 1010, { animate: false, changed: ['a'] });
    expect([...t.nodeKind]).toEqual([ANIM_NONE, ANIM_NONE]);
    expect(t.ghosts).toEqual([]);
    expect(t.active(1010)).toBe(false);
  });

  it('keeps the number of ghosts bounded while scrubbing', () => {
    const t = new Transitions();
    const many = (k: number) => nodes(...Array.from({ length: 1500 }, (_, i) => `${k}:${i}`));
    for (let k = 0; k < 6; k++) t.update(many(k), [], k * 16, { animate: true });
    expect(t.ghosts.length).toBeLessThanOrEqual(MAX_GHOST_NODES);
    t.dropGhosts();
    expect(t.ghostCount).toBe(0);
  });
});

describe('placement', () => {
  const graph = (n: number, edges: RenderEdge[]) => buildCsr(n, edgeEndpoints(n, edges));

  it('keeps old slots and puts a new node about a link length from its neighbour', () => {
    // 0 — 1 kept at (0,0) and (30,0); 2 is new, hangs from 1.
    const csr = graph(3, [{ source: 0, target: 1 }, { source: 2, target: 1 }]);
    const oldPos = new Float32Array([0, 0, 0, 1, 30, 0, 0, 1]);
    const p = placeNodes(3, csr, new Uint32Array([0, 1, NONE]), oldPos, '2d', 30, 2);
    expect([...p.pos.subarray(0, 8)]).toEqual([0, 0, 0, 1, 30, 0, 0, 1]);
    expect(p.src[2]).toBe(1);
    const dx = p.pos[8]! - 30, dy = p.pos[9]!;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(20);
    expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(30.001);
    // Away from the anchor's other neighbour (node 0, on the left).
    expect(dx).toBeGreaterThan(0);
    // The GPU recipe gives the same position from the old slot.
    expect(p.offset[8]! + 30).toBeCloseTo(p.pos[8]!, 4);
    expect(p.seeded).toBe(0);
  });

  it('chains new nodes from a kept one, and seeds a new component on the spiral', () => {
    const csr = graph(5, [{ source: 0, target: 1 }, { source: 1, target: 2 }, { source: 3, target: 4 }]);
    const p = placeNodes(5, csr, new Uint32Array([0, NONE, NONE, NONE, NONE]), new Float32Array([100, 100, 0, 1]), '3d', 30, 1);
    expect(p.src[1]).toBe(0);
    expect(p.src[2]).toBe(0);
    expect(p.pos[8]! - 100).toBeCloseTo(p.offset[8]!, 4);
    expect(p.src[3]).toBe(NONE);
    expect(p.src[4]).toBe(NONE);
    expect(p.seeded).toBe(1);
    for (const v of p.pos) expect(Number.isFinite(v)).toBe(true);
  });

  it('lets the nodes near a change move and holds the rest', () => {
    // A path 0 — 1 — 2 — … — 9.
    const csr = graph(10, Array.from({ length: 9 }, (_, i) => ({ source: i, target: i + 1 })));
    const m = mobilityAround(10, csr, [0]);
    expect(m[0]).toBe(1);
    expect(m[1]).toBe(0.5);
    expect(m[2]).toBe(0.25);
    expect(m[3]).toBe(0.125);
    expect(m[9]).toBeCloseTo(MOBILITY_FLOOR, 6);
    expect(mobilityAround(3, graph(3, []), [])[1]).toBeCloseTo(MOBILITY_FLOOR, 6);
  });
});
