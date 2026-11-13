/** The force-directed layout on the GPU (see shaders/layout.wgsl.ts for the forces). */
import type { Csr } from './csr.js';
import { GrowableBuffer } from './gpu.js';
import { GATHER_WGSL, LAYOUT_WGSL, TWEEN_WGSL } from './shaders/layout.wgsl.js';

const TILE = 256;
/** Above this many nodes, repulsion samples a rotating subset of tiles each tick. */
export const EXACT_REPULSION_LIMIT = 20480;
const SAMPLED_TILES = EXACT_REPULSION_LIMIT / TILE;
const ZERO4 = new Float32Array(4);

export interface LayoutSettings {
  /** Repulsion strength (d3 many-body strength, positive = repel). */
  charge: number;
  linkDistance: number;
  linkStrength: number;
  gravity: number;
  /** d3 velocityDecay. */
  decay: number;
  alphaMin: number;
  alphaDecay: number;
}

/** The alphaDecay that cools from 1 to alphaMin (0.001) in `ticks` ticks. */
export function decayForTicks(ticks: number): number {
  return 1 - Math.pow(0.001, 1 / Math.max(1, ticks));
}

export const DEFAULT_LAYOUT: LayoutSettings = {
  charge: 30,
  linkDistance: 30,
  linkStrength: 1,
  gravity: 0.04,
  decay: 0.4,
  alphaMin: 0.001,
  alphaDecay: decayForTicks(300),
};

/** How many repulsion tiles a tick visits and the scale that compensates for the sample. */
export function repulsionTiles(n: number): { total: number; tiles: number; scale: number } {
  const total = Math.max(1, Math.ceil(n / TILE));
  if (n <= EXACT_REPULSION_LIMIT) return { total, tiles: total, scale: 1 };
  return { total, tiles: SAMPLED_TILES, scale: total / SAMPLED_TILES };
}

/** The most a tick scales the positions by when the spread changes (in log terms): ×1.06. */
export const MAX_RESCALE = 0.06;

export class GpuLayout {
  readonly settings: LayoutSettings = { ...DEFAULT_LAYOUT };
  /**
   * Scales the equilibrium: link distance × spread and charge × spread², so that every force
   * (springs, repulsion, the linear gravity) scales alike and the layout at rest grows by `spread`.
   */
  spread = 1;
  /** The spread the positions are drawn at: ticks scale them towards `spread` (MAX_RESCALE a tick). */
  appliedSpread = 1;
  /** Current positions (read by the renderer). vec4 per node. */
  readonly pos: GrowableBuffer;
  private readonly next: GrowableBuffer;
  private readonly vel: GrowableBuffer;
  private readonly pinned: GrowableBuffer;
  private readonly offsets: GrowableBuffer;
  private readonly nbrs: GrowableBuffer;
  private readonly mobility: GrowableBuffer;
  private mobilityData = new Float32Array(64);
  /** Whether some node's mobility is below 1 (or the buffer holds no mobility yet). */
  private dampedNow = true;
  private mobilityStale = true;
  private readonly params: GPUBuffer;
  private readonly paramData = new ArrayBuffer(80);
  private readonly paramU32 = new Uint32Array(this.paramData);
  private readonly paramF32 = new Float32Array(this.paramData);
  private readonly pipeline: GPUComputePipeline;
  private readonly gatherPipeline: GPUComputePipeline;
  private readonly gatherParams: GPUBuffer;
  private readonly gatherData = new Uint32Array(4);
  private readonly gatherSrc: GrowableBuffer;
  private readonly gatherOff: GrowableBuffer;
  // The fixed layout's animation (see TWEEN_WGSL).
  private readonly fixedBase: GrowableBuffer;
  private readonly fixedFrom: GrowableBuffer;
  private readonly tweenPipeline: GPUComputePipeline;
  private readonly tweenParams: GPUBuffer;
  private readonly tweenData = new ArrayBuffer(48);
  private readonly tweenU32 = new Uint32Array(this.tweenData);
  private readonly tweenF32 = new Float32Array(this.tweenData);
  private tweenBind: GPUBindGroup | null = null;
  private tweenKey = '';
  /** Nodes the fixed base holds (0 until `setFixedBase`). */
  private fixedN = 0;
  private bindGroup: GPUBindGroup | null = null;
  private bindKey = '';
  private pinnedData = new Uint32Array(64);
  private readonly zeroVec = new Float32Array(4);
  private readonly one = new Uint32Array([1]);
  private readonly zero = new Uint32Array([0]);

  n = 0;
  dims: 2 | 3 = 2;
  alpha = 0;
  alphaTarget = 0;
  ticks = 0;
  msPerTick = 0;

  private readonly staging: GPUBuffer[] = [];
  private readonly plainPass = { label: 'layout.tick' };
  private readonly timedPass: { label: string; timestampWrites: GPUComputePassTimestampWrites } | null;
  private readonly query: { set: GPUQuerySet; resolve: GPUBuffer; read: GPUBuffer; busy: boolean } | null;

  constructor(private readonly device: GPUDevice, timestamps: boolean) {
    const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.pos = new GrowableBuffer(device, 'layout.pos', S | GPUBufferUsage.COPY_SRC, 16);
    this.next = new GrowableBuffer(device, 'layout.next', S | GPUBufferUsage.COPY_SRC, 16);
    this.vel = new GrowableBuffer(device, 'layout.vel', S, 16);
    this.pinned = new GrowableBuffer(device, 'layout.pinned', S, 4);
    this.offsets = new GrowableBuffer(device, 'layout.offsets', S, 4);
    this.nbrs = new GrowableBuffer(device, 'layout.nbrs', S, 4);
    this.mobility = new GrowableBuffer(device, 'layout.mobility', S, 4);
    this.params = device.createBuffer({ label: 'layout.params', size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const module = device.createShaderModule({ label: 'layout', code: LAYOUT_WGSL });
    this.pipeline = device.createComputePipeline({ label: 'layout.tick', layout: 'auto', compute: { module, entryPoint: 'tick' } });
    const gather = device.createShaderModule({ label: 'layout.gather', code: GATHER_WGSL });
    this.gatherPipeline = device.createComputePipeline({ label: 'layout.gather', layout: 'auto', compute: { module: gather, entryPoint: 'gather' } });
    this.gatherParams = device.createBuffer({ label: 'layout.gatherParams', size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.gatherSrc = new GrowableBuffer(device, 'layout.gatherSrc', S, 4);
    this.gatherOff = new GrowableBuffer(device, 'layout.gatherOff', S, 16);
    this.fixedBase = new GrowableBuffer(device, 'layout.fixedBase', S, 16);
    this.fixedFrom = new GrowableBuffer(device, 'layout.fixedFrom', S, 16);
    const tween = device.createShaderModule({ label: 'layout.tween', code: TWEEN_WGSL });
    this.tweenPipeline = device.createComputePipeline({ label: 'layout.tween', layout: 'auto', compute: { module: tween, entryPoint: 'tween' } });
    this.tweenParams = device.createBuffer({ label: 'layout.tweenParams', size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.query = timestamps
      ? {
          set: device.createQuerySet({ type: 'timestamp', count: 2 }),
          resolve: device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }),
          read: device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
          busy: false,
        }
      : null;
    this.timedPass = this.query
      ? { label: 'layout.tick', timestampWrites: { querySet: this.query.set, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } }
      : null;
  }

  /**
   * Upload a graph: positions are stride-4 (xyzw), velocities reset. `count` ≥ n slots are written:
   * the ones after n are drawn (ghosts of removed nodes) but take no part in the layout.
   */
  setGraph(n: number, positions: Float32Array, csr: Csr, count = n): void {
    this.resize(n, count, csr);
    this.pos.write(positions, count);
    this.resetState(csr);
  }

  /**
   * Upload a graph whose start positions are gathered on the GPU from the current ones: slot i of
   * `count` takes old slot `src[i]` plus `offset[i]` (xyzw), or `offset[i]` alone when `src[i]` is
   * 0xffffffff. Old slots are the slots of the previous upload (its ghosts included).
   */
  regraph(n: number, count: number, src: Uint32Array, offset: Float32Array, csr: Csr): void {
    if (count === 0) {
      this.setGraph(n, new Float32Array(0), csr, 0);
      return;
    }
    const device = this.device;
    this.gatherSrc.ensure(count);
    this.gatherOff.ensure(count);
    this.gatherSrc.write(src, count);
    this.gatherOff.write(offset, count);
    this.next.ensure(count);
    this.gatherData[0] = count;
    this.gatherData[1] = this.dims;
    device.queue.writeBuffer(this.gatherParams, 0, this.gatherData);
    const bind = device.createBindGroup({
      label: 'layout.gather',
      layout: this.gatherPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.gatherParams } },
        { binding: 1, resource: { buffer: this.pos.buffer } },
        { binding: 2, resource: { buffer: this.next.buffer } },
        { binding: 3, resource: { buffer: this.gatherSrc.buffer } },
        { binding: 4, resource: { buffer: this.gatherOff.buffer } },
      ],
    });
    let enc = device.createCommandEncoder({ label: 'layout.gather' });
    const pass = enc.beginComputePass({ label: 'layout.gather' });
    pass.setPipeline(this.gatherPipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.ceil(count / TILE));
    pass.end();
    device.queue.submit([enc.finish()]);
    // Submitted: the old position buffer may now be replaced.
    this.resize(n, count, csr);
    enc = device.createCommandEncoder({ label: 'layout.gatherCopy' });
    enc.copyBufferToBuffer(this.next.buffer, 0, this.pos.buffer, 0, count * 16);
    device.queue.submit([enc.finish()]);
    this.resetState(csr);
  }

  private resize(n: number, count: number, csr: Csr): void {
    if (n !== this.n) this.msPerTick = 0;
    this.n = n;
    this.pos.ensure(count);
    this.next.ensure(count);
    this.vel.ensure(n);
    this.pinned.ensure(n);
    this.offsets.ensure(n + 1);
    this.nbrs.ensure(csr.neighbors.length);
    if (this.mobility.ensure(n)) this.mobilityStale = true;
  }

  /** Whether some nodes take only part of the force (after `setMobility` with values). */
  get damped(): boolean {
    return this.dampedNow;
  }

  /** Whether the mobility buffer was reallocated and needs `setMobility` before the next tick. */
  get stale(): boolean {
    return this.mobilityStale;
  }

  /** How much of the force each node takes (0..1 per node); null sets every node to 1. */
  setMobility(m: Float32Array | null): void {
    if (!m && !this.dampedNow && !this.mobilityStale) return;
    if (this.mobilityData.length < this.mobility.capacity) this.mobilityData = new Float32Array(this.mobility.capacity);
    if (m) this.mobilityData.set(m.subarray(0, Math.min(m.length, this.n)));
    else this.mobilityData.fill(1);
    this.mobility.write(this.mobilityData, m ? Math.min(m.length, this.n) : this.mobility.capacity);
    this.dampedNow = !!m;
    this.mobilityStale = false;
  }

  private resetState(csr: Csr): void {
    const n = this.n;
    const zeros = new Float32Array(this.vel.capacity * 4);
    this.vel.write(zeros, this.vel.capacity);
    if (this.pinnedData.length < this.pinned.capacity) this.pinnedData = new Uint32Array(this.pinned.capacity);
    this.pinnedData.fill(0);
    this.pinned.write(this.pinnedData, this.pinned.capacity);
    this.offsets.write(csr.offsets, n + 1);
    this.nbrs.write(csr.neighbors, csr.neighbors.length);
  }

  /** Overwrite all positions (stride 4) and reset velocities. */
  setPositions(positions: Float32Array): void {
    this.pos.write(positions, this.n);
    const zeros = new Float32Array(this.n * 4);
    this.vel.write(zeros, this.n);
  }

  setNodePosition(i: number, x: number, y: number, z: number): void {
    const v = this.zeroVec;
    v[0] = x; v[1] = y; v[2] = z; v[3] = 1;
    this.device.queue.writeBuffer(this.pos.buffer, i * 16, v);
    this.device.queue.writeBuffer(this.vel.buffer, i * 16, ZERO4);
    // A tween in flight holds the node where it is put.
    if (i < this.fixedN) this.device.queue.writeBuffer(this.fixedFrom.buffer, i * 16, v);
  }

  /** Zero every velocity (before the forces take over from positions set otherwise). */
  resetVelocities(): void {
    this.vel.write(new Float32Array(this.vel.capacity * 4), this.vel.capacity);
  }

  /** Upload the fixed layout's base positions (xyzw, spread 1) for the first `n` nodes. */
  setFixedBase(base: Float32Array, n = this.n): void {
    this.fixedBase.ensure(n);
    this.fixedFrom.ensure(n);
    this.fixedBase.write(base, n);
    this.fixedN = n;
  }

  /** Change one node's fixed base position. */
  setFixedBaseAt(i: number, base: Float32Array): void {
    if (i < 0 || i >= this.fixedN) return;
    this.fixedBase.write(base, 1, i);
  }

  /** Start a tween from the positions drawn now. */
  tweenFrom(): void {
    const n = Math.min(this.n, this.fixedN);
    if (n === 0) return;
    const enc = this.device.createCommandEncoder({ label: 'layout.tweenFrom' });
    enc.copyBufferToBuffer(this.pos.buffer, 0, this.fixedFrom.buffer, 0, n * 16);
    this.device.queue.submit([enc.finish()]);
  }

  /** Positions = from → the fixed slots at `spread` around `pivot`, at eased progress t (1: exactly there). */
  tweenStep(t: number, spread: number, pivot: readonly number[]): void {
    const n = Math.min(this.n, this.fixedN);
    if (n === 0) return;
    const key = `${this.pos.version}.${this.fixedBase.version}.${this.fixedFrom.version}`;
    if (!this.tweenBind || key !== this.tweenKey) {
      this.tweenKey = key;
      this.tweenBind = this.device.createBindGroup({
        label: 'layout.tween',
        layout: this.tweenPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.tweenParams } },
          { binding: 1, resource: { buffer: this.fixedBase.buffer } },
          { binding: 2, resource: { buffer: this.fixedFrom.buffer } },
          { binding: 3, resource: { buffer: this.pos.buffer } },
        ],
      });
    }
    const u = this.tweenU32, f = this.tweenF32;
    u[0] = n;
    u[1] = this.dims;
    f[4] = pivot[0]!;
    f[5] = pivot[1]!;
    f[6] = pivot[2]!;
    f[7] = t;
    f[8] = spread;
    this.device.queue.writeBuffer(this.tweenParams, 0, this.tweenData);
    const enc = this.device.createCommandEncoder({ label: 'layout.tween' });
    const pass = enc.beginComputePass({ label: 'layout.tween' });
    pass.setPipeline(this.tweenPipeline);
    pass.setBindGroup(0, this.tweenBind);
    pass.dispatchWorkgroups(Math.ceil(n / TILE));
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  setPinned(i: number, on: boolean): void {
    if (i < 0 || i >= this.n) return;
    this.device.queue.writeBuffer(this.pinned.buffer, i * 4, on ? this.one : this.zero);
  }

  get running(): boolean {
    return this.alpha >= this.settings.alphaMin || this.alphaTarget > 0 || this.appliedSpread !== this.spread;
  }

  /** Encode and submit one tick at the current alpha, then cool. */
  tick(): void {
    if (this.n === 0) return;
    const key = `${this.pos.version}.${this.next.version}.${this.vel.version}.${this.pinned.version}.${this.offsets.version}.${this.nbrs.version}.${this.mobility.version}`;
    if (!this.bindGroup || key !== this.bindKey) {
      this.bindKey = key;
      this.bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.params } },
          { binding: 1, resource: { buffer: this.pos.buffer } },
          { binding: 2, resource: { buffer: this.next.buffer } },
          { binding: 3, resource: { buffer: this.vel.buffer } },
          { binding: 4, resource: { buffer: this.pinned.buffer } },
          { binding: 5, resource: { buffer: this.offsets.buffer } },
          { binding: 6, resource: { buffer: this.nbrs.buffer } },
          { binding: 7, resource: { buffer: this.mobility.buffer } },
        ],
      });
    }
    const s = this.settings;
    this.alpha += (this.alphaTarget - this.alpha) * s.alphaDecay;
    const rep = repulsionTiles(this.n);
    const u = this.paramU32, f = this.paramF32;
    u[0] = this.n;
    u[1] = rep.tiles;
    u[2] = (this.ticks * rep.tiles) % rep.total;
    u[3] = rep.total;
    u[4] = this.dims;
    f[8] = this.alpha;
    // Scale the drawing towards a new spread, at most MAX_RESCALE a tick; the forces take the scale
    // the drawing is at, so that they never fling nodes towards a size it has not reached yet.
    let r = 1;
    if (this.appliedSpread !== this.spread) {
      const d = Math.log(this.spread / this.appliedSpread);
      if (Math.abs(d) <= MAX_RESCALE) {
        r = this.spread / this.appliedSpread;
        this.appliedSpread = this.spread;
      } else {
        r = Math.exp(Math.sign(d) * MAX_RESCALE);
        this.appliedSpread *= r;
      }
    }
    const k = this.appliedSpread;
    f[9] = s.charge * k * k;
    f[10] = rep.scale;
    f[11] = k * k; // distanceMin² (d3 distanceMin = 1, scaled)
    f[12] = s.linkDistance * k;
    f[13] = s.linkStrength;
    f[14] = s.gravity;
    f[15] = s.decay;
    f[16] = 200 * k;
    f[17] = r;
    this.device.queue.writeBuffer(this.params, 0, this.paramData);

    const q = this.query && !this.query.busy && this.ticks % 10 === 0 ? this.query : null;
    const enc = this.device.createCommandEncoder({ label: 'layout' });
    const pass = enc.beginComputePass(q ? this.timedPass! : this.plainPass);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.dispatchWorkgroups(Math.ceil(this.n / TILE));
    pass.end();
    enc.copyBufferToBuffer(this.next.buffer, 0, this.pos.buffer, 0, this.n * 16);
    if (q) {
      enc.resolveQuerySet(q.set, 0, 2, q.resolve, 0);
      enc.copyBufferToBuffer(q.resolve, 0, q.read, 0, 16);
    }
    this.device.queue.submit([enc.finish()]);
    this.ticks++;
    if (q) {
      q.busy = true;
      q.read.mapAsync(GPUMapMode.READ).then(
        () => {
          const t = new BigUint64Array(q.read.getMappedRange());
          const ns = Number(t[1]! - t[0]!);
          q.read.unmap();
          q.busy = false;
          if (ns > 0) this.msPerTick = this.msPerTick ? this.msPerTick * 0.7 + (ns / 1e6) * 0.3 : ns / 1e6;
        },
        () => {
          q.busy = false;
        },
      );
    } else if (!this.query && this.ticks % 10 === 1) {
      const t0 = performance.now();
      this.device.queue.onSubmittedWorkDone().then(() => {
        const ms = performance.now() - t0;
        this.msPerTick = this.msPerTick ? this.msPerTick * 0.7 + ms * 0.3 : ms;
      });
    }
  }

  /** Copy the first `n` positions (stride 4) into `out`, in queue order after all submitted ticks. */
  async readPositions(out: Float32Array, n = this.n): Promise<void> {
    if (n === 0) return;
    const bytes = n * 16;
    let buf = this.staging.pop();
    if (!buf || buf.size < bytes) {
      buf?.destroy();
      buf = this.device.createBuffer({ label: 'layout.readback', size: Math.ceil((bytes * 1.25) / 16) * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    }
    const enc = this.device.createCommandEncoder({ label: 'layout.readback' });
    enc.copyBufferToBuffer(this.pos.buffer, 0, buf, 0, bytes);
    this.device.queue.submit([enc.finish()]);
    try {
      await buf.mapAsync(GPUMapMode.READ, 0, bytes);
      out.set(new Float32Array(buf.getMappedRange(0, bytes)));
      buf.unmap();
      this.staging.push(buf);
    } catch (e) {
      buf.destroy();
      throw e;
    }
  }

  destroy(): void {
    for (const b of [this.pos, this.next, this.vel, this.pinned, this.offsets, this.nbrs, this.mobility, this.gatherSrc, this.gatherOff, this.fixedBase, this.fixedFrom]) b.destroy();
    this.params.destroy();
    this.tweenParams.destroy();
    this.gatherParams.destroy();
    for (const b of this.staging) b.destroy();
    if (this.query) {
      this.query.set.destroy();
      this.query.resolve.destroy();
      if (!this.query.busy) this.query.read.destroy();
    }
  }
}
