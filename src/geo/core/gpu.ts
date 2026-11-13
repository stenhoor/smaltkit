/** WebGPU setup, buffers and the per-frame uniform arena every layer writes its draw uniforms into. */

export class GpuUnavailableError extends Error {
  constructor(message = 'WebGPU is not available in this browser') {
    super(message);
    this.name = 'GpuUnavailableError';
  }
}

export async function isWebGpuAvailable(): Promise<boolean> {
  try {
    return typeof navigator !== 'undefined' && !!navigator.gpu && (await navigator.gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

export interface Gpu {
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly format: GPUTextureFormat;
  /** The adapter supports GPU timestamps: frame times are measured on the GPU. */
  readonly timestamps: boolean;
}

/** Samples per pixel for the map's render pass: smooth edges on lines, fills and hexagons. */
export const SAMPLES = 4;
/** Depth (for extruded columns in 3D) and the stencil buffer that polygon fills are drawn through. */
export const STENCIL_FORMAT: GPUTextureFormat = 'depth24plus-stencil8';

export async function initGpu(canvas: HTMLCanvasElement): Promise<Gpu> {
  if (typeof navigator === 'undefined' || !navigator.gpu) throw new GpuUnavailableError();
  let adapter: GPUAdapter | null;
  try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  } catch (e) {
    throw new GpuUnavailableError(`WebGPU adapter request failed: ${String(e)}`);
  }
  if (!adapter) throw new GpuUnavailableError('No WebGPU adapter is available');
  const timestamps = adapter.features.has('timestamp-query');
  let device: GPUDevice;
  try {
    device = await adapter.requestDevice({
      requiredFeatures: (['timestamp-query', 'float32-blendable', 'float32-filterable'] as GPUFeatureName[]).filter((f) => adapter.features.has(f)),
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
      },
    });
  } catch (e) {
    throw new GpuUnavailableError(`WebGPU device request failed: ${String(e)}`);
  }
  const context = canvas.getContext('webgpu');
  if (!context) {
    device.destroy();
    throw new GpuUnavailableError('The canvas has no WebGPU context');
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });
  return { device, context, format, timestamps };
}

/**
 * Draws on a canvas with a device you already have (shared with your own renderer, or with another map). The device
 * stays yours: the map never destroys it.
 */
export function connectGpu(canvas: HTMLCanvasElement | OffscreenCanvas, device: GPUDevice): Gpu {
  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) throw new GpuUnavailableError('The canvas has no WebGPU context');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });
  return { device, context, format, timestamps: device.features.has('timestamp-query') };
}

/** A GPU buffer holding a typed array, padded to 4 bytes. */
export function bufferFrom(device: GPUDevice, data: ArrayBufferView, usage: GPUBufferUsageFlags, label?: string): GPUBuffer {
  const size = Math.max(16, Math.ceil(data.byteLength / 4) * 4);
  const buf = device.createBuffer({ label, size, usage: usage | GPUBufferUsage.COPY_DST, mappedAtCreation: true });
  new Uint8Array(buf.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  buf.unmap();
  return buf;
}

/** Bytes between two draws' uniforms: WebGPU's minimum dynamic offset alignment. */
export const UNIFORM_STRIDE = 256;

/**
 * One uniform buffer per frame, written once: every draw takes the next 256-byte slot and binds it with a dynamic
 * offset. Hundreds of draws (tiles × style layers) cost one writeBuffer.
 */
export class UniformArena {
  buffer: GPUBuffer;
  private data: Float32Array;
  private used = 0;
  private capacity: number;
  version = 0;

  constructor(private readonly device: GPUDevice, slots = 1024) {
    this.capacity = slots;
    this.data = new Float32Array((slots * UNIFORM_STRIDE) / 4);
    this.buffer = this.create();
  }

  private create(): GPUBuffer {
    return this.device.createBuffer({ label: 'smaltgl uniforms', size: this.capacity * UNIFORM_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }

  /** Set when a frame needed more slots than there were: that frame drew wrongly and the next one grows the arena. */
  overflowed = false;

  /** Starts a frame. Grows the buffer first if the last frame overflowed (bind groups follow `version`). */
  reset(): void {
    this.used = 0;
    if (this.overflowed) {
      this.overflowed = false;
      this.capacity *= 2;
      this.data = new Float32Array((this.capacity * UNIFORM_STRIDE) / 4);
      this.buffer.destroy();
      this.buffer = this.create();
      this.version++;
    }
  }

  /** Reserves a slot and returns its byte offset; `values` (up to 64 floats) go in it. */
  push(values: ArrayLike<number>): number {
    if (this.used === this.capacity) {
      this.overflowed = true;
      return 0;
    }
    const off = this.used * UNIFORM_STRIDE;
    this.data.set(values as ArrayLike<number>, off / 4);
    this.used++;
    return off;
  }

  /** Uploads every slot used this frame. */
  flush(): void {
    if (this.used) this.device.queue.writeBuffer(this.buffer, 0, this.data.buffer, 0, this.used * UNIFORM_STRIDE);
  }
}

/** The view uniforms every shader declares (camera.ts `shaderView`) and the projection from world offsets to clip space. */
export const VIEW_WGSL = /* wgsl */ `
struct View {
  scale: f32, cosr: f32, sinr: f32, ratio: f32,
  half: vec2f, time: f32, metres: f32,
  psin: f32, pcos: f32, dist: f32, spare: f32,
};
@group(0) @binding(0) var<uniform> view: View;

// Pixels from the screen's centre of a world offset from the camera's centre, rotated.
fn toPixels(d: vec2f) -> vec2f {
  let p = d * view.scale;
  return vec2f(p.x * view.cosr - p.y * view.sinr, p.x * view.sinr + p.y * view.cosr);
}
// Pixels on the ground (rotated, from the centre) and a height in pixels to clip space, in perspective when pitched.
fn project(p: vec2f, z: f32) -> vec4f {
  let depth = view.dist - p.y * view.psin - z * view.pcos;
  let yc = p.y * view.pcos - z * view.psin;
  let w = max(depth, 1e-3) / view.dist;
  let zn = clamp(depth / (view.dist * 64.0), 0.0, 1.0);
  return vec4f(p.x / view.half.x, -yc / view.half.y, zn * w, w);
}
fn pixelsToClip(p: vec2f) -> vec4f {
  return project(p, 0.0);
}
// Metres of height to pixels at the current zoom.
fn metresToPixels(m: f32) -> f32 {
  return m / view.metres * view.scale;
}
// A pixel offset on screen is not rotated: points and line widths keep their size.
`;

/** The depth-stencil state of every pipeline that draws in the map's pass but leaves the stencil alone. */
export const NO_STENCIL: GPUDepthStencilState = {
  format: STENCIL_FORMAT,
  depthCompare: 'always',
  depthWriteEnabled: false,
  stencilFront: { compare: 'always', passOp: 'keep' },
  stencilBack: { compare: 'always', passOp: 'keep' },
  stencilReadMask: 0,
  stencilWriteMask: 0,
};

/** For extruded geometry: tested against and written to the depth buffer, stencil untouched. */
export const DEPTH_TESTED: GPUDepthStencilState = { ...NO_STENCIL, depthCompare: 'less', depthWriteEnabled: true };

/** Premultiplied-alpha blending: what every map shader outputs. */
export const BLEND_OVER: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

/** Additive blending: overlapping points glow brighter. */
export const BLEND_ADD: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

/** A 256 × 1 colour ramp texture from a baked table (color.ts). */
export function rampTexture(device: GPUDevice, table: Uint8Array): GPUTexture {
  const tex = device.createTexture({ size: [256, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  device.queue.writeTexture({ texture: tex }, table, { bytesPerRow: 1024 }, [256, 1]);
  return tex;
}
