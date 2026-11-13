/**
 * The graph view: owns the GPU resources, the layout, the camera and the frame loop. It renders on
 * demand: a frame is requested only when something changed (layout running, camera moving, hover,
 * graph or style changes), so an idle view does no GPU work.
 */
import {
  boundsOf, clamp, convertCamera, defaultCamera, dolly, easeInOut, fitCamera, lerpCamera, orbit, pan,
  project, scalePx, unproject, viewProjection, zoomAt2d,
} from './camera.js';
import type { Bounds, CameraState, Projected } from './camera.js';
import { buildCsr, degreeOrder, edgeEndpoints } from './csr.js';
import type { Csr } from './csr.js';
import { GrowableBuffer } from './gpu.js';
import type { Gpu } from './gpu.js';
import { nextCapacity } from './growth.js';
import { InputController } from './input.js';
import type { InputHost } from './input.js';
import { ALL_LABELS_BELOW, GlyphAtlas, LABEL_CAP, MAX_LABEL_CHARS, buildGlyphInstances, chooseLabels, shouldShowAll } from './labels.js';
import { FixedLayout } from './fixed.js';
import { GpuLayout, decayForTicks } from './layout.js';
import { FAMILY_PALETTE_DARK, FAMILY_PALETTE_LIGHT, GroupColors, THEMES, packRgba8, parseColor } from './palette.js';
import type { Rgba } from './palette.js';
import { PICK_FORMAT, Picker } from './picking.js';
import { NONE, hash01, mobilityAround, placeNodes, seedPosition } from './place.js';
import type { PickRequest } from './picking.js';
import { matchNodes } from './search.js';
import { DRAW_WGSL } from './shaders/draw.wgsl.js';
import { ANIM_EXIT, ENTER_MS, EXIT_MS, FLASH_MS, Transitions } from './transition.js';
import type {
  GraphView, GraphViewOptions, GraphViewStats, Hit, LayoutControl, LayoutMode, RenderEdge, RenderGraph, RenderNode, SetGraphOptions, Theme,
  ViewMode,
} from './types.js';

/** World radius of a node of size 1. */
const BASE_RADIUS = 4;
const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';
const MIRROR_EVERY_TICKS = 12;
const LABEL_THROTTLE_MS = 120;
const ANIM_MS = 450;
/** Into the fixed layout, or a recomputed one. */
const FIXED_SWITCH_MS = 400;
/** A spread change in the fixed layout (retargeted while a slider moves). */
const SPREAD_MS = 200;
export const MIN_SPREAD = 0.2;
export const MAX_SPREAD = 5;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

export function clampSpread(s: number): number {
  return Number.isFinite(s) ? Math.min(MAX_SPREAD, Math.max(MIN_SPREAD, s)) : 1;
}
/** Bytes of the frame uniform (struct Frame in draw.wgsl.ts). */
const FRAME_BYTES = 288;

interface Pipelines {
  pick?: boolean;
  node: GPURenderPipeline;
  edge: GPURenderPipeline;
  label?: GPURenderPipeline;
}

/** The fixed layout easing from where nodes were to their slots (in the layout's tween shader). */
interface Tween {
  t0: number;
  ms: number;
  ease: (t: number) => number;
}

interface Anim {
  from: CameraState;
  to: CameraState;
  t0: number;
  ms: number;
}

function putColor(f: Float32Array, o: number, c: Rgba, alpha: number): void {
  f[o] = c[0];
  f[o + 1] = c[1];
  f[o + 2] = c[2];
  f[o + 3] = c[3] * alpha;
}

export class GraphViewImpl implements GraphView {
  private readonly device: GPUDevice;
  private readonly context: GPUCanvasContext;
  private readonly lay: GpuLayout;
  private readonly styleBuf: GrowableBuffer;
  private readonly edgeBuf: GrowableBuffer;
  private readonly glyphBuf: GrowableBuffer;
  private readonly frameBuf: GPUBuffer;
  private readonly pickFrameBuf: GPUBuffer;
  private readonly frameData = new ArrayBuffer(FRAME_BYTES);
  private readonly frameF32 = new Float32Array(this.frameData);
  private readonly frameU32 = new Uint32Array(this.frameData);
  private readonly bgl: GPUBindGroupLayout;
  private readonly draw2d: Pipelines;
  private readonly draw3d: Pipelines;
  private readonly pick2d: Pipelines;
  private readonly pick3d: Pipelines;
  private readonly sampler: GPUSampler;
  private readonly picker: Picker;
  private atlas: GlyphAtlas;
  private bindGroup: GPUBindGroup | null = null;
  private pickBindGroup: GPUBindGroup | null = null;
  private bindKey = '';
  private depthTex: GPUTexture | null = null;
  private depthView: GPUTextureView | null = null;
  /** Reused pass descriptors (views are filled in per frame). */
  private readonly drawPass: GPURenderPassDescriptor;
  private readonly pickPass: GPURenderPassDescriptor;

  // Graph.
  private nodes: RenderNode[] = [];
  private edges: RenderEdge[] = [];
  private n = 0;
  private m = 0;
  private pairs: Uint32Array = new Uint32Array(0);
  private csr: Csr = { offsets: new Uint32Array(1), neighbors: new Uint32Array(0) };
  private order: Uint32Array = new Uint32Array(0);
  private slots = new Uint32Array(0);
  private styleData = new ArrayBuffer(16 * 64);
  private styleU32 = new Uint32Array(this.styleData);
  private styleF32 = new Float32Array(this.styleData);
  private hl = new Uint8Array(0);
  private hlActive = false;
  private hlList: number[] = [];
  private mirror = new Float32Array(0);
  private readScratch = new Float32Array(0);
  private bounds: Bounds = { min: [0, 0, 0], max: [0, 0, 0], radius: 0, count: 0 };
  private idIndex = new Map<string | number, number>();
  private readonly groups = new GroupColors();
  private gen = 0;
  // Transitions: ghosts of removed nodes and edges are drawn after the live ones (slots n.. and m..).
  private readonly tr = new Transitions();
  private readonly epoch = performance.now();
  private animNow = 0;
  private ghostN = 0;
  private ghostE = 0;
  /** Per-node layout mobility while the layout settles a small change (null: all 1). */
  private mob: Float32Array | null = null;
  private edgeData = new Uint32Array(64 * 4);
  private edgeF32 = new Float32Array(this.edgeData.buffer);

  // Layout mode and spread.
  private lm: LayoutMode;
  private sp: number;
  private readonly fixed = new FixedLayout();
  private tween: Tween | null = null;

  // View.
  private mode: ViewMode;
  private theme: Theme;
  private labelsOn: boolean;
  private readonly customPalette: string[] | null;
  private readonly background: 'transparent' | 'theme';
  private cam: CameraState = defaultCamera();
  private anim: Anim | null = null;
  private autoFit = true;
  private hover: Hit | null = null;
  private hoverAt = { x: -1, y: -1 };
  private pickedAt = { x: -1, y: -1 };
  private focused = -1;
  private drag: { node: number; depth: number; dx: number; dy: number } | null = null;
  private hoverCb: ((hit: Hit | null) => void) | null = null;
  private clickCb: ((hit: Hit | null) => void) | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private readonly vp = new Float32Array(16);
  private readonly proj: Projected = { x: 0, y: 0, depth: 0, w: 0 };

  // Labels.
  private glyphData = new Uint32Array(LABEL_CAP * MAX_LABEL_CHARS * 4);
  private glyphCount = 0;
  private labelsDirty = true;
  private labelsDue = 0;

  // Loop.
  private raf = 0;
  private needsDraw = true;
  private stylesDirty = true;
  private layoutActive = false;
  private switching = false;
  private mirrorPromise: Promise<void> | null = null;
  private readonly frameTimes = new Float64Array(128);
  private frameHead = 0;
  private destroyed = false;
  private lost = false;
  private readonly ro: ResizeObserver | null;
  private readonly input: InputController;
  private readonly onDpr = () => this.resize();
  private dprQuery: MediaQueryList | null = null;

  readonly layout: LayoutControl;

  constructor(private readonly canvas: HTMLCanvasElement, gpu: Gpu, opts: GraphViewOptions) {
    this.device = gpu.device;
    this.context = gpu.context;
    this.mode = opts.mode ?? '2d';
    this.theme = opts.theme ?? 'light';
    this.labelsOn = opts.labels ?? true;
    this.customPalette = opts.palette && opts.palette.length > 0 ? [...opts.palette] : null;
    this.background = opts.background ?? 'transparent';
    this.lm = opts.layoutMode === 'fixed' ? 'fixed' : 'force';
    this.sp = opts.spread === undefined ? 1 : clampSpread(opts.spread);
    const device = this.device;

    this.lay = new GpuLayout(device, gpu.timestamps);
    if (opts.layoutTicks !== undefined) this.lay.settings.alphaDecay = decayForTicks(opts.layoutTicks);
    this.lay.dims = this.mode === '2d' ? 2 : 3;
    this.lay.spread = this.sp;
    const S = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.styleBuf = new GrowableBuffer(device, 'render.styles', S, 16);
    this.edgeBuf = new GrowableBuffer(device, 'render.edges', S, 16);
    this.glyphBuf = new GrowableBuffer(device, 'render.glyphs', S, 16);
    const U = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
    this.frameBuf = device.createBuffer({ label: 'render.frame', size: FRAME_BYTES, usage: U });
    this.pickFrameBuf = device.createBuffer({ label: 'render.pickFrame', size: FRAME_BYTES, usage: U });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.picker = new Picker(device);
    this.drawPass = {
      label: 'render',
      colorAttachments: [{ view: null as unknown as GPUTextureView, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: null as unknown as GPUTextureView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    };
    this.pickPass = {
      label: 'pick',
      colorAttachments: [{ view: this.picker.color.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: this.picker.depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    };
    this.dpr = globalThis.devicePixelRatio || 1;
    this.atlas = new GlyphAtlas(device, this.dpr);

    const V = GPUShaderStage.VERTEX, FR = GPUShaderStage.FRAGMENT;
    this.bgl = device.createBindGroupLayout({
      label: 'render',
      entries: [
        { binding: 0, visibility: V | FR, buffer: { type: 'uniform' } },
        { binding: 1, visibility: V, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: V, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: V, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: V, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: FR, texture: { sampleType: 'float' } },
        { binding: 6, visibility: FR, sampler: { type: 'filtering' } },
      ],
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.bgl] });
    const module = device.createShaderModule({ label: 'draw', code: DRAW_WGSL });
    const blend: GPUBlendState = {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    };
    const make = (vs: string, fs: string, pick: boolean, depthWrite: boolean, compare: GPUCompareFunction) =>
      device.createRenderPipeline({
        label: `${vs}/${fs}`,
        layout,
        vertex: { module, entryPoint: vs },
        fragment: {
          module,
          entryPoint: fs,
          targets: [pick ? { format: PICK_FORMAT } : { format: gpu.format, blend }],
        },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: depthWrite, depthCompare: compare },
      });
    this.draw2d = {
      node: make('vs_node', 'fs_node', false, false, 'always'),
      edge: make('vs_edge', 'fs_edge', false, false, 'always'),
      label: make('vs_label', 'fs_label', false, false, 'always'),
    };
    this.draw3d = {
      node: make('vs_node', 'fs_node', false, true, 'less'),
      edge: make('vs_edge', 'fs_edge', false, false, 'less'),
      label: this.draw2d.label!,
    };
    this.pick2d = {
      pick: true,
      node: make('vs_node', 'fs_node_pick', true, false, 'always'),
      edge: make('vs_edge', 'fs_edge_pick', true, false, 'always'),
    };
    this.pick3d = {
      pick: true,
      node: make('vs_node', 'fs_node_pick', true, true, 'less'),
      edge: make('vs_edge', 'fs_edge_pick', true, false, 'less'),
    };

    device.lost.then((info) => {
      this.lost = true;
      if (!this.destroyed) console.error(`smaltcy render: GPU device lost (${info.reason}): ${info.message}`);
    });

    const self = this;
    this.layout = {
      start() {
        if (self.lm === 'fixed') return;
        self.layoutActive = true;
        if (self.lay.alpha < self.lay.settings.alphaMin) self.lay.alpha = 0.3;
        self.requestFrame();
      },
      stop() {
        self.layoutActive = false;
      },
      get running() {
        if (self.lm === 'fixed') return self.n > 0 && self.tween !== null;
        return self.n > 0 && (self.switching || (self.layoutActive && self.lay.running));
      },
      reheat() {
        if (self.lm === 'fixed') {
          self.recomputeFixed(FIXED_SWITCH_MS);
          return;
        }
        self.freeLayout();
        self.lay.alpha = 1;
        self.layoutActive = true;
        self.requestFrame();
      },
    };

    this.input = new InputController(canvas, this.inputHost());
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entries) => this.observed(entries)) : null;
    try {
      this.ro?.observe(canvas, { box: 'device-pixel-content-box' });
    } catch {
      this.ro?.observe(canvas);
    }
    this.watchDpr();
    this.resize();
  }

  // ---- public API -----------------------------------------------------------------------------

  setGraph(g: RenderGraph, opts?: SetGraphOptions): void {
    if (this.destroyed) return;
    const animate = !!opts?.animate;
    const keep = !!opts?.keepPositions && this.n > 0;
    const now = performance.now() - this.epoch;
    const oldN = this.n;
    const oldGhosts = this.tr.ghosts;
    // The CPU's estimate of every old slot: live nodes from the mirror, then the ghosts.
    const oldPos = new Float32Array(Math.max(oldN + oldGhosts.length, 1) * 4);
    oldPos.set(this.mirror.subarray(0, Math.min(this.mirror.length, oldN * 4)));
    for (let k = 0; k < oldGhosts.length; k++) {
      const gh = oldGhosts[k]!, o = (oldN + k) * 4;
      oldPos[o] = gh.x;
      oldPos[o + 1] = gh.y;
      oldPos[o + 2] = gh.z;
      oldPos[o + 3] = 1;
    }
    const hadSlots = oldN + oldGhosts.length > 0;
    const diff = this.tr.update(g.nodes, g.edges, now, { animate, changed: opts?.changed, oldPos });

    const nodes = g.nodes;
    const n = nodes.length;
    const m = g.edges.length;
    this.nodes = nodes;
    this.edges = g.edges;
    this.n = n;
    this.m = m;
    this.gen++;

    this.pairs = edgeEndpoints(n, g.edges);
    this.csr = buildCsr(n, this.pairs, m);
    this.order = degreeOrder(this.csr);
    this.slots = new Uint32Array(n);
    for (let i = 0; i < n; i++) this.slots[i] = this.groups.slot(nodes[i]!.group);
    const index = new Map<string | number, number>();
    for (let i = 0; i < n; i++) if (!index.has(nodes[i]!.id)) index.set(nodes[i]!.id, i);
    this.idIndex = index;

    // Positions. Kept nodes (and nodes that come back from a ghost) start where they are; new ones
    // next to a placed neighbour, else on the seed spiral. Ghosts stay where they were.
    const ghosts = this.tr.ghosts;
    const G = ghosts.length;
    const count = n + G;
    const cap = nextCapacity(count, 0);
    const out = { pos: new Float32Array(cap * 4), src: new Uint32Array(cap), offset: new Float32Array(cap * 4) };
    let kept = 0;
    let fixedMoved = false;
    if (this.lm === 'fixed') {
      // Fixed: every node at its slot. Kept nodes start from where they are drawn (a spread or a
      // move in flight carries on from there); new ones at their slot.
      if (keep) fixedMoved = this.fixed.update(nodes, this.csr, diff.src, this.mode);
      else this.fixed.compute(nodes, this.csr, this.mode);
      this.fixed.targets(this.sp, out.pos);
      for (let i = 0; i < n; i++) {
        const s = diff.src[i]!;
        const o = i * 4;
        if (keep && s < oldN) {
          out.src[i] = s;
          out.offset[o] = out.offset[o + 1] = out.offset[o + 2] = out.offset[o + 3] = 0;
        } else {
          out.src[i] = NONE;
          out.offset.set(out.pos.subarray(o, o + 4), o);
        }
      }
    } else if (keep) {
      for (let i = 0; i < n; i++) if (diff.src[i] !== NONE) kept++;
      placeNodes(n, this.csr, diff.src, oldPos, this.mode, this.lay.settings.linkDistance * this.sp, kept, out);
    } else {
      for (let i = 0; i < n; i++) {
        seedPosition(i, this.mode, out.pos, i * 4);
        out.offset.set(out.pos.subarray(i * 4, i * 4 + 4), i * 4);
        out.src[i] = NONE;
      }
    }
    for (let k = 0; k < G; k++) {
      const gh = ghosts[k]!, o = (n + k) * 4;
      out.pos[o] = gh.x;
      out.pos[o + 1] = gh.y;
      out.pos[o + 2] = gh.z;
      out.pos[o + 3] = 1;
      out.src[n + k] = gh.at;
    }
    this.mirror = out.pos;
    this.bounds = boundsOf(out.pos, n);
    if (hadSlots && (keep || G > 0)) this.lay.regraph(n, count, out.src, out.offset, this.csr);
    else this.lay.setGraph(n, out.pos, this.csr, count);

    if (this.lm === 'fixed') {
      this.mob = null;
      this.lay.setMobility(null);
      this.lay.alpha = 0;
      this.layoutActive = false;
      this.lay.setFixedBase(this.fixed.base, n);
      if (keep && (fixedMoved || this.tween)) {
        // Carry on from the drawn positions: a move of whole clusters in full, a spread change in
        // flight for the time it had left.
        const left = this.tween ? this.tween.t0 + this.tween.ms - performance.now() : 0;
        this.lay.tweenFrom();
        this.tween = fixedMoved
          ? { t0: performance.now(), ms: Math.max(left, FIXED_SWITCH_MS), ease: easeInOut }
          : { t0: performance.now(), ms: Math.max(left, 16), ease: easeOut };
      } else this.tween = null;
      if (keep && this.autoFit) this.animateTo(this.fitState(this.anim ? this.anim.to : this.cam), 300);
    } else if (keep) {
      // Reheat by how much changed, and after a small change let mainly the nodes near it move, so
      // that a step of one or two nodes barely moves the rest of the drawing.
      const changes = diff.added + diff.removed + 0.5 * (diff.edgesAdded + diff.edgesRemoved);
      const running = this.layoutActive && this.lay.running;
      if (changes > 0) {
        // A layout already running freely stays free; a damped one (an earlier small change, or a
        // scrub) adds the nodes near this change to the ones that move.
        const free = running && !this.lay.damped;
        this.lay.alpha = Math.max(this.lay.alpha, Math.min(1, 0.05 + changes / Math.max(n, 1)));
        if (free || changes > n * 0.2) {
          this.mob = null;
          this.lay.setMobility(null);
        } else {
          const mob = mobilityAround(n, this.csr, diff.touched);
          const old = running ? this.mob : null;
          if (old) {
            for (let i = 0; i < n; i++) {
              const s = diff.src[i]!;
              mob[i] = Math.max(mob[i]!, s < old.length ? old[s]! : 1);
            }
          }
          this.mob = mob;
          this.lay.setMobility(mob);
        }
      } else if (this.lay.stale || (this.mob && this.mob.length !== n)) {
        this.mob = null;
        this.lay.setMobility(null);
      } else if (this.mob) {
        // Same nodes, perhaps in another order: carry each node's mobility over.
        const mob = new Float32Array(n), old = this.mob;
        for (let i = 0; i < n; i++) {
          const s = diff.src[i]!;
          mob[i] = s < old.length ? old[s]! : 1;
        }
        this.mob = mob;
        this.lay.setMobility(mob);
      }
      this.layoutActive = n > 0 && (this.layoutActive || changes > 0);
    } else {
      this.mob = null;
      this.lay.setMobility(null);
      this.lay.alpha = 1;
      this.lay.appliedSpread = this.sp;
      this.layoutActive = n > 0;
    }

    // Edges: (source, target, transition kind, start), live ones first, then the ghosts.
    const GE = this.tr.ghostEdges.length;
    this.edgeBuf.ensure(m + GE);
    if (this.edgeData.length < this.edgeBuf.capacity * 4) {
      this.edgeData = new Uint32Array(this.edgeBuf.capacity * 4);
      this.edgeF32 = new Float32Array(this.edgeData.buffer);
    }
    const ed = this.edgeData, ef = this.edgeF32, ek = this.tr.edgeKind, es = this.tr.edgeStart;
    for (let k = 0; k < m; k++) {
      ed[k * 4] = this.pairs[2 * k]!;
      ed[k * 4 + 1] = this.pairs[2 * k + 1]!;
      ed[k * 4 + 2] = ek[k]! << 1;
      ef[k * 4 + 3] = es[k]!;
    }
    const ge = this.tr.ghostEnds;
    for (let j = 0; j < GE; j++) {
      const o = (m + j) * 4;
      ed[o] = ge[2 * j]!;
      ed[o + 1] = ge[2 * j + 1]!;
      ed[o + 2] = ANIM_EXIT << 1;
      ef[o + 3] = this.tr.ghostEdges[j]!.start;
    }
    this.edgeBuf.write(ed, m + GE);
    this.ghostN = G;
    this.ghostE = GE;

    this.styleBuf.ensure(count);
    if (this.styleU32.length < this.styleBuf.capacity * 4) {
      this.styleData = new ArrayBuffer(this.styleBuf.capacity * 16);
      this.styleU32 = new Uint32Array(this.styleData);
      this.styleF32 = new Float32Array(this.styleData);
    }
    this.hl = new Uint8Array(n);
    this.hlActive = false;
    this.hlList = [];
    this.focused = -1;
    if (this.drag) this.dragEnd();
    this.setHover(null);
    this.stylesDirty = true;
    this.labelsDirty = true;
    this.labelsDue = 0;
    this.needsDraw = true;

    if (!keep) {
      this.autoFit = true;
      this.anim = null;
      this.cam = this.fitState(this.cam);
    }
    this.requestFrame();
  }

  setMode(mode: ViewMode): void {
    if (mode === this.mode || this.destroyed) return;
    this.mode = mode;
    this.lay.dims = mode === '2d' ? 2 : 3;
    this.freeLayout();
    this.anim = null;
    this.cam = convertCamera(this.cam, mode, Math.max(this.height, 1));
    if (mode === '3d') this.animateTo({ ...this.cam, yaw: 0.55, pitch: -0.3 }, 700);
    if (this.lm === 'fixed') {
      this.gen++;
      this.recomputeFixed(FIXED_SWITCH_MS + 100);
      this.invalidate(true);
      return;
    }
    this.switching = true;
    const gen = this.gen;
    void this.refreshMirror().then(() => {
      this.switching = false;
      this.requestFrame();
      if (gen !== this.gen || this.destroyed) return;
      const p = this.mirror;
      const spread = Math.max(this.bounds.radius, 20) * 0.6;
      for (let i = 0; i < this.n; i++) p[i * 4 + 2] = mode === '3d' ? (hash01(i) - 0.5) * spread : 0;
      this.lay.setPositions(p);
      this.bounds = boundsOf(p, this.n);
      this.lay.alpha = Math.max(this.lay.alpha, mode === '3d' ? 0.6 : 0.3);
      this.layoutActive = this.n > 0;
      this.invalidate(true);
    });
    this.invalidate(true);
  }

  get layoutMode(): LayoutMode {
    return this.lm;
  }

  get spread(): number {
    return this.sp;
  }

  setLayoutMode(mode: LayoutMode): void {
    if (this.destroyed || (mode !== 'fixed' && mode !== 'force') || mode === this.lm) return;
    this.lm = mode;
    // Reads in flight (and a 2D/3D switch waiting on one) belong to the other mode.
    this.gen++;
    this.switching = false;
    if (this.drag) this.dragEnd();
    if (mode === 'fixed') {
      this.layoutActive = false;
      this.lay.alpha = 0;
      this.lay.alphaTarget = 0;
      this.recomputeFixed(FIXED_SWITCH_MS);
    } else {
      // Physics from where the nodes are now, gently.
      this.tween = null;
      this.lay.appliedSpread = this.sp;
      this.lay.resetVelocities();
      this.freeLayout();
      this.lay.alpha = Math.max(this.lay.alpha, 0.3);
      this.layoutActive = this.n > 0;
      this.invalidate(true);
    }
  }

  setSpread(spread: number): void {
    const s = clampSpread(spread);
    if (this.destroyed || s === this.sp) return;
    this.sp = s;
    this.lay.spread = s;
    // Spreading is the reader moving things themselves: hold the camera so the nodes visibly move apart (fit() frames
    // them again), as a pan or zoom does.
    this.autoFit = false;
    if (this.n === 0 || this.lm === 'fixed') this.lay.appliedSpread = s;
    if (this.n === 0) return;
    if (this.lm === 'fixed') {
      // Retarget from where the nodes are drawn: a slider dragged every frame never queues.
      this.startTween(SPREAD_MS, easeOut);
    } else {
      // Link distance and charge scale with the spread; reheat gently so the drawing grows or
      // shrinks smoothly to its new rest.
      this.freeLayout();
      this.lay.alpha = Math.max(this.lay.alpha, 0.3);
      this.layoutActive = true;
      this.requestFrame();
    }
  }

  setTheme(theme: Theme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.stylesDirty = true;
    this.invalidate(false);
  }

  setLabels(on: boolean): void {
    this.labelsOn = on;
    this.invalidate(true);
  }

  highlight(indices: number[] | null): void {
    this.focused = -1;
    this.hl.fill(0);
    this.hlList = [];
    this.hlActive = indices !== null;
    if (indices) {
      for (const i of indices) {
        if (Number.isInteger(i) && i >= 0 && i < this.n && !this.hl[i]) {
          this.hl[i] = 1;
          this.hlList.push(i);
        }
      }
    }
    this.stylesDirty = true;
    this.invalidate(true);
  }

  search(text: string): number[] {
    if (!text.trim()) {
      this.highlight(null);
      return [];
    }
    const found = matchNodes(this.nodes, text);
    this.highlight(found);
    return found;
  }

  focus(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.n) return;
    this.focused = index;
    this.autoFit = false;
    this.invalidate(true);
    const gen = this.gen;
    void this.refreshMirror().then(() => {
      if (gen !== this.gen || this.destroyed) return;
      const p = this.mirror;
      const base = this.anim ? this.anim.to : this.cam;
      const to = { ...base, x: p[index * 4]!, y: p[index * 4 + 1]!, z: this.mode === '3d' ? p[index * 4 + 2]! : 0 };
      if (this.mode === '2d') to.zoom = Math.max(base.zoom, 2.5 * this.dpr);
      else to.distance = Math.min(base.distance, 160);
      this.animateTo(to, ANIM_MS);
    });
  }

  fit(): void {
    const gen = this.gen;
    void this.refreshMirror().then(() => {
      if (gen !== this.gen || this.destroyed) return;
      this.animateTo(this.fitState(this.anim ? this.anim.to : this.cam), ANIM_MS);
    });
  }

  onHover(cb: (hit: Hit | null) => void): void {
    this.hoverCb = cb;
  }

  onClick(cb: (hit: Hit | null) => void): void {
    this.clickCb = cb;
  }

  async positions(): Promise<Float32Array> {
    const n = this.n;
    if (n === 0) return new Float32Array(0);
    const tmp = new Float32Array(n * 4);
    await this.lay.readPositions(tmp, n);
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      out[i * 3] = tmp[i * 4]!;
      out[i * 3 + 1] = tmp[i * 4 + 1]!;
      out[i * 3 + 2] = tmp[i * 4 + 2]!;
    }
    return out;
  }

  stats(): GraphViewStats {
    // Frames per second over the frames drawn in the last few seconds (0 when idle). With a
    // single recent frame, the interval to the frame before it.
    const now = performance.now();
    const ring = this.frameTimes, len = ring.length;
    const newest = ring[(this.frameHead + len - 1) % len]!;
    let fps = 0;
    if (newest > 0 && now - newest <= 3000) {
      let count = 1, oldest = newest;
      for (let k = 2; k <= len; k++) {
        const t = ring[(this.frameHead + len - k) % len]!;
        if (t <= 0) break;
        if (now - t > 3000) {
          if (count === 1) {
            count = 2;
            oldest = t;
          }
          break;
        }
        count++;
        oldest = t;
      }
      if (count >= 2 && newest > oldest) fps = ((count - 1) * 1000) / (newest - oldest);
    }
    return { nodes: this.n, edges: this.m, fps: Math.round(fps * 10) / 10, layoutMsPerTick: this.lay.msPerTick };
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.setDpr(globalThis.devicePixelRatio || 1);
    this.applySize(Math.round(r.width * this.dpr), Math.round(r.height * this.dpr));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro?.disconnect();
    this.dprQuery?.removeEventListener('change', this.onDpr);
    this.input.destroy();
    this.picker.destroy();
    this.atlas.destroy();
    this.lay.destroy();
    this.styleBuf.destroy();
    this.edgeBuf.destroy();
    this.glyphBuf.destroy();
    this.frameBuf.destroy();
    this.pickFrameBuf.destroy();
    this.depthTex?.destroy();
    try {
      this.context.unconfigure();
    } catch {
      /* already gone */
    }
    this.device.destroy();
  }

  // ---- input host -----------------------------------------------------------------------------

  private inputHost(): InputHost {
    return {
      mode: () => this.mode,
      scale: () => this.cssScale(),
      pan: (dx, dy) => {
        this.anim = null;
        pan(this.cam, this.mode, this.height, dx, dy);
        this.invalidate(true);
      },
      orbit: (dx, dy) => {
        this.anim = null;
        orbit(this.cam, dx, dy);
        this.invalidate(true);
      },
      zoomAt: (x, y, factor) => {
        this.anim = null;
        if (this.mode === '2d') zoomAt2d(this.cam, this.width, this.height, x, y, factor);
        else dolly(this.cam, 1 / factor);
        this.invalidate(true);
      },
      hover: (x, y) => {
        this.hoverAt = { x, y };
        void this.picker.request(x, y).then((hit) => {
          this.pickedAt = { x, y };
          if (this.drag) return;
          if (this.hoverAt.x === x && this.hoverAt.y === y) this.setHover(this.validHit(hit));
        });
        this.requestFrame();
      },
      leave: () => {
        this.hoverAt = { x: -1, y: -1 };
        this.setHover(null);
      },
      pick: (x, y) => this.pickAt(x, y),
      lastHover: () => ({ hit: this.hover, x: this.pickedAt.x, y: this.pickedAt.y }),
      dragStart: (node, x, y) => this.dragStart(node, x, y),
      dragMove: (x, y) => this.dragMove(x, y),
      dragEnd: () => this.dragEnd(),
      click: (hit) => this.clickCb?.(this.validHit(hit)),
      interacted: () => {
        this.autoFit = false;
      },
    };
  }

  /** GPU pick at a canvas pixel (device pixels). */
  private pickAt(x: number, y: number): Promise<Hit | null> {
    const p = this.picker.request(x, y).then((hit) => this.validHit(hit));
    this.requestFrame();
    return p;
  }

  private cssScale(): number {
    const w = this.canvas.getBoundingClientRect().width;
    return w > 0 && this.width > 0 ? this.width / w : this.dpr;
  }

  pick(x: number, y: number): Promise<Hit | null> {
    const k = this.cssScale();
    return this.pickAt(x * k, y * k);
  }

  screenPosition(index: number): { x: number; y: number } | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.n) return null;
    this.computeViewProj();
    const p = project(this.vp, this.width, this.height, this.mirror.subarray(index * 4, index * 4 + 3));
    if (!(p.w > 0)) return null;
    const k = this.cssScale();
    return { x: p.x / k, y: p.y / k };
  }

  sync(): Promise<void> {
    return this.refreshMirror();
  }

  private dragStart(node: number, x: number, y: number): void {
    if (node < 0 || node >= this.n) return;
    this.computeViewProj();
    const p = project(this.vp, this.width, this.height, this.mirror.subarray(node * 4, node * 4 + 3), this.proj);
    this.drag = { node, depth: p.depth, dx: p.x - x, dy: p.y - y };
    this.anim = null;
    this.autoFit = false;
    if (this.lm === 'force') {
      this.lay.setPinned(node, true);
      this.freeLayout();
      this.lay.alphaTarget = 0.3;
      this.layoutActive = true;
    }
    this.setHover({ kind: 'node', index: node });
    this.requestFrame();
  }

  private dragMove(x: number, y: number): void {
    const d = this.drag;
    if (!d) return;
    this.computeViewProj();
    const w = unproject(this.vp, this.width, this.height, x + d.dx, y + d.dy, d.depth);
    if (this.mode === '2d') w[2] = 0;
    const o = d.node * 4;
    this.mirror[o] = w[0];
    this.mirror[o + 1] = w[1];
    this.mirror[o + 2] = w[2];
    this.lay.setNodePosition(d.node, w[0], w[1], w[2]);
    if (this.lm === 'fixed') {
      // Only this node moves, and it stays where it is dropped (at any spread).
      this.fixed.moveNode(d.node, w[0], w[1], w[2], this.sp);
      this.lay.setFixedBaseAt(d.node, this.fixed.base.subarray(o, o + 4));
      this.bounds = boundsOf(this.mirror, this.n);
    }
    this.invalidate(false);
  }

  private dragEnd(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.lay.setPinned(d.node, false);
    this.lay.alphaTarget = 0;
    this.requestFrame();
  }

  // ---- internals ------------------------------------------------------------------------------

  /** Lay the whole graph out afresh in the fixed layout and ease the nodes to it. */
  private recomputeFixed(ms: number): void {
    if (this.n === 0) return;
    this.fixed.compute(this.nodes, this.csr, this.mode);
    this.lay.setFixedBase(this.fixed.base, this.n);
    this.startTween(ms, easeInOut);
  }

  /** Ease from the drawn positions to the fixed slots at the current spread. */
  private startTween(ms: number, ease: (t: number) => number): void {
    this.lay.tweenFrom();
    this.tween = { t0: performance.now(), ms, ease };
    this.fixedMirror(ms);
    this.requestFrame();
  }

  /** The mirror holds the fixed slots: the CPU knows them, no read-back needed. */
  private fixedMirror(fitMs: number): void {
    const n = this.n;
    if (this.mirror.length < n * 4) {
      const m = new Float32Array(nextCapacity(n, 0) * 4);
      m.set(this.mirror.subarray(0, Math.min(this.mirror.length, m.length)));
      this.mirror = m;
    }
    this.fixed.targets(this.sp, this.mirror);
    this.bounds = boundsOf(this.mirror, n);
    if (this.autoFit) this.animateTo(this.fitState(this.anim ? this.anim.to : this.cam), fitMs);
    this.labelsDirty = true;
    this.needsDraw = true;
  }

  /** Every node takes the full layout force again. */
  private freeLayout(): void {
    this.mob = null;
    this.lay.setMobility(null);
  }

  private validHit(hit: Hit | null): Hit | null {
    if (!hit) return null;
    if (hit.kind === 'node' && hit.index < this.n) return hit;
    if (hit.kind === 'edge' && hit.index < this.m) return hit;
    return null;
  }

  private setHover(hit: Hit | null): void {
    const h = this.hover;
    if (h === hit || (h && hit && h.kind === hit.kind && h.index === hit.index)) return;
    this.hover = hit;
    this.canvas.style.cursor = hit?.kind === 'node' ? 'pointer' : '';
    this.hoverCb?.(hit);
    this.labelsDue = 0;
    this.invalidate(true);
  }

  private invalidate(labels: boolean): void {
    this.needsDraw = true;
    if (labels) this.labelsDirty = true;
    this.requestFrame();
  }

  private requestFrame(): void {
    if (!this.raf && !this.destroyed && !this.lost) this.raf = requestAnimationFrame(this.frame);
  }

  private observed(entries: ResizeObserverEntry[]): void {
    const e = entries[entries.length - 1];
    if (!e) return;
    this.setDpr(globalThis.devicePixelRatio || 1);
    const box = e.devicePixelContentBoxSize?.[0];
    if (box) this.applySize(box.inlineSize, box.blockSize);
    else this.applySize(Math.round(e.contentRect.width * this.dpr), Math.round(e.contentRect.height * this.dpr));
  }

  private watchDpr(): void {
    if (typeof matchMedia !== 'function') return;
    this.dprQuery?.removeEventListener('change', this.onDpr);
    this.dprQuery = matchMedia(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`);
    this.dprQuery.addEventListener('change', this.onDpr);
  }

  private setDpr(dpr: number): void {
    if (dpr === this.dpr) return;
    this.dpr = dpr;
    this.atlas.destroy();
    this.atlas = new GlyphAtlas(this.device, dpr);
    this.bindKey = '';
    this.watchDpr();
    this.invalidate(true);
  }

  private applySize(w: number, h: number): void {
    w = Math.max(0, w);
    h = Math.max(0, h);
    if (w === this.width && h === this.height) return;
    const first = this.width === 0 || this.height === 0;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.max(1, w);
    this.canvas.height = Math.max(1, h);
    if (first && this.autoFit && this.n > 0) this.cam = this.fitState(this.cam);
    this.invalidate(true);
  }

  private fitState(from: CameraState): CameraState {
    let maxR = BASE_RADIUS;
    for (let i = 0; i < this.n; i++) {
      const s = this.nodes[i]!.size;
      if (s !== undefined && s > 1) maxR = Math.max(maxR, BASE_RADIUS * Math.sqrt(s));
    }
    const w = Math.max(this.width, 1), h = Math.max(this.height, 1);
    return fitCamera(this.bounds, this.mode, w, h, 24 * this.dpr, maxR, from);
  }

  private animateTo(to: CameraState, ms: number): void {
    this.anim = { from: { ...this.cam }, to, t0: performance.now(), ms };
    this.invalidate(true);
  }

  private refreshMirror(): Promise<void> {
    if (this.mirrorPromise) return this.mirrorPromise;
    const n = this.n;
    const gen = this.gen;
    if (n === 0) return Promise.resolve();
    if (this.readScratch.length < n * 4) this.readScratch = new Float32Array(nextCapacity(n, 0) * 4);
    const p = this.lay
      .readPositions(this.readScratch, n)
      .then(() => {
        if (gen !== this.gen || this.destroyed) return;
        this.mirror.set(this.readScratch.subarray(0, n * 4));
        this.bounds = boundsOf(this.mirror, n);
        if (this.autoFit) {
          const base = this.anim ? this.anim.to : this.cam;
          this.animateTo(this.fitState(base), 300);
        }
        this.labelsDirty = true;
        this.requestFrame();
      })
      .catch(() => {})
      .finally(() => {
        this.mirrorPromise = null;
      });
    this.mirrorPromise = p;
    return p;
  }

  private computeViewProj(): void {
    viewProjection(this.cam, this.mode, Math.max(this.width, 1), Math.max(this.height, 1), this.bounds.radius, this.vp);
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (this.destroyed || this.lost) return;
    let again = false;

    // Layout.
    if (this.layoutActive && !this.switching && this.n > 0) {
      if (this.lay.running) {
        const ms = this.lay.msPerTick;
        const ticks = ms > 0 ? clamp(Math.floor(8 / ms), 1, 4) : 1;
        for (let t = 0; t < ticks; t++) {
          this.lay.tick();
          if (this.lay.ticks % MIRROR_EVERY_TICKS === 0) void this.refreshMirror();
        }
        this.needsDraw = true;
        again = true;
      } else {
        this.layoutActive = false;
        void this.refreshMirror();
      }
    }

    // The fixed layout easing to its slots.
    if (this.tween && this.lm === 'fixed') {
      const tw = this.tween;
      const t = Math.min(1, Math.max(0, (now - tw.t0) / tw.ms));
      this.lay.tweenStep(t >= 1 ? 1 : tw.ease(t), this.sp, this.fixed.pivot);
      this.needsDraw = true;
      if (t >= 1) {
        this.tween = null;
        this.fixedMirror(300);
      } else again = true;
    }

    // Transitions run in the shaders from per-element start times; the loop only keeps drawing
    // until the last one ends, then drops the ghosts.
    this.animNow = now - this.epoch;
    if (this.tr.until > 0) {
      if (this.animNow < this.tr.until) again = true;
      else {
        this.tr.dropGhosts();
        this.ghostN = 0;
        this.ghostE = 0;
      }
      this.needsDraw = true;
    }

    // Camera animation.
    if (this.anim) {
      const a = this.anim;
      const t = Math.min(1, (now - a.t0) / a.ms);
      lerpCamera(a.from, a.to, easeInOut(Math.max(0, t)), this.cam);
      if (t >= 1) this.anim = null;
      else again = true;
      this.needsDraw = true;
      this.labelsDirty = true;
    }

    if (this.stylesDirty) this.uploadStyles();
    if (this.labelsDirty) {
      if (now >= this.labelsDue) {
        this.labelsDirty = false;
        this.labelsDue = now + LABEL_THROTTLE_MS;
        this.updateLabels();
        this.needsDraw = true;
      } else {
        again = true;
      }
    }

    if (this.width > 0 && this.height > 0) {
      this.computeViewProj();
      if (this.needsDraw) {
        this.needsDraw = false;
        this.render();
        this.frameTimes[this.frameHead] = now;
        this.frameHead = (this.frameHead + 1) % this.frameTimes.length;
      }
      const req = this.picker.take();
      if (req) this.renderPick(req);
    }
    if (again) this.requestFrame();
  };

  private uploadStyles(): void {
    this.stylesDirty = false;
    const palette = this.customPalette ?? (this.theme === 'dark' ? FAMILY_PALETTE_DARK : FAMILY_PALETTE_LIGHT);
    const packed = palette.map((c) => packRgba8(parseColor(c)));
    const u = this.styleU32, f = this.styleF32;
    const kind = this.tr.nodeKind, start = this.tr.nodeStart;
    for (let i = 0; i < this.n; i++) {
      const node = this.nodes[i]!;
      const size = node.size !== undefined && Number.isFinite(node.size) ? Math.max(node.size, 0.05) : 1;
      u[i * 4] = packed[this.slots[i]! % packed.length]!;
      f[i * 4 + 1] = BASE_RADIUS * Math.sqrt(size);
      u[i * 4 + 2] = this.hl[i]! | (kind[i]! << 1);
      f[i * 4 + 3] = start[i]!;
    }
    const ghosts = this.tr.ghosts;
    for (let k = 0; k < this.ghostN; k++) {
      const gh = ghosts[k]!, o = (this.n + k) * 4;
      const size = gh.node.size !== undefined && Number.isFinite(gh.node.size) ? Math.max(gh.node.size, 0.05) : 1;
      u[o] = packed[this.groups.slot(gh.node.group) % packed.length]!;
      f[o + 1] = BASE_RADIUS * Math.sqrt(size);
      u[o + 2] = ANIM_EXIT << 1;
      f[o + 3] = gh.start;
    }
    this.styleBuf.write(this.styleU32, this.n + this.ghostN);
    this.needsDraw = true;
  }

  private updateLabels(): void {
    const always: number[] = [];
    if (this.hover?.kind === 'node') always.push(this.hover.index);
    if (this.focused >= 0) always.push(this.focused);
    for (const i of this.hlList) always.push(i);
    let showAll = false;
    if (this.labelsOn && this.n > 0) {
      let spacing: number;
      const b = this.bounds;
      if (this.mode === '2d') {
        const area = Math.max((b.max[0] - b.min[0]) * (b.max[1] - b.min[1]), 1);
        spacing = Math.sqrt(area / this.n) * this.cam.zoom;
      } else {
        spacing = ((2 * Math.max(b.radius, 1)) / Math.cbrt(this.n)) * (scalePx(this.cam, '3d', this.height) / this.cam.distance);
      }
      showAll = shouldShowAll(this.n, spacing, this.dpr);
    }
    let visible: ((i: number) => boolean) | undefined;
    if (showAll) {
      this.computeViewProj();
      const W = this.width, H = this.height, mirror = this.mirror, vp = this.vp, pr = this.proj;
      const margin = 40 * this.dpr;
      visible = (i) => {
        project(vp, W, H, mirror.subarray(i * 4, i * 4 + 3), pr);
        return pr.w > 0 && pr.depth <= 1 && pr.x > -margin && pr.x < W + margin && pr.y > -margin && pr.y < H + margin;
      };
    }
    // While a highlight is active in a larger graph, only highlighted nodes keep their labels.
    if (showAll && this.hlActive && this.n > ALL_LABELS_BELOW) showAll = false;
    const chosen = chooseLabels({ nodeCount: this.n, order: this.order, always, showAll, visible });
    this.glyphCount = buildGlyphInstances(this.nodes, chosen, (ch) => this.atlas.slot(ch), this.glyphData);
    this.glyphBuf.ensure(this.glyphCount);
    this.glyphBuf.write(this.glyphData, this.glyphCount);
  }

  private ensureTargets(): void {
    if (!this.depthTex || this.depthTex.width !== this.width || this.depthTex.height !== this.height) {
      this.depthTex?.destroy();
      this.depthTex = this.device.createTexture({
        label: 'render.depth',
        size: [this.width, this.height],
        format: DEPTH_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.depthView = this.depthTex.createView();
    }
    const key = `${this.lay.pos.version}.${this.styleBuf.version}.${this.edgeBuf.version}.${this.glyphBuf.version}.${this.atlas.fontPx}`;
    if (key !== this.bindKey || !this.bindGroup) {
      this.bindKey = key;
      const entries = (frame: GPUBuffer): GPUBindGroupEntry[] => [
        { binding: 0, resource: { buffer: frame } },
        { binding: 1, resource: { buffer: this.lay.pos.buffer } },
        { binding: 2, resource: { buffer: this.styleBuf.buffer } },
        { binding: 3, resource: { buffer: this.edgeBuf.buffer } },
        { binding: 4, resource: { buffer: this.glyphBuf.buffer } },
        { binding: 5, resource: this.atlas.texture.createView() },
        { binding: 6, resource: this.sampler },
      ];
      this.bindGroup = this.device.createBindGroup({ label: 'render', layout: this.bgl, entries: entries(this.frameBuf) });
      this.pickBindGroup = this.device.createBindGroup({ label: 'pick', layout: this.bgl, entries: entries(this.pickFrameBuf) });
    }
  }

  private fillFrame(pick: PickRequest | null): void {
    const f = this.frameF32, u = this.frameU32;
    const t = THEMES[this.theme];
    f.set(this.vp, 0);
    f[16] = this.width;
    f[17] = this.height;
    f[18] = this.dpr;
    f[19] = scalePx(this.cam, this.mode, this.height);
    if (pick) {
      f[20] = Math.floor(pick.x);
      f[21] = Math.floor(pick.y);
      f[22] = 1;
      f[23] = 1;
    } else {
      f[20] = 0;
      f[21] = 0;
      f[22] = this.width;
      f[23] = this.height;
    }
    const edgeAlpha = this.m > 4000 ? 0.55 : this.m > 500 ? 0.75 : 0.9;
    putColor(f, 24, t.edge, edgeAlpha);
    putColor(f, 28, t.edgeStrong, 1);
    putColor(f, 32, t.accent, 1);
    putColor(f, 36, t.surface, 1);
    putColor(f, 40, t.text, 1);
    // Fog over the depth of the scene in 3D.
    const r = Math.max(this.bounds.radius, 1);
    f[44] = Math.max(0, this.cam.distance - r * 0.6);
    f[45] = this.cam.distance + r * 1.1;
    f[46] = 0.7;
    f[47] = t.dim;
    f[48] = this.atlas.advance;
    f[49] = this.atlas.cellW;
    f[50] = this.atlas.cellH;
    f[51] = this.atlas.cols;
    f[52] = this.atlas.width;
    f[53] = this.atlas.height;
    f[54] = 2 * this.dpr;
    f[55] = 1;
    u[56] = this.hover?.kind === 'node' ? this.hover.index + 1 : 0;
    u[57] = this.hover?.kind === 'edge' ? this.hover.index + 1 : 0;
    u[58] = this.hlActive ? 1 : 0;
    u[59] = this.mode === '3d' ? 1 : 0;
    u[60] = pick ? 1 : 0;
    u[61] = 1;
    u[62] = this.n;
    u[63] = this.focused + 1;
    f[64] = this.animNow;
    f[65] = ENTER_MS;
    f[66] = EXIT_MS;
    f[67] = FLASH_MS;
    u[68] = this.n + this.ghostN;
    u[69] = 0;
    u[70] = 0;
    u[71] = 0;
  }

  private encodeScene(pass: GPURenderPassEncoder, p: Pipelines): void {
    // 2D: edges under nodes. 3D: nodes first so that edges are depth-tested against them, except
    // when picking, where nodes are drawn last so that a node wins over an edge in front of it.
    // Ghosts (after the live slots) are drawn but never picked.
    const nodes = p.pick ? this.n : this.n + this.ghostN;
    const edges = p.pick ? this.m : this.m + this.ghostE;
    const nodesFirst = this.mode === '3d' && !p.pick;
    if (nodesFirst && nodes > 0) {
      pass.setPipeline(p.node);
      pass.draw(6, nodes);
    }
    if (edges > 0) {
      pass.setPipeline(p.edge);
      pass.draw(12, edges);
    }
    if (!nodesFirst && nodes > 0) {
      pass.setPipeline(p.node);
      pass.draw(6, nodes);
    }
    if (p.label && this.glyphCount > 0) {
      pass.setPipeline(p.label);
      pass.draw(6, this.glyphCount);
    }
  }

  private render(): void {
    this.ensureTargets();
    this.atlas.flush();
    this.fillFrame(null);
    this.device.queue.writeBuffer(this.frameBuf, 0, this.frameData);
    const color = this.drawPass.colorAttachments[0]!;
    const bg = THEMES[this.theme].bg;
    const clear = color.clearValue as { r: number; g: number; b: number; a: number };
    const opaque = this.background === 'theme';
    clear.r = opaque ? bg[0] : 0;
    clear.g = opaque ? bg[1] : 0;
    clear.b = opaque ? bg[2] : 0;
    clear.a = opaque ? 1 : 0;
    color.view = this.context.getCurrentTexture().createView();
    this.drawPass.depthStencilAttachment!.view = this.depthView!;
    const enc = this.device.createCommandEncoder({ label: 'render' });
    const pass = enc.beginRenderPass(this.drawPass);
    pass.setBindGroup(0, this.bindGroup);
    this.encodeScene(pass, this.mode === '2d' ? this.draw2d : this.draw3d);
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  private renderPick(req: PickRequest): void {
    this.ensureTargets();
    this.fillFrame(req);
    this.device.queue.writeBuffer(this.pickFrameBuf, 0, this.frameData);
    const enc = this.device.createCommandEncoder({ label: 'pick' });
    const pass = enc.beginRenderPass(this.pickPass);
    pass.setBindGroup(0, this.pickBindGroup);
    this.encodeScene(pass, this.mode === '2d' ? this.pick2d : this.pick3d);
    pass.end();
    this.picker.encodeCopy(enc);
    this.device.queue.submit([enc.finish()]);
    this.picker.resolveAfterSubmit(req, () => {
      if (this.picker.wanted) this.requestFrame();
    });
  }
}
