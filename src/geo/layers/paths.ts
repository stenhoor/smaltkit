/**
 * Paths, and trips over time: vehicle traces, ship tracks, walks. Each segment is a rounded capsule drawn by the GPU.
 * With timestamps and `time`, only what has happened by then is drawn, fading over `trail`, and the head of each trip
 * moves smoothly along its current segment: playback is a single uniform per frame.
 */
import { BLEND_ADD, BLEND_OVER, NO_STENCIL, VIEW_WGSL } from '../core/gpu.js';
import { projectColumns, type Bounds } from '../core/mercator.js';
import { describeRow, emptyStorage, makeRamp, PICK_TARGET, premul, resolveColor, storageEntry, storageOf, type Ramp, type ResolvedColor } from './common.js';
import { Selection, selectionWgsl } from './common.js';
import { autoId, extent, originOffset, RAMP_WGSL, type ColorSpec, type Frame, type Layer, type LayerGpu } from './layer.js';

export interface PathData {
  /** Where each path starts in the point columns, plus the end: paths.length + 1 offsets. */
  readonly starts: ArrayLike<number>;
  readonly lng: ArrayLike<number>;
  readonly lat: ArrayLike<number>;
  /** A time per point (any unit; seconds are usual), for trips. */
  readonly times?: ArrayLike<number>;
}

export interface PathOptions {
  readonly id?: string;
  readonly data: PathData;
  /** A CSS colour, or a column with a value per path through a ramp. */
  readonly color?: ColorSpec;
  /** Width in pixels (default 2). */
  readonly width?: number;
  readonly opacity?: number;
  readonly additive?: boolean;
  /** Trips: draw what has happened by this time (the times' unit). Omit to draw whole paths. */
  readonly time?: number;
  /** Trips: how long a trail stays visible (default: a tenth of the time span). */
  readonly trail?: number;
  /** Columns with a value per path, shown when a path is hovered. */
  readonly properties?: Readonly<Record<string, ArrayLike<unknown>>>;
  readonly visible?: boolean;
}

const WGSL = /* wgsl */ `
${VIEW_WGSL}
struct U {
  offset: vec2f, width: f32, opacity: f32,
  color: vec4f,
  hasColor: f32, trips: f32, time: f32, trail: f32,
  slot: f32, highlight: f32, selOn: f32, pad1: f32,
};
@group(1) @binding(0) var<uniform> u: U;
${RAMP_WGSL}
@group(1) @binding(3) var<storage, read> pos: array<vec2f>;
@group(1) @binding(4) var<storage, read> times: array<f32>;
@group(1) @binding(5) var<storage, read> segStart: array<u32>;
@group(1) @binding(6) var<storage, read> segPath: array<u32>;
@group(1) @binding(7) var<storage, read> colorT: array<f32>;
${selectionWgsl(8)}
struct V {
  @builtin(position) p: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) len: f32,
  @location(2) @interpolate(flat) color: vec4f,
  @location(3) @interpolate(flat) path: u32,
  @location(4) @interpolate(flat) w: f32,
};
const C = array<vec2f, 6>(vec2f(0, -1), vec2f(1, -1), vec2f(0, 1), vec2f(0, 1), vec2f(1, -1), vec2f(1, 1));
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) s: u32) -> V {
  var o: V;
  let i = segStart[s];
  let path = segPath[s];
  var a = pos[i];
  var b = pos[i + 1u];
  var fade = 1.0;
  if (u.trips > 0.5) {
    let ta = times[i];
    let tb = times[i + 1u];
    // Not started yet, or long gone.
    if (ta > u.time || tb < u.time - u.trail) { o.p = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
    // The head: cut the segment where the trip is now.
    if (tb > u.time) { b = mix(a, b, clamp((u.time - ta) / max(1e-9, tb - ta), 0.0, 1.0)); }
    fade = clamp(1.0 - (u.time - min(tb, u.time)) / max(1e-9, u.trail), 0.0, 1.0);
  }
  let pa = toPixels(a + u.offset);
  let pb = toPixels(b + u.offset);
  let d = pb - pa;
  let len = length(d);
  var dir = vec2f(1.0, 0.0);
  if (len > 1e-6) { dir = d / len; }
  let n = vec2f(-dir.y, dir.x);
  var w = u.width;
  if (f32(path) == u.highlight) { w = w + 2.0; }
  let hw = max(w, 1.0) * 0.5 + 1.0;
  let c = C[vi];
  let along = select(-hw, len + hw, c.x > 0.5);
  o.p = pixelsToClip(pa + dir * along + n * c.y * hw);
  o.local = vec2f(along, c.y * hw);
  o.len = len;
  var col = u.color;
  if (u.hasColor > 0.5) { col = ramp(colorT[path]); }
  if (f32(path) == u.highlight) { col = vec4f(mix(col.rgb, vec3f(1.0), 0.3), 1.0); }
  o.color = vec4f(col.rgb * col.a, col.a) * u.opacity * fade * selectionAlpha(path, u.selOn);
  o.path = path;
  o.w = w;
  return o;
}
fn dist(v: V) -> f32 {
  if (v.local.x < 0.0) { return length(v.local); }
  if (v.local.x > v.len) { return length(vec2f(v.local.x - v.len, v.local.y)); }
  return abs(v.local.y);
}
@fragment fn fs(v: V) -> @location(0) vec4f {
  let a = clamp(max(v.w, 1.0) * 0.5 - dist(v) + 0.5, 0.0, 1.0) * min(v.w, 1.0);
  if (a <= 0.0) { discard; }
  return v.color * a;
}
@fragment fn fsPick(v: V) -> @location(0) u32 {
  if (dist(v) > max(v.w, 4.0) * 0.5) { discard; }
  return (u32(u.slot) << 24u) | (v.path + 1u);
}
`;

export class PathLayer implements Layer {
  readonly id: string;
  visible: boolean;
  /** Segments. */
  readonly count: number;
  readonly paths: number;
  readonly bounds: Bounds;
  readonly origin: readonly [number, number];
  /** The first and last timestamps, for a time slider. */
  readonly timeRange: readonly [number, number];
  private opts: PathOptions;
  private col: ResolvedColor;
  private positions: Float32Array;
  private times?: Float32Array;
  private segStart: Uint32Array;
  private segPath: Uint32Array;
  private gpu?: LayerGpu;
  private pipe?: GPURenderPipeline;
  private pickPipe?: GPURenderPipeline;
  private layout?: GPUBindGroupLayout;
  private group?: GPUBindGroup;
  private groupVersion = -1;
  private buffers: GPUBuffer[] = [];
  private ramp?: Ramp;
  private highlighted = -1;
  private redraw: () => void = () => {};
  private timeBase = 0;
  /** Playing: seconds of data time per second of real time (set by `play`). */
  private playback?: { speed: number; last: number; loop: boolean };

  constructor(options: PathOptions) {
    this.opts = options;
    this.id = options.id ?? autoId('paths');
    this.visible = options.visible ?? true;
    const d = options.data;
    const p = projectColumns(d.lng, d.lat);
    this.positions = p.positions;
    this.origin = p.origin;
    this.bounds = p.bounds;
    const n = d.starts.length - 1;
    this.paths = Math.max(0, n);
    let segs = 0;
    for (let k = 0; k < n; k++) segs += Math.max(0, d.starts[k + 1] - d.starts[k] - 1);
    this.segStart = new Uint32Array(segs);
    this.segPath = new Uint32Array(segs);
    let s = 0;
    for (let k = 0; k < n; k++)
      for (let i = d.starts[k]; i < d.starts[k + 1] - 1; i++) {
        this.segStart[s] = i;
        this.segPath[s++] = k;
      }
    this.count = segs;
    if (d.times) {
      // Times as offsets from the first, so float32 keeps sub-second precision over long spans.
      const [t0, t1] = extent(d.times);
      this.timeBase = t0;
      this.times = new Float32Array(d.times.length);
      for (let i = 0; i < d.times.length; i++) this.times[i] = d.times[i] - t0;
      this.timeRange = [t0, t1];
    } else this.timeRange = [0, 0];
    this.col = resolveColor(options.color, '#E5622F');
  }

  get legend(): ResolvedColor {
    return this.col;
  }

  get time(): number | undefined {
    return this.opts.time;
  }

  get animating(): boolean {
    return !!this.playback;
  }

  /** Moves the trips to a time and redraws. */
  setTime(time: number): void {
    this.opts = { ...this.opts, time };
    this.redraw();
  }

  /** Plays the trips at `speed` data-time units per second, looping over the time range by default. */
  play(speed: number, loop = true): void {
    this.playback = { speed, last: performance.now(), loop };
    if (this.opts.time === undefined) this.opts = { ...this.opts, time: this.timeRange[0] };
    this.redraw();
  }

  pause(): void {
    this.playback = undefined;
  }

  update(changes: Partial<Pick<PathOptions, 'width' | 'opacity' | 'trail'>>): void {
    this.opts = { ...this.opts, ...changes };
    this.redraw();
  }

  attach(gpu: LayerGpu, redraw: () => void): void {
    this.gpu = gpu;
    this.redraw = redraw;
    const { device } = gpu;
    const V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT;
    this.layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: V | F, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 256 } },
        { binding: 1, visibility: V | F, texture: { sampleType: 'float' } },
        { binding: 2, visibility: V | F, sampler: { type: 'filtering' } },
        ...[3, 4, 5, 6, 7, 8].map((b) => storageEntry(b, V)),
      ],
    });
    const module = device.createShaderModule({ label: 'paths', code: WGSL });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [gpu.viewLayout, this.layout] });
    this.pipe = device.createRenderPipeline({
      label: 'paths',
      layout: pl,
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: gpu.format, blend: this.opts.additive ? BLEND_ADD : BLEND_OVER }] },
      depthStencil: NO_STENCIL,
      multisample: { count: gpu.samples },
    });
    this.pickPipe = device.createRenderPipeline({ label: 'paths pick', layout: pl, vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fsPick', targets: [PICK_TARGET] } });
    const empty = emptyStorage(device);
    this.buffers = [
      storageOf(device, this.positions, empty, 'path positions'),
      storageOf(device, this.times, empty, 'path times'),
      storageOf(device, this.segStart, empty, 'path segments'),
      storageOf(device, this.segPath, empty, 'path ids'),
      storageOf(device, this.col.t, empty, 'path colour'),
      empty,
    ];
    this.ramp = makeRamp(device, this.col.table);
    this.selection = new Selection(device, emptyStorage(device));
    if (this.pendingSelection !== undefined) this.selection.set(this.pendingSelection);
  }

  private selection?: Selection;
  private selectionVersion = -1;
  private pendingSelection?: Uint8Array | null;

  /** Selected rows (a byte each, non-zero for selected), or null: unselected ones are dimmed. */
  setSelection(mask: Uint8Array | null): void {
    if (this.selection) this.selection.set(mask);
    else this.pendingSelection = mask;
    this.redraw();
  }

  private bind(): GPUBindGroup {
    const gpu = this.gpu!;
    if (!this.group || this.groupVersion !== gpu.arena.version || this.selectionVersion !== this.selection!.version) {
      this.group = gpu.device.createBindGroup({
        layout: this.layout!,
        entries: [
          { binding: 0, resource: { buffer: gpu.arena.buffer, size: 256 } },
          { binding: 1, resource: this.ramp!.texture.createView() },
          { binding: 2, resource: this.ramp!.sampler },
          ...this.buffers.slice(0, 5).map((buffer, k) => ({ binding: 3 + k, resource: { buffer } })),
          { binding: 8, resource: { buffer: this.selection!.buffer } },
        ],
      });
      this.groupVersion = gpu.arena.version;
      this.selectionVersion = this.selection!.version;
    }
    return this.group;
  }

  private uniforms(frame: Frame, slot: number): number[] {
    const o = this.opts;
    const [ox, oy] = originOffset(this.origin, frame.camera);
    const trips = o.time !== undefined && !!this.times;
    const span = this.timeRange[1] - this.timeRange[0];
    return [
      ox, oy, o.width ?? 2, o.opacity ?? 0.9,
      ...premul(this.col.color),
      this.col.mode, trips ? 1 : 0, (o.time ?? 0) - this.timeBase, o.trail ?? Math.max(1e-6, span / 10),
      slot, this.highlighted, this.selection?.active ? 1 : 0, 0,
    ];
  }

  prepare(): void {
    const pb = this.playback;
    if (!pb) return;
    const now = performance.now();
    let t = (this.opts.time ?? this.timeRange[0]) + ((now - pb.last) / 1000) * pb.speed;
    pb.last = now;
    if (t > this.timeRange[1]) {
      if (pb.loop) t = this.timeRange[0];
      else {
        t = this.timeRange[1];
        this.playback = undefined;
      }
    }
    this.opts = { ...this.opts, time: t };
    this.onTime?.(t);
  }

  /** Called with the trip time on every played frame (for a slider). */
  onTime?: (time: number) => void;

  draw(pass: GPURenderPassEncoder, frame: Frame): void {
    if (!this.visible || !this.count) return;
    const off = this.gpu!.arena.push(this.uniforms(frame, 0));
    pass.setPipeline(this.pipe!);
    pass.setBindGroup(0, frame.viewGroup);
    pass.setBindGroup(1, this.bind(), [off]);
    pass.draw(6, this.count);
  }

  pick(pass: GPURenderPassEncoder, frame: Frame, slot: number): void {
    if (!this.visible || !this.count) return;
    const off = this.gpu!.arena.push(this.uniforms(frame, slot));
    pass.setPipeline(this.pickPipe!);
    pass.setBindGroup(0, frame.viewGroup);
    pass.setBindGroup(1, this.bind(), [off]);
    pass.draw(6, this.count);
  }

  describe(index: number): Record<string, unknown> {
    return describeRow(this.opts.properties, index);
  }

  highlight(index: number): void {
    this.highlighted = index;
  }

  destroy(): void {
    this.selection?.destroy();
    for (const b of new Set(this.buffers)) b.destroy();
    this.ramp?.texture.destroy();
  }
}

/** Paths, or trips played over time. */
export const paths = (options: PathOptions): PathLayer => new PathLayer(options);
/** Trips: paths with a time per point, drawn up to `time` with fading trails. */
export const trips = (options: PathOptions & { readonly data: PathData & { readonly times: ArrayLike<number> } }): PathLayer =>
  new PathLayer({ ...options, time: options.time ?? extent(options.data.times)[0] });
