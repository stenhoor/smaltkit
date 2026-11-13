import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chartData, type ChartColumn, type ChartContext } from 'smaltkit/charts';
import { fitProjection, geoPath, mapChart, toFeatures, type Feature } from 'smaltkit/maps';
import type { Value } from 'smaltkit/format';

// Two unit squares side by side, as TopoJSON: quantized, delta-encoded, sharing their middle edge (arc 1).
const topo = {
  type: 'Topology',
  transform: { scale: [1, 1], translate: [0, 0] },
  objects: {
    regions: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', arcs: [[0, 1]], properties: { name: 'West' } },
        { type: 'Polygon', arcs: [[2, ~1]], id: 'E', properties: { name: 'East' } },
      ],
    },
  },
  arcs: [
    [[1, 0], [-1, 0], [0, 1], [1, 0]], // (1,0) → (0,0) → (0,1) → (1,1)
    [[1, 1], [0, -1]], //                   (1,1) → (1,0)
    [[1, 1], [1, 0], [0, -1], [-1, 0]], //  (1,1) → (2,1) → (2,0) → (1,0)
  ],
};

test('TopoJSON decodes to GeoJSON features: quantized arcs, shared and reversed', () => {
  const fs = toFeatures(topo);
  assert.equal(fs.length, 2);
  assert.deepEqual(fs[0]!.geometry, { type: 'Polygon', coordinates: [[[1, 0], [0, 0], [0, 1], [1, 1], [1, 0]]] });
  assert.deepEqual(fs[1]!.geometry, { type: 'Polygon', coordinates: [[[1, 1], [2, 1], [2, 0], [1, 0], [1, 1]]] }, 'arc 1 reversed');
  assert.equal(fs[1]!.id, 'E');
  assert.equal(toFeatures({ type: 'FeatureCollection', features: fs }).length, 2, 'GeoJSON passes through');
  assert.deepEqual(toFeatures('nonsense'), []);
});

test('projections fit the shapes into the box, y down', () => {
  const fs = toFeatures(topo);
  const p = fitProjection('equirectangular', fs, 220, 120, 10);
  const [x0, y0] = p([0, 1]);
  const [x1, y1] = p([2, 0]);
  assert.ok(Math.abs(x0 - 10) < 1e-6 && Math.abs(x1 - 210) < 1e-6, `${x0} ${x1}`);
  assert.ok(y0 < y1, 'north is up');
  assert.ok(Math.abs((y1 - y0) - 100) < 1e-6, 'one degree each way: square');
  const m = fitProjection('mercator', fs, 200, 200);
  assert.ok(Number.isFinite(m([179, 89])[1]), 'mercator clamps the poles');
  assert.equal(geoPath(fs[0]!.geometry, p), 'M110,110L10,110L10,10L110,10L110,110Z');
});

function col(key: string, role: string, kind: ChartColumn['kind'], values: Value[]): ChartColumn {
  return { key, role, label: key, kind, values, type: kind === 'measure' ? 'number' : 'text', fmt: (v) => String(v ?? '') };
}
function ctx(columns: ChartColumn[], options: Record<string, unknown>, selected: (r: number) => boolean | null = () => null): ChartContext {
  return { el: { innerHTML: '' }, width: 300, height: 200, options, data: chartData(columns, columns[0]?.values.length ?? 0), extra: {}, palette: 12, selected };
}

test('filled regions: rows matched by name or id, coloured low to high; the rest are plain shapes', () => {
  const c = ctx([col('l', 'location', 'dimension', ['west', 'E', 'Atlantis']), col('v', 'values', 'measure', [10, 30, 5])], { shapes: topo }, (r) => r === 0);
  mapChart(c);
  const html = c.el.innerHTML;
  assert.equal((html.match(/sk-map-region/g) ?? []).length, 2);
  assert.match(html, /class="sk-map-shape sk-mark sk-map-region sk-on" data-row="0"/);
  assert.match(html, /data-row="1" d="[^"]+" style="fill:color-mix\(in oklab, var\(--sk-seq-hi\) 100%/, 'the highest');
  assert.match(html, /1 not on the map/, 'Atlantis has no shape');
  assert.doesNotMatch(html, /NaN|undefined/);
});

test('points by latitude and longitude, sized by a measure, without shapes', () => {
  const c = ctx([col('la', 'latitude', 'dimension', [51.5, 40.7, 999]), col('lo', 'longitude', 'dimension', [-0.1, -74, 0]), col('s', 'size', 'measure', [100, 25, 1])], {});
  mapChart(c);
  const circles = c.el.innerHTML.match(/<circle[^>]*>/g) ?? [];
  assert.equal(circles.length, 2, 'out-of-range coordinates are skipped');
  const r = circles.map((x) => Number(/ r="([\d.]+)"/.exec(x)![1]));
  assert.ok(Math.abs(r[0]! / r[1]! - 2) < 0.01, 'area-scaled: 4× the value, 2× the radius');
  const cx = circles.map((x) => Number(/ cx="([\d.]+)"/.exec(x)![1]));
  assert.ok(cx.every((x) => x - Math.max(...r) >= 0 && x + Math.max(...r) <= 300), `circles inside the box: ${cx}`);
  const empty = ctx([col('l', 'location', 'dimension', ['West'])], {});
  mapChart(empty);
  assert.match(empty.el.innerHTML, /Add a shapes file/);
});

test('the colour scale covers only the rows drawn: one with no position or no shape does not stretch it', () => {
  const money = (c: ChartColumn): ChartColumn => ({ ...c, fmt: (v) => `$${v}` });
  const legend = /<span>\$10<\/span><span class="sk-map-ramp"><\/span><span>\$30<\/span>/;
  // Points: the third row (an online shop) has no coordinates and the largest value.
  const pts = ctx([col('la', 'latitude', 'dimension', [51.5, 40.7, null]), col('lo', 'longitude', 'dimension', [-0.1, -74, null]), money(col('v', 'values', 'measure', [10, 30, 900]))], {});
  mapChart(pts);
  assert.match(pts.el.innerHTML, legend, 'legend from the drawn points');
  assert.match(pts.el.innerHTML, /data-row="1"[^>]*style="fill:color-mix\(in oklab, var\(--sk-seq-hi\) 100%/, 'the highest drawn point is the darkest');
  // Regions: Atlantis has no shape and the largest value.
  const reg = ctx([col('l', 'location', 'dimension', ['West', 'East', 'Atlantis']), money(col('v', 'values', 'measure', [10, 30, 900]))], { shapes: topo });
  mapChart(reg);
  assert.match(reg.el.innerHTML, legend, 'legend from the drawn regions');
  assert.match(reg.el.innerHTML, /data-row="1" d="[^"]+" style="fill:color-mix\(in oklab, var\(--sk-seq-hi\) 100%/);
});

test('features keep their properties', () => {
  const f: Feature = toFeatures(topo)[0]!;
  assert.equal(f.properties?.name, 'West');
});
