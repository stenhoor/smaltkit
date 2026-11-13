import { describe, it } from 'node:test';
import { expect } from './helpers/expect.ts';
import { NO_NODE, buildCsr, degree, degreeOrder, edgeEndpoints } from '../dist/graph/csr.js';

describe('CSR adjacency', () => {
  it('lists each edge in both directions', () => {
    const pairs = edgeEndpoints(4, [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 0, target: 2 },
      { source: 3, target: 0 },
    ]);
    const csr = buildCsr(4, pairs);
    expect([...csr.offsets]).toEqual([0, 3, 5, 7, 8]);
    const nb = (i: number) => [...csr.neighbors.subarray(csr.offsets[i]!, csr.offsets[i + 1]!)].sort();
    expect(nb(0)).toEqual([1, 2, 3]);
    expect(nb(1)).toEqual([0, 2]);
    expect(nb(2)).toEqual([0, 1]);
    expect(nb(3)).toEqual([0]);
    expect(degree(csr, 0)).toBe(3);
  });

  it('leaves out self-loops and out-of-range endpoints but keeps edge indices', () => {
    const pairs = edgeEndpoints(3, [
      { source: 0, target: 0 },
      { source: 0, target: 7 },
      { source: -1, target: 1 },
      { source: 1.5, target: 2 },
      { source: 1, target: 2 },
    ]);
    expect(pairs.length).toBe(10);
    expect(pairs[2]).toBe(NO_NODE);
    expect(pairs[4]).toBe(NO_NODE);
    expect(pairs[6]).toBe(NO_NODE);
    expect([pairs[8], pairs[9]]).toEqual([1, 2]);
    const csr = buildCsr(3, pairs);
    expect(csr.neighbors.length).toBe(2);
    expect([...csr.offsets]).toEqual([0, 0, 1, 2]);
  });

  it('counts parallel edges', () => {
    const csr = buildCsr(2, edgeEndpoints(2, [{ source: 0, target: 1 }, { source: 1, target: 0 }]));
    expect(degree(csr, 0)).toBe(2);
    expect(degree(csr, 1)).toBe(2);
  });

  it('handles an empty graph', () => {
    const csr = buildCsr(0, edgeEndpoints(0, []));
    expect([...csr.offsets]).toEqual([0]);
    expect(csr.neighbors.length).toBe(0);
  });

  it('orders nodes by descending degree, ties by index', () => {
    const csr = buildCsr(5, edgeEndpoints(5, [
      { source: 4, target: 0 }, { source: 4, target: 1 }, { source: 4, target: 2 }, { source: 2, target: 3 },
    ]));
    expect([...degreeOrder(csr)]).toEqual([4, 2, 0, 1, 3]);
  });
});
