/**
 * GeoJSON to layer data: points, lines and polygons as columns, with each feature's properties as columns beside
 * them. Multi-geometries become one row per part; `feature` says which feature a row came from. Numeric properties
 * become Float64Arrays (missing values NaN); others stay arrays, with codes for colouring by category.
 */

type Position = readonly number[];
interface Geometry {
  readonly type: string;
  readonly coordinates?: unknown;
  readonly geometries?: readonly Geometry[];
}
interface Feature {
  readonly type: 'Feature';
  readonly geometry: Geometry | null;
  readonly properties?: Record<string, unknown> | null;
}

/** Property columns for one kind of geometry. */
export interface PropertyColumns {
  /** Numbers (Float64Array, NaN where missing) or other values. */
  readonly columns: Record<string, Float64Array | unknown[]>;
  /** For text columns: the distinct values, and each row's code into them (for categorical colours). */
  readonly categories: Record<string, { readonly names: readonly string[]; readonly codes: Float32Array }>;
}

export interface GeoJsonData {
  readonly points: { readonly count: number; readonly lng: Float64Array; readonly lat: Float64Array; readonly feature: Uint32Array } & PropertyColumns;
  readonly lines: { readonly count: number; readonly starts: Uint32Array; readonly lng: Float64Array; readonly lat: Float64Array; readonly feature: Uint32Array } & PropertyColumns;
  readonly polygons: { readonly count: number; readonly starts: Uint32Array; readonly rings: Uint32Array; readonly lng: Float64Array; readonly lat: Float64Array; readonly feature: Uint32Array } & PropertyColumns;
  readonly features: number;
}

class Growing {
  data = new Float64Array(1024);
  length = 0;
  push(v: number): void {
    if (this.length === this.data.length) {
      const d = new Float64Array(this.data.length * 2);
      d.set(this.data);
      this.data = d;
    }
    this.data[this.length++] = v;
  }
  done(): Float64Array {
    return this.data.slice(0, this.length);
  }
}

/** Reads a GeoJSON FeatureCollection, Feature or bare geometry (an object, or its JSON text). */
export function readGeoJSON(input: string | object): GeoJsonData {
  const root = (typeof input === 'string' ? JSON.parse(input) : input) as { type: string; features?: Feature[] };
  const features: Feature[] =
    root.type === 'FeatureCollection' ? (root.features ?? []) : root.type === 'Feature' ? [root as unknown as Feature] : [{ type: 'Feature', geometry: root as unknown as Geometry, properties: {} }];

  const pt = { lng: new Growing(), lat: new Growing(), feature: [] as number[] };
  const ln = { lng: new Growing(), lat: new Growing(), starts: [] as number[], feature: [] as number[] };
  const pg = { lng: new Growing(), lat: new Growing(), starts: [] as number[], rings: [] as number[], feature: [] as number[] };

  const addPoint = (p: Position, f: number) => {
    if (p.length < 2) return;
    pt.lng.push(+p[0]);
    pt.lat.push(+p[1]);
    pt.feature.push(f);
  };
  const addLine = (line: readonly Position[], f: number) => {
    if (line.length < 2) return;
    ln.starts.push(ln.lng.length);
    for (const p of line) {
      ln.lng.push(+p[0]);
      ln.lat.push(+p[1]);
    }
    ln.feature.push(f);
  };
  const addPolygon = (rings: readonly (readonly Position[])[], f: number) => {
    if (!rings.length || rings[0].length < 3) return;
    pg.starts.push(pg.lng.length);
    for (const ring of rings) {
      if (ring.length < 3) continue;
      pg.rings.push(pg.lng.length);
      for (const p of ring) {
        pg.lng.push(+p[0]);
        pg.lat.push(+p[1]);
      }
    }
    pg.feature.push(f);
  };
  const visit = (g: Geometry | null, f: number): void => {
    if (!g) return;
    const c = g.coordinates as never;
    switch (g.type) {
      case 'Point':
        return addPoint(c, f);
      case 'MultiPoint':
        return (c as Position[]).forEach((p) => addPoint(p, f));
      case 'LineString':
        return addLine(c, f);
      case 'MultiLineString':
        return (c as Position[][]).forEach((l) => addLine(l, f));
      case 'Polygon':
        return addPolygon(c, f);
      case 'MultiPolygon':
        return (c as Position[][][]).forEach((p) => addPolygon(p, f));
      case 'GeometryCollection':
        return (g.geometries ?? []).forEach((x) => visit(x, f));
    }
  };
  features.forEach((feat, i) => visit(feat.geometry, i));

  const props = (rows: readonly number[]): PropertyColumns => {
    const keys = new Set<string>();
    for (const f of new Set(rows)) for (const k of Object.keys(features[f]?.properties ?? {})) keys.add(k);
    const columns: PropertyColumns['columns'] = {};
    const categories: Record<string, { names: string[]; codes: Float32Array }> = {};
    for (const k of keys) {
      const vals = rows.map((f) => features[f]?.properties?.[k]);
      if (vals.every((v) => v === null || v === undefined || typeof v === 'number')) columns[k] = Float64Array.from(vals, (v) => (typeof v === 'number' ? v : NaN));
      else {
        columns[k] = vals;
        const names: string[] = [];
        const index = new Map<string, number>();
        const codes = Float32Array.from(vals, (v) => {
          const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
          let c = index.get(s);
          if (c === undefined) index.set(s, (c = names.push(s) - 1));
          return c;
        });
        categories[k] = { names, codes };
      }
    }
    return { columns, categories };
  };

  const ends = (starts: number[], total: number) => Uint32Array.from([...starts, total]);
  return {
    points: { count: pt.feature.length, lng: pt.lng.done(), lat: pt.lat.done(), feature: Uint32Array.from(pt.feature), ...props(pt.feature) },
    lines: { count: ln.feature.length, starts: ends(ln.starts, ln.lng.length), lng: ln.lng.done(), lat: ln.lat.done(), feature: Uint32Array.from(ln.feature), ...props(ln.feature) },
    polygons: {
      count: pg.feature.length,
      starts: ends(pg.starts, pg.lng.length),
      rings: Uint32Array.from(pg.rings),
      lng: pg.lng.done(),
      lat: pg.lat.done(),
      feature: Uint32Array.from(pg.feature),
      ...props(pg.feature),
    },
    features: features.length,
  };
}

const LNG = /^(lng|lon|long|longitude|x|pickup_longitude|start_lng|start_lon)$/i;
const LAT = /^(lat|latitude|y|pickup_latitude|start_lat)$/i;

/** Finds longitude and latitude columns by their usual names (lng, lon, longitude, x; lat, latitude, y). */
export function findCoordinates(names: readonly string[]): { lng?: string; lat?: string } {
  return { lng: names.find((n) => LNG.test(n.trim())), lat: names.find((n) => LAT.test(n.trim())) };
}
