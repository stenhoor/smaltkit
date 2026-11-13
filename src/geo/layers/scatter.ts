/**
 * Points as circles: one instanced quad per row, its circle cut in the fragment shader with an anti-aliased edge.
 * Colour, size and up to two filters are columns in storage buffers, read by instance index: nothing is rebuilt on the
 * CPU when a filter or the view changes.
 */
import { NO_STENCIL, BLEND_OVER, BLEND_ADD, VIEW_WGSL } from '../core/gpu.js';
import { metersToWorld, yToLat, type Projected } from '../core/mercator.js';
import { parseColor } from '../core/color.js';
import {
  baseEntries, describeRow, emptyStorage, FILTER_WGSL, filterUniforms, makeRamp, PICK_TARGET, premul, resolveColor,
  Selection, selectionWgsl, storageEntry, storageOf, toProjected, type PointInput, type Ramp, type ResolvedColor,
} from './common.js';
import { autoId, extent, originOffset, RAMP_WGSL, type ColorSpec, type Frame, type GpuFilter, type Layer, type LayerGpu } from './layer.js';

export interface ScatterOptions {
  readonly id?: string;
  readonly data: PointInput;
  /** A CSS colour, or a column through a ramp. */
  readonly color?: ColorSpec;
  /** Radius in pixels (or metres with `units: 'meters'`). */
  readonly radius?: number;
  /** A column that scales each point's radius between `radius` and `radiusMax` (square-root scale: area follows value). */
  readonly size?: { readonly values: ArrayLike<number>; readonly domain?: readonly [number, number] };
  readonly radiusMax?: number;
  readonly units?: 'pixels' | 'meters';
  readonly opacity?: number;
  readonly stroke?: { readonly color?: string; readonly width?: number };
  /** Additive blending: dense areas glow. */
  readonly additive?: boolean;
  /** Up to two GPU filters. Change `range` and call `map.redraw()`, or use `layer.setFilter`. */
  readonly filters?: readonly GpuFilter[];
  /** Columns shown when a point is hovered or clicked. */
  readonly properties?: Readonly<Record<string, ArrayLike<unknown>>>;
  readonly visible?: boolean;
}

const WGSL = /* wgsl */ `
${VIEW_WGSL}
struct U {
  offset: vec2f, radius: f32, stroke: f32,
  color: vec4f,
  strokeColor: vec4f,
  fa: vec3f, hasColor: f32,
  fb: vec3f, hasSize: f32,
  sizeDomain: vec2f, radiusMax: f32, opacity: f32,
  highlight: f32, slot: f32, worldRadius: f32, selOn: f32,
};
@group(1) @binding(0) var<uniform> u: U;
${RAMP_WGSL}
@group(1) @binding(3) var<storage, read> pos: array<vec2f>;
@group(1) @binding(4) var<storage, read> colorT: array<f32>;
@group(1) @binding(5) var<storage, read> size: array<f32>;
@group(1) @binding(6) var<storage, read> filterA: array<f32>;
@group(1) @binding(7) var<storage, read> filterB: array<f32>;
${selectionWgsl(8)}
${FILTER_WGSL}

struct V {
  @builtin(position) p: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) color: vec4f,
  @location(2) @interpolate(flat) r: f32,
  @location(3) @interpolate(flat) id: u32,
};

const CORNERS = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));

@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) i: u32) -> V {
  var o: V;
  o.id = i;
  if (!passes(i, u.fa, u.fb)) { o.p = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
  var r = u.radius;
  if (u.worldRadius > 0.0) { r = max(1.0, u.worldRadius * view.scale); }
  if (u.hasSize > 0.5) {
    let t = clamp((size[i] - u.sizeDomain.x) / max(1e-12, u.sizeDomain.y - u.sizeDomain.x), 0.0, 1.0);
    r = mix(r, u.radiusMax, sqrt(t));
  }
  var c = u.color;
  if (u.hasColor > 0.5) { c = ramp(colorT[i]); }
  if (f32(i) == u.highlight) { r = r + 3.0; }
  c = vec4f(c.rgb * c.a, c.a) * u.opacity * selectionAlpha(i, u.selOn);
  let corner = CORNERS[vi];
  let extent = r + u.stroke + 1.0;
  let centre = toPixels(pos[i] + u.offset);
  o.p = pixelsToClip(centre + corner * extent);
  o.local = corner * extent;
  o.color = c;
  o.r = r;
  return o;
}

@fragment fn fs(v: V) -> @location(0) vec4f {
  let d = length(v.local);
  let edge = v.r + u.stroke;
  let a = clamp(edge - d + 0.5, 0.0, 1.0);
  if (a <= 0.0) { discard; }
  var c = v.color;
  if (u.stroke > 0.0) {
    let s = u.strokeColor * u.opacity;
    c = mix(c, s, clamp(d - v.r + 0.5, 0.0, 1.0));
  }
  return c * a;
}

@fragment fn fsPick(v: V) -> @location(0) u32 {
  if (length(v.local) > v.r + u.stroke + 0.5) { discard; }
  return (u32(u.slot) << 24u) | (v.id + 1u);
}
`;

export class ScatterLayer implements Layer {
  readonly id: string;
  visible: boolean;
  readonly count: number;
  readonly bounds: Projected['bounds'];
  readonly data: Projected;
  private opts: ScatterOptions;
  private col: ResolvedColor;
  private gpu?: LayerGpu;
  private pipeline?: GPURenderPipeline;
  private pickPipeline?: GPURenderPipeline;
  private group?: GPUBindGroup;
  private groupVersion = -1;
  private buffers: GPUBuffer[] = [];
  private ramp?: Ramp;
  private highlighted = -1;
  private redraw: () => void = () => {};
  filters: GpuFilter[];

  constructor(options: ScatterOptions) {
    this.opts = options;
    this.id = options.id ?? autoId('scatter');
    this.visible = options.visible ?? true;
    this.data = toProjected(options.data);
    this.count = this.data.count;
    this.bounds = this.data.bounds;
    this.col = resolveColor(options.color, '#2F5BB7');
    this.filters = [...(options.filters ?? [])];
  }

  /** The resolved colour scale, for legends. */
  get legend(): ResolvedColor {
    return this.col;
  }

  attach(gpu: LayerGpu, redraw: () => void): void {
    this.gpu = gpu;
    this.redraw = redraw;
    const { device } = gpu;
    const V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT;
    const layout = device.createBindGroupLayout({
      label: 'scatter',
      entries: [...baseEntries(V | F), ...[3, 4, 5, 6, 7, 8].map((b) => storageEntry(b, V))],
    });
    const module = device.createShaderModule({ label: 'scatter', code: WGSL });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [gpu.viewLayout, layout] });
    this.pipeline = device.createRenderPipeline({
      label: 'scatter',
      layout: pl,
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: gpu.format, blend: this.opts.additive ? BLEND_ADD : BLEND_OVER }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: NO_STENCIL,
      multisample: { count: gpu.samples },
    });
    this.pickPipeline = device.createRenderPipeline({
      label: 'scatter pick',
      layout: pl,
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fsPick', targets: [PICK_TARGET] },
      primitive: { topology: 'triangle-list' },
    });
    const empty = emptyStorage(device);
    const size = this.opts.size ? Float32Array.from(this.opts.size.values) : undefined;
    this.buffers = [
      storageOf(device, this.data.positions, empty, 'scatter positions'),
      storageOf(device, this.col.t, empty, 'scatter colour'),
      storageOf(device, size, empty, 'scatter size'),
      storageOf(device, this.filters[0]?.values, empty, 'scatter filter A'),
      storageOf(device, this.filters[1]?.values, empty, 'scatter filter B'),
      empty,
    ];
    this.ramp = makeRamp(device, this.col.table);
    this.selection = new Selection(device, empty);
    if (this.pendingSelection !== undefined) this.selection.set(this.pendingSelection);
    this.layout = layout;
  }

  private layout?: GPUBindGroupLayout;

  private bindGroup(): GPUBindGroup {
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

  private selection?: Selection;
  private selectionVersion = -1;

  /** Selected rows (a byte each, non-zero for selected), or null: unselected rows are dimmed. */
  setSelection(mask: Uint8Array | null): void {
    if (this.selection) this.selection.set(mask);
    else this.pendingSelection = mask;
    this.redraw();
  }

  private pendingSelection?: Uint8Array | null;

  /** Changes how points look without re-uploading them. */
  update(changes: Partial<Pick<ScatterOptions, 'radius' | 'radiusMax' | 'opacity' | 'stroke' | 'units'>>): void {
    this.opts = { ...this.opts, ...changes };
    this.redraw();
  }

  /** Sets a filter's range (index 0 or 1) and redraws. */
  setFilter(index: number, range: [number, number]): void {
    const f = this.filters[index];
    if (f) f.range = range;
    this.redraw();
  }

  private uniforms(frame: Frame, slot: number): number[] {
    const o = this.opts;
    const [ox, oy] = originOffset(this.data.origin, frame.camera);
    const color = premul(this.col.color, 1);
    const stroke = o.stroke ? parseColor(o.stroke.color ?? (frame.dark ? '#14171F' : '#FFFFFF')) : [0, 0, 0, 0];
    const sizeDomain = o.size ? (o.size.domain ?? extent(o.size.values)) : [0, 1];
    const [fa0, fa1, fa2, fb0, fb1, fb2] = filterUniforms(this.filters);
    const radius = o.radius ?? 3;
    const worldRadius = o.units === 'meters' ? metersToWorld(radius, yToLat(this.data.origin[1])) : 0;
    return [
      ox, oy, radius, o.stroke ? (o.stroke.width ?? 1) : 0,
      ...color,
      stroke[0] * stroke[3], stroke[1] * stroke[3], stroke[2] * stroke[3], stroke[3],
      fa0, fa1, fa2, this.col.mode,
      fb0, fb1, fb2, o.size ? 1 : 0,
      sizeDomain[0], sizeDomain[1], o.radiusMax ?? radius * 4, o.opacity ?? 1,
      this.highlighted, slot, worldRadius, this.selection?.active ? 1 : 0,
    ];
  }

  draw(pass: GPURenderPassEncoder, frame: Frame): void {
    if (!this.visible || !this.count) return;
    const off = this.gpu!.arena.push(this.uniforms(frame, 0));
    pass.setPipeline(this.pipeline!);
    pass.setBindGroup(0, frame.viewGroup);
    pass.setBindGroup(1, this.bindGroup(), [off]);
    pass.draw(6, this.count);
  }

  pick(pass: GPURenderPassEncoder, frame: Frame, slot: number): void {
    if (!this.visible || !this.count) return;
    const off = this.gpu!.arena.push(this.uniforms(frame, slot));
    pass.setPipeline(this.pickPipeline!);
    pass.setBindGroup(0, frame.viewGroup);
    pass.setBindGroup(1, this.bindGroup(), [off]);
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

/** Points as circles. */
export const scatter = (options: ScatterOptions): ScatterLayer => new ScatterLayer(options);
