/**
 * Web Mercator in "world" units: the whole map is the unit square, x east from the antimeridian, y south from the top.
 * The GPU works in 32-bit floats, so data is stored as offsets from an origin near it (see {@link projectColumns}):
 * small numbers keep their precision when the map is zoomed far in.
 */

export const MAX_LAT = 85.0511287798066;
export const EARTH_CIRCUMFERENCE = 40075016.686;

const D2R = Math.PI / 180;

export const lngToX = (lng: number): number => (lng + 180) / 360;

export function latToY(lat: number): number {
  const l = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + (l * D2R) / 2)) / (2 * Math.PI);
}

export const xToLng = (x: number): number => x * 360 - 180;

export const yToLat = (y: number): number => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/** World units for a distance in metres at a latitude (Mercator stretches distances by 1 / cos(lat)). */
export const metersToWorld = (meters: number, lat: number): number => meters / (EARTH_CIRCUMFERENCE * Math.cos(lat * D2R));

export type LngLat = readonly [lng: number, lat: number];

/** World bounds: [minX, minY, maxX, maxY]. */
export type Bounds = [number, number, number, number];

/** Positions ready for the GPU: interleaved x, y offsets from `origin`, in world units. */
export interface Projected {
  /** x0, y0, x1, y1, … as offsets from `origin`. */
  readonly positions: Float32Array;
  /** The world point the offsets are measured from (the centre of `bounds`). */
  readonly origin: readonly [number, number];
  /** World bounds of every finite point. */
  readonly bounds: Bounds;
  readonly count: number;
}

/**
 * Projects longitude and latitude columns to GPU positions. Points with a missing or non-finite coordinate are put
 * far off the map (NaN would poison GPU aggregation).
 */
export function projectColumns(lng: ArrayLike<number>, lat: ArrayLike<number>, origin?: readonly [number, number]): Projected {
  const n = Math.min(lng.length, lat.length);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = lng[i], b = lat[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      xs[i] = NaN;
      continue;
    }
    const x = (a + 180) / 360;
    const s = Math.sin(Math.max(-MAX_LAT, Math.min(MAX_LAT, b)) * D2R);
    const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
    xs[i] = x;
    ys[i] = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (minX > maxX) minX = maxX = minY = maxY = 0.5;
  const o: [number, number] = origin ? [origin[0], origin[1]] : [(minX + maxX) / 2, (minY + maxY) / 2];
  const positions = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(xs[i])) {
      positions[2 * i] = 1e6;
      positions[2 * i + 1] = 1e6;
    } else {
      positions[2 * i] = xs[i] - o[0];
      positions[2 * i + 1] = ys[i] - o[1];
    }
  }
  return { positions, origin: o, bounds: [minX, minY, maxX, maxY], count: n };
}

/** The world point of a longitude and latitude. */
export const toWorld = (lng: number, lat: number): [number, number] => [lngToX(lng), latToY(lat)];

/** Longitude and latitude of a world point. */
export const toLngLat = (x: number, y: number): [number, number] => [xToLng(x), yToLat(y)];
