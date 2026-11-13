/**
 * Tiles in, geometry out: the tile source finds the tile URL template, runs a pool of tile workers (fetch, decode,
 * build), keeps a cache, and each frame plans which tiles to draw and which square of each (a loaded parent stands in
 * for a missing child). It holds no GPU state: a renderer attaches its own data to each entry through `onReady` and
 * frees it in `onEvict`, so the same source can feed this kit's renderer, another renderer, or a test.
 */
import type { Camera } from '../core/camera.js';
import type { TileGeometry } from './build.js';
import { coverTiles, tileKey, type TileId } from './tiles.js';

export const OPENFREEMAP = 'https://tiles.openfreemap.org/planet';

export interface TileEntry {
  readonly id: TileId;
  state: 'loading' | 'ready' | 'error';
  geometry?: TileGeometry;
  /** Whatever a renderer keeps for this tile (GPU buffers). */
  data?: unknown;
  /** The frame the tile was last needed in. */
  used: number;
  request?: number;
  worker?: Worker;
}

/** A tile to draw, and the square of it to draw (its own, or a missing descendant's). */
export interface DrawItem {
  readonly tile: TileEntry;
  readonly clip: TileId;
}

export interface TileSourceOptions {
  /** A TileJSON URL, or a tile URL template with {z}, {x} and {y}. Default: OpenFreeMap's planet. */
  readonly tiles?: string;
  /** The deepest zoom the source has (default 14). */
  readonly maxTileZoom?: number;
  /** Workers decoding tiles (default: half the cores, 2 to 4). */
  readonly workers?: number;
  /** Creates a tile worker. Default: the package's own (`tile-worker.js`). */
  readonly createWorker?: () => Worker;
  /** Tiles kept in the cache (default 300). */
  readonly cacheSize?: number;
  /** Requests in flight at once (default 24). */
  readonly concurrency?: number;
}

export interface TileSourceHooks {
  /** A tile's geometry arrived. */
  onReady?(entry: TileEntry): void;
  /** A tile left the cache: free what `onReady` made. */
  onEvict?(entry: TileEntry): void;
  /** Something new to draw. */
  changed?(): void;
}

export class TileSource {
  private template?: Promise<string>;
  private templateValue?: string;
  private tiles = new Map<string, TileEntry>();
  private workers: Worker[] = [];
  private nextWorker = 0;
  private nextRequest = 1;
  private requests = new Map<number, TileEntry>();
  private frameNo = 0;
  private missing = 1;
  private errors = 0;
  private destroyed = false;
  hooks: TileSourceHooks = {};

  constructor(private readonly opts: TileSourceOptions = {}) {}

  /** Starts the workers. Called on first use; call it early to warm up. */
  start(): void {
    if (this.workers.length || this.destroyed) return;
    const n = this.opts.workers ?? Math.max(2, Math.min(4, Math.floor((globalThis.navigator?.hardwareConcurrency ?? 4) / 2)));
    for (let i = 0; i < n; i++) {
      const w = this.opts.createWorker ? this.opts.createWorker() : new Worker(new URL('./tile-worker.js', import.meta.url), { type: 'module', name: 'smaltgl tiles' });
      w.onmessage = (e) => this.onTile(e.data);
      this.workers.push(w);
    }
  }

  get maxTileZoom(): number {
    return this.opts.maxTileZoom ?? 14;
  }

  /** Tiles loading now. */
  get pending(): number {
    let n = 0;
    for (const t of this.tiles.values()) if (t.state === 'loading') n++;
    return n;
  }

  /** Every tile the last plan needed is loaded (or failed). */
  get idle(): boolean {
    return this.templateValue !== undefined && this.missing === 0;
  }

  /** Tiles that failed to load. */
  get failures(): number {
    return this.errors;
  }

  /** Every tile in the cache. */
  entries(): IterableIterator<TileEntry> {
    return this.tiles.values();
  }

  private tileUrl(): Promise<string> {
    if (!this.template) {
      const src = this.opts.tiles ?? OPENFREEMAP;
      this.template = src.includes('{z}')
        ? Promise.resolve(src)
        : fetch(src)
            .then((r) => r.json())
            .then((j: { tiles: string[] }) => j.tiles[0]);
      this.template.then(
        (t) => {
          this.templateValue = t;
          this.hooks.changed?.();
        },
        () => this.errors++,
      );
    }
    return this.template;
  }

  private request(id: TileId): TileEntry {
    this.start();
    const entry: TileEntry = { id, state: 'loading', used: this.frameNo };
    this.tiles.set(tileKey(id), entry);
    const url = this.templateValue!.replace('{z}', String(id.z)).replace('{x}', String(id.x)).replace('{y}', String(id.y));
    const req = this.nextRequest++;
    const worker = this.workers[this.nextWorker++ % this.workers.length];
    entry.request = req;
    entry.worker = worker;
    this.requests.set(req, entry);
    worker.postMessage({ id: req, url, z: id.z });
    return entry;
  }

  private onTile(msg: { id: number; geometry?: TileGeometry; error?: string }): void {
    const entry = this.requests.get(msg.id);
    this.requests.delete(msg.id);
    if (!entry || this.destroyed) return;
    if (!msg.geometry) {
      if (msg.error === 'aborted') this.tiles.delete(tileKey(entry.id));
      else {
        entry.state = 'error';
        this.errors++;
      }
      return;
    }
    entry.geometry = msg.geometry;
    entry.state = 'ready';
    this.hooks.onReady?.(entry);
    this.hooks.changed?.();
  }

  /** The tiles to draw for the camera, parents first; requests the ones that are missing. */
  plan(camera: Camera): DrawItem[] {
    this.frameNo++;
    const out: DrawItem[] = [];
    if (!this.templateValue) {
      void this.tileUrl();
      return out;
    }
    const max = this.maxTileZoom;
    const want = coverTiles(camera, max);
    const wanted = new Set(want.map(tileKey));
    // Cancel loads that scrolled away.
    for (const [key, t] of this.tiles)
      if (t.state === 'loading' && !wanted.has(key) && t.request !== undefined && this.frameNo - t.used > 2) {
        t.worker?.postMessage({ cancel: t.request });
        t.request = undefined;
      }
    let inflight = this.pending;
    const limit = this.opts.concurrency ?? 24;
    this.missing = 0;
    for (const id of want) {
      const key = tileKey(id);
      let t = this.tiles.get(key);
      if (t?.state !== 'ready' && t?.state !== 'error') this.missing++;
      if (!t && inflight < limit) {
        t = this.request(id);
        inflight++;
      }
      if (t) t.used = this.frameNo;
      if (t?.state === 'ready') {
        out.push({ tile: t, clip: id });
        continue;
      }
      // A loaded ancestor, clipped to this tile's square.
      let found = false;
      for (let dz = 1; dz <= 6 && id.z - dz >= 0; dz++) {
        const a = this.tiles.get(tileKey({ z: id.z - dz, x: id.x >> dz, y: id.y >> dz }));
        if (a?.state === 'ready') {
          a.used = this.frameNo;
          out.push({ tile: a, clip: id });
          found = true;
          break;
        }
      }
      if (found) continue;
      // Loaded children, each in its own square.
      if (id.z < max)
        for (let k = 0; k < 4; k++) {
          const c = { z: id.z + 1, x: id.x * 2 + (k & 1), y: id.y * 2 + (k >> 1) };
          const ct = this.tiles.get(tileKey(c));
          if (ct?.state === 'ready') {
            ct.used = this.frameNo;
            out.push({ tile: ct, clip: c });
          }
        }
    }
    // Parents first: children drawn after them cover them.
    out.sort((a, b) => a.tile.id.z - b.tile.id.z);
    this.evict();
    return out;
  }

  private evict(): void {
    const max = this.opts.cacheSize ?? 300;
    if (this.tiles.size <= max) return;
    const old = [...this.tiles.entries()].filter(([, t]) => t.state !== 'loading' && t.used < this.frameNo).sort((a, b) => a[1].used - b[1].used);
    for (const [key, t] of old.slice(0, this.tiles.size - max)) {
      this.hooks.onEvict?.(t);
      this.tiles.delete(key);
    }
  }

  destroy(): void {
    this.destroyed = true;
    for (const w of this.workers) w.terminate();
    for (const t of this.tiles.values()) this.hooks.onEvict?.(t);
    this.tiles.clear();
  }
}
