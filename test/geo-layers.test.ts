import { describe, it } from 'node:test';
import { expect } from './helpers/expect.ts';
import { triangulate } from 'smaltkit/geo/layers';

const area = (r: number[], tris: number[]) => {
  let a = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const [p, q, s] = [tris[i], tris[i + 1], tris[i + 2]];
    a += Math.abs((r[2 * q] - r[2 * p]) * (r[2 * s + 1] - r[2 * p + 1]) - (r[2 * q + 1] - r[2 * p + 1]) * (r[2 * s] - r[2 * p])) / 2;
  }
  return a;
};
const ringArea = (r: number[]) => {
  let a = 0;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += (r[2 * j] - r[2 * i]) * (r[2 * j + 1] + r[2 * i + 1]);
  return Math.abs(a) / 2;
};

describe('triangulate', () => {
  const shapes: Record<string, number[]> = {
    square: [0, 0, 1, 0, 1, 1, 0, 1],
    'L (concave)': [0, 0, 2, 0, 2, 1, 1, 1, 1, 3, 0, 3],
    'L, other winding': [0, 3, 1, 3, 1, 1, 2, 1, 2, 0, 0, 0],
    star: Array.from({ length: 20 }, (_, i) => {
      const a = (Math.PI * (i >> 1)) / 5, r = (i >> 1) % 2 ? 0.4 : 1;
      return i % 2 ? Math.sin(a) * r : Math.cos(a) * r;
    }),
    'closed ring': [0, 0, 4, 0, 4, 4, 0, 4, 0, 0],
  };
  for (const [name, ring] of Object.entries(shapes)) {
    it(`covers a ${name} exactly`, () => {
      const t = triangulate(ring);
      const n = ring.length / 2 - (name === 'closed ring' ? 1 : 0);
      expect(t.length).toBe((n - 2) * 3);
      expect(area(ring, t)).toBeCloseTo(ringArea(ring.slice(0, n * 2)), 9);
    });
  }
});

describe('triangulate with holes', () => {
  // A 10 × 10 square with a 4 × 4 hole, and with two holes.
  const outer = [0, 0, 10, 0, 10, 10, 0, 10];
  const hole1 = [3, 3, 3, 7, 7, 7, 7, 3];
  const hole2 = [1, 1, 1, 2, 2, 2, 2, 1];
  it('covers the square minus one hole', () => {
    const xy = [...outer, ...hole1];
    const t = triangulate(xy, 0, 4, [[4, 4]]);
    expect(area(xy, t)).toBeCloseTo(100 - 16, 9);
  });
  it('covers the square minus two holes, whatever their winding', () => {
    const xy = [...outer, ...hole1, ...[...hole2].reverse()];
    const t = triangulate(xy, 0, 4, [[4, 4], [8, 4]]);
    expect(area(xy, t)).toBeCloseTo(100 - 16 - 1, 9);
  });
  it('handles a concave outer ring with a hole', () => {
    // A U shape with a hole in its base.
    const u = [0, 0, 9, 0, 9, 9, 6, 9, 6, 3, 3, 3, 3, 9, 0, 9];
    const h = [4, 1, 5, 1, 5, 2, 4, 2];
    const xy = [...u, ...h];
    const t = triangulate(xy, 0, 8, [[8, 4]]);
    expect(area(xy, t)).toBeCloseTo(ringArea(u) - 1, 9);
  });
});
