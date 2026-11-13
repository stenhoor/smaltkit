/**
 * Arcs between pairs of points: flights, migrations, deliveries. Each arc is one instance; the vertex shader builds
 * its curve (a raised arc on screen, or the great circle) from 32 segments, so a million arcs cost one draw call.
 * With `animate`, dashes flow from source to target, driven by the frame time alone.
 */
import { BLEND_ADD, BLEND_OVER, NO_STENCIL, VIEW_WGSL } from '../core/gpu.js';
import { parseColor } from '../core/color.js';
import { projectColumns, type Bounds, type Projected } from '../core/mercator.js';
import { describeRow, emptyStorage, FILTER_WGSL, filterUniforms, makeRamp, PICK_TARGET, premul, resolveColor, storageEntry, storageOf, type Ramp, type ResolvedColor } from './common.js';
import { Selection, selectionWgsl } from './common.js';
import { autoId, originOffset, RAMP_WGSL, type ColorSpec, type Frame, type GpuFilter, type Layer, type LayerGpu } from './layer.js';

export interface ArcData {
  readonly sourceLng: ArrayLike<number>;
  readonly sourceLat: ArrayLike<number>;
  readonly targetLng: ArrayLike<number>;
  readonly targetLat: ArrayLike<number>;
}

export interface ArcOptions {
  readonly id?: string;
  readonly data: ArcData;
  /** The source end's colour, or a column through a ramp (the whole arc). */
  readonly color?: ColorSpec;
  /** The target end's colour (a gradient along the arc); default: the source colour. */
  readonly targetColor?: string;
  /** Width in pixels (default 1.5). */
  readonly width?: number;
  /** Arc height as a fraction of its length on screen (default 0.25; 0 for straight lines). */
  readonly height?: number;
  /** Follow great circles (long routes on a world map). */
  readonly greatCircle?: boolean;
  /** Dashes flowing from source to target. */
  readonly animate?: boolean | { readonly speed?: number };
  readonly opacity?: number;
  readonly additive?: boolean;
  readonly filters?: readonly GpuFilter[];
  readonly properties?: Readonly<Record<string, ArrayLike<unknown>>>;
  readonly visible?: boolean;
}

const SEGMENTS = 32;

const WGSL = /* wgsl */ `
${VIEW_WGSL}
struct U {
  offset: vec2f, width: f32, height: f32,
  color: vec4f,
  toColor: vec4f,
  fa: vec3f, hasColor: f32,
  fb: vec3f, great: f32,
  camera: vec2f, animate: f32, speed: f32,
  opacity: f32, slot: f32, highlight: f32, selOn: f32,
};
@group(1) @binding(0) var<uniform> u: U;
${RAMP_WGSL}
@group(1) @binding(3) var<storage, read> ends: array<vec4f>;
@group(1) @binding(4) var<storage, read> lnglat: array<vec4f>;
@group(1) @binding(5) var<storage, read> colorT: array<f32>;
@group(1) @binding(6) var<storage, read> filterA: array<f32>;
@group(1) @binding(7) var<storage, read> filterB: array<f32>;
${selectionWgsl(8)}
${FILTER_WGSL}
const SEG = ${SEGMENTS}u;
const PI = 3.14159265358979;

// A point along the arc at t, in pixels from the screen centre.
fn along(i: u32, t: f32, a: vec2f, b: vec2f) -> vec2f {
  if (u.great > 0.5) {
    // Spherical interpolation between the ends, then Web Mercator; relative to the camera in world units.
    let ll = lnglat[i];
    let p0 = vec3f(cos(ll.y) * cos(ll.x), cos(ll.y) * sin(ll.x), sin(ll.y));
    let p1 = vec3f(cos(ll.w) * cos(ll.z), cos(ll.w) * sin(ll.z), sin(ll.w));
    let w = acos(clamp(dot(p0, p1), -1.0, 1.0));
    var p = p0;
    if (w > 1e-5) { p = (sin((1.0 - t) * w) * p0 + sin(t * w) * p1) / sin(w); }
    let lng = atan2(p.y, p.x);
    let lat = clamp(asin(clamp(p.z, -1.0, 1.0)), -1.4844, 1.4844);
    let world = vec2f((lng + PI) / (2.0 * PI), 0.5 - log(tan(PI / 4.0 + lat / 2.0)) / (2.0 * PI));
    return toPixels(world - u.camera);
  }
  let pa = toPixels(a + u.offset);
  let pb = toPixels(b + u.offset);
  let d = pb - pa;
  let n = vec2f(-d.y, d.x);
  return mix(pa, pb, t) + n * u.height * 4.0 * t * (1.0 - t);
}

struct V {
  @builtin(position) p: vec4f,
  @location(0) side: f32,
  @location(1) t: f32,
  @location(2) @interpolate(flat) color0: vec4f,
  @location(3) @interpolate(flat) color1: vec4f,
  @location(4) @interpolate(flat) id: u32,
  @location(5) @interpolate(flat) seam: f32,
};

@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) i: u32) -> V {
  var o: V;
  if (!passes(i, u.fa, u.fb)) { o.p = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
  let seg = vi / 6u;
  let k = vi % 6u;
  let e = ends[i];
  let t0 = f32(seg) / f32(SEG);
  let t1 = f32(seg + 1u) / f32(SEG);
  let p0 = along(i, t0, e.xy, e.zw);
  let p1 = along(i, t1, e.xy, e.zw);
  var dir = p1 - p0;
  let len = length(dir);
  // A great circle that crosses the antimeridian jumps across the map: hide that segment.
  o.seam = select(0.0, 1.0, u.great > 0.5 && len > view.scale * 0.5);
  if (len > 1e-6) { dir = dir / len; } else { dir = vec2f(1.0, 0.0); }
  let n = vec2f(-dir.y, dir.x);
  var w = u.width;
  if (f32(i) == u.highlight) { w = w + 2.0; }
  let hw = w * 0.5 + 1.0;
  let ends2 = array<f32, 6>(0.0, 1.0, 0.0, 0.0, 1.0, 1.0);
  let sides = array<f32, 6>(-1.0, -1.0, 1.0, 1.0, -1.0, 1.0);
  let t = ends2[k];
  // Extend each piece by half a pixel along the curve so neighbours overlap without gaps.
  let p = mix(p0 - dir * 0.5, p1 + dir * 0.5, t) + n * sides[k] * hw;
  o.p = pixelsToClip(p);
  o.side = sides[k] * hw;
  o.t = mix(t0, t1, t);
  var c0 = u.color;
  var c1 = u.toColor;
  if (u.hasColor > 0.5) { c0 = ramp(colorT[i]); c1 = c0; }
  if (f32(i) == u.highlight) { c0 = vec4f(mix(c0.rgb, vec3f(1.0), 0.3), 1.0); c1 = c0; }
  let sa = selectionAlpha(i, u.selOn);
  o.color0 = vec4f(c0.rgb, c0.a * sa);
  o.color1 = vec4f(c1.rgb, c1.a * sa);
  o.id = i;
  return o;
}

fn coverage(v: V) -> f32 {
  var w = u.width;
  if (f32(v.id) == u.highlight) { w = w + 2.0; }
  return clamp(max(w, 1.0) * 0.5 - abs(v.side) + 0.5, 0.0, 1.0) * min(w, 1.0);
}

@fragment fn fs(v: V) -> @location(0) vec4f {
  if (v.seam > 0.5) { discard; }
  var a = coverage(v);
  if (u.animate > 0.5) {
    // Dashes: a bright head fading back along the arc, moving from source to target.
    let phase = fract(v.t * 4.0 - view.time * u.speed + f32(v.id % 97u) * 0.173);
    a = a * (0.25 + 0.75 * smoothstep(0.0, 1.0, phase));
  }
  if (a <= 0.0) { discard; }
  let c = mix(v.color0, v.color1, v.t);
  return vec4f(c.rgb * c.a, c.a) * a * u.opacity;
}

@fragment fn fsPick(v: V) -> @location(0) u32 {
  if (v.seam > 0.5 || abs(v.side) > max(u.width, 3.0) * 0.5 + 1.0) { discard; }
  return (u32(u.slot) << 24u) | (v.id + 1u);
}
`;

export class ArcLayer implements Layer {
  readonly id: string;
  visible: boolean;
  readonly count: number;
  readonly bounds: Bounds;
  readonly origin: readonly [number, number];
  filters: GpuFilter[];
  private opts: ArcOptions;
  private col: ResolvedColor;
  private ends: Float32Array;
  private lnglat: Float32Array;
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

  constructor(options: ArcOptions) {
    this.opts = options;
    this.id = options.id ?? autoId('arcs');
    this.visible = options.visible ?? true;
    const d = options.data;
    const src: Projected = projectColumns(d.sourceLng, d.sourceLat);
    const tgt: Projected = projectColumns(d.targetLng, d.targetLat, src.origin);
    this.origin = src.origin;
    this.count = Math.min(src.count, tgt.count);
    this.bounds = [Math.min(src.bounds[0], tgt.bounds[0]), Math.min(src.bounds[1], tgt.bounds[1]), Math.max(src.bounds[2], tgt.bounds[2]), Math.max(src.bounds[3], tgt.bounds[3])];
    this.ends = new Float32Array(this.count * 4);
    this.lnglat = new Float32Array(this.count * 4);
    const R = Math.PI / 180;
    for (let i = 0; i < this.count; i++) {
      this.ends.set([src.positions[2 * i], src.positions[2 * i + 1], tgt.positions[2 * i], tgt.positions[2 * i + 1]], i * 4);
      this.lnglat.set([d.sourceLng[i] * R, d.sourceLat[i] * R, d.targetLng[i] * R, d.targetLat[i] * R], i * 4);
    }
    this.col = resolveColor(options.color, '#0E7FAE');
    this.filters = [...(options.filters ?? [])];
  }

  get legend(): ResolvedColor {
    return this.col;
  }

  get animating(): boolean {
    return !!this.opts.animate;
  }

  /** Changes how arcs look without re-uploading them. */
  update(changes: Partial<Pick<ArcOptions, 'width' | 'height' | 'greatCircle' | 'animate' | 'opacity' | 'targetColor'>>): void {
    this.opts = { ...this.opts, ...changes };
    this.redraw();
  }

  attach(gpu: LayerGpu, redraw: () => void): void {
    this.gpu = gpu;
    this.redraw = redraw;
    const { device } = gpu;
    const V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT;
    this.layout = device.createBindGroupLayout({ entries: [...baseLayout(V | F), ...[3, 4, 5, 6, 7, 8].map((b) => storageEntry(b, V))] });
    const module = device.createShaderModule({ label: 'arcs', code: WGSL });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [gpu.viewLayout, this.layout] });
    this.pipe = device.createRenderPipeline({
      label: 'arcs',
      layout: pl,
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: gpu.format, blend: this.opts.additive ? BLEND_ADD : BLEND_OVER }] },
      depthStencil: NO_STENCIL,
      multisample: { count: gpu.samples },
    });
    this.pickPipe = device.createRenderPipeline({ label: 'arcs pick', layout: pl, vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fsPick', targets: [PICK_TARGET] } });
    const empty = emptyStorage(device);
    this.buffers = [
      storageOf(device, this.ends, empty, 'arc ends'),
      storageOf(device, this.lnglat, empty, 'arc lnglat'),
      storageOf(device, this.col.t, empty, 'arc colour'),
      storageOf(device, this.filters[0]?.values, empty, 'arc filter A'),
      storageOf(device, this.filters[1]?.values, empty, 'arc filter B'),
      empty,
    ];
    this.ramp = makeRamp(device, this.col.table);
    this.selection = new Selection(device, emptyStorage(device));
    if (this.pendingSelection !== undefined) this.selection.set(this.pendingSelection);
  }

  setFilter(index: number, range: [number, number]): void {
    const f = this.filters[index];
    if (f) f.range = range;
    this.redraw();
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
    const c = premul(this.col.color);
    const tc = o.targetColor ? parseColor(o.targetColor) : this.col.color;
    const [fa0, fa1, fa2, fb0, fb1, fb2] = filterUniforms(this.filters);
    const speed = typeof o.animate === 'object' ? (o.animate.speed ?? 0.5) : 0.5;
    return [
      ox, oy, o.width ?? 1.5, o.height ?? 0.25,
      ...c,
      ...tc,
      fa0, fa1, fa2, this.col.mode,
      fb0, fb1, fb2, o.greatCircle ? 1 : 0,
      frame.camera.x, frame.camera.y, o.animate ? 1 : 0, speed,
      o.opacity ?? 0.8, slot, this.highlighted, this.selection?.active ? 1 : 0,
    ];
  }

  draw(pass: GPURenderPassEncoder, frame: Frame): void {
    if (!this.visible || !this.count) return;
    const off = this.gpu!.arena.push(this.uniforms(frame, 0));
    pass.setPipeline(this.pipe!);
    pass.setBindGroup(0, frame.viewGroup);
    pass.setBindGroup(1, this.bind(), [off]);
    pass.draw(SEGMENTS * 6, this.count);
  }

  pick(pass: GPURenderPassEncoder, frame: Frame, slot: number): void {
    if (!this.visible || !this.count) return;
    const off = this.gpu!.arena.push(this.uniforms(frame, slot));
    pass.setPipeline(this.pickPipe!);
    pass.setBindGroup(0, frame.viewGroup);
    pass.setBindGroup(1, this.bind(), [off]);
    pass.draw(SEGMENTS * 6, this.count);
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

function baseLayout(visibility: number): GPUBindGroupLayoutEntry[] {
  return [
    { binding: 0, visibility, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 256 } },
    { binding: 1, visibility, texture: { sampleType: 'float' } },
    { binding: 2, visibility, sampler: { type: 'filtering' } },
  ];
}

/** Arcs between pairs of points. */
export const arcs = (options: ArcOptions): ArcLayer => new ArcLayer(options);
