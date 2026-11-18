# smaltkit/gpu

WebGPU compute: the device, compute pipelines from WGSL source, and the matrix product in 32-bit floats.

A shader is WGSL text in the TypeScript, which the browser's GPU driver compiles where it runs
(`device.createShaderModule`): no precompiled binary. `gpuDevice` asks for the device once and shares it, with the
adapter's largest storage buffers, and asks again after it is lost. `computePipeline` compiles a shader on a device
the first time and keeps the pipeline for it after.

`gpuMatMul` multiplies a column-major A (n × p) by B (p × k) on the GPU: a 16 × 16 tile of the output per workgroup,
with A sent in chunks of rows that fit the device's buffers. It computes in 32-bit floats, so each result is within
about 10⁻⁶ of its terms' size of the 64-bit product, not equal to it. WebGPU is in browsers only: in Node, and in a
browser without it, `gpuDevice` resolves to `null`.

## Examples

Code that uses the GPU where there is one, and something else where there isn't:

```ts
import { gpuDevice } from 'smaltkit/gpu';

const d = await gpuDevice();
console.log(d === null ? 'no WebGPU here' : 'WebGPU', d === (await gpuDevice()));
```

```text
no WebGPU here true
```

The matrix product, where there is a device: a 2 × 2 by 2 × 1, column-major.

```ts
import { gpuDevice, gpuMatMul } from 'smaltkit/gpu';

const d = await gpuDevice();
if (d) console.log(Array.from(await gpuMatMul(d, 2, 2, 1, [1, 3, 2, 4], [5, 6])));
```

The flags WebGPU's buffers take, as numbers, for code that runs where `GPUBufferUsage` isn't defined:

```ts
import { GPU_BUFFER } from 'smaltkit/gpu';

console.log(GPU_BUFFER.STORAGE | GPU_BUFFER.COPY_DST);
```

```text
136
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

#### computePipeline {#computePipeline}

```ts noplay
function computePipeline(d: GPUDevice, code: string, entryPoint?: string): GPUComputePipeline;
```

A compute pipeline for WGSL source, compiled on this device the first time and kept for it after.

- `@param` d The device.
- `@param` code The shader's WGSL source.
- `@param` entryPoint The compute entry point's name.
- `@returns` The pipeline, with its bind group layouts from the shader (`layout: 'auto'`).

#### gpuAvailable {#gpuAvailable}

```ts noplay
function gpuAvailable(): Promise<boolean>;
```

Whether this page or worker gets a WebGPU device for compute.

- `@returns` A promise of whether `gpuDevice` gives one.

#### gpuBufferLimit {#gpuBufferLimit}

```ts noplay
function gpuBufferLimit(d: GPUDevice): number;
```

The largest buffer a shader can bind on this device, in bytes.

#### gpuDevice {#gpuDevice}

```ts noplay
function gpuDevice(): Promise<GPUDevice | null>;
```

The WebGPU device for compute work, asked for once and shared, with the adapter's largest storage buffers; asked for
again after it is lost.

- `@returns` The device, or `null` where there is no WebGPU or no adapter.

#### gpuMatMul {#gpuMatMul}

```ts noplay
function gpuMatMul(d: GPUDevice, n: number, p: number, k: number, a: ArrayLike<number>, b: ArrayLike<number>): Promise<Float64Array>;
```

The matrix product A · B on the GPU, in 32-bit floats (each term rounded to 32 bits, so a relative error around 10⁻⁶
of the terms' size). A is n × p and B is p × k, both column-major; the result is n × k, column-major, in 64-bit
floats. A goes to the GPU in chunks of rows that fit the device's buffers and workgroup counts.

- `@param` d The device (`gpuDevice()`).
- `@param` n A's rows.
- `@param` p A's columns, B's rows.
- `@param` k B's columns.
- `@param` a A, column-major: n × p numbers.
- `@param` b B, column-major: p × k numbers.
- `@returns` A · B, column-major.
- `@throws` RangeError where B doesn't fit in one of the device's buffers (`gpuMatMulFits`), or an array's length isn't
its size.

#### gpuMatMulFits {#gpuMatMulFits}

```ts noplay
function gpuMatMulFits(d: GPUDevice, p: number, k: number): boolean;
```

Whether `gpuMatMul` takes a B of p × k on this device: B goes to the GPU whole, A in chunks of rows.

- `@param` d The device.
- `@param` p B's rows (A's columns).
- `@param` k B's columns.
- `@returns` Whether B fits in one of the device's buffers.

### Constants

#### GPU_BUFFER {#GPU_BUFFER}

```ts noplay
const GPU_BUFFER: {
    readonly MAP_READ: 1;
    readonly MAP_WRITE: 2;
    readonly COPY_SRC: 4;
    readonly COPY_DST: 8;
    readonly UNIFORM: 64;
    readonly STORAGE: 128;
};
```

The WebGPU spec's buffer usage flags, as numbers, for where the `GPUBufferUsage` object isn't declared or defined.

#### GPU_MAP_READ {#GPU_MAP_READ}

```ts noplay
const GPU_MAP_READ = 1;
```

The WebGPU spec's map mode for reading a buffer back (`GPUMapMode.READ`).

<!-- api:end -->
