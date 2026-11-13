/**
 * The vector basemap: OpenStreetMap data in OpenMapTiles-schema vector tiles (OpenFreeMap by default), drawn with
 * WebGPU in the map's own render pass, under the data layers, with its labels over them.
 *
 * It is three parts, each usable on its own:
 *
 * - `TileSource` (tile-source.ts): fetching in workers, the cache, and which tiles to draw. No GPU.
 * - `TileRenderer` (tile-renderer.ts): fills through the stencil buffer and lines as capsules.
 * - `LabelRenderer` (label-renderer.ts): place, road and river names.
 *
 * `Basemap` joins them for the map (`MapBasemap` in core/contract.ts) and holds the theme.
 */
import { parseColor, type RGBA } from '../core/color.js';
import type { Frame, LayerGpu, MapBasemap } from '../core/contract.js';
import { LabelRenderer, labelCandidates } from './label-renderer.js';
import { THEMES, type Theme } from './style.js';
import { TileRenderer } from './tile-renderer.js';
import { TileSource, type DrawItem, type TileSourceOptions } from './tile-source.js';

export { OPENFREEMAP } from './tile-source.js';

export const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

export interface BasemapOptions extends TileSourceOptions {
  /** 'light' (default), 'dark', or a theme of your own (style.ts). */
  readonly theme?: 'light' | 'dark' | Theme;
  /** Labels on (default true). */
  readonly labels?: boolean;
  readonly attribution?: string;
  /** A tile source of your own (the basemap sets its hooks); by default it makes one from these options. */
  readonly source?: TileSource;
}

export class Basemap implements MapBasemap {
  readonly source: TileSource;
  readonly tiles = new TileRenderer();
  readonly labels = new LabelRenderer();
  private theme: Theme;
  private opts: BasemapOptions;
  private plan: DrawItem[] = [];
  private redraw: () => void = () => {};
  private ownSource: boolean;

  constructor(options: BasemapOptions = {}) {
    this.opts = options;
    this.theme = typeof options.theme === 'object' ? options.theme : THEMES[options.theme ?? 'light'];
    this.ownSource = !options.source;
    this.source = options.source ?? new TileSource(options);
  }

  get dark(): boolean {
    return this.theme.dark;
  }

  get background(): RGBA {
    return parseColor(this.theme.background);
  }

  get attribution(): string {
    return this.opts.attribution ?? ATTRIBUTION;
  }

  get pending(): number {
    return this.source.pending;
  }

  get idle(): boolean {
    return this.source.idle;
  }

  /** Tiles that failed to load. */
  get failures(): number {
    return this.source.failures;
  }

  get themeName(): string {
    return this.theme.name;
  }

  /** Switches themes; tiles stay loaded. */
  setTheme(theme: 'light' | 'dark' | Theme): void {
    this.theme = typeof theme === 'object' ? theme : THEMES[theme];
    this.labels.clear();
    this.redraw();
  }

  attach(gpu: LayerGpu, redraw: () => void): void {
    this.redraw = redraw;
    this.tiles.attach(gpu);
    this.labels.attach(gpu);
    this.source.hooks = { onReady: (e) => this.tiles.upload(e), onEvict: (e) => this.tiles.release(e), changed: redraw };
    // Tiles that arrived before this renderer did (a shared source).
    for (const e of this.source.entries()) if (e.state === 'ready' && !e.data) this.tiles.upload(e);
    this.source.start();
  }

  draw(pass: GPURenderPassEncoder, frame: Frame): void {
    this.plan = this.source.plan(frame.camera);
    this.tiles.draw(pass, frame, this.plan, this.theme);
  }

  drawLabels(pass: GPURenderPassEncoder, frame: Frame): void {
    if (this.opts.labels === false || !this.plan.length) return;
    this.labels.draw(pass, frame, labelCandidates(this.plan, frame.camera, this.theme), this.theme);
  }

  destroy(): void {
    if (this.ownSource) this.source.destroy();
    else for (const e of this.source.entries()) this.tiles.release(e);
    this.labels.destroy();
  }
}

/** The OpenStreetMap basemap, from OpenFreeMap unless `tiles` says otherwise. */
export const basemap = (options?: BasemapOptions): Basemap => new Basemap(options);
