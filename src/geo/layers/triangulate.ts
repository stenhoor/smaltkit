/**
 * Ear clipping for polygons with holes. Data polygons need real triangles, not the basemap's stencil fill, because
 * each polygon has its own colour and neighbours must not cover each other. Holes are joined to the outer ring by a
 * bridge (a cut to a vertex the hole can see), which makes one ring the ear clipper can work on. Convex rings without
 * holes (most districts and cells) take a fast path.
 */

/**
 * Triangulates a ring of vertices [x0, y0, x1, y1, …] starting at vertex `offset`, `n` vertices long, with optional
 * holes (each `[offset, n]` into the same array). Returns vertex indices into the array, three per triangle.
 */
export function triangulate(xy: ArrayLike<number>, offset = 0, n = xy.length / 2, holes: readonly (readonly [number, number])[] = []): number[] {
  const ring = closedLess(xy, offset, n);
  if (ring.length < 3) return [];
  const x = (i: number) => xy[2 * i];
  const y = (i: number) => xy[2 * i + 1];
  const signed = (r: readonly number[]) => {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (x(r[j]) - x(r[i])) * (y(r[j]) + y(r[i]));
    return a;
  };
  // Outer ring counter-clockwise (in this sum's sense), holes the other way.
  if (signed(ring) < 0) ring.reverse();
  let verts = ring;
  const hs = holes.map(([o, m]) => closedLess(xy, o, m)).filter((h) => h.length >= 3);
  for (const h of hs) if (signed(h) > 0) h.reverse();
  // Bridge holes in order of their rightmost vertex, right first.
  hs.sort((a, b) => Math.max(...b.map(x)) - Math.max(...a.map(x)));
  for (const h of hs) verts = bridge(verts, h, x, y);
  return earClip(verts, x, y, hs.length === 0);
}

/** Vertex indices of a ring, without a closing vertex that repeats the first. */
function closedLess(xy: ArrayLike<number>, offset: number, n: number): number[] {
  if (n >= 2 && xy[2 * (offset + n - 1)] === xy[2 * offset] && xy[2 * (offset + n - 1) + 1] === xy[2 * offset + 1]) n--;
  return Array.from({ length: Math.max(0, n) }, (_, i) => offset + i);
}

/** Joins a hole to the ring: from the hole's rightmost vertex, a cut right to the nearest ring vertex it can reach. */
function bridge(ring: number[], hole: number[], x: (i: number) => number, y: (i: number) => number): number[] {
  let hi = 0;
  for (let i = 1; i < hole.length; i++) if (x(hole[i]) > x(hole[hi])) hi = i;
  const hx = x(hole[hi]), hy = y(hole[hi]);
  // The nearest ring edge crossed by a ray going right from the hole's vertex.
  let best = -1, bestX = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ay = y(a), by = y(b);
    if ((ay > hy) === (by > hy) && ay !== hy && by !== hy) continue;
    if (ay === by) continue;
    const t = (hy - ay) / (by - ay);
    if (t < 0 || t > 1) continue;
    const ix = x(a) + t * (x(b) - x(a));
    if (ix >= hx && ix < bestX) {
      bestX = ix;
      best = x(a) > x(b) ? i : (i + 1) % ring.length;
    }
  }
  if (best < 0) best = 0;
  // Of the ring's vertices inside the triangle (hole vertex, hit point, chosen vertex), take the one at the smallest
  // angle from the ray: the cut to it crosses nothing.
  const px = x(ring[best]), py = y(ring[best]);
  let chosen = best, bestAngle = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const vx = x(ring[i]), vy = y(ring[i]);
    if (vx < hx) continue;
    if (!inTriangle(hx, hy, bestX, hy, px, py, vx, vy) && i !== best) continue;
    const angle = Math.abs(Math.atan2(vy - hy, vx - hx));
    if (angle < bestAngle || (angle === bestAngle && vx < x(ring[chosen]))) {
      bestAngle = angle;
      chosen = i;
    }
  }
  const h = [...hole.slice(hi), ...hole.slice(0, hi + 1)];
  return [...ring.slice(0, chosen + 1), ...h, ...ring.slice(chosen)];
}

function inTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number): boolean {
  const d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const d2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  const d3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function earClip(v: number[], x: (i: number) => number, y: (i: number) => number, simple: boolean): number[] {
  const n = v.length;
  const cross = (a: number, b: number, c: number) => (x(b) - x(a)) * (y(c) - y(a)) - (y(b) - y(a)) * (x(c) - x(a));
  // The outer ring is counter-clockwise (y up): a convex corner turns left, cross > 0.
  const convexAt = (a: number, b: number, c: number) => cross(a, b, c) > 0;
  const out: number[] = [];
  if (simple) {
    let convex = true;
    for (let i = 0; i < n && convex; i++) {
      const c = cross(v[(i + n - 1) % n], v[i], v[(i + 1) % n]);
      if (c < 0) convex = false;
    }
    if (convex) {
      for (let i = 1; i < n - 1; i++) out.push(v[0], v[i], v[i + 1]);
      return out;
    }
  }
  const next = new Int32Array(n), prev = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    next[i] = (i + 1) % n;
    prev[i] = (i + n - 1) % n;
  }
  const same = (p: number, q: number) => x(p) === x(q) && y(p) === y(q);
  const inside = (a: number, b: number, c: number, p: number) => {
    if (same(p, a) || same(p, b) || same(p, c)) return false;
    return cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  };
  let remaining = n;
  let i = 0;
  let stall = 0;
  while (remaining > 3 && stall < remaining) {
    const a = v[prev[i]], b = v[i], c = v[next[i]];
    let ear = convexAt(a, b, c);
    if (ear)
      for (let p = next[next[i]]; p !== prev[i]; p = next[p])
        if (inside(a, b, c, v[p]) && cross(v[prev[p]], v[p], v[next[p]]) <= 0) {
          ear = false;
          break;
        }
    if (ear) {
      out.push(a, b, c);
      next[prev[i]] = next[i];
      prev[next[i]] = prev[i];
      remaining--;
      i = next[i];
      stall = 0;
    } else {
      i = next[i];
      stall++;
    }
  }
  // Whatever is left (a degenerate sliver, or the last triangle) goes in as a fan.
  if (remaining >= 3) {
    const rest: number[] = [];
    let k = i;
    for (let m = 0; m < remaining; m++, k = next[k]) rest.push(v[k]);
    for (let m = 1; m < rest.length - 1; m++) out.push(rest[0], rest[m], rest[m + 1]);
  }
  return out;
}
