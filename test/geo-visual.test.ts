// The host-facing visuals without a page or GPU: the catalogue, options, and building layers from role-tagged
// columns as a BI host hands them over: numbers as text or bigint, nulls, categories, shapes matched by name.
import { describe, it } from 'node:test';
import { expect } from './helpers/expect.ts';
import { VISUALS, buildVisual, codes, numbers, optionsFor, DEFAULT_THEME, type VisualData, type VisualKind } from 'smaltkit/geo/visual';
import { readGeoJSON } from 'smaltkit/geo/geojson';

function table(cols: Record<string, ArrayLike<unknown>>, rows: number): VisualData {
  return { rows, column: (role) => (cols[role] ? { values: cols[role], label: role } : undefined) };
}

describe('the catalogue', () => {
  it('describes each visual with roles and options a host can register', () => {
    for (const [kind, d] of Object.entries(VISUALS)) {
      expect(d.kind).toBe(kind);
      expect(d.roles.some((r) => r.required)).toBe(true);
      expect(new Set(d.roles.map((r) => r.name)).size).toBe(d.roles.length);
      for (const o of d.options) if (o.type === 'select') expect(o.choices!.map((c) => c[0])).toContain(o.default);
      expect(d.rowLimit).toBeGreaterThan(0);
    }
  });

  it('fills options from the defaults', () => {
    expect(optionsFor('hexbin', { cellSize: 250 })).toMatchObject({ cellSize: 250, measure: 'sum', extrude: false, basemap: 'auto' });
  });
});

describe('columns from a host', () => {
  it('reads numbers from numbers, bigints and numeric text; the rest is NaN', () => {
    expect(Array.from(numbers({ values: [1, 2n, '3.5', '', null, 'x'] }, 6))).toEqual([1, 2, 3.5, NaN, NaN, NaN]);
    expect(Array.from(numbers(undefined, 2))).toEqual([NaN, NaN]);
  });

  it('codes categories in order of first appearance', () => {
    const c = codes({ values: ['b', 'a', 'b', null] }, 4);
    expect(Array.from(c.codes)).toEqual([0, 1, 0, 2]);
    expect(c.names).toEqual(['b', 'a', '']);
  });
});

describe('buildVisual', () => {
  const lat = [40.7, 40.8, 51.5], lng = [-74, -73.9, -0.1];
  const cases: Record<Exclude<VisualKind, 'regions'>, Record<string, ArrayLike<unknown>>> = {
    points: { latitude: lat, longitude: lng, values: [1, 2, 3], category: ['x', 'y', 'x'], size: [5, 6, 7] },
    heatmap: { latitude: lat, longitude: lng, weight: [1, 1, 2] },
    hexbin: { latitude: lat, longitude: lng, values: [1, 2, 3] },
    arcs: { originLatitude: lat, originLongitude: lng, destinationLatitude: [51.5, 51.5, 40.7], destinationLongitude: [-0.1, -0.1, -74], values: [1, 2, 3] },
  };
  for (const [kind, cols] of Object.entries(cases)) {
    it(`${kind}: one main layer with every row`, () => {
      const b = buildVisual(kind as VisualKind, table(cols, 3), optionsFor(kind as VisualKind), DEFAULT_THEME);
      expect(b.layers.length).toBe(1);
      expect(b.layers[0].id).toBe('visual');
      expect(b.layers[0].count).toBe(3);
      expect(b.rowOf).toBeUndefined();
    });
  }

  it('regions: shapes matched to locations by name, with the row of each shape', () => {
    const square = (x: number) => [[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]];
    const shapes = readGeoJSON({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { name: 'North' }, geometry: { type: 'Polygon', coordinates: [square(0)] } },
        { type: 'Feature', properties: { name: 'South' }, geometry: { type: 'MultiPolygon', coordinates: [[square(2)], [square(4)]] } },
        { type: 'Feature', properties: { name: 'Elsewhere' }, geometry: { type: 'Polygon', coordinates: [square(9)] } },
      ],
    });
    const b = buildVisual('regions', table({ location: ['south', 'NORTH', 'Atlantis'], values: [5, 7, 1] }, 3), optionsFor('regions', { shapes: 'x.json' }), DEFAULT_THEME, shapes);
    expect(b.layers[0].count).toBe(3); // North, and South's two parts
    expect(Array.from(b.rowOf!)).toEqual([1, 0, 0]);
    expect(b.note).toBe('1 of 3 locations have no shape');
  });

  it('regions: says what is missing instead of drawing nothing quietly', () => {
    expect(buildVisual('regions', table({}, 0), optionsFor('regions'), DEFAULT_THEME).note).toMatch(/shapes file/);
  });
});
