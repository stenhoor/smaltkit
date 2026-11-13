/** Which tiles cover the view. */
import type { Camera } from '../core/camera.js';

export interface TileId {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

export const tileKey = (t: TileId): string => `${t.z}/${t.x}/${t.y}`;

/**
 * The tiles at the camera's zoom (floored, capped at `maxZoom`) that the view overlaps, nearest the centre first.
 * Tiles are 512 CSS pixels at their own zoom, so between 512 and 1,024 pixels on screen.
 */
export function coverTiles(camera: Camera, maxZoom = 14, marginPx = 0): TileId[] {
  const z = Math.max(0, Math.min(maxZoom, Math.floor(camera.zoom)));
  const n = 2 ** z;
  const [a, b, c, d] = camera.visibleBounds(marginPx);
  const x0 = Math.max(0, Math.floor(a * n)), x1 = Math.min(n - 1, Math.floor(c * n));
  const y0 = Math.max(0, Math.floor(b * n)), y1 = Math.min(n - 1, Math.floor(d * n));
  const out: TileId[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  const cx = camera.x * n, cy = camera.y * n;
  out.sort((p, q) => Math.hypot(p.x + 0.5 - cx, p.y + 0.5 - cy) - Math.hypot(q.x + 0.5 - cx, q.y + 0.5 - cy));
  // Pitched far towards the horizon, the view reaches many tiles: keep the nearest.
  return out.slice(0, 64);
}
