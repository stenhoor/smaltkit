/**
 * The map's renderer: one canvas, one WebGPU device, one render pass per frame, layers and a basemap, picking and
 * frame timing. It has no input, tooltip or page furniture, so it can draw a map inside something else: a notebook
 * cell, a report, an offscreen canvas, or a page that has its own controls. `SmaltMap` (map.ts) adds those.
 *
 * Frames are drawn only when asked (`redraw`), at most once per display refresh, and keep coming while a layer
 * animates.
 */
import { Camera } from '../core/camera.js';
import type { Frame, Layer, LayerGpu, MapBasemap, Picked } from '../core/contract.js';
import { connectGpu, initGpu, SAMPLES, STENCIL_FORMAT, UniformArena, type Gpu } from '../core/gpu.js';
import type { Bounds } from '../core/mercator.js';

/** What each frame took, for the statistics panels. */
export interface FrameStats {
  /** Milliseconds of CPU time to record the frame. */
  cpuMs: number;
  /** Milliseconds the GPU spent on the frame, when the adapter can time it. */
  gpuMs?: number;
  /** Frames per second over the last second, while frames are being drawn. */
  fps: number;
  /** Objects drawn by the data layers. */
  objects: number;
  frames: number;
  tilesPending: number;
}

export interface RendererOptions {
  /** Device pixel ratio to draw at (default: the screen's, at most 2). */
  readonly pixelRatio?: number;
  /** A device to draw with (yours to keep: the renderer won't destroy it). By default the renderer asks for one. */
  readonly device?: GPUDevice;
  /** The camera to draw from (default: a new one). Share one to keep two renderers in step. */
  readonly camera?: Camera;
}

export class MapRenderer {
  readonly camera: Camera;
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly stats: FrameStats = { cpuMs: 0, fps: 0, objects: 0, frames: 0, tilesPending: 0 };
  /** Called after every frame. */
  onFrame?: (stats: FrameStats) => void;
  private gpu!: Gpu;
  private ownDevice: boolean;
  private layerGpu!: LayerGpu;
  private viewBuffer!: GPUBuffer;
  private viewGroup!: GPUBindGroup;
  private arena!: UniformArena;
  private color?: GPUTexture;
  private stencil?: GPUTexture;
  private pickTex?: GPUTexture;
  private pickRead?: GPUBuffer;
  private pickBusy = false;
  private pickQueue?: { x: number; y: number; resolve: ((p: Picked | null) => void)[] };
  private layers: Layer[] = [];
  private basemap: MapBasemap | null = null;
  private frameRequested = 0;
  private start = performance.now();
  private ratio: number;
  private fpsWindow: number[] = [];
  private timer?: { query: GPUQuerySet; resolve: GPUBuffer; read: GPUBuffer; busy: boolean };
  private destroyed = false;
  private lost = false;

  private constructor(canvas: HTMLCanvasElement | OffscreenCanvas, options: RendererOptions) {
    this.canvas = canvas;
    this.camera = options.camera ?? new Camera();
    this.ratio = options.pixelRatio ?? Math.min(2, globalThis.devicePixelRatio || 1);
    this.ownDevice = !options.device;
  }

  /** A renderer drawing on `canvas`. Throws `GpuUnavailableError` without WebGPU. */
  static async create(canvas: HTMLCanvasElement | OffscreenCanvas, options: RendererOptions = {}): Promise<MapRenderer> {
    const r = new MapRenderer(canvas, options);
    r.gpu = options.device ? connectGpu(canvas, options.device) : await initGpu(canvas as HTMLCanvasElement);
    r.setup();
    return r;
  }

  private setup(): void {
    const { device } = this.gpu;
    device.lost.then((info) => {
      this.lost = true;
      if (!this.destroyed) console.error(`smaltgl: the GPU device was lost (${info.reason}): ${info.message}`);
    });
    this.arena = new UniformArena(device);
    this.viewBuffer = device.createBuffer({ label: 'smaltgl view', size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const viewLayout = device.createBindGroupLayout({
      label: 'smaltgl view',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }],
    });
    this.viewGroup = device.createBindGroup({ layout: viewLayout, entries: [{ binding: 0, resource: { buffer: this.viewBuffer } }] });
    const arena = this.arena;
    this.layerGpu = {
      device,
      format: this.gpu.format,
      samples: SAMPLES,
      viewLayout,
      get arena() {
        return arena;
      },
    };
    if (this.gpu.timestamps) {
      this.timer = {
        query: device.createQuerySet({ type: 'timestamp', count: 2 }),
        resolve: device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }),
        read: device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
        busy: false,
      };
    }
  }

  /** What layers and basemaps are attached with: the device, formats, view layout and uniform arena. */
  get layerContext(): LayerGpu {
    return this.layerGpu;
  }

  get device(): GPUDevice {
    return this.gpu.device;
  }

  /** The GPU can time frames on this adapter. */
  get gpuTiming(): boolean {
    return !!this.gpu.timestamps;
  }

  get pixelRatio(): number {
    return this.ratio;
  }

  /** Sizes the drawing to `width` × `height` CSS pixels (the canvas gets that times the pixel ratio). */
  resize(width: number, height: number, pixelRatio = this.ratio): void {
    this.ratio = pixelRatio;
    const w = Math.max(1, width), h = Math.max(1, height);
    this.camera.width = w;
    this.camera.height = h;
    const pw = Math.max(1, Math.round(w * this.ratio)), ph = Math.max(1, Math.round(h * this.ratio));
    if (this.canvas.width === pw && this.canvas.height === ph && this.color) return;
    this.canvas.width = pw;
    this.canvas.height = ph;
    this.color?.destroy();
    this.stencil?.destroy();
    this.pickTex?.destroy();
    const { device, format } = this.gpu;
    this.color = device.createTexture({ label: 'smaltgl colour', size: [pw, ph], format, sampleCount: SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.stencil = device.createTexture({ label: 'smaltgl stencil', size: [pw, ph], format: STENCIL_FORMAT, sampleCount: SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.pickTex = device.createTexture({ label: 'smaltgl pick', size: [pw, ph], format: 'r32uint', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    this.pickRead ??= device.createBuffer({ label: 'smaltgl pick read', size: 256, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.redraw();
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Layers and basemap

  /** Sets the basemap (or none); the one it replaces is destroyed. Passing the current one again redraws it. */
  setBasemap(basemap: MapBasemap | null): void {
    if (basemap !== this.basemap) {
      this.basemap?.destroy();
      this.basemap = basemap;
      basemap?.attach(this.layerGpu, () => this.redraw());
    }
    this.redraw();
  }

  getBasemap(): MapBasemap | null {
    return this.basemap;
  }

  addLayer(layer: Layer): Layer {
    if (this.layers.some((l) => l.id === layer.id)) throw new Error(`A layer with id ${layer.id} is already on the map`);
    layer.attach(this.layerGpu, () => this.redraw());
    this.layers.push(layer);
    this.redraw();
    return layer;
  }

  /** Removes and destroys a layer; returns it, or undefined if it wasn't there. */
  removeLayer(layer: Layer | string): Layer | undefined {
    const i = this.layers.findIndex((l) => l === layer || l.id === layer);
    if (i < 0) return undefined;
    const [l] = this.layers.splice(i, 1);
    l.destroy();
    this.redraw();
    return l;
  }

  /** Replaces every layer, destroying the old ones that are not in the new list. */
  setLayers(layers: readonly Layer[]): void {
    for (const l of this.layers) if (!layers.includes(l)) l.destroy();
    const keep = new Set(this.layers);
    this.layers = [];
    for (const l of layers) {
      if (keep.has(l)) this.layers.push(l);
      else this.addLayer(l);
    }
    this.redraw();
  }

  getLayers(): readonly Layer[] {
    return this.layers;
  }

  /** World bounds of every layer's data. */
  dataBounds(): Bounds | undefined {
    let out: Bounds | undefined;
    for (const l of this.layers) {
      const b = l.bounds;
      if (!b) continue;
      out = out ? [Math.min(out[0], b[0]), Math.min(out[1], b[1]), Math.max(out[2], b[2]), Math.max(out[3], b[3])] : [...b];
    }
    return out;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Frames

  /** Asks for a frame (at most one per display refresh). */
  redraw(): void {
    if (this.frameRequested || this.destroyed) return;
    this.frameRequested = requestAnimationFrame((now) => {
      this.frameRequested = 0;
      this.frame(now);
    });
  }

  /** Draws a frame now and resolves when the GPU has finished it. */
  async renderNow(): Promise<void> {
    this.frame(performance.now());
    await this.gpu.device.queue.onSubmittedWorkDone();
  }

  /** Resolves when the basemap has every tile in view (or after `timeoutMs`) and the frame is finished. */
  async idle(timeoutMs = 30000): Promise<void> {
    const t0 = performance.now();
    for (;;) {
      await this.renderNow();
      if (!this.basemap || this.basemap.idle || performance.now() - t0 > timeoutMs) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    // Labels place against the finished tiles.
    await this.renderNow();
  }

  /** What is drawn at (x, y) in CSS pixels: read from the next frame's picking pass. */
  pick(x: number, y: number): Promise<Picked | null> {
    return new Promise((resolve) => {
      // The latest position wins; everyone waiting gets its answer.
      const waiting = this.pickQueue?.resolve ?? [];
      this.pickQueue = { x, y, resolve: [...waiting, resolve] };
      this.redraw();
    });
  }

  private frame(now: number): void {
    if (this.destroyed || this.lost || !this.color) return;
    const t0 = performance.now();
    const { device, context } = this.gpu;
    this.arena.reset();
    const time = (now - this.start) / 1000;
    device.queue.writeBuffer(this.viewBuffer, 0, this.camera.shaderView(this.ratio, time));
    const encoder = device.createCommandEncoder({ label: 'smaltgl frame' });
    const frame: Frame = {
      camera: this.camera,
      pixelRatio: this.ratio,
      time,
      viewGroup: this.viewGroup,
      encoder,
      width: this.canvas.width,
      height: this.canvas.height,
      dark: !!this.basemap?.dark,
    };
    for (const l of this.layers) if (l.visible) l.prepare?.(frame);
    const bg = this.basemap?.background ?? [0, 0, 0, 0];
    const timing = !!this.timer && !this.timer.busy;
    const pass = encoder.beginRenderPass({
      label: 'smaltgl map',
      colorAttachments: [
        {
          view: this.color.createView(),
          resolveTarget: context.getCurrentTexture().createView(),
          clearValue: { r: bg[0] * bg[3], g: bg[1] * bg[3], b: bg[2] * bg[3], a: bg[3] },
          loadOp: 'clear',
          storeOp: 'discard',
        },
      ],
      depthStencilAttachment: {
        view: this.stencil!.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
        stencilClearValue: 0,
        stencilLoadOp: 'clear',
        stencilStoreOp: 'discard',
      },
      ...(timing ? { timestampWrites: { querySet: this.timer!.query, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {}),
    });
    pass.setViewport(0, 0, this.canvas.width, this.canvas.height, 0, 1);
    this.basemap?.draw(pass, frame);
    let objects = 0;
    for (const l of this.layers) {
      if (!l.visible) continue;
      l.draw(pass, frame);
      objects += l.count;
    }
    this.basemap?.drawLabels(pass, frame);
    pass.end();
    if (timing) {
      encoder.resolveQuerySet(this.timer!.query, 0, 2, this.timer!.resolve, 0);
      encoder.copyBufferToBuffer(this.timer!.resolve, 0, this.timer!.read, 0, 16);
    }
    const pick = this.pickQueue && !this.pickBusy ? this.pickQueue : undefined;
    if (pick) this.encodePick(encoder, frame, pick.x, pick.y);
    this.arena.flush();
    device.queue.submit([encoder.finish()]);
    if (pick) {
      this.pickQueue = undefined;
      void this.readPick(pick);
    }
    if (timing) void this.readTimer();

    this.stats.cpuMs = performance.now() - t0;
    this.stats.objects = objects;
    this.stats.frames++;
    this.stats.tilesPending = this.basemap?.pending ?? 0;
    this.fpsWindow.push(now);
    while (this.fpsWindow.length && this.fpsWindow[0] < now - 1000) this.fpsWindow.shift();
    this.stats.fps = this.fpsWindow.length;
    this.onFrame?.(this.stats);
    if (this.arena.overflowed || this.pickQueue || this.layers.some((l) => l.visible && l.animating)) this.redraw();
  }

  private encodePick(encoder: GPUCommandEncoder, frame: Frame, x: number, y: number): void {
    const px = Math.max(0, Math.min(this.canvas.width - 1, Math.floor(x * this.ratio)));
    const py = Math.max(0, Math.min(this.canvas.height - 1, Math.floor(y * this.ratio)));
    const pass = encoder.beginRenderPass({
      label: 'smaltgl pick',
      colorAttachments: [{ view: this.pickTex!.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setViewport(0, 0, this.canvas.width, this.canvas.height, 0, 1);
    // Only the pixel under the pointer is shaded.
    pass.setScissorRect(px, py, 1, 1);
    this.layers.forEach((l, i) => {
      if (l.visible && l.pick) l.pick(pass, frame, i + 1);
    });
    pass.end();
    encoder.copyTextureToBuffer({ texture: this.pickTex!, origin: [px, py] }, { buffer: this.pickRead!, bytesPerRow: 256 }, [1, 1]);
  }

  private async readPick(p: { x: number; y: number; resolve: ((p: Picked | null) => void)[] }): Promise<void> {
    this.pickBusy = true;
    let picked: Picked | null = null;
    try {
      await this.pickRead!.mapAsync(GPUMapMode.READ);
      const id = new Uint32Array(this.pickRead!.getMappedRange(0, 4))[0];
      this.pickRead!.unmap();
      if (id) {
        const layer = this.layers[(id >>> 24) - 1];
        const index = (id & 0xffffff) - 1;
        if (layer) picked = { layer: layer.id, index, properties: layer.describe?.(index) ?? {}, lngLat: this.camera.lngLatAt(p.x, p.y) };
      }
    } catch {
      // Destroyed while reading.
    } finally {
      this.pickBusy = false;
    }
    for (const r of p.resolve) r(picked);
  }

  private async readTimer(): Promise<void> {
    const t = this.timer!;
    t.busy = true;
    try {
      await t.read.mapAsync(GPUMapMode.READ);
      const [a, b] = new BigUint64Array(t.read.getMappedRange(0, 16));
      t.read.unmap();
      if (b > a) this.stats.gpuMs = Number(b - a) / 1e6;
    } catch {
      // Destroyed.
    } finally {
      t.busy = false;
    }
  }

  /** Destroys the layers, the basemap and the GPU resources (and the device, unless it was passed in). */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frameRequested) cancelAnimationFrame(this.frameRequested);
    for (const l of this.layers) l.destroy();
    this.basemap?.destroy();
    for (const t of [this.color, this.stencil, this.pickTex]) t?.destroy();
    this.pickRead?.destroy();
    this.viewBuffer?.destroy();
    this.arena?.buffer.destroy();
    if (this.ownDevice) this.gpu.device.destroy();
    else this.gpu.context.unconfigure();
  }
}
