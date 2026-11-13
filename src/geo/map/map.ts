/**
 * The map: a `MapRenderer` (renderer.ts) in a container, with the parts a page needs around it, each optional and
 * each usable on its own:
 *
 * - input (input.ts): drag, wheel, pinch, keys; `interactive: false` leaves it out;
 * - a tooltip and the attribution line (overlays.ts); `tooltip: false` leaves out the tooltip;
 * - resizing with the container, hover highlighting, events, and camera flights.
 */
import { Camera, type ViewState } from '../core/camera.js';
import type { Layer, MapBasemap, Picked } from '../core/contract.js';
import type { Bounds } from '../core/mercator.js';
import { attachInput } from './input.js';
import { Attribution, Tooltip, defaultTooltip } from './overlays.js';
import { MapRenderer, type FrameStats } from './renderer.js';

export type { MapBasemap } from '../core/contract.js';
export type { FrameStats } from './renderer.js';
export { defaultTooltip } from './overlays.js';

export interface MapOptions extends Partial<ViewState> {
  readonly basemap?: MapBasemap | null;
  readonly layers?: readonly Layer[];
  /** Device pixel ratio to draw at (default: the screen's, at most 2). */
  readonly pixelRatio?: number;
  /** Show the hovered object's values in a tooltip (default true), or format them yourself. */
  readonly tooltip?: boolean | ((picked: Picked) => string | null);
  /** Pan, zoom, rotate and tilt with the pointer and keys (default true). */
  readonly interactive?: boolean;
  /** Draw with a device you already have (shared with your own WebGPU code); the map won't destroy it. */
  readonly device?: GPUDevice;
  readonly minZoom?: number;
  readonly maxZoom?: number;
}

type Listener<T> = (value: T) => void;
interface Events {
  move: ViewState;
  hover: Picked | null;
  click: Picked | null;
  frame: FrameStats;
}

export class SmaltMap {
  readonly container: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  /** The renderer underneath: layers, basemap, frames and picking. */
  readonly renderer: MapRenderer;
  private tooltip?: Tooltip;
  private attribution: Attribution;
  private detach: () => void = () => {};
  private resize?: ResizeObserver;
  private listeners = new Map<keyof Events, Set<Listener<never>>>();
  private hovered: Picked | null = null;
  private destroyed = false;

  private constructor(container: HTMLElement, canvas: HTMLCanvasElement, renderer: MapRenderer, options: MapOptions) {
    this.container = container;
    this.canvas = canvas;
    this.renderer = renderer;
    const t = options.tooltip ?? true;
    if (t !== false) this.tooltip = new Tooltip(container, typeof t === 'function' ? t : defaultTooltip);
    this.attribution = new Attribution(container);
    renderer.onFrame = (s) => this.emit('frame', s);
    const fit = () => renderer.resize(container.clientWidth, container.clientHeight);
    fit();
    this.resize = new ResizeObserver(fit);
    this.resize.observe(container);
    if (options.interactive !== false) this.attachInput();
    this.setBasemap(options.basemap ?? null);
    for (const l of options.layers ?? []) this.addLayer(l);
  }

  /** Creates a map in `container` (which should have a size). Throws `GpuUnavailableError` without WebGPU. */
  static async create(container: HTMLElement, options: MapOptions = {}): Promise<SmaltMap> {
    const canvas = container.ownerDocument.createElement('canvas');
    canvas.className = 'smaltgl-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Map. Drag to pan, scroll to zoom, right-drag to rotate and tilt.');
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'none', outline: 'none' });
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.appendChild(canvas);
    const camera = new Camera();
    if (options.minZoom !== undefined) camera.minZoom = options.minZoom;
    if (options.maxZoom !== undefined) camera.maxZoom = options.maxZoom;
    camera.setView({ center: options.center ?? [0, 20], zoom: options.zoom ?? 1.5, bearing: options.bearing ?? 0, pitch: options.pitch ?? 0 });
    let renderer: MapRenderer;
    try {
      renderer = await MapRenderer.create(canvas, { camera, device: options.device, pixelRatio: options.pixelRatio });
    } catch (e) {
      canvas.remove();
      throw e;
    }
    return new SmaltMap(container, canvas, renderer, options);
  }

  private attachInput(): void {
    let hoverAt: [number, number] | undefined;
    this.detach = attachInput(this.canvas, this.camera, {
      changed: () => {
        this.redraw();
        this.emit('move', this.camera.view());
        this.tooltip?.hide();
      },
      hover: (x, y) => {
        hoverAt = [x, y];
        void this.renderer.pick(x, y).then((p) => {
          // A newer hover moved on.
          if (!hoverAt || hoverAt[0] !== x || hoverAt[1] !== y || this.destroyed) return;
          this.setHovered(p);
          if (p) this.tooltip?.show(p, x, y);
        });
      },
      leave: () => {
        hoverAt = undefined;
        this.setHovered(null);
      },
      click: (x, y) => void this.renderer.pick(x, y).then((p) => this.emit('click', p)),
    });
  }

  get camera(): Camera {
    return this.renderer.camera;
  }

  get stats(): FrameStats {
    return this.renderer.stats;
  }

  get device(): GPUDevice {
    return this.renderer.device;
  }

  get gpuTiming(): boolean {
    return this.renderer.gpuTiming;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Layers and basemap

  /** Sets the basemap (or none). Passing the current one again picks up a theme change. */
  setBasemap(basemap: MapBasemap | null): void {
    this.renderer.setBasemap(basemap);
    this.attribution.set(basemap?.attribution ?? '');
    this.container.classList.toggle('smaltgl-dark', !!basemap?.dark);
  }

  getBasemap(): MapBasemap | null {
    return this.renderer.getBasemap();
  }

  addLayer(layer: Layer): Layer {
    return this.renderer.addLayer(layer);
  }

  removeLayer(layer: Layer | string): void {
    const l = this.renderer.removeLayer(layer);
    if (l && this.hovered?.layer === l.id) this.setHovered(null);
  }

  /** Replaces every layer (destroying the old ones that are not in the new list). */
  setLayers(layers: readonly Layer[]): void {
    this.setHovered(null);
    this.renderer.setLayers(layers);
  }

  getLayers(): readonly Layer[] {
    return this.renderer.getLayers();
  }

  // -------------------------------------------------------------------------------------------------------------------
  // View

  setView(view: Partial<ViewState>): void {
    this.camera.setView(view);
    this.redraw();
    this.emit('move', this.camera.view());
  }

  getView(): ViewState {
    return this.camera.view();
  }

  /** Fits world bounds (or every layer's data) into the view. */
  fitBounds(bounds?: Bounds, paddingPx = 40): void {
    const b = bounds ?? this.renderer.dataBounds();
    if (b) this.setView(this.camera.fit(b, paddingPx));
  }

  /** Glides to a view over `ms` milliseconds. */
  flyTo(view: Partial<ViewState>, ms = 1200): Promise<void> {
    const cam = this.camera;
    const from = cam.view();
    const fx = cam.x, fy = cam.y;
    const to = new Camera();
    to.setView({ ...from, ...view });
    const t0 = performance.now();
    return new Promise((resolve) => {
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / ms);
        const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        // Zoom out a little mid-flight when travelling far.
        const dist = Math.hypot(to.x - fx, to.y - fy) * 2 ** Math.min(from.zoom, to.zoom);
        const arc = Math.min(4, Math.log2(1 + dist)) * Math.sin(Math.PI * e);
        cam.x = fx + (to.x - fx) * e;
        cam.y = fy + (to.y - fy) * e;
        cam.zoom = from.zoom + (to.zoom - from.zoom) * e - arc;
        cam.bearing = (from.bearing ?? 0) + (to.bearing - (from.bearing ?? 0)) * e;
        cam.pitch = (from.pitch ?? 0) + (to.pitch - (from.pitch ?? 0)) * e;
        cam.clamp();
        this.redraw();
        this.emit('move', cam.view());
        if (t < 1 && !this.destroyed) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Events and frames

  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn as Listener<never>);
    return () => set.delete(fn as Listener<never>);
  }

  private emit<K extends keyof Events>(event: K, value: Events[K]): void {
    for (const fn of this.listeners.get(event) ?? []) (fn as Listener<Events[K]>)(value);
  }

  redraw(): void {
    this.renderer.redraw();
  }

  renderNow(): Promise<void> {
    return this.renderer.renderNow();
  }

  /** Resolves when every tile in view is drawn (or after `timeoutMs`). For screenshots, tests and benchmarks. */
  idle(timeoutMs?: number): Promise<void> {
    return this.renderer.idle(timeoutMs);
  }

  /** What is drawn at (x, y), in CSS pixels from the map's corner. */
  pick(x: number, y: number): Promise<Picked | null> {
    return this.renderer.pick(x, y);
  }

  private setHovered(p: Picked | null): void {
    if (p?.layer === this.hovered?.layer && p?.index === this.hovered?.index) return;
    const layers = this.renderer.getLayers();
    if (this.hovered) layers.find((l) => l.id === this.hovered!.layer)?.highlight?.(-1);
    this.hovered = p;
    if (p) layers.find((l) => l.id === p.layer)?.highlight?.(p.index);
    this.canvas.style.cursor = p ? 'pointer' : '';
    if (!p) this.tooltip?.hide();
    this.emit('hover', p);
    this.redraw();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.detach();
    this.resize?.disconnect();
    this.renderer.destroy();
    this.canvas.remove();
    this.tooltip?.destroy();
    this.attribution.destroy();
  }
}

/** Creates a map. */
export const createMap = (container: HTMLElement, options?: MapOptions): Promise<SmaltMap> => SmaltMap.create(container, options);
