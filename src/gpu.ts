/**
 * WebGPU compute: the device, asked for once; compute pipelines from WGSL source, compiled by the browser where they
 * are used and kept per device; and the matrix product, a tiled shader in 32-bit floats. No precompiled binary: the
 * shaders are WGSL text, which the browser's GPU driver compiles at run time. Where there is no WebGPU (Node, or a
 * browser without it), `gpuDevice` resolves to `null`.
 */

/** The WebGPU spec's buffer usage flags, as numbers, for where the `GPUBufferUsage` object isn't declared or defined. */
export const GPU_BUFFER = {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
} as const;

/** The WebGPU spec's map mode for reading a buffer back (`GPUMapMode.READ`). */
export const GPU_MAP_READ = 0x0001;

let device: Promise<GPUDevice | null> | undefined;

/**
 * The WebGPU device for compute work, asked for once and shared, with the adapter's largest storage buffers; asked for
 * again after it is lost.
 * @returns The device, or `null` where there is no WebGPU or no adapter.
 */
export function gpuDevice(): Promise<GPUDevice | null> {
  return (device ??= (async () => {
    const gpu = (globalThis as { navigator?: Navigator }).navigator?.gpu;
    if (!gpu) return null;
    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) return null;
      const d = await adapter.requestDevice({
        requiredLimits: { maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize },
      });
      void d.lost.then(() => {
        device = undefined;
      });
      return d;
    } catch {
      return null;
    }
  })());
}

/**
 * Whether this page or worker gets a WebGPU device for compute.
 * @returns A promise of whether `gpuDevice` gives one.
 */
export async function gpuAvailable(): Promise<boolean> {
  return (await gpuDevice()) !== null;
}

const pipelines = new WeakMap<GPUDevice, Map<string, GPUComputePipeline>>();

/**
 * A compute pipeline for WGSL source, compiled on this device the first time and kept for it after.
 * @param d The device.
 * @param code The shader's WGSL source.
 * @param entryPoint The compute entry point's name.
 * @returns The pipeline, with its bind group layouts from the shader (`layout: 'auto'`).
 */
export function computePipeline(d: GPUDevice, code: string, entryPoint = 'main'): GPUComputePipeline {
  let byCode = pipelines.get(d);
  if (!byCode) pipelines.set(d, (byCode = new Map()));
  const key = `${entryPoint}\n${code}`;
  let p = byCode.get(key);
  if (!p) {
    p = d.createComputePipeline({ layout: 'auto', compute: { module: d.createShaderModule({ code }), entryPoint } });
    byCode.set(key, p);
  }
  return p;
}

/** The largest buffer a shader can bind on this device, in bytes. */
export function gpuBufferLimit(d: GPUDevice): number {
  return Math.min(d.limits.maxStorageBufferBindingSize, d.limits.maxBufferSize);
}

// The matrix product: a 16 × 16 tile of the output per workgroup, with the matching tiles of A and B staged in
// workgroup memory. Everything is column-major.
const TILE = 16;
const MATMUL = /* wgsl */ `
struct Dims { n: u32, p: u32, k: u32, pad: u32 }
@group(0) @binding(0) var<uniform> dims: Dims;
@group(0) @binding(1) var<storage, read> a: array<f32>;
@group(0) @binding(2) var<storage, read> b: array<f32>;
@group(0) @binding(3) var<storage, read_write> out: array<f32>;
var<workgroup> ta: array<array<f32, ${TILE}>, ${TILE}>;
var<workgroup> tb: array<array<f32, ${TILE}>, ${TILE}>;

@compute @workgroup_size(${TILE}, ${TILE})
fn main(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>) {
  let i = g.x;
  let j = g.y;
  var sum = 0.0;
  let tiles = (dims.p + ${TILE}u - 1u) / ${TILE}u;
  for (var t = 0u; t < tiles; t++) {
    let ca = t * ${TILE}u + l.y;
    let rb = t * ${TILE}u + l.x;
    ta[l.y][l.x] = select(0.0, a[ca * dims.n + i], i < dims.n && ca < dims.p);
    tb[l.y][l.x] = select(0.0, b[j * dims.p + rb], j < dims.k && rb < dims.p);
    workgroupBarrier();
    for (var q = 0u; q < ${TILE}u; q++) {
      sum += ta[q][l.x] * tb[l.y][q];
    }
    workgroupBarrier();
  }
  if (i < dims.n && j < dims.k) {
    out[j * dims.n + i] = sum;
  }
}`;

/**
 * Whether `gpuMatMul` takes a B of p × k on this device: B goes to the GPU whole, A in chunks of rows.
 * @param d The device.
 * @param p B's rows (A's columns).
 * @param k B's columns.
 * @returns Whether B fits in one of the device's buffers.
 */
export function gpuMatMulFits(d: GPUDevice, p: number, k: number): boolean {
  return p * k * 4 <= gpuBufferLimit(d);
}

/**
 * The matrix product A · B on the GPU, in 32-bit floats (each term rounded to 32 bits, so a relative error around 10⁻⁶
 * of the terms' size). A is n × p and B is p × k, both column-major; the result is n × k, column-major, in 64-bit
 * floats. A goes to the GPU in chunks of rows that fit the device's buffers and workgroup counts.
 * @param d The device (`gpuDevice()`).
 * @param n A's rows.
 * @param p A's columns, B's rows.
 * @param k B's columns.
 * @param a A, column-major: n × p numbers.
 * @param b B, column-major: p × k numbers.
 * @returns A · B, column-major.
 * @throws RangeError where B doesn't fit in one of the device's buffers (`gpuMatMulFits`), or an array's length isn't
 * its size.
 */
export async function gpuMatMul(d: GPUDevice, n: number, p: number, k: number, a: ArrayLike<number>, b: ArrayLike<number>): Promise<Float64Array> {
  if (a.length !== n * p || b.length !== p * k) throw new RangeError(`gpuMatMul: A must hold ${n} × ${p} numbers and B ${p} × ${k}`);
  const out = new Float64Array(n * k);
  if (n === 0 || k === 0 || p === 0) return out;
  if (!gpuMatMulFits(d, p, k)) throw new RangeError(`gpuMatMul: B (${p} × ${k}) is larger than this GPU's buffers`);
  const limit = gpuBufferLimit(d);
  const rowsPerChunk = Math.max(1, Math.min(Math.floor(limit / (4 * Math.max(p, k))), d.limits.maxComputeWorkgroupsPerDimension * TILE));
  const pipeline = computePipeline(d, MATMUL);
  const { STORAGE, COPY_DST, COPY_SRC, UNIFORM, MAP_READ } = GPU_BUFFER;
  const bBuf = d.createBuffer({ size: p * k * 4, usage: STORAGE | COPY_DST });
  d.queue.writeBuffer(bBuf, 0, Float32Array.from(b));
  try {
    for (let r0 = 0; r0 < n; r0 += rowsPerChunk) {
      const m = Math.min(rowsPerChunk, n - r0);
      // This chunk's rows of A, column-major.
      const chunk = new Float32Array(m * p);
      for (let c = 0; c < p; c++) for (let i = 0; i < m; i++) chunk[c * m + i] = a[c * n + r0 + i]!;
      const dims = d.createBuffer({ size: 16, usage: UNIFORM | COPY_DST });
      d.queue.writeBuffer(dims, 0, new Uint32Array([m, p, k, 0]));
      const aBuf = d.createBuffer({ size: chunk.byteLength, usage: STORAGE | COPY_DST });
      d.queue.writeBuffer(aBuf, 0, chunk);
      const size = m * k * 4;
      const oBuf = d.createBuffer({ size, usage: STORAGE | COPY_SRC });
      const read = d.createBuffer({ size, usage: MAP_READ | COPY_DST });
      const bind = d.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [dims, aBuf, bBuf, oBuf].map((buffer, binding) => ({ binding, resource: { buffer } })),
      });
      const enc = d.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(Math.ceil(m / TILE), Math.ceil(k / TILE));
      pass.end();
      enc.copyBufferToBuffer(oBuf, 0, read, 0, size);
      d.queue.submit([enc.finish()]);
      await read.mapAsync(GPU_MAP_READ);
      const result = new Float32Array(read.getMappedRange().slice(0));
      read.unmap();
      for (let j = 0; j < k; j++) for (let i = 0; i < m; i++) out[j * n + r0 + i] = result[j * m + i]!;
      for (const buf of [dims, aBuf, oBuf, read]) buf.destroy();
    }
  } finally {
    bBuf.destroy();
  }
  return out;
}
