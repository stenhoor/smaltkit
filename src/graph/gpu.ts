/** WebGPU device setup, errors and growable buffers. */
import { nextCapacity } from './growth.js';

export class GpuUnavailableError extends Error {
  constructor(message = 'WebGPU is not available in this browser') {
    super(message);
    this.name = 'GpuUnavailableError';
  }
}

/** True when the browser exposes WebGPU and an adapter can be obtained. */
export async function isWebGpuAvailable(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu) return false;
    return (await navigator.gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

export interface Gpu {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  timestamps: boolean;
}

export async function initGpu(canvas: HTMLCanvasElement): Promise<Gpu> {
  if (typeof navigator === 'undefined' || !navigator.gpu) throw new GpuUnavailableError();
  let adapter: GPUAdapter | null = null;
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
      requiredFeatures: timestamps ? ['timestamp-query'] : [],
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
 * A GPU buffer of fixed-size elements that grows by the capacity policy. `ensure` reallocates only
 * when the capacity is exceeded (contents are not kept) and bumps `version` so that bind groups
 * that reference it can be rebuilt.
 */
export class GrowableBuffer {
  buffer: GPUBuffer;
  capacity: number;
  version = 0;

  constructor(
    private readonly device: GPUDevice,
    private readonly label: string,
    private readonly usage: GPUBufferUsageFlags,
    private readonly elementBytes: number,
    minCapacity = 64,
  ) {
    this.capacity = nextCapacity(minCapacity, 0);
    this.buffer = this.create();
  }

  private create(): GPUBuffer {
    return this.device.createBuffer({
      label: this.label,
      size: Math.max(16, Math.ceil((this.capacity * this.elementBytes) / 16) * 16),
      usage: this.usage,
    });
  }

  /** Returns true when the buffer was reallocated. */
  ensure(count: number): boolean {
    const cap = nextCapacity(count, this.capacity);
    if (cap === this.capacity) return false;
    this.buffer.destroy();
    this.capacity = cap;
    this.buffer = this.create();
    this.version++;
    return true;
  }

  write(data: ArrayBufferView, elements: number, offsetElements = 0): void {
    if (elements <= 0) return;
    this.device.queue.writeBuffer(
      this.buffer,
      offsetElements * this.elementBytes,
      data.buffer,
      data.byteOffset + offsetElements * this.elementBytes,
      elements * this.elementBytes,
    );
  }

  destroy(): void {
    this.buffer.destroy();
  }
}
