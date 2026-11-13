import { describe, it } from 'node:test';
import { expect } from './helpers/expect.ts';
import { Camera, lngToX, latToY, xToLng, yToLat, projectColumns, metersToWorld, parseColor, bakeRamp, RAMPS, rampAt, toHex } from 'smaltkit/geo/core';

describe('Web Mercator', () => {
  it('maps the corners and centre of the world', () => {
    expect(lngToX(-180)).toBe(0);
    expect(lngToX(180)).toBe(1);
    expect(latToY(0)).toBeCloseTo(0.5, 12);
    expect(latToY(85.0511287798066)).toBeCloseTo(0, 9);
  });

  it('round-trips longitude and latitude', () => {
    for (const [lng, lat] of [[-73.985, 40.758], [139.69, 35.69], [-0.12, 51.5], [151.2, -33.9]]) {
      expect(xToLng(lngToX(lng))).toBeCloseTo(lng, 9);
      expect(yToLat(latToY(lat))).toBeCloseTo(lat, 9);
    }
  });

  it('keeps street-level precision in float32 offsets from the origin', () => {
    // Two points 10 cm apart in Manhattan stay distinct and in order after projection.
    const lng = [-73.98500, -73.9849988], lat = [40.75, 40.75];
    const p = projectColumns(lng, lat);
    const dx = p.positions[2] - p.positions[0];
    const meters = dx / metersToWorld(1, 40.75);
    expect(meters).toBeGreaterThan(0.05);
    expect(meters).toBeLessThan(0.15);
  });

  it('puts missing coordinates far off the map and leaves them out of the bounds', () => {
    const p = projectColumns([0, NaN, 10], [0, 5, 10]);
    expect(p.positions[2]).toBeGreaterThan(1000);
    expect(p.bounds[2]).toBeCloseTo(lngToX(10), 9);
  });
});

describe('Camera', () => {
  const cam = () => {
    const c = new Camera();
    c.width = 800;
    c.height = 600;
    c.setView({ center: [-73.98, 40.75], zoom: 12, bearing: 30 });
    return c;
  };

  it('converts screen to world and back, rotated', () => {
    const c = cam();
    const [x, y] = c.screenToWorld(123, 456);
    const [sx, sy] = c.worldToScreen(x, y);
    expect(sx).toBeCloseTo(123, 6);
    expect(sy).toBeCloseTo(456, 6);
  });

  it('zooms about a point and keeps it under the pointer', () => {
    const c = cam();
    const before = c.screenToWorld(600, 100);
    c.zoomAround(14.5, 600, 100);
    const after = c.screenToWorld(600, 100);
    expect(after[0]).toBeCloseTo(before[0], 12);
    expect(after[1]).toBeCloseTo(before[1], 12);
    expect(c.zoom).toBe(14.5);
  });

  it('pans by a drag', () => {
    const c = cam();
    const w = c.screenToWorld(400, 300);
    c.panBy(50, -20);
    const [sx, sy] = c.worldToScreen(w[0], w[1]);
    expect(sx).toBeCloseTo(450, 6);
    expect(sy).toBeCloseTo(280, 6);
  });

  it('fits bounds into the viewport', () => {
    const c = cam();
    const b: [number, number, number, number] = [lngToX(-74.05), latToY(40.85), lngToX(-73.9), latToY(40.65)];
    const v = c.fit(b, 0);
    c.setView(v);
    const [x0, y0] = c.worldToScreen(b[0], b[1]);
    const [x1, y1] = c.worldToScreen(b[2], b[3]);
    expect(Math.min(x0, x1)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(x0, x1)).toBeLessThanOrEqual(801);
    expect(Math.min(y0, y1)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(y0, y1)).toBeLessThanOrEqual(601);
  });
});

describe('colour', () => {
  it('parses hex colours', () => {
    expect(parseColor('#003399')).toEqual([0, 0.2, 0.6, 1]);
    expect(parseColor('#fff8')[3]).toBeCloseTo(0x88 / 255, 6);
    expect(() => parseColor('blue')).toThrow();
  });

  it('bakes ramps whose ends are their first and last stops', () => {
    const t = bakeRamp(RAMPS.smalt);
    expect(t.length).toBe(1024);
    expect(toHex([t[0] / 255, t[1] / 255, t[2] / 255, 1])).toBe(RAMPS.smalt[0].toLowerCase());
    expect(rampAt(RAMPS.smalt, 1)).toBe(RAMPS.smalt[RAMPS.smalt.length - 1].toLowerCase());
  });

  it('every sequential ramp gets steadily darker or lighter', () => {
    for (const name of ['smalt', 'verdant'] as const) {
      const t = bakeRamp(RAMPS[name]);
      const lum = (i: number) => 0.2126 * t[i * 4] + 0.7152 * t[i * 4 + 1] + 0.0722 * t[i * 4 + 2];
      for (let i = 8; i < 256; i += 8) expect(lum(i)).toBeLessThanOrEqual(lum(i - 8) + 1);
    }
  });
});
