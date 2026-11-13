import { describe, it } from 'node:test';
import { expect } from './helpers/expect.ts';
import { ALL_LABELS_BELOW, MAX_LABEL_CHARS, buildGlyphInstances, chooseLabels, labelText, shouldShowAll } from '../dist/graph/labels.js';
import { decodePick } from '../dist/graph/picking.js';

describe('labels', () => {
  it('uses the label, else the id, and truncates long ones', () => {
    expect(labelText({ id: 7 })).toBe('7');
    expect(labelText({ id: 7, label: 'Ada' })).toBe('Ada');
    const long = labelText({ id: 1, label: 'x'.repeat(100) });
    expect([...long]).toHaveLength(MAX_LABEL_CHARS);
    expect(long.endsWith('…')).toBe(true);
  });

  it('labels every node in small graphs or when spread out', () => {
    expect(shouldShowAll(ALL_LABELS_BELOW, 0, 1)).toBe(true);
    expect(shouldShowAll(10_000, 10, 1)).toBe(false);
    expect(shouldShowAll(10_000, 100, 1)).toBe(true);
    expect(shouldShowAll(10_000, 100, 2)).toBe(false);
  });

  it('puts the always-set first, then visible nodes by degree, up to the cap', () => {
    const order = new Uint32Array([3, 1, 0, 2, 4]);
    expect(chooseLabels({ nodeCount: 5, order, always: [2, 2, 9], showAll: false })).toEqual([2]);
    expect(chooseLabels({ nodeCount: 5, order, always: [2], showAll: true })).toEqual([2, 3, 1, 0, 4]);
    expect(chooseLabels({ nodeCount: 5, order, always: [], showAll: true, visible: (i) => i !== 1, cap: 3 })).toEqual([3, 0, 2]);
    expect(chooseLabels({ nodeCount: 5, order, always: [4, 0, 1], showAll: true, cap: 2 })).toEqual([4, 0]);
  });

  it('builds one instance per glyph', () => {
    const nodes = [{ id: 'ab' }, { id: 0, label: 'xyz' }];
    const out = new Uint32Array(16 * 4);
    const slots = new Map<string, number>();
    const n = buildGlyphInstances(nodes, [1, 0], (ch) => slots.get(ch) ?? (slots.set(ch, slots.size), slots.size - 1), out);
    expect(n).toBe(5);
    expect([...out.subarray(0, 4)]).toEqual([1, 0, 0, 3]);
    expect([...out.subarray(8, 12)]).toEqual([1, 2, 2, 3]);
    expect([...out.subarray(12, 16)]).toEqual([0, 3, 0, 2]);
  });

  it('stops before overflowing the instance buffer', () => {
    const out = new Uint32Array(4 * 4);
    expect(buildGlyphInstances([{ id: 'abc' }, { id: 'def' }], [0, 1], () => 0, out)).toBe(3);
  });
});

describe('pick ids', () => {
  it('decodes nodes, edges and nothing', () => {
    expect(decodePick(0)).toBeNull();
    expect(decodePick(1)).toEqual({ kind: 'node', index: 0 });
    expect(decodePick(1235)).toEqual({ kind: 'node', index: 1234 });
    expect(decodePick((0x80000000 | 1) >>> 0)).toEqual({ kind: 'edge', index: 0 });
    expect(decodePick((0x80000000 | 30000) >>> 0)).toEqual({ kind: 'edge', index: 29999 });
  });
});
