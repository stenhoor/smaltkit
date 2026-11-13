/**
 * Polygons coloured by value (choropleths): districts, zones, catchments. Rings are triangulated once on the CPU
 * (triangulate.ts), then each frame is one indexed draw for the fills and one instanced draw for the outlines.
 */
import { BLEND_OVER, bufferFrom, DEPTH_TESTED, NO_STENCIL, VIEW_WGSL } from '../core/gpu.js';
import { parseColor } from '../core/color.js';
import { projectColumns, type Bounds } from '../core/mercator.js';
import { describeRow, emptyStorage, makeRamp, PICK_TARGET, premul, resolveColor, storageEntry, storageOf, type Ramp, type ResolvedColor } from './common.js';
import { Selection, selectionWgsl } from './common.js';
import { autoId, originOffset, RAMP_WGSL, type ColorSpec, type Frame, type GpuFilter, type Layer, type LayerGpu } from './layer.js';
import { triangulate } from './triangulate.js';

export interface PolygonData {
  /** Where each polygon's ring starts in the point columns, plus the end: polygons + 1 offsets. */
  readonly starts: ArrayLike<number>;
  readonly lng: ArrayLike<number>;
  readonly lat: ArrayLike<number>;
  /**
   * Where every ring starts in the point columns (outer rings and holes), when polygons have holes. A polygon's outer
   * ring starts at `starts[k]`; any other ring starting before `starts[k + 1]` is a hole in it.
   */
  readonly rings?: ArrayLike<number>;
}

export interface PolygonOptions {
  readonly id?: string;
  readonly data: PolygonData;
  /** A CSS colour, or a column with a value per polygon through a ramp. */
  readonly color?: ColorSpec;
  readonly opacity?: number;
  /** Outline colour and width in pixels (default: thin, in the map's halo colour). Width 0 for none. */
  readonly stroke?: { readonly color?: string; readonly width?: number };
  /** Raise polygons into blocks: a height in metres per polygon (`values` times `scale`), or one height for all. */
  readonly extrude?: { readonly values?: ArrayLike<number>; readonly scale?: number } | number;
  /** A filter with a value per polygon. */
  readonly filters?: readonly GpuFilter[];
  readonly properties?: Readonly<Record<string, ArrayLike<unknown>>>;
  readonly visible?: boolean;
}

const WGSL = /* wgsl */ `
${VIEW_WGSL}
struct U {
  offset: vec2f, opacity: f32, strokeWidth: f32,
  color: vec4f,
  stroke: vec4f,
  hasColor: f32, slot: f32, highlight: f32, hasFilter: f32,
  range: vec2f, extrude: f32, heightScale: f32,
  selOn: f32, sp0: f32, sp1: f32, sp2: f32,
};
@group(1) @binding(0) var<uniform> u: U;
${RAMP_WGSL}
@group(1) @binding(3) var<storage, read> colorT: array<f32>;
@group(1) @binding(4) var<storage, read> filterA: array<f32>;
@group(1) @binding(5) var<storage, read> heights: array<f32>;
${selectionWgsl(6)}
// Height in pixels: a value per polygon times the scale, or the scale alone.
fn heightOf(poly: u32) -> f32 {
  if (u.extrude < 0.5) { return 0.0; }
  if (u.extrude > 1.5) { return metresToPixels(max(0.0, heights[poly]) * u.heightScale); }
  return metresToPixels(u.heightScale);
}
fn colorOf(poly: u32) -> vec4f {
  var c = u.color;
  if (u.hasColor > 0.5) { c = ramp(colorT[poly]); }
  if (f32(poly) == u.highlight) { c = vec4f(mix(c.rgb, vec3f(1.0), 0.3), c.a); }
  return c;
}
fn hidden(poly: u32) -> bool {
  if (u.hasFilter > 0.5) { let v = filterA[poly]; return !(v >= u.range.x && v <= u.range.y); }
  return false;
}
struct F { @builtin(position) p: vec4f, @location(0) @interpolate(flat) color: vec4f, @location(1) @interpolate(flat) id: u32 };
@vertex fn vsFill(@location(0) p: vec2f, @location(1) poly: u32) -> F {
  var o: F;
  if (hidden(poly)) { o.p = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
  o.p = project(toPixels(p + u.offset), heightOf(poly));
  let c = colorOf(poly);
  let a = select(u.opacity, 1.0, u.extrude > 0.5);
  o.color = vec4f(c.rgb * c.a, c.a) * a * selectionAlpha(poly, u.selOn);
  o.id = poly;
  return o;
}
@fragment fn fsFill(v: F) -> @location(0) vec4f { return v.color; }
@fragment fn fsPick(v: F) -> @location(0) u32 { return (u32(u.slot) << 24u) | (v.id + 1u); }

struct L { @builtin(position) p: vec4f, @location(0) side: f32 };
const C = array<vec2f, 6>(vec2f(0, -1), vec2f(1, -1), vec2f(0, 1), vec2f(0, 1), vec2f(1, -1), vec2f(1, 1));
@vertex fn vsLine(@builtin(vertex_index) vi: u32, @location(0) seg: vec4f, @location(1) poly: u32) -> L {
  var o: L;
  if (hidden(poly) || u.strokeWidth <= 0.0) { o.p = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
  let a = toPixels(seg.xy + u.offset);
  let b = toPixels(seg.zw + u.offset);
  let d = b - a;
  let len = length(d);
  var dir = vec2f(1.0, 0.0);
  if (len > 1e-6) { dir = d / len; }
  let n = vec2f(-dir.y, dir.x);
  let hw = u.strokeWidth * 0.5 + 1.0;
  let c = C[vi];
  o.p = project(mix(a - dir * hw * 0.5, b + dir * hw * 0.5, c.x) + n * c.y * hw, heightOf(poly));
  o.side = c.y * hw;
  return o;
}
// Walls: a quad per outline segment, from the ground to the polygon's height, shaded by which way it faces.
struct W { @builtin(position) p: vec4f, @location(0) @interpolate(flat) color: vec4f };
@vertex fn vsWall(@builtin(vertex_index) vi: u32, @location(0) seg: vec4f, @location(1) poly: u32) -> W {
  var o: W;
  let h = heightOf(poly);
  if (hidden(poly) || h <= 0.0) { o.p = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
  let ends = array<f32, 6>(0.0, 1.0, 0.0, 0.0, 1.0, 1.0);
  let ups = array<f32, 6>(0.0, 0.0, 1.0, 1.0, 0.0, 1.0);
  let p = mix(seg.xy, seg.zw, ends[vi]);
  o.p = project(toPixels(p + u.offset), h * ups[vi]);
  let d = seg.zw - seg.xy;
  let n = normalize(vec2f(d.y, -d.x) + vec2f(1e-9));
  let shade = 0.6 + 0.3 * abs(dot(n, normalize(vec2f(-1.0, -1.0))));
  let c = colorOf(poly);
  o.color = vec4f(c.rgb * shade, 1.0) * selectionAlpha(poly, u.selOn);
  return o;
}
@fragment fn fsWall(v: W) -> @location(0) vec4f { return v.color; }

@fragment fn fsLine(v: L) -> @location(0) vec4f {
  let a = clamp(max(u.strokeWidth, 1.0) * 0.5 - abs(v.side) + 0.5, 0.0, 1.0) * min(u.strokeWidth, 1.0);
  return u.stroke * a;
}
`;

export class PolygonLayer implements Layer {
  readonly id: string;
  visible: boolean;
  readonly count: number;
  readonly bounds: Bounds;
  readonly origin: readonly [number, number];
  filters: GpuFilter[];
  private opts: PolygonOptions;
  private col: ResolvedColor;
  private verts: Float32Array;
  private vertPoly: Uint32Array;
  private index: Uint32Array;
  private segs: Float32Array;
  private segPoly: Uint32Array;
  private gpu?: LayerGpu;
  private fillPipe?: GPURenderPipeline;
  private linePipe?: GPURenderPipeline;
  private pickPipe?: GPURenderPipeline;
  private wallPipe?: GPURenderPipeline;
  private layout?: GPUBindGroupLayout;
  private group?: GPUBindGroup;
  private groupVersion = -1;
  private gpuBuffers: GPUBuffer[] = [];
  private ramp?: Ramp;
  private highlighted = -1;
  private redraw: () => void = () => {};

  constructor(options: PolygonOptions) {
    this.opts = options;
    this.id = options.id ?? autoId('polygons');
    this.visible = options.visible ?? true;
    const d = options.data;
    const p = projectColumns(d.lng, d.lat);
    this.origin = p.origin;
    this.bounds = p.bounds;
    this.verts = p.positions;
    const n = d.starts.length - 1;
    this.count = Math.max(0, n);
    this.vertPoly = new Uint32Array(p.count);
    const idx: number[] = [];
    const segs: number[] = [];
    const segPoly: number[] = [];
    // Ring boundaries: every polygon start, plus the hole starts when given.
    const bounds = Array.from(new Set([...Array.from(d.starts), ...(d.rings ? Array.from(d.rings) : [])])).sort((a, b) => a - b);
    let r = 0;
    for (let k = 0; k < n; k++) {
      const s = d.starts[k], e = d.starts[k + 1];
      for (let i = s; i < e; i++) this.vertPoly[i] = k;
      // The rings of this polygon: [start, end) pairs.
      const rings: [number, number][] = [];
      while (r < bounds.length && bounds[r] < s) r++;
      for (let q = r; q < bounds.length && bounds[q] < e; q++) rings.push([bounds[q], Math.min(e, bounds[q + 1] ?? e)]);
      if (!rings.length) continue;
      const [o0, o1] = rings[0];
      const holes = rings.slice(1).map(([a, b]) => [a, b - a] as const);
      for (const t of triangulate(p.positions, o0, o1 - o0, holes)) idx.push(t);
      for (const [a, b] of rings)
        for (let i = a; i < b; i++) {
          const j = i + 1 < b ? i + 1 : a;
          segs.push(p.positions[2 * i], p.positions[2 * i + 1], p.positions[2 * j], p.positions[2 * j + 1]);
          segPoly.push(k);
        }
    }
    this.index = Uint32Array.from(idx);
    this.segs = Float32Array.from(segs);
    this.segPoly = Uint32Array.from(segPoly);
    this.col = resolveColor(options.color, '#2F5BB7');
    this.filters = [...(options.filters ?? [])];
  }

  get legend(): ResolvedColor {
    return this.col;
  }

  update(changes: Partial<Pick<PolygonOptions, 'opacity' | 'stroke'>> & { extrude?: { scale?: number } | number }): void {
    // A height scale changes without re-uploading; switching extrusion on or off needs a new layer.
    if (changes.extrude !== undefined && typeof this.opts.extrude === 'object' && typeof changes.extrude === 'object') changes = { ...changes, extrude: { ...this.opts.extrude, ...changes.extrude } };
    this.opts = { ...this.opts, ...changes };
    this.redraw();
  }

  setFilter(index: number, range: [number, number]): void {
    const f = this.filters[index];
    if (f) f.range = range;
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
        storageEntry(3, V),
        storageEntry(4, V),
        storageEntry(5, V),
        storageEntry(6, V),
      ],
    });
    const module = device.createShaderModule({ label: 'polygons', code: WGSL });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [gpu.viewLayout, this.layout] });
    const fillBuffers: GPUVertexBufferLayout[] = [
      { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
      { arrayStride: 4, attributes: [{ shaderLocation: 1, offset: 0, format: 'uint32' }] },
    ];
    const extruded = !!this.opts.extrude;
    this.fillPipe = device.createRenderPipeline({
      label: 'polygon fill',
      layout: pl,
      vertex: { module, entryPoint: 'vsFill', buffers: fillBuffers },
      fragment: { module, entryPoint: 'fsFill', targets: [{ format: gpu.format, blend: BLEND_OVER }] },
      depthStencil: extruded ? DEPTH_TESTED : NO_STENCIL,
      multisample: { count: gpu.samples },
    });
    this.wallPipe = device.createRenderPipeline({
      label: 'polygon walls',
      layout: pl,
      vertex: {
        module,
        entryPoint: 'vsWall',
        buffers: [
          { arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] },
          { arrayStride: 4, stepMode: 'instance', attributes: [{ shaderLocation: 1, offset: 0, format: 'uint32' }] },
        ],
      },
      fragment: { module, entryPoint: 'fsWall', targets: [{ format: gpu.format, blend: BLEND_OVER }] },
      depthStencil: DEPTH_TESTED,
      multisample: { count: gpu.samples },
    });
    this.pickPipe = device.createRenderPipeline({
      label: 'polygon pick',
      layout: pl,
      vertex: { module, entryPoint: 'vsFill', buffers: fillBuffers },
      fragment: { module, entryPoint: 'fsPick', targets: [PICK_TARGET] },
    });
    this.linePipe = device.createRenderPipeline({
      label: 'polygon outline',
      layout: pl,
      vertex: {
        module,
        entryPoint: 'vsLine',
        buffers: [
          { arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] },
          { arrayStride: 4, stepMode: 'instance', attributes: [{ shaderLocation: 1, offset: 0, format: 'uint32' }] },
        ],
      },
      fragment: { module, entryPoint: 'fsLine', targets: [{ format: gpu.format, blend: BLEND_OVER }] },
      depthStencil: extruded ? { ...DEPTH_TESTED, depthWriteEnabled: false, depthCompare: 'less-equal' } : NO_STENCIL,
      multisample: { count: gpu.samples },
    });
    const empty = emptyStorage(device);
    const VB = GPUBufferUsage.VERTEX;
    this.gpuBuffers = [
      bufferFrom(device, this.verts, VB, 'polygon vertices'),
      bufferFrom(device, this.vertPoly, VB, 'polygon vertex ids'),
      bufferFrom(device, this.index, GPUBufferUsage.INDEX, 'polygon indices'),
      bufferFrom(device, this.segs, VB, 'polygon outline'),
      bufferFrom(device, this.segPoly, VB, 'polygon outline ids'),
      storageOf(device, this.col.t, empty, 'polygon colour'),
      storageOf(device, this.filters[0]?.values, empty, 'polygon filter'),
      storageOf(device, this.heightValues(), empty, 'polygon heights'),
      empty,
    ];
    this.ramp = makeRamp(device, this.col.table);
    this.selection = new Selection(device, emptyStorage(device));
    if (this.pendingSelection !== undefined) this.selection.set(this.pendingSelection);
  }

  private heightValues(): Float32Array | undefined {
    const e = this.opts.extrude;
    return e && typeof e === 'object' && e.values ? Float32Array.from(e.values) : undefined;
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
          { binding: 3, resource: { buffer: this.gpuBuffers[5] } },
          { binding: 4, resource: { buffer: this.gpuBuffers[6] } },
          { binding: 5, resource: { buffer: this.gpuBuffers[7] } },
          { binding: 6, resource: { buffer: this.selection!.buffer } },
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
    const stroke = parseColor(o.stroke?.color ?? (frame.dark ? '#14171F' : '#FFFFFF'));
    const f = this.filters[0];
    const e = o.extrude;
    const mode = !e ? 0 : typeof e === 'number' ? 1 : e.values ? 2 : 1;
    const scale = typeof e === 'number' ? e : (e?.scale ?? 1);
    return [
      ox, oy, o.opacity ?? 0.75, o.stroke?.width ?? 0.8,
      ...premul(this.col.color),
      ...premul(stroke),
      this.col.mode, slot, this.highlighted, f ? 1 : 0,
      f?.range[0] ?? 0, f?.range[1] ?? 0, mode, scale,
      this.selection?.active ? 1 : 0, 0, 0, 0,
    ];
  }

  private fill(pass: GPURenderPassEncoder, frame: Frame, pipe: GPURenderPipeline, slot: number): void {
    const off = this.gpu!.arena.push(this.uniforms(frame, slot));
    pass.setPipeline(pipe);
    pass.setBindGroup(0, frame.viewGroup);
    pass.setBindGroup(1, this.bind(), [off]);
    pass.setVertexBuffer(0, this.gpuBuffers[0]);
    pass.setVertexBuffer(1, this.gpuBuffers[1]);
    pass.setIndexBuffer(this.gpuBuffers[2], 'uint32');
    pass.drawIndexed(this.index.length);
    if (pipe === this.fillPipe && this.opts.extrude && this.segPoly.length) {
      pass.setPipeline(this.wallPipe!);
      pass.setVertexBuffer(0, this.gpuBuffers[3]);
      pass.setVertexBuffer(1, this.gpuBuffers[4]);
      pass.draw(6, this.segPoly.length);
    }
    if (pipe === this.fillPipe && this.segPoly.length) {
      pass.setPipeline(this.linePipe!);
      pass.setVertexBuffer(0, this.gpuBuffers[3]);
      pass.setVertexBuffer(1, this.gpuBuffers[4]);
      pass.draw(6, this.segPoly.length);
    }
  }

  draw(pass: GPURenderPassEncoder, frame: Frame): void {
    if (this.visible && this.index.length) this.fill(pass, frame, this.fillPipe!, 0);
  }

  pick(pass: GPURenderPassEncoder, frame: Frame, slot: number): void {
    if (this.visible && this.index.length) this.fill(pass, frame, this.pickPipe!, slot);
  }

  describe(index: number): Record<string, unknown> {
    return describeRow(this.opts.properties, index);
  }

  highlight(index: number): void {
    this.highlighted = index;
  }

  destroy(): void {
    this.selection?.destroy();
    for (const b of new Set(this.gpuBuffers)) b.destroy();
    this.ramp?.texture.destroy();
  }
}

/** Polygons coloured by value. */
export const polygons = (options: PolygonOptions): PolygonLayer => new PolygonLayer(options);
