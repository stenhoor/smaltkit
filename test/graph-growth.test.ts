import { describe, it } from 'node:test';
import { expect } from './helpers/expect.ts';
import { MIN_CAPACITY, nextCapacity } from '../dist/graph/growth.js';
import { EXACT_REPULSION_LIMIT, repulsionTiles } from '../dist/graph/layout.js';

describe('buffer growth', () => {
  it('starts at the minimum capacity', () => {
    expect(nextCapacity(0, 0)).toBe(MIN_CAPACITY);
    expect(nextCapacity(10, 0)).toBe(MIN_CAPACITY);
  });

  it('keeps the capacity while it suffices', () => {
    expect(nextCapacity(100, 128)).toBe(128);
    expect(nextCapacity(128, 128)).toBe(128);
    expect(nextCapacity(0, 4096)).toBe(4096);
  });

  it('doubles when exceeded, and grows by at least what is needed', () => {
    expect(nextCapacity(129, 128)).toBe(256);
    expect(nextCapacity(1000, 128)).toBe(1024);
    expect(nextCapacity(10_000, 0)).toBeGreaterThanOrEqual(10_000);
  });

  it('grows by half above a million elements and stays a multiple of 64', () => {
    const c = nextCapacity((1 << 20) + 1, 1 << 20);
    expect(c).toBeGreaterThan(1 << 20);
    expect(c).toBeLessThanOrEqual(Math.ceil((1 << 20) * 1.5 / 64) * 64);
    expect(c % 64).toBe(0);
  });

  it('never shrinks', () => {
    let cap = 0;
    for (const need of [5, 300, 70, 5000, 10, 5001]) {
      const next = nextCapacity(need, cap);
      expect(next).toBeGreaterThanOrEqual(Math.max(need, cap));
      cap = next;
    }
  });
});

describe('repulsion sampling', () => {
  it('is exact up to the limit', () => {
    expect(repulsionTiles(1)).toEqual({ total: 1, tiles: 1, scale: 1 });
    expect(repulsionTiles(EXACT_REPULSION_LIMIT)).toEqual({ total: 80, tiles: 80, scale: 1 });
  });

  it('samples a fixed number of tiles above it and scales the force', () => {
    const r = repulsionTiles(100_000);
    expect(r.total).toBe(391);
    expect(r.tiles).toBe(80);
    expect(r.scale).toBeCloseTo(391 / 80);
  });
});
