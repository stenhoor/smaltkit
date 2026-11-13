/**
 * Density as a heatmap, entirely on the GPU, every frame:
 *
 *   1. every point is splatted as a Gaussian into a float texture at half resolution, blended additively;
 *   2. a compute pass finds the texture's maximum (workgroup reduction, then one atomic per workgroup);
 *   3. in the map's pass, a full-screen triangle colours each pixel by its density over that maximum.
 *
 * Nothing goes back to the CPU, so zooming re-normalises instantly, and filters cost no rebuild.
 */
import { BLEND_OVER, NO_STENCIL, VIEW_WGSL } from '../core/gpu.js';
import { RAMPS, bakeRamp, type RampName } from '../core/color.js';
import type { Projected } from '../core/mercator.js';
import { emptyStorage, FILTER_WGSL, filterUniforms, makeRamp, storageOf, toProjected, type PointInput, type Ramp } from './common.js';
import { autoId, canBlendFloat32, originOffset, type Frame, type GpuFilter, type Layer, type LayerGpu } from './layer.js';

export interface HeatmapOptions {
  readonly id?: string;
  readonly data: PointInput;
  /** A weight per point (default 1). */
  readonly weight?: ArrayLike<number>;
  /** Kernel radius in CSS pixels (default 20). */
  readonly radius?: number;
  /** Multiplies the colour scale's top: below 1 saturates sooner (default 1). */
  readonly intensity?: number;
  readonly ramp?: RampName | readonly string[];
  readonly opacity?: number;
  /** 'log' (default) shows sparse and dense areas together; 'linear' shows the peaks. */
  readonly scale?: 'log' | 'linear';
  readonly filters?: readonly GpuFilter[];
  readonly visible?: boolean;
}

const SPLAT_WGSL = /* wgsl */ `
${VIEW_WGSL}
struct U { offset: vec2f, radius: f32, hasWeight: f32, fa: vec3f, down: f32, fb: vec3f, pad: f32 };
@group(1) @binding(0) var<uniform> u: U;
@group(1) @binding(1) var<storage, read> pos: array<vec2f>;
@group(1) @binding(2) var<storage, read> weight: array<f32>;
@group(1) @binding(3) var<storage, read> filterA: array<f32>;
@group(1) @binding(4) var<storage, read> filterB: array<f32>;
${FILTER_WGSL}
struct V { @builtin(position) p: vec4f, @location(0) local: vec2f, @location(1) @interpolate(flat) w: f32 };
const C = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) i: u32) -> V {
  var o: V;
  if (!passes(i, u.fa, u.fb)) { o.p = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
  let c = C[vi];
  let p = toPixels(pos[i] + u.offset) + c * u.radius;
  o.p = pixelsToClip(p);
  o.local = c;
  o.w = select(1.0, weight[i], u.hasWeight > 0.5);
  return o;
}
@fragment fn fs(v: V) -> @location(0) vec4f {
  let d2 = dot(v.local, v.local);
  if (d2 > 1.0) { discard; }
  // A Gaussian with sigma = radius / 3, cut at the radius.
  return vec4f(exp(-4.5 * d2) * v.w, 0.0, 0.0, 1.0);
}
`;

const MAX_WGSL = /* wgsl */ `
@group(0) @binding(0) var heat: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> maxBits: atomic<u32>;
var<workgroup> local: array<f32, 256>;
@compute @workgroup_size(16, 16) fn main(@builtin(global_invocation_id) g: vec3u, @builtin(local_invocation_index) li: u32) {
  let size = textureDimensions(heat);
  var v = 0.0;
  // Each invocation reads a 4 × 4 block.
  for (var dy = 0u; dy < 4u; dy++) {
    for (var dx = 0u; dx < 4u; dx++) {
      let p = vec2u(g.x * 4u + dx, g.y * 4u + dy);
      if (p.x < size.x && p.y < size.y) { v = max(v, textureLoad(heat, p, 0).r); }
    }
  }
  local[li] = v;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (li < s) { local[li] = max(local[li], local[li + s]); }
    workgroupBarrier();
  }
  if (li == 0u) { atomicMax(&maxBits, bitcast<u32>(local[0])); }
}
`;

const COLOR_WGSL = /* wgsl */ `
${VIEW_WGSL}
struct U { intensity: f32, opacity: f32, logScale: f32, pad: f32 };
@group(1) @binding(0) var<uniform> u: U;
@group(1) @binding(1) var rampTex: texture_2d<f32>;
@group(1) @binding(2) var rampSampler: sampler;
@group(1) @binding(3) var heat: texture_2d<f32>;
@group(1) @binding(4) var<storage, read> maxBits: u32;
struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> V {
  let xy = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return V(vec4f(xy * 2.0 - 1.0, 0.0, 1.0), vec2f(xy.x, 1.0 - xy.y));
}
@fragment fn fs(v: V) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(heat));
  // Bilinear by hand: float32 textures are not filterable everywhere.
  let p = v.uv * size - 0.5;
  let f = fract(p);
  let i = vec2i(floor(p));
  let m = vec2i(size) - 1;
  let a = textureLoad(heat, clamp(i, vec2i(0), m), 0).r;
  let b = textureLoad(heat, clamp(i + vec2i(1, 0), vec2i(0), m), 0).r;
  let c = textureLoad(heat, clamp(i + vec2i(0, 1), vec2i(0), m), 0).r;
  let d = textureLoad(heat, clamp(i + vec2i(1, 1), vec2i(0), m), 0).r;
  let h = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  let top = max(1e-6, bitcast<f32>(maxBits) * u.intensity);
  var t = h / top;
  if (u.logScale > 0.5) { t = log(1.0 + h * 50.0 / top) / log(51.0); }
  t = clamp(t, 0.0, 1.0);
  if (t < 0.004) { discard; }
  let c0 = textureSampleLevel(rampTex, rampSampler, vec2f(t * (255.0 / 256.0) + 0.5 / 256.0, 0.5), 0.0);
  // Fade in from transparent at the low end so the map shows through.
  let alpha = smoothstep(0.0, 0.25, t) * u.opacity;
  return vec4f(c0.rgb * alpha, alpha);
}
`;

export class HeatmapLayer implements Layer {
  readonly id: string;
  visible: boolean;
  readonly count: number;
  readonly bounds: Projected['bounds'];
  readonly data: Projected;
  filters: GpuFilter[];
  private opts: HeatmapOptions;
  private gpu?: LayerGpu;
  private splat?: GPURenderPipeline;
  private maxPipe?: GPUComputePipeline;
  private colorPipe?: GPURenderPipeline;
  private splatLayout?: GPUBindGroupLayout;
  private colorLayout?: GPUBindGroupLayout;
  private splatGroup?: GPUBindGroup;
  private splatVersion = -1;
  private colorGroup?: GPUBindGroup;
  private colorKey = '';
  private maxGroup?: GPUBindGroup;
  private heat?: GPUTexture;
  private heatFormat: GPUTextureFormat = 'r16float';
  private maxBuf?: GPUBuffer;
  private buffers: GPUBuffer[] = [];
  private ramp?: Ramp;
  private redraw: () => void = () => {};

  constructor(options: HeatmapOptions) {
    this.opts = options;
    this.id = options.id ?? autoId('heatmap');
    this.visible = options.visible ?? true;
    this.data = toProjected(options.data);
    this.count = this.data.count;
    this.bounds = this.data.bounds;
    this.filters = [...(options.filters ?? [])];
  }

  get rampStops(): readonly string[] {
    const r = this.opts.ramp ?? 'glow';
    return typeof r === 'string' ? RAMPS[r] : r;
  }

  attach(gpu: LayerGpu, redraw: () => void): void {
    this.gpu = gpu;
    this.redraw = redraw;
    const { device } = gpu;
    this.heatFormat = canBlendFloat32(device) ? 'r32float' : 'r16float';
    const V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT, C = GPUShaderStage.COMPUTE;
    this.splatLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: V | F, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 256 } },
        ...[1, 2, 3, 4].map((b) => ({ binding: b, visibility: V, buffer: { type: 'read-only-storage' as const } })),
      ],
    });
    const splat = device.createShaderModule({ label: 'heatmap splat', code: SPLAT_WGSL });
    this.splat = device.createRenderPipeline({
      label: 'heatmap splat',
      layout: device.createPipelineLayout({ bindGroupLayouts: [gpu.viewLayout, this.splatLayout] }),
      vertex: { module: splat, entryPoint: 'vs' },
      fragment: {
        module: splat,
        entryPoint: 'fs',
        targets: [{ format: this.heatFormat, blend: { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } } }],
      },
    });
    const maxLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: C, texture: { sampleType: 'unfilterable-float' } },
        { binding: 1, visibility: C, buffer: { type: 'storage' } },
      ],
    });
    this.maxPipe = device.createComputePipeline({
      label: 'heatmap max',
      layout: device.createPipelineLayout({ bindGroupLayouts: [maxLayout] }),
      compute: { module: device.createShaderModule({ label: 'heatmap max', code: MAX_WGSL }), entryPoint: 'main' },
    });
    this.maxLayoutRef = maxLayout;
    this.colorLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: F, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 256 } },
        { binding: 1, visibility: F, texture: { sampleType: 'float' } },
        { binding: 2, visibility: F, sampler: { type: 'filtering' } },
        { binding: 3, visibility: F, texture: { sampleType: 'unfilterable-float' } },
        { binding: 4, visibility: F, buffer: { type: 'read-only-storage' } },
      ],
    });
    const color = device.createShaderModule({ label: 'heatmap colour', code: COLOR_WGSL });
    this.colorPipe = device.createRenderPipeline({
      label: 'heatmap colour',
      layout: device.createPipelineLayout({ bindGroupLayouts: [gpu.viewLayout, this.colorLayout] }),
      vertex: { module: color, entryPoint: 'vs' },
      fragment: { module: color, entryPoint: 'fs', targets: [{ format: gpu.format, blend: BLEND_OVER }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: NO_STENCIL,
      multisample: { count: gpu.samples },
    });
    const empty = emptyStorage(device);
    this.buffers = [
      storageOf(device, this.data.positions, empty, 'heatmap positions'),
      storageOf(device, this.opts.weight ? Float32Array.from(this.opts.weight) : undefined, empty, 'heatmap weight'),
      storageOf(device, this.filters[0]?.values, empty, 'heatmap filter A'),
      storageOf(device, this.filters[1]?.values, empty, 'heatmap filter B'),
      empty,
    ];
    this.maxBuf = device.createBuffer({ label: 'heatmap max', size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.ramp = makeRamp(device, bakeRamp(this.rampStops));
  }

  private maxLayoutRef?: GPUBindGroupLayout;

  /** Changes the kernel and scale without re-uploading points. */
  update(changes: Partial<Pick<HeatmapOptions, 'radius' | 'intensity' | 'opacity' | 'scale'>>): void {
    this.opts = { ...this.opts, ...changes };
    this.redraw();
  }

  setFilter(index: number, range: [number, number]): void {
    const f = this.filters[index];
    if (f) f.range = range;
    this.redraw();
  }

  prepare(frame: Frame): void {
    if (!this.count) return;
    const gpu = this.gpu!;
    const { device } = gpu;
    const w = Math.max(1, Math.ceil(frame.width / 2)), h = Math.max(1, Math.ceil(frame.height / 2));
    if (!this.heat || this.heat.width !== w || this.heat.height !== h) {
      this.heat?.destroy();
      this.heat = device.createTexture({ label: 'heatmap density', size: [w, h], format: this.heatFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      this.colorGroup = undefined;
      this.maxGroup = device.createBindGroup({
        layout: this.maxLayoutRef!,
        entries: [
          { binding: 0, resource: this.heat.createView() },
          { binding: 1, resource: { buffer: this.maxBuf! } },
        ],
      });
    }
    if (!this.splatGroup || this.splatVersion !== gpu.arena.version) {
      this.splatGroup = device.createBindGroup({
        layout: this.splatLayout!,
        entries: [{ binding: 0, resource: { buffer: gpu.arena.buffer, size: 256 } }, ...this.buffers.slice(0, 4).map((buffer, k) => ({ binding: k + 1, resource: { buffer } }))],
      });
      this.splatVersion = gpu.arena.version;
    }
    const [ox, oy] = originOffset(this.data.origin, frame.camera);
    const [fa0, fa1, fa2, fb0, fb1, fb2] = filterUniforms(this.filters);
    const off = gpu.arena.push([ox, oy, this.opts.radius ?? 20, this.opts.weight ? 1 : 0, fa0, fa1, fa2, 2, fb0, fb1, fb2, 0]);
    const pass = frame.encoder.beginRenderPass({
      label: 'heatmap splat',
      colorAttachments: [{ view: this.heat.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(this.splat!);
    pass.setBindGroup(0, frame.viewGroup);
    pass.setBindGroup(1, this.splatGroup, [off]);
    pass.draw(6, this.count);
    pass.end();
    frame.encoder.clearBuffer(this.maxBuf!, 0, 16);
    const cp = frame.encoder.beginComputePass({ label: 'heatmap max' });
    cp.setPipeline(this.maxPipe!);
    cp.setBindGroup(0, this.maxGroup!);
    cp.dispatchWorkgroups(Math.ceil(w / 64), Math.ceil(h / 64));
    cp.end();
  }

  draw(pass: GPURenderPassEncoder, frame: Frame): void {
    if (!this.visible || !this.count || !this.heat) return;
    const gpu = this.gpu!;
    const key = `${gpu.arena.version}`;
    if (!this.colorGroup || this.colorKey !== key) {
      this.colorGroup = gpu.device.createBindGroup({
        layout: this.colorLayout!,
        entries: [
          { binding: 0, resource: { buffer: gpu.arena.buffer, size: 256 } },
          { binding: 1, resource: this.ramp!.texture.createView() },
          { binding: 2, resource: this.ramp!.sampler },
          { binding: 3, resource: this.heat.createView() },
          { binding: 4, resource: { buffer: this.maxBuf!, size: 4 } },
        ],
      });
      this.colorKey = key;
    }
    const off = gpu.arena.push([this.opts.intensity ?? 1, this.opts.opacity ?? 0.9, (this.opts.scale ?? 'log') === 'log' ? 1 : 0, 0]);
    pass.setPipeline(this.colorPipe!);
    pass.setBindGroup(0, frame.viewGroup);
    pass.setBindGroup(1, this.colorGroup, [off]);
    pass.draw(3);
  }

  destroy(): void {
    for (const b of new Set(this.buffers)) b.destroy();
    this.heat?.destroy();
    this.maxBuf?.destroy();
    this.ramp?.texture.destroy();
  }
}

/** Point density as a heatmap. */
export const heatmap = (options: HeatmapOptions): HeatmapLayer => new HeatmapLayer(options);
