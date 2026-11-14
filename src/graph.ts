/**
 * A graph view: WebGPU only, 2D and 3D, with the force-directed layout in compute
 * shaders. `createGraphView` rejects with `GpuUnavailableError` when WebGPU is not available.
 */
import { initGpu } from './graph/gpu.js';
import type { GraphView, GraphViewOptions } from './graph/types.js';
import { GraphViewImpl } from './graph/view.js';

export type {
  GraphView, GraphViewOptions, GraphViewStats, Hit, LayoutControl, LayoutMode, RenderEdge, RenderGraph, RenderNode, SetGraphOptions, Theme, ViewMode,
} from './graph/types.js';
export { GpuUnavailableError, isWebGpuAvailable } from './graph/gpu.js';
export { FAMILY_PALETTE_DARK, FAMILY_PALETTE_LIGHT } from './graph/palette.js';
export { resultsToGraph, defaultCaption, type ResultsGraph, type ResultsGraphOptions, type ResultNodeLike, type ResultRelLike } from './graph/results.js';

/**
 * A graph view on a canvas, drawn with WebGPU: call its `setGraph` with nodes and edges to show them.
 * @param canvas The canvas to draw on; the view follows its size.
 * @param opts The view's options: 2D or 3D, the layout, the theme, captions and more.
 * @returns The view, once the GPU is ready.
 * @throws GpuUnavailableError (the promise rejects) where the browser has no WebGPU or no adapter.
 */
export async function createGraphView(canvas: HTMLCanvasElement, opts: GraphViewOptions = {}): Promise<GraphView> {
  const gpu = await initGpu(canvas);
  return new GraphViewImpl(canvas, gpu, opts);
}
