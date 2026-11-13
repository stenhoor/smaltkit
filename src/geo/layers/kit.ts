/**
 * The layer kit: what a layer of your own needs to plug into the map, from the contract to the WGSL the built-in
 * layers share. A layer implements `Layer`; `attach` gets a `LayerGpu` (device, formats, view layout, uniform arena);
 * every pipeline in the map's pass declares `NO_STENCIL` (or `DEPTH_TESTED`) and `gpu.samples`; group 0 is the view
 * (`VIEW_WGSL`); a draw's uniforms go in an arena slot bound with a dynamic offset.
 */
export type { Layer, LayerGpu, Frame, Picked } from '../core/contract.js';
export { VIEW_WGSL, NO_STENCIL, DEPTH_TESTED, BLEND_OVER, BLEND_ADD, bufferFrom, rampTexture, UNIFORM_STRIDE, SAMPLES, STENCIL_FORMAT } from '../core/gpu.js';
export { projectColumns, metersToWorld, type Projected } from '../core/mercator.js';
export { parseColor, bakeRamp, bakeCategorical, RAMPS, CATEGORICAL } from '../core/color.js';
export { RAMP_WGSL, originOffset, extent, asF32, autoId, canBlendFloat32, type ColorSpec, type GpuFilter } from './layer.js';
export {
  FILTER_WGSL, filterUniforms, resolveColor, makeRamp, emptyStorage, storageOf, storageEntry, baseEntries, PICK_TARGET, premul, describeRow, toProjected,
  type PointInput, type ResolvedColor, type Ramp,
} from './common.js';
export { triangulate } from './triangulate.js';
