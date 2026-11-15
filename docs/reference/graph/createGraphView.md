# createGraphView

<!-- api:start -->

```ts noplay
import { createGraphView } from 'smaltkit/graph';
function createGraphView(canvas: HTMLCanvasElement, opts?: GraphViewOptions): Promise<GraphView>;
```

A graph view on a canvas, drawn with WebGPU: call its `setGraph` with nodes and edges to show them.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `canvas` | `HTMLCanvasElement` | The canvas to draw on; the view follows its size. |
| `opts?` | `GraphViewOptions` | The view's options: 2D or 3D, the layout, the theme, captions and more. |

## Returns

`Promise<GraphView>`: The view, once the GPU is ready.

## Errors

- GpuUnavailableError (the promise rejects) where the browser has no WebGPU or no adapter.

<!-- api:end -->

## Examples

A view of a result, with a click on a node:

```ts
import { createGraphView, resultsToGraph, GpuUnavailableError } from 'smaltkit/graph';

try {
  const view = await createGraphView(document.querySelector('canvas')!, { theme: 'css' });
  const { graph, nodes } = resultsToGraph(rows);
  view.setGraph(graph);
  view.onClick((hit) => {
    if (hit?.kind === 'node') console.log(nodes[hit.index]);
  });
} catch (e) {
  if (e instanceof GpuUnavailableError) console.log('This browser has no WebGPU: showing the table instead.');
  else throw e;
}
```


## See also

- [`resultsToGraph`](./resultsToGraph).
- [`isWebGpuAvailable`](./isWebGpuAvailable).
- [`createTimeline`](../timeline/createTimeline): step through a graph's versions.
