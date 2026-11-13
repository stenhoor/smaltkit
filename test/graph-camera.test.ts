import { describe, it } from 'node:test';
import { expect } from './helpers/expect.ts';
import {
  boundsOf, convertCamera, defaultCamera, fitCamera,
  FIT_MAX_ZOOM, lerpCamera, mat4Invert, mat4Multiply, orbit, pan,
  project, unproject, viewProjection, zoomAt2d,
} from '../dist/graph/camera.js';

const W = 800, H = 600;

function vp(s = defaultCamera(), mode: '2d' | '3d' = '2d', r = 100) {
  return viewProjection(s, mode, W, H, r, new Float32Array(16));
}

describe('2D camera', () => {
  it('maps the centre to the middle of the viewport, x right and y down', () => {
    const s = { ...defaultCamera(), x: 10, y: 20, zoom: 2 };
    const m = vp(s);
    const c = project(m, W, H, [10, 20, 0]);
    expect(c.x).toBeCloseTo(400);
    expect(c.y).toBeCloseTo(300);
    const p = project(m, W, H, [15, 25, 0]);
    expect(p.x).toBeCloseTo(410);
    expect(p.y).toBeCloseTo(310);
  });

  it('unprojects back to the world point', () => {
    const s = { ...defaultCamera(), x: -3, y: 7, zoom: 0.37 };
    const m = vp(s);
    const p = project(m, W, H, [123, -45, 0]);
    const w = unproject(m, W, H, p.x, p.y, p.depth);
    expect(w[0]).toBeCloseTo(123, 3);
    expect(w[1]).toBeCloseTo(-45, 3);
  });

  it('zooms about the cursor', () => {
    const s = { ...defaultCamera(), zoom: 1 };
    const before = unproject(vp(s), W, H, 100, 50, 0.5);
    zoomAt2d(s, W, H, 100, 50, 3);
    expect(s.zoom).toBe(3);
    const after = unproject(vp(s), W, H, 100, 50, 0.5);
    expect(after[0]).toBeCloseTo(before[0], 4);
    expect(after[1]).toBeCloseTo(before[1], 4);
  });

  it('pans with the pointer', () => {
    const s = { ...defaultCamera(), zoom: 2 };
    const p0 = project(vp(s), W, H, [0, 0, 0]);
    pan(s, '2d', H, 30, -10);
    const p1 = project(vp(s), W, H, [0, 0, 0]);
    expect(p1.x - p0.x).toBeCloseTo(30);
    expect(p1.y - p0.y).toBeCloseTo(-10);
  });

  it('fits bounds with padding', () => {
    const pos = new Float32Array([-1000, -500, 0, 1, 1000, 500, 0, 1]);
    const b = boundsOf(pos, 2);
    const s = fitCamera(b, '2d', W, H, 50, 0, defaultCamera());
    const m = vp(s);
    const a = project(m, W, H, [-1000, -500, 0]);
    const c = project(m, W, H, [1000, 500, 0]);
    expect(a.x).toBeCloseTo(50);
    expect(c.x).toBeCloseTo(750);
    expect(a.y).toBeGreaterThanOrEqual(49.9);
    expect(c.y).toBeLessThanOrEqual(550.1);
  });

  it('does not zoom a small graph in past FIT_MAX_ZOOM', () => {
    const b = boundsOf(new Float32Array([-10, -5, 0, 1, 10, 5, 0, 1]), 2);
    expect(fitCamera(b, '2d', W, H, 50, 0, defaultCamera()).zoom).toBe(FIT_MAX_ZOOM);
  });
});

describe('3D camera', () => {
  it('at yaw = pitch = 0 looks like the 2D view: x right, y down', () => {
    const s = { ...defaultCamera(), distance: 100 };
    const m = vp(s, '3d');
    const c = project(m, W, H, [0, 0, 0]);
    expect(c.x).toBeCloseTo(400);
    expect(c.y).toBeCloseTo(300);
    expect(c.w).toBeCloseTo(100);
    expect(c.depth).toBeGreaterThan(0);
    expect(c.depth).toBeLessThan(1);
    const r = project(m, W, H, [10, 10, 0]);
    expect(r.x).toBeGreaterThan(400);
    expect(r.y).toBeGreaterThan(300);
    // Nearer points are larger depth-wise smaller.
    const near = project(m, W, H, [0, 0, -50]);
    expect(near.depth).toBeLessThan(c.depth);
  });

  it('keeps the on-screen scale when converting from 2D', () => {
    const s2 = { ...defaultCamera(), zoom: 2.5 };
    const s3 = convertCamera(s2, '3d', H);
    const a = project(vp(s2), W, H, [10, 0, 0]);
    const b = project(vp(s3, '3d'), W, H, [10, 0, 0]);
    expect(b.x).toBeCloseTo(a.x, 3);
    const back = convertCamera(s3, '2d', H);
    expect(back.zoom).toBeCloseTo(2.5, 6);
  });

  it('unprojects at a given depth', () => {
    const s = { ...defaultCamera(), distance: 300, yaw: 0.7, pitch: -0.3, x: 5, y: 6, z: 7 };
    const m = vp(s, '3d');
    const p = project(m, W, H, [40, -20, 15]);
    const w = unproject(m, W, H, p.x, p.y, p.depth);
    expect(w[0]).toBeCloseTo(40, 1);
    expect(w[1]).toBeCloseTo(-20, 1);
    expect(w[2]).toBeCloseTo(15, 1);
  });

  it('pans so the target follows the pointer', () => {
    const s = { ...defaultCamera(), distance: 200, yaw: 0.4, pitch: 0.2 };
    const p0 = project(vp(s, '3d'), W, H, [0, 0, 0]);
    pan(s, '3d', H, 25, 15);
    const p1 = project(vp(s, '3d'), W, H, [0, 0, 0]);
    expect(p1.x - p0.x).toBeCloseTo(25, 1);
    expect(p1.y - p0.y).toBeCloseTo(15, 1);
  });

  it('orbit clamps the pitch', () => {
    const s = defaultCamera();
    orbit(s, 0, 10000);
    expect(s.pitch).toBeLessThan(Math.PI / 2);
  });

  it('fit puts every point inside the viewport', () => {
    const pts = [[-80, 0, 0], [80, 10, 0], [0, -60, 40], [0, 70, -40]];
    const pos = new Float32Array(pts.flatMap((p) => [...p, 1]));
    const s = fitCamera(boundsOf(pos, pts.length), '3d', W, H, 20, 2, { ...defaultCamera(), yaw: 1, pitch: 0.3 });
    const m = vp(s, '3d', 200);
    for (const p of pts) {
      const q = project(m, W, H, p);
      expect(q.x).toBeGreaterThan(0);
      expect(q.x).toBeLessThan(W);
      expect(q.y).toBeGreaterThan(0);
      expect(q.y).toBeLessThan(H);
    }
  });
});

describe('mat4 helpers', () => {
  it('invert gives the identity when multiplied back', () => {
    const m = vp({ ...defaultCamera(), distance: 50, yaw: 0.3 }, '3d');
    const inv = new Float32Array(16);
    expect(mat4Invert(m, inv)).toBe(true);
    const id = mat4Multiply(m, inv, new Float32Array(16));
    for (let i = 0; i < 16; i++) expect(id[i]).toBeCloseTo(i % 5 === 0 ? 1 : 0, 4);
  });

  it('lerps zoom in log space', () => {
    const a = { ...defaultCamera(), zoom: 1 };
    const b = { ...defaultCamera(), zoom: 4 };
    expect(lerpCamera(a, b, 0.5, defaultCamera()).zoom).toBeCloseTo(2);
  });

  it('bounds ignore non-finite points', () => {
    const b = boundsOf(new Float32Array([1, 2, 3, 1, NaN, 0, 0, 1, -1, -2, -3, 1]), 3);
    expect(b.count).toBe(2);
    expect(b.min).toEqual([-1, -2, -3]);
    expect(b.radius).toBeCloseTo(Math.hypot(1, 2, 3));
  });
});
