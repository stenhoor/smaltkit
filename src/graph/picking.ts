/** GPU picking: ids rendered into a 1×1 r32uint target at the pointer, read back asynchronously. */
import type { Hit } from './types.js';

export const PICK_FORMAT: GPUTextureFormat = 'r32uint';
const EDGE_BIT = 0x80000000;

/** Decode the id the pick shaders write: 0 none, node index + 1, or (edge index + 1) | EDGE_BIT. */
export function decodePick(v: number): Hit | null {
  if (v === 0) return null;
  if (v & EDGE_BIT) return { kind: 'edge', index: (v & ~EDGE_BIT) - 1 };
  return { kind: 'node', index: v - 1 };
}

export interface PickRequest {
  x: number;
  y: number;
  waiters: ((h: Hit | null) => void)[];
}

/**
 * One pick in flight at a time; a newer request replaces a queued one (its waiters get the newer
 * result), so hover picks are throttled to the frame rate and never pile up.
 */
export class Picker {
  readonly color: GPUTexture;
  readonly depth: GPUTexture;
  private readonly read: GPUBuffer;
  private pending: PickRequest | null = null;
  private inFlight = false;
  private destroyed = false;

  constructor(private readonly device: GPUDevice) {
    this.color = device.createTexture({ label: 'pick.color', size: [1, 1], format: PICK_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    this.depth = device.createTexture({ label: 'pick.depth', size: [1, 1], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.read = device.createBuffer({ label: 'pick.read', size: 256, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  }

  request(x: number, y: number): Promise<Hit | null> {
    return new Promise((resolve) => {
      const waiters = this.pending ? this.pending.waiters : [];
      waiters.push(resolve);
      this.pending = { x, y, waiters };
    });
  }

  /** The request to render now, if any and none is in flight. */
  take(): PickRequest | null {
    if (this.inFlight || !this.pending) return null;
    const r = this.pending;
    this.pending = null;
    return r;
  }

  get wanted(): boolean {
    return this.pending !== null;
  }

  /** After the pick pass is encoded: copy the pixel under the pointer to the read buffer. */
  encodeCopy(enc: GPUCommandEncoder): void {
    enc.copyTextureToBuffer({ texture: this.color }, { buffer: this.read, bytesPerRow: 256 }, [1, 1]);
    this.inFlight = true;
  }

  /** After the submit that holds the copy: map, decode and resolve the request. */
  resolveAfterSubmit(req: PickRequest, onDone: () => void): void {
    this.read.mapAsync(GPUMapMode.READ, 0, 4).then(
      () => {
        const v = new Uint32Array(this.read.getMappedRange(0, 4))[0]!;
        this.read.unmap();
        this.inFlight = false;
        const hit = decodePick(v);
        for (const w of req.waiters) w(hit);
        onDone();
      },
      () => {
        this.inFlight = false;
        for (const w of req.waiters) w(null);
      },
    );
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const w of this.pending?.waiters ?? []) w(null);
    this.pending = null;
    this.color.destroy();
    this.depth.destroy();
    if (!this.inFlight) this.read.destroy();
  }
}
