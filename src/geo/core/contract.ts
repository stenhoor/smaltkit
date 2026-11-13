/**
 * The contracts between the pieces: what the map hands a layer or a basemap each frame, and what they implement. They
 * live in core so that the map, the layers and the basemap depend on core alone, never on each other: a layer written
 * elsewhere, or the basemap on its own, plugs into the map through these types.
 *
 * Each frame the map runs, in order:
 *
 *   1. every layer's `prepare`: compute passes and offscreen passes (aggregation, density), on the frame's encoder;
 *   2. its main pass: the basemap's `draw`, then every layer's `draw`, then the basemap's `drawLabels`;
 *   3. on hover or click, a picking pass: every pickable layer's `pick`, into a 32-bit id target.
 */
import type { Camera } from './camera.js';
import type { UniformArena } from './gpu.js';
import type { Bounds } from './mercator.js';

export interface LayerGpu {
  readonly device: GPUDevice;
  /** The canvas's colour format. */
  readonly format: GPUTextureFormat;
  /** Samples per pixel in the main pass. */
  readonly samples: number;
  /** Group 0 of every pipeline: the view uniforms. */
  readonly viewLayout: GPUBindGroupLayout;
  /** The frame's uniform arena; a draw's group-1 binding 0 is a 256-byte slot of it, at a dynamic offset. */
  readonly arena: UniformArena;
}

export interface Frame {
  readonly camera: Camera;
  readonly pixelRatio: number;
  /** Seconds since the map started; animations read it. */
  readonly time: number;
  readonly viewGroup: GPUBindGroup;
  /** For compute and offscreen passes in `prepare`. */
  readonly encoder: GPUCommandEncoder;
  /** Size of the drawing buffer in device pixels. */
  readonly width: number;
  readonly height: number;
  /** Dark basemap: layers may pick lighter defaults. */
  readonly dark: boolean;
}

/** One picked object: the layer it is in, its index in the layer's data, and what the layer says about it. */
export interface Picked {
  readonly layer: string;
  readonly index: number;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly lngLat?: readonly [number, number];
}

export interface Layer {
  readonly id: string;
  visible: boolean;
  /** Set while the layer animates (trips playing, arcs flowing): the map keeps drawing frames. */
  readonly animating?: boolean;
  /** World bounds of the layer's data, for fitting the view. */
  readonly bounds?: Bounds;
  /** How many objects the layer draws, for the frame statistics. */
  readonly count: number;
  /** Creates pipelines and buffers. Called once, when the layer is added to a map. */
  attach(gpu: LayerGpu, redraw: () => void): void;
  prepare?(frame: Frame): void;
  draw(pass: GPURenderPassEncoder, frame: Frame): void;
  /** Draws ids into the picking target: `(layerSlot << 24) | (index + 1)`, 0 for nothing. */
  pick?(pass: GPURenderPassEncoder, frame: Frame, slot: number): void;
  /** What a picked index means: the row's values, or a bin's count. */
  describe?(index: number): Picked['properties'];
  /** Highlights one object (or none, with -1). */
  highlight?(index: number): void;
  destroy(): void;
}

/** What the map needs from a basemap (basemap/basemap.ts is the one smaltgl ships). */
export interface MapBasemap {
  readonly dark: boolean;
  /** Text for the attribution line (HTML). */
  readonly attribution: string;
  /** The colour behind everything, as 0–1 floats. */
  readonly background: readonly [number, number, number, number];
  attach(gpu: LayerGpu, redraw: () => void): void;
  /** Fills and lines, before the data layers. */
  draw(pass: GPURenderPassEncoder, frame: Frame): void;
  /** Labels, after the data layers. */
  drawLabels(pass: GPURenderPassEncoder, frame: Frame): void;
  /** Tiles still loading. */
  readonly pending: number;
  /** Everything the view needs is drawn. */
  readonly idle: boolean;
  destroy(): void;
}
