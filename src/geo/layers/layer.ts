/**
 * Layer helpers: the contracts (from core), and what layers share. A layer implements `Layer` (core/contract.ts).
 */
import type { RampName } from '../core/color.js';
export type { Layer, LayerGpu, Frame, Picked, MapBasemap } from '../core/contract.js';
import type { Camera } from '../core/camera.js';

/** Whether the device can blend into 32-bit float targets (heatmaps then never saturate). */
export const canBlendFloat32 = (device: GPUDevice): boolean => device.features.has('float32-blendable' as GPUFeatureName);

/** A filter the GPU applies every frame: rows whose value is outside [min, max] are not drawn (or counted). */
export interface GpuFilter {
  readonly values: Float32Array;
  range: [number, number];
}

/** A colour: a CSS hex colour for every object, or a column mapped through a ramp. */
export type ColorSpec =
  | string
  | {
      readonly values: Float32Array | Float64Array | ArrayLike<number>;
      /** Domain of the values; by default their minimum and maximum. */
      readonly domain?: readonly [number, number];
      readonly ramp?: RampName | readonly string[];
      /** Values are category codes 0, 1, 2…: colour each from the categorical palette. */
      readonly categorical?: boolean;
      /** The colours for categories (default: the kit's ten). */
      readonly palette?: readonly string[];
      readonly reverse?: boolean;
    };

let next = 0;
export const autoId = (kind: string): string => `${kind}-${++next}`;

/** min and max of finite values. */
export function extent(values: ArrayLike<number>): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo > hi ? [0, 1] : [lo, hi];
}

export const asF32 = (v: ArrayLike<number>): Float32Array => (v instanceof Float32Array ? v : Float32Array.from(v));

/** The world-offset of a layer's origin from the camera centre: what every layer passes its shader first. */
export const originOffset = (origin: readonly [number, number], camera: Camera): [number, number] => [origin[0] - camera.x, origin[1] - camera.y];

/** WGSL that turns a value in 0–1 into a colour from the layer's ramp texture (group 1, bindings 1 and 2). */
export const RAMP_WGSL = /* wgsl */ `
@group(1) @binding(1) var rampTex: texture_2d<f32>;
@group(1) @binding(2) var rampSampler: sampler;
fn ramp(t: f32) -> vec4f {
  return textureSampleLevel(rampTex, rampSampler, vec2f(clamp(t, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0, 0.5), 0.0);
}
`;
