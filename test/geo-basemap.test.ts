import { describe, it } from 'node:test';
import { expect } from './helpers/expect.ts';
import { decodeTile, buildTile, coverTiles, atZoom, FILL_GROUPS, LINE_GROUPS, LABEL_KINDS, LIGHT, DARK } from 'smaltkit/geo/basemap';
import { Camera } from 'smaltkit/geo/core';
import { encodeTile } from './helpers/mvt-encode.ts';

const square = (x0: number, y0: number, s: number): [number, number][] => [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]];

const tile = encodeTile([
  {
    name: 'water',
    features: [{ type: 3, properties: { class: 'lake' }, geometry: [square(100, 100, 1000), square(400, 400, 200).reverse()] }],
  },
  {
    name: 'transportation',
    features: [
      { type: 2, properties: { class: 'motorway' }, geometry: [[[0, 2048], [2048, 2048], [4096, 1000]]] },
      { type: 2, properties: { class: 'footway_unknown' }, geometry: [[[0, 0], [10, 10]]] },
    ],
  },
  { name: 'place', features: [{ type: 1, properties: { class: 'city', name: 'Testville', 'name:en': 'Test City', rank: 3, capital: 2 }, geometry: [[[2000, 2000]]] }] },
  { name: 'poi', features: [{ type: 1, properties: { name: 'Ignored' }, geometry: [[[5, 5]]] }] },
]);

describe('vector tiles', () => {
  it('decodes layers, properties and geometry', () => {
    const layers = decodeTile(tile);
    expect([...layers.keys()]).toEqual(['water', 'transportation', 'place', 'poi']);
    const water = layers.get('water')!;
    expect(water.extent).toBe(4096);
    expect(water.features[0].properties.class).toBe('lake');
    expect(water.features[0].geometry.length).toBe(2);
    expect(water.features[0].geometry[0]).toEqual([100, 100, 1100, 100, 1100, 1100, 100, 1100]);
    const place = layers.get('place')!.features[0];
    expect(place.properties.rank).toBe(3);
    expect(place.properties['name:en']).toBe('Test City');
  });

  it('skips layers it was not asked for', () => {
    expect([...decodeTile(tile, new Set(['place'])).keys()]).toEqual(['place']);
  });

  it('builds fills as fans, lines as segments and labels as points, by style group', () => {
    const g = buildTile(tile, 12);
    const water = g.fills.find((f) => FILL_GROUPS[f.group] === 'water')!;
    // Two rings of four vertices: two triangles each.
    expect(water.count).toBe(12);
    expect(g.fillVerts.length).toBe(16);
    const motorway = g.lines.find((l) => LINE_GROUPS[l.group] === 'motorway')!;
    expect(motorway.count).toBe(2);
    expect(Array.from(g.segments.slice(motorway.start * 4, motorway.start * 4 + 4))).toEqual([0, 2048, 2048, 2048]);
    // The unknown road class is not drawn.
    expect(g.lines.length).toBe(1);
    expect(g.labels).toEqual([{ kind: LABEL_KINDS.indexOf('capital'), text: 'Test City', x: 2000, y: 2000, rank: 3 }]);
  });

  it('decodes an empty tile', () => {
    const g = buildTile(new Uint8Array(0), 3);
    expect(g.fills.length + g.lines.length + g.labels.length).toBe(0);
  });
});

describe('tile cover', () => {
  it('covers the view at the floored zoom, nearest the centre first', () => {
    const c = new Camera();
    c.width = 1024;
    c.height = 768;
    c.setView({ center: [-73.985, 40.75], zoom: 12.6 });
    const tiles = coverTiles(c);
    expect(tiles.every((t) => t.z === 12)).toBe(true);
    // A 1024 × 768 view at 1.5× the tile zoom's scale: about 2 × 2 to 3 × 2 tiles.
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    expect(tiles.length).toBeLessThanOrEqual(9);
    const n = 2 ** 12;
    expect(tiles[0]).toEqual({ z: 12, x: Math.floor(c.x * n), y: Math.floor(c.y * n) });
  });

  it('stops at the source zoom and scales past it', () => {
    const c = new Camera();
    c.width = 800;
    c.height = 600;
    c.setView({ center: [2.35, 48.86], zoom: 17.5 });
    expect(coverTiles(c, 14).every((t) => t.z === 14)).toBe(true);
  });
});

describe('style', () => {
  it('interpolates by zoom and holds past the ends', () => {
    const s = [[5, 1], [10, 6]] as const;
    expect(atZoom(s, 2)).toBe(1);
    expect(atZoom(s, 12)).toBe(6);
    const mid = atZoom(s, 7.5);
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(3.5);
  });

  it('gives every group a colour in both themes', () => {
    for (const t of [LIGHT, DARK]) {
      for (const g of FILL_GROUPS) expect(t.fills[g]).toMatch(/^#[0-9A-F]{6}$/i);
      for (const g of LINE_GROUPS) expect(t.lines[g].color).toMatch(/^#[0-9A-F]{6}$/i);
      for (const k of LABEL_KINDS) expect(t.labels[k].color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe('line labels', () => {
  it('puts a road name halfway along its line, facing along it', () => {
    const t = encodeTile([
      { name: 'transportation_name', features: [{ type: 2, properties: { class: 'primary', name: 'Broadway' }, geometry: [[[0, 1000], [2000, 1000], [2000, 3000]]] }] },
      { name: 'waterway', features: [{ type: 2, properties: { class: 'river', name: 'Hudson' }, geometry: [[[100, 0], [100, 50]]] }] },
    ]);
    const g = buildTile(t, 15);
    const road = g.labels.find((l) => l.text === 'Broadway')!;
    expect(road.kind).toBe(LABEL_KINDS.indexOf('road'));
    // 4,000 units long: halfway is the corner at (2000, 1000), where the line still runs east.
    expect([road.x, road.y, road.dx, road.dy]).toEqual([2000, 1000, 1, 0]);
    // A river too short to hold its name gets none.
    expect(g.labels.some((l) => l.text === 'Hudson')).toBe(false);
  });
});
