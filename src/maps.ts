// Maps as SVG strings: GeoJSON and TopoJSON shapes, Mercator and equirectangular projections fitted to a box, and
// mapChart, a filled-region (choropleth) and point map in the style of the charts: marks carry data-row and get
// sk-dim / sk-on from ctx.selected, colours come from the --sk-* variables. No outside code: shapes come from the
// app (a file the author supplies), never bundled here.
import type { ChartContext } from './charts.js';
import { esc, r2, seqColor, toNum } from './svg.js';

// ------------------------------------------------------------------ GeoJSON (the parts maps use)

export type Position = [number, number];
export type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'MultiPoint'; coordinates: Position[] }
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'MultiLineString'; coordinates: Position[][] }
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] }
  | { type: 'GeometryCollection'; geometries: Geometry[] };

export interface Feature {
  type: 'Feature';
  id?: string | number;
  properties: Record<string, unknown> | null;
  geometry: Geometry | null;
}

interface Topology {
  type: 'Topology';
  arcs: number[][][];
  transform?: { scale: [number, number]; translate: [number, number] };
  objects: Record<string, TopoGeometry>;
}

type TopoGeometry = {
  type: string;
  id?: string | number;
  properties?: Record<string, unknown>;
  arcs?: unknown;
  coordinates?: unknown;
  geometries?: TopoGeometry[];
};

/** Decode a TopoJSON object (by name, else the first) into GeoJSON features. */
function topoFeatures(topo: Topology, object?: string): Feature[] {
  const name = object && topo.objects[object] ? object : Object.keys(topo.objects)[0];
  if (!name) return [];
  const t = topo.transform;
  // Arcs are delta-encoded when the topology is quantized (has a transform).
  const arcs = topo.arcs.map((arc) => {
    if (!t) return arc.map((p) => [p[0]!, p[1]!] as Position);
    let x = 0;
    let y = 0;
    return arc.map((p) => {
      x += p[0]!;
      y += p[1]!;
      return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]] as Position;
    });
  });
  const point = (p: number[]): Position => (t ? [p[0]! * t.scale[0] + t.translate[0], p[1]! * t.scale[1] + t.translate[1]] : [p[0]!, p[1]!]);
  const line = (ids: number[]): Position[] => {
    const out: Position[] = [];
    for (const i of ids) {
      const a = i < 0 ? arcs[~i]!.slice().reverse() : arcs[i]!;
      // Consecutive arcs share their joining point.
      out.push(...(out.length ? a.slice(1) : a));
    }
    return out;
  };
  const geom = (g: TopoGeometry): Geometry | null => {
    switch (g.type) {
      case 'Point':
        return { type: 'Point', coordinates: point(g.coordinates as number[]) };
      case 'MultiPoint':
        return { type: 'MultiPoint', coordinates: (g.coordinates as number[][]).map(point) };
      case 'LineString':
        return { type: 'LineString', coordinates: line(g.arcs as number[]) };
      case 'MultiLineString':
        return { type: 'MultiLineString', coordinates: (g.arcs as number[][]).map(line) };
      case 'Polygon':
        return { type: 'Polygon', coordinates: (g.arcs as number[][]).map(line) };
      case 'MultiPolygon':
        return { type: 'MultiPolygon', coordinates: (g.arcs as number[][][]).map((p) => p.map(line)) };
      case 'GeometryCollection':
        return { type: 'GeometryCollection', geometries: (g.geometries ?? []).map(geom).filter((x): x is Geometry => !!x) };
      default:
        return null;
    }
  };
  const root = topo.objects[name]!;
  const members = root.type === 'GeometryCollection' ? (root.geometries ?? []) : [root];
  return members.map((g) => ({ type: 'Feature', ...(g.id !== undefined ? { id: g.id } : {}), properties: g.properties ?? {}, geometry: geom(g) }));
}

/**
 * Features from GeoJSON (a FeatureCollection, a Feature or a bare geometry) or TopoJSON (`object` names which of its
 * objects; else the first). Anything else gives no features.
 */
export function toFeatures(input: unknown, object?: string): Feature[] {
  if (!input || typeof input !== 'object') return [];
  const o = input as { type?: string; features?: unknown[] };
  if (o.type === 'Topology') return topoFeatures(input as Topology, object);
  if (o.type === 'FeatureCollection' && Array.isArray(o.features)) return o.features as Feature[];
  if (o.type === 'Feature') return [input as Feature];
  if (typeof o.type === 'string' && 'coordinates' in o) return [{ type: 'Feature', properties: {}, geometry: input as Geometry }];
  return [];
}

// ------------------------------------------------------------------ projections

export type ProjectionKind = 'mercator' | 'equirectangular';

/** A projection: lon/lat in degrees to x/y in px (y down). */
export interface Projection {
  (p: Position): Position;
  kind: ProjectionKind;
}

const RAD = Math.PI / 180;
const MAX_LAT = 85.05113;

/** The unit projection: lon/lat to plane coordinates (y up). */
function raw(kind: ProjectionKind, [lon, lat]: Position): Position {
  if (kind === 'equirectangular') return [lon * RAD, lat * RAD];
  const phi = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * RAD;
  return [lon * RAD, Math.log(Math.tan(Math.PI / 4 + phi / 2))];
}

function eachPosition(g: Geometry | null, fn: (p: Position) => void): void {
  if (!g) return;
  switch (g.type) {
    case 'Point':
      return fn(g.coordinates);
    case 'MultiPoint':
    case 'LineString':
      return g.coordinates.forEach(fn);
    case 'MultiLineString':
    case 'Polygon':
      return g.coordinates.forEach((r) => r.forEach(fn));
    case 'MultiPolygon':
      return g.coordinates.forEach((p) => p.forEach((r) => r.forEach(fn)));
    case 'GeometryCollection':
      return g.geometries.forEach((x) => eachPosition(x, fn));
  }
}

/** A projection fitted to show every position (of the features and any extra points) inside width × height. */
export function fitProjection(kind: ProjectionKind, features: Feature[], width: number, height: number, pad = 8, extra: Position[] = []): Projection {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (p: Position) => {
    const [x, y] = raw(kind, p);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  for (const f of features) eachPosition(f.geometry, grow);
  extra.forEach(grow);
  if (!Number.isFinite(x0)) [x0, y0, x1, y1] = [-Math.PI, -1.5, Math.PI, 1.5];
  // One point (or one line of points): give it a sensible span.
  if (x1 - x0 < 1e-6) [x0, x1] = [x0 - 0.05, x1 + 0.05];
  if (y1 - y0 < 1e-6) [y0, y1] = [y0 - 0.05, y1 + 0.05];
  const k = Math.min((width - 2 * pad) / (x1 - x0), (height - 2 * pad) / (y1 - y0));
  const ox = (width - k * (x1 - x0)) / 2;
  const oy = (height - k * (y1 - y0)) / 2;
  const f = ((p: Position) => {
    const [x, y] = raw(kind, p);
    return [ox + (x - x0) * k, oy + (y1 - y) * k] as Position;
  }) as Projection;
  f.kind = kind;
  return f;
}

/** SVG path data for a geometry (polygons closed; points as nothing: draw those as circles). */
export function geoPath(g: Geometry | null, project: Projection): string {
  if (!g) return '';
  const ring = (r: Position[], close: boolean) => {
    if (!r.length) return '';
    let d = '';
    r.forEach((p, i) => {
      const [x, y] = project(p);
      d += `${i ? 'L' : 'M'}${r2(x)},${r2(y)}`;
    });
    return close ? d + 'Z' : d;
  };
  switch (g.type) {
    case 'LineString':
      return ring(g.coordinates, false);
    case 'MultiLineString':
      return g.coordinates.map((r) => ring(r, false)).join('');
    case 'Polygon':
      return g.coordinates.map((r) => ring(r, true)).join('');
    case 'MultiPolygon':
      return g.coordinates.map((p) => p.map((r) => ring(r, true)).join('')).join('');
    case 'GeometryCollection':
      return g.geometries.map((x) => geoPath(x, project)).join('');
    default:
      return '';
  }
}

// ------------------------------------------------------------------ the map visual

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** The names a feature answers to: the key property first, then its id and the usual name and code properties. */
function featureKeys(f: Feature, key: string): string[] {
  const p = f.properties ?? {};
  const out = [p[key], f.id, p.name, p.NAME, p.iso_a2, p.ISO_A2, p.iso_a3, p.ISO_A3, p.code, p.id];
  return out.filter((x) => x !== undefined && x !== null && x !== '').map(norm);
}

function dim(ctx: ChartContext, row: number): string {
  const s = ctx.selected(row);
  return s === false ? ' sk-dim' : s ? ' sk-on' : '';
}

/**
 * Map. Shapes come in options.shapes (parsed GeoJSON or TopoJSON; options.object picks a TopoJSON object).
 *
 * - Filled regions: role `location` (a dimension whose values name regions: matched against options.key, default
 *   `name`, then the feature's id and common name / ISO code properties) and `values` (one measure, coloured low to
 *   high on the sequential ramp).
 * - Points: roles `latitude` and `longitude` (numbers), optional `size` (a measure, area-scaled) and `values`
 *   (colour). Drawn over the shapes when there are any.
 *
 * Options: shapes, object, key, projection (mercator, equirectangular), legend (true by default for filled regions).
 */
export function mapChart(ctx: ChartContext): void {
  const { data } = ctx;
  const W = Math.max(60, ctx.width);
  const features = toFeatures(ctx.options.shapes, typeof ctx.options.object === 'string' ? ctx.options.object : undefined);
  const loc = data.role('location')[0];
  const lat = data.role('latitude')[0];
  const lon = data.role('longitude')[0];
  const val = data.role('values')[0];
  const size = data.role('size')[0];
  const points = !!(lat && lon);
  if (!features.length && !points) {
    ctx.el.innerHTML = `<div class="sk-empty">${loc ? 'Add a shapes file (GeoJSON or TopoJSON) to match locations to' : 'Add a location, or latitude and longitude'}</div>`;
    return;
  }
  const kind: ProjectionKind = ctx.options.projection === 'equirectangular' ? 'equirectangular' : 'mercator';
  const showLegend = !!(val && ctx.options.legend !== false && ctx.options.legend !== 'none');
  const legendH = showLegend ? 26 : 0;
  const H = Math.max(40, ctx.height - legendH);
  const pts: { row: number; p: Position }[] = [];
  if (points) {
    for (let r = 0; r < data.rows; r++) {
      const p: Position = [toNum(lon!.values[r]), toNum(lat!.values[r])];
      if (Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[1]) <= 90 && Math.abs(p[0]) <= 180) pts.push({ row: r, p });
    }
  }
  // Points need room for their circles at the edges.
  const rmax = Math.max(4, Math.min(W, H) / 18);
  const project = fitProjection(kind, features, W, H, features.length ? 8 : rmax + 4, features.length ? [] : pts.map((x) => x.p));
  // Rows by location name, and the row each shape shows.
  const rowsByName = new Map<string, number>();
  if (loc) for (let r = 0; r < data.rows; r++) rowsByName.set(norm(loc.fmt(loc.values[r]!)), r).set(norm(loc.values[r]), r);
  const key = typeof ctx.options.key === 'string' && ctx.options.key ? ctx.options.key : 'name';
  const shapeRow = features.map((f) => (loc ? featureKeys(f, key).map((k) => rowsByName.get(k)).find((x) => x !== undefined) : undefined));
  // Colour scale over the measure, of the rows the map draws: a row with no shape or no position (an online shop on
  // a map of stores) would otherwise stretch the scale and pale every mark.
  const drawn = new Set<number>([...shapeRow.filter((r): r is number => r !== undefined), ...pts.map((x) => x.row)]);
  let lo = Infinity;
  let hi = -Infinity;
  if (val) {
    for (const r of drawn) {
      const v = toNum(val.values[r]);
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
  }
  const colourOf = (r: number) => {
    const v = val ? toNum(val.values[r]) : NaN;
    return Number.isFinite(v) ? seqColor((v - lo) / (hi - lo || 1)) : '';
  };
  let svg = '';
  let matched = 0;
  features.forEach((f, i) => {
    const d = geoPath(f.geometry, project);
    if (!d) return;
    const row = shapeRow[i];
    const title = esc(String((f.properties ?? {})[key] ?? (f.properties ?? {}).name ?? f.id ?? ''));
    if (row === undefined) {
      svg += `<path class="sk-map-shape" d="${d}"><title>${title}</title></path>`;
      return;
    }
    matched++;
    const c = colourOf(row);
    svg += `<path class="sk-map-shape sk-mark sk-map-region${dim(ctx, row)}" data-row="${row}" d="${d}"${c ? ` style="fill:${c}"` : ''}/>`;
  });
  if (points) {
    const smax = size ? Math.max(...pts.map((x) => Math.abs(toNum(size.values[x.row])) || 0), 0) : 0;
    for (const { row, p } of pts) {
      const [x, y] = project(p);
      const s = size ? Math.abs(toNum(size.values[row])) || 0 : 0;
      const rad = size && smax ? Math.max(2, Math.sqrt(s / smax) * rmax) : 4;
      const c = colourOf(row);
      svg += `<circle class="sk-map-point sk-mark sk-c0${dim(ctx, row)}" data-row="${row}" cx="${r2(x)}" cy="${r2(y)}" r="${r2(rad)}"${c ? ` style="fill:${c}"` : ''}/>`;
    }
  }
  const unmatched = loc && features.length && !points && data.rows ? data.rows - matched : 0;
  const legend = showLegend && Number.isFinite(lo)
    ? `<div class="sk-map-legend"><span>${esc(val!.fmt(lo))}</span><span class="sk-map-ramp"></span><span>${esc(val!.fmt(hi))}</span>${unmatched > 0 ? `<span class="sk-map-note" title="Rows whose location names no shape">${unmatched} not on the map</span>` : ''}</div>`
    : '';
  ctx.el.innerHTML = `<div class="sk-chart sk-map"><svg class="sk-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg}</svg>${legend}</div>`;
}

/** The columns a map reads by role (for apps that list a map's fields). */
export const MAP_ROLES = ['location', 'latitude', 'longitude', 'values', 'size'] as const;
export type MapRole = (typeof MAP_ROLES)[number];
