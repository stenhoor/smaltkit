/**
 * From role-tagged columns to layers: what each visual in the catalogue draws, as a pure function (no page, no GPU:
 * layers touch the GPU only when they are attached). Hosts don't call this directly; `MapVisual` does, and tests do.
 */
import type { Layer } from '../core/contract.js';
import type { GeoJsonData } from '../data/geojson.js';
import { aggregateLayer, arcLayer, heatmapLayer, polygonLayer, scatterLayer } from './layers.js';
import type { VisualKind } from './catalogue.js';
import type { VisualTheme } from './theme.js';

/** One role's column, as the host has it: values (numbers, text, null…), a label, and how to show a value. */
export interface VisualColumn {
  readonly values: ArrayLike<unknown>;
  readonly label?: string;
  format?(value: unknown): string;
}

/** The query result a visual draws: a row count and the column for each role it takes (undefined if unset). */
export interface VisualData {
  readonly rows: number;
  column(role: string): VisualColumn | undefined;
}

/** What a visual drew: its layers (the main one has id 'visual') and how layer objects map back to data rows. */
export interface BuiltVisual {
  readonly layers: Layer[];
  /** For each object of the main layer, its data row (regions: a shape per matched location); identity if absent. */
  readonly rowOf?: Int32Array;
  /** Something the reader should know (locations without a shape, a role missing). */
  readonly note?: string;
}

/** A column as numbers: numeric text parsed, everything else NaN (the layers skip NaN coordinates). */
export function numbers(col: VisualColumn | undefined, rows: number): Float64Array {
  const out = new Float64Array(rows);
  if (!col) return out.fill(NaN);
  const v = col.values;
  for (let i = 0; i < rows; i++) {
    const x = v[i];
    out[i] = typeof x === 'number' ? x : typeof x === 'bigint' ? Number(x) : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
  }
  return out;
}

/** A column as category codes 0, 1, 2… (in order of first appearance), and the categories. */
export function codes(col: VisualColumn, rows: number): { codes: Float32Array; names: string[] } {
  const names: string[] = [];
  const index = new Map<string, number>();
  const out = new Float32Array(rows);
  for (let i = 0; i < rows; i++) {
    const k = String(col.values[i] ?? '');
    let c = index.get(k);
    if (c === undefined) index.set(k, (c = names.push(k) - 1));
    out[i] = c;
  }
  return { codes: out, names };
}

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : d);

/** The layers for one visual. `shapes` is the regions visual's parsed GeoJSON file. */
export function buildVisual(kind: VisualKind, data: VisualData, options: Readonly<Record<string, unknown>>, theme: VisualTheme, shapes?: GeoJsonData): BuiltVisual {
  const n = data.rows;
  const o = options;
  const id = 'visual';
  const opacity = num(o.opacity, 0.85);
  const ramp = [...theme.sequential];
  const first = theme.palette[0] ?? '#2F5BB7';
  switch (kind) {
    case 'points': {
      const lng = numbers(data.column('longitude'), n), lat = numbers(data.column('latitude'), n);
      const values = data.column('values'), category = data.column('category'), size = data.column('size');
      const color = category
        ? { values: codes(category, n).codes, categorical: true, palette: theme.palette }
        : values
          ? { values: numbers(values, n), ramp }
          : first;
      return {
        layers: [
          scatterLayer({
            id,
            data: { lng, lat },
            color,
            size: size ? { values: numbers(size, n) } : undefined,
            radius: num(o.radius, 3),
            radiusMax: num(o.radiusMax, 14),
            opacity,
            additive: !!o.glow,
            stroke: size ? { width: 1 } : undefined,
          }),
        ],
      };
    }
    case 'heatmap': {
      const w = data.column('weight');
      return {
        layers: [
          heatmapLayer({ id, data: { lng: numbers(data.column('longitude'), n), lat: numbers(data.column('latitude'), n) }, weight: w ? numbers(w, n) : undefined, radius: num(o.radius, 20), intensity: num(o.intensity, 1), opacity: num(o.opacity, 0.9), ramp: theme.dark ? undefined : ramp }),
        ],
      };
    }
    case 'hexbin': {
      const v = data.column('values');
      const measure = v ? (o.measure === 'mean' || o.measure === 'count' ? o.measure : 'sum') : 'count';
      return {
        layers: [
          aggregateLayer({
            id,
            shape: 'hexagon',
            data: { lng: numbers(data.column('longitude'), n), lat: numbers(data.column('latitude'), n) },
            weight: v ? numbers(v, n) : undefined,
            measure,
            cellSize: num(o.cellSize, 500),
            ramp,
            opacity,
            scale: measure === 'mean' ? 'linear' : 'log',
            extrude: o.extrude ? num(o.height, 3000) : 0,
          }),
        ],
      };
    }
    case 'arcs': {
      const v = data.column('values');
      return {
        layers: [
          arcLayer({
            id,
            data: {
              sourceLng: numbers(data.column('originLongitude'), n),
              sourceLat: numbers(data.column('originLatitude'), n),
              targetLng: numbers(data.column('destinationLongitude'), n),
              targetLat: numbers(data.column('destinationLatitude'), n),
            },
            color: v ? { values: numbers(v, n), ramp } : first,
            width: num(o.width, 1.5),
            greatCircle: o.greatCircle !== false,
            animate: !!o.animate,
            opacity: num(o.opacity, 0.7),
          }),
        ],
      };
    }
    case 'regions': {
      if (!shapes) return { layers: [], note: o.shapes ? 'Loading shapes…' : 'Set a shapes file (GeoJSON) in the options' };
      const loc = data.column('location');
      if (!loc) return { layers: [], note: 'Add a location field' };
      const key = String(o.key || 'name');
      const rowFor = new Map<string, number>();
      for (let i = 0; i < n; i++) rowFor.set(String(loc.values[i] ?? '').toLowerCase(), i);
      const p = shapes.polygons;
      const prop = p.columns[key] as ArrayLike<unknown> | undefined;
      if (!prop) return { layers: [], note: `The shapes have no "${key}" property` };
      // Keep the shapes that match a location: each polygon part its own entry, all mapped to the location's row.
      const keep: number[] = [];
      const rows: number[] = [];
      for (let k = 0; k < p.count; k++) {
        const r = rowFor.get(String(prop[k] ?? '').toLowerCase());
        if (r !== undefined) {
          keep.push(k);
          rows.push(r);
        }
      }
      const matched = new Set(rows).size;
      const starts: number[] = [0], ringStarts: number[] = [], lng: number[] = [], lat: number[] = [];
      for (const k of keep) {
        for (const rs of p.rings) if (rs >= p.starts[k] && rs < p.starts[k + 1]) ringStarts.push(lng.length + rs - p.starts[k]);
        for (let i = p.starts[k]; i < p.starts[k + 1]; i++) {
          lng.push(p.lng[i]);
          lat.push(p.lat[i]);
        }
        starts.push(lng.length);
      }
      const v = data.column('values');
      const values = v ? numbers(v, n) : undefined;
      const per = values ? Float64Array.from(rows, (r) => values[r]) : undefined;
      let top = 0;
      if (per) for (const x of per) if (x > top) top = x;
      return {
        layers: keep.length
          ? [
              polygonLayer({
                id,
                data: { starts, lng, lat, rings: ringStarts },
                color: per ? { values: per, ramp } : first,
                opacity: num(o.opacity, 0.8),
                extrude: o.extrude && per ? { values: per, scale: 50_000 / Math.max(1e-9, top) } : undefined,
              }),
            ]
          : [],
        rowOf: Int32Array.from(rows),
        note: matched < n ? `${n - matched} of ${n} locations have no shape` : undefined,
      };
    }
  }
}
