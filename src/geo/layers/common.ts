/** What the layers share: data input, colour resolution, empty buffers, bind group layouts and WGSL helpers. */
import { bakeCategorical, bakeRamp, parseColor, RAMPS, type RGBA } from '../core/color.js';
import { bufferFrom, rampTexture } from '../core/gpu.js';
import { projectColumns, type Projected } from '../core/mercator.js';
import { extent, type ColorSpec, type GpuFilter } from './layer.js';

/** Points: projected positions, or longitude and latitude columns to project. */
export type PointInput = Projected | { readonly lng: ArrayLike<number>; readonly lat: ArrayLike<number> };

export function toProjected(data: PointInput): Projected {
  return 'positions' in data ? data : projectColumns(data.lng, data.lat);
}

export interface ResolvedColor {
  /** 0: one colour for all; 1: per object, from the ramp. */
  readonly mode: 0 | 1;
  readonly color: RGBA;
  /** Per object, 0–1 along the ramp (mode 1). */
  readonly t?: Float32Array;
  readonly table: Uint8Array;
  readonly domain: readonly [number, number];
  readonly stops: readonly string[];
  readonly categorical: boolean;
}

export function resolveColor(spec: ColorSpec | undefined, fallback: string): ResolvedColor {
  if (spec === undefined || typeof spec === 'string') {
    const css = spec ?? fallback;
    return { mode: 0, color: parseColor(css), table: bakeRamp(RAMPS.smalt), domain: [0, 1], stops: [css], categorical: false };
  }
  const values = spec.values;
  const n = values.length;
  const t = new Float32Array(n);
  if (spec.categorical) {
    for (let i = 0; i < n; i++) t[i] = (((values[i] % 256) + 256) % 256) / 255;
    return { mode: 1, color: [1, 1, 1, 1], t, table: bakeCategorical(spec.palette), domain: [0, 255], stops: [...(spec.palette ?? [])], categorical: true };
  }
  const stops = typeof spec.ramp === 'string' ? RAMPS[spec.ramp] : (spec.ramp ?? RAMPS.smalt);
  const domain = spec.domain ?? extent(values);
  const span = domain[1] - domain[0] || 1;
  for (let i = 0; i < n; i++) t[i] = (values[i] - domain[0]) / span;
  return { mode: 1, color: [1, 1, 1, 1], t, table: bakeRamp(stops, spec.reverse), domain, stops: spec.reverse ? [...stops].reverse() : stops, categorical: false };
}

/** A small storage buffer bound where an optional column is absent. */
export function emptyStorage(device: GPUDevice): GPUBuffer {
  return bufferFrom(device, new Float32Array(4), GPUBufferUsage.STORAGE, 'smaltgl empty');
}

export const storageOf = (device: GPUDevice, data: ArrayBufferView | undefined, empty: GPUBuffer, label: string): GPUBuffer =>
  data ? bufferFrom(device, data, GPUBufferUsage.STORAGE, label) : empty;

export interface Ramp {
  texture: GPUTexture;
  sampler: GPUSampler;
}

export function makeRamp(device: GPUDevice, table: Uint8Array): Ramp {
  return { texture: rampTexture(device, table), sampler: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) };
}

/** Filter uniforms: [hasA, minA, maxA, hasB, minB, maxB]. */
export function filterUniforms(filters: readonly (GpuFilter | undefined)[]): number[] {
  const a = filters[0], b = filters[1];
  return [a ? 1 : 0, a?.range[0] ?? 0, a?.range[1] ?? 0, b ? 1 : 0, b?.range[0] ?? 0, b?.range[1] ?? 0];
}

/** WGSL: whether row i passes the layer's GPU filters (storage bindings `filterA` and `filterB`, uniforms `f`). */
export const FILTER_WGSL = /* wgsl */ `
fn passes(i: u32, fa: vec3f, fb: vec3f) -> bool {
  if (fa.x > 0.5) {
    let v = filterA[i];
    if (!(v >= fa.y && v <= fa.z)) { return false; }
  }
  if (fb.x > 0.5) {
    let v = filterB[i];
    if (!(v >= fb.y && v <= fb.z)) { return false; }
  }
  return true;
}
`;

/** WGSL for writing a pick id. */
export const PICK_OUT = `@location(0) id: u32`;

/** The colour target of a picking pipeline. */
export const PICK_TARGET: GPUColorTargetState = { format: 'r32uint' };

/** Shared bind group layout entries: binding 0 the draw's uniform slot, 1 and 2 the ramp. */
export function baseEntries(visibility: number): GPUBindGroupLayoutEntry[] {
  return [
    { binding: 0, visibility, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 256 } },
    { binding: 1, visibility, texture: { sampleType: 'float' } },
    { binding: 2, visibility, sampler: { type: 'filtering' } },
  ];
}

export const storageEntry = (binding: number, visibility: number, type: GPUBufferBindingType = 'read-only-storage'): GPUBindGroupLayoutEntry => ({
  binding,
  visibility,
  buffer: { type },
});

/** Premultiplies a colour by its alpha and an opacity. */
export const premul = ([r, g, b, a]: RGBA, opacity = 1): RGBA => [r * a * opacity, g * a * opacity, b * a * opacity, a * opacity];

/** Values for a tooltip from named columns. */
export function describeRow(columns: Readonly<Record<string, ArrayLike<unknown>>> | undefined, i: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (columns) for (const [k, v] of Object.entries(columns)) out[k] = v[i];
  return out;
}

/**
 * WGSL for a selection: a byte per row (1 selected, 0 not), packed four to a word, at `binding` of group 1.
 * `selectionAlpha(i, on)` is 1 for selected rows (and for every row when `on` is 0), and dims the rest.
 */
export function selectionWgsl(binding: number): string {
  return /* wgsl */ `
@group(1) @binding(${binding}) var<storage, read> selection: array<u32>;
fn selectionAlpha(i: u32, on: f32) -> f32 {
  if (on < 0.5) { return 1.0; }
  let byte = (selection[i >> 2u] >> ((i & 3u) * 8u)) & 0xffu;
  return select(0.16, 1.0, byte > 0u);
}
`;
}

/**
 * A layer's selection on the GPU: which rows are selected, a byte each. Set when the selection changes (a click, a
 * filter elsewhere), not per frame. `buffer` is a small placeholder until the first selection; `version` changes when
 * the buffer does, so the layer rebuilds its bind group.
 */
export class Selection {
  buffer: GPUBuffer;
  version = 0;
  /** Whether any selection is set (otherwise every row draws at full strength). */
  active = false;
  private size = 0;

  constructor(private readonly device: GPUDevice, private readonly placeholder: GPUBuffer) {
    this.buffer = placeholder;
  }

  /** Selected rows (non-zero bytes), or null for no selection. */
  set(mask: Uint8Array | null): void {
    if (!mask) {
      this.active = false;
      return;
    }
    const bytes = Math.max(16, Math.ceil(mask.length / 4) * 4);
    if (bytes > this.size) {
      if (this.buffer !== this.placeholder) this.buffer.destroy();
      this.buffer = this.device.createBuffer({ label: 'selection', size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      this.size = bytes;
      this.version++;
    }
    const padded = mask.length % 4 ? new Uint8Array(Math.ceil(mask.length / 4) * 4) : mask;
    if (padded !== mask) padded.set(mask);
    this.device.queue.writeBuffer(this.buffer, 0, padded.buffer, padded.byteOffset, padded.byteLength);
    this.active = true;
  }

  destroy(): void {
    if (this.buffer !== this.placeholder) this.buffer.destroy();
  }
}
