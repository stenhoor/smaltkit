/**
 * smaltcy's graph renderer: WebGPU only, 2D and 3D, with the force-directed layout in compute
 * shaders. `createGraphView` rejects with `GpuUnavailableError` when WebGPU is not available.
 */
import { initGpu } from './gpu.js';
import type { GraphView, GraphViewOptions } from './types.js';
import { GraphViewImpl } from './view.js';

export type {
  GraphView, GraphViewOptions, GraphViewStats, Hit, LayoutControl, LayoutMode, RenderEdge, RenderGraph, RenderNode, SetGraphOptions, Theme, ViewMode,
} from './types.js';
export { GpuUnavailableError, isWebGpuAvailable } from './gpu.js';
export { FAMILY_PALETTE_DARK, FAMILY_PALETTE_LIGHT } from './palette.js';
export { resultsToGraph, defaultCaption, type ResultsGraph, type ResultsGraphOptions, type ResultNodeLike, type ResultRelLike } from './results.js';

export async function createGraphView(canvas: HTMLCanvasElement, opts: GraphViewOptions = {}): Promise<GraphView> {
  const gpu = await initGpu(canvas);
  return new GraphViewImpl(canvas, gpu, opts);
}
