# smaltkit/graph

A graph view drawn on the GPU (WebGPU only), 2D and 3D, for nodes and relationships from any source.

A force-directed layout runs in compute shaders (100,000 nodes), or a fixed one places a cluster per group with nothing
overlapping. It has a spread to push nodes apart, animated changes (`setGraph(g, { animate: true })`, for stepping
through versions), captions, hover and click, search, highlight and focus, and touch, mouse and keyboard to pan, zoom
and orbit. `theme: 'css'` takes the colours from the `--sk-*` properties the charts read. `resultsToGraph` turns rows
of graph values (nodes, relationships, paths) into a graph. `createGraphView` rejects with `GpuUnavailableError` where
there's no WebGPU.

## Examples

```ts
import { createGraphView, resultsToGraph, isWebGpuAvailable } from 'smaltkit/graph';

if (await isWebGpuAvailable()) {
  const view = await createGraphView(document.querySelector('canvas')!, { theme: 'css' });
  view.setGraph(resultsToGraph(rows).graph);
}
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

Each has a page of its own.

| Function | |
| --- | --- |
| [`createGraphView`](./graph/createGraphView) | A graph view on a canvas, drawn with WebGPU: call its `setGraph` with nodes and edges to show them. |
| [`defaultCaption`](./graph/defaultCaption) | A node's caption when nothing else is asked for: its `name`, `title`, `label` or `code` property, else its first label and its id. |
| [`isWebGpuAvailable`](./graph/isWebGpuAvailable) | True when the browser exposes WebGPU and an adapter can be obtained: whether createGraphView can work here. |
| [`resultsToGraph`](./graph/resultsToGraph) | Every node, relationship and path in the values (rows, lists, maps, nested at any depth), as a graph to draw. |

### Classes

#### GpuUnavailableError {#GpuUnavailableError}

```ts noplay
class GpuUnavailableError extends Error {
    constructor(message?: string);
}
```

### Constants

#### FAMILY_PALETTE_DARK {#FAMILY_PALETTE_DARK}

```ts noplay
const FAMILY_PALETTE_DARK: string[];
```

#### FAMILY_PALETTE_LIGHT {#FAMILY_PALETTE_LIGHT}

```ts noplay
const FAMILY_PALETTE_LIGHT: string[];
```

The family product colours, in order: smalt, ui, bi, df, nb, ql, smalt-500, kiln.

### Interfaces

#### GraphView {#GraphView}

```ts noplay
interface GraphView {
    setGraph(g: RenderGraph, opts?: SetGraphOptions): void;
    setMode(mode: ViewMode): void;
    setTheme(theme: Theme): void;
    setLabels(on: boolean): void;
    setLayoutMode(mode: LayoutMode): void;
    readonly layoutMode: LayoutMode;
    setSpread(spread: number): void;
    readonly spread: number;
    highlight(indices: number[] | null): void;
    search(text: string): number[];
    focus(index: number): void;
    fit(): void;
    onHover(cb: (hit: Hit | null) => void): void;
    onClick(cb: (hit: Hit | null) => void): void;
    readonly layout: LayoutControl;
    pick(x: number, y: number): Promise<Hit | null>;
    screenPosition(index: number): {
        x: number;
        y: number;
    } | null;
    sync(): Promise<void>;
    positions(): Promise<Float32Array>;
    stats(): GraphViewStats;
    resize(): void;
    destroy(): void;
}
```

| Member | |
| --- | --- |
| `setGraph` | Replace the graph. With `keepPositions`, nodes whose id was already shown keep their position. |
| `setMode` | Switch between 2D and 3D, reusing the layout. |
| `setLayoutMode` | `'fixed'` eases every node to a slot of its group's cluster and stops the physics (dragging a node then moves only that node); `'force'` resumes the physics from where the nodes are. |
| `setSpread` | Move the nodes closer together (&lt; 1) or farther apart (> 1), clamped to 0.2..5. Fixed: around the layout's centre, eased; force: the layout's link distance and repulsion scale, and it settles to the new size. Cheap enough to call on every frame of a slider drag. It holds the camera (as a pan or zoom does) so the nodes visibly move apart; `fit()` frames them again. |
| `highlight` | Highlighted nodes and their incident edges are drawn at full strength, the rest dimmed; null clears. |
| `search` | Case-insensitive match on label, id and group; highlights and returns the matching indices. |
| `focus` | Animate the camera to the node. |
| `fit` | Frame the whole graph. |
| `pick` | GPU pick at a point in CSS pixels relative to the canvas: the node or edge drawn there, or null. |
| `screenPosition` | Where a node is on the canvas, in CSS pixels, from the last positions read back from the GPU (call `sync()` first for the current ones); null when it is behind the 3D camera. |
| `sync` | Read the current layout positions back from the GPU for `screenPosition`. |
| `positions` | Read back xyz per node. |

#### GraphViewOptions {#GraphViewOptions}

```ts noplay
interface GraphViewOptions {
    mode?: ViewMode;
    theme?: Theme;
    labels?: boolean;
    palette?: string[];
    background?: 'transparent' | 'theme';
    layoutTicks?: number;
    layoutMode?: LayoutMode;
    spread?: number;
}
```

| Member | |
| --- | --- |
| `palette?` | Categorical colours for node groups; defaults to the theme's (the family palette, or `--sk-c0` … for `'css'`). |
| `background?` | `'transparent'` (default) lets the page show through; `'theme'` clears to the theme background. |
| `layoutTicks?` | Ticks the layout takes to cool to rest (default 300): fewer settles sooner and less evenly. |
| `layoutMode?` | `'force'` (default) or `'fixed'`. |
| `spread?` | How far apart nodes are, as a factor of the normal layout (default 1, clamped to 0.2..5). |

#### GraphViewStats {#GraphViewStats}

```ts noplay
interface GraphViewStats {
    nodes: number;
    edges: number;
    fps: number;
    layoutMsPerTick: number;
}
```

#### Hit {#Hit}

```ts noplay
interface Hit {
    kind: 'node' | 'edge';
    index: number;
}
```

#### LayoutControl {#LayoutControl}

```ts noplay
interface LayoutControl {
    start(): void;
    stop(): void;
    readonly running: boolean;
    reheat(): void;
}
```

| Member | |
| --- | --- |
| `start` | Run the forces (force mode; nothing to run in fixed mode). |
| `running` | The forces are running, or (fixed mode) nodes are easing to their slots. |
| `reheat` | Restart the forces from full heat; in fixed mode, lay the graph out afresh. |

#### RenderEdge {#RenderEdge}

```ts noplay
interface RenderEdge {
    id?: string | number;
    source: number;
    target: number;
    label?: string;
    group?: string;
}
```

| Member | |
| --- | --- |
| `id?` | Identity across `setGraph` calls, for animated transitions. Without one, an edge is identified by its source id, target id and label. |
| `source` | Index into `nodes`. |
| `target` | Index into `nodes`. |

#### RenderGraph {#RenderGraph}

```ts noplay
interface RenderGraph {
    nodes: RenderNode[];
    edges: RenderEdge[];
}
```

#### RenderNode {#RenderNode}

```ts noplay
interface RenderNode {
    id: string | number;
    label?: string;
    group?: string;
    size?: number;
}
```

Public data types of the graph renderer.

| Member | |
| --- | --- |
| `size?` | Relative size; 1 is the default. |

#### ResultNodeLike {#ResultNodeLike}

```ts noplay
interface ResultNodeLike {
    readonly kind: 'node';
    readonly id: number | string;
    readonly labels: readonly string[];
    readonly properties: Readonly<Record<string, unknown>>;
}
```

#### ResultRelLike {#ResultRelLike}

```ts noplay
interface ResultRelLike {
    readonly kind: 'relationship';
    readonly id: number | string;
    readonly type: string;
    readonly start: number | string;
    readonly end: number | string;
    readonly properties: Readonly<Record<string, unknown>>;
}
```

#### ResultsGraph {#ResultsGraph}

```ts noplay
interface ResultsGraph {
    readonly graph: RenderGraph;
    readonly nodes: readonly ResultNodeLike[];
    readonly relationships: readonly ResultRelLike[];
}
```

| Member | |
| --- | --- |
| `graph` | For `view.setGraph`. |
| `nodes` | The nodes in drawing order: `graph.nodes[i]` is `nodes[i]`, so a hit's `index` finds its node. |
| `relationships` | The relationships in drawing order, likewise for edge hits. |

#### ResultsGraphOptions {#ResultsGraphOptions}

```ts noplay
interface ResultsGraphOptions {
    readonly caption?: (node: ResultNodeLike) => string;
    readonly group?: (node: ResultNodeLike) => string;
}
```

| Member | |
| --- | --- |
| `caption?` | A node's caption (default: its `name`, `title`, `label` or `code` property, else its first label and id). |
| `group?` | A node's colour group (default: its first label). |

#### SetGraphOptions {#SetGraphOptions}

```ts noplay
interface SetGraphOptions {
    keepPositions?: boolean;
    animate?: boolean;
    changed?: readonly (string | number)[];
}
```

| Member | |
| --- | --- |
| `keepPositions?` | Nodes whose id was already shown keep their position; new ones start next to a neighbour. |
| `animate?` | Animate the change from the graph shown: new nodes and edges fade and grow in, removed ones fade and shrink out where they were (they are no longer picked), and the nodes in `changed` flash. A call while a transition runs takes over from where it is, so calls can follow each other every frame. |
| `changed?` | Ids of nodes whose properties changed: with `animate`, they get a brief ring. |

### Types

#### LayoutMode {#LayoutMode}

```ts noplay
type LayoutMode = 'force' | 'fixed';
```

`'force'`: the force-directed layout (physics on the GPU). `'fixed'`: no physics; every node in a
slot of its group's cluster, spread out so each one can be seen.

#### Theme {#Theme}

```ts noplay
type Theme = 'light' | 'dark' | 'css';
```

`'light'` and `'dark'`: the smalt brand's colours. `'css'`: the page's, read from the `--sk-*` custom properties on
the canvas or above (`--sk-surface`, `--sk-border`, `--sk-muted`, `--sk-text`, `--sk-sel`, the group colours
`--sk-c0` … `--sk-c11`; `--sk-graph-bg`, `--sk-graph-edge` and `--sk-graph-accent` override the first three for
the graph alone), the same ones the charts read. Any not set keeps the light colour. Call `setTheme('css')` again
after changing them.

#### ViewMode {#ViewMode}

```ts noplay
type ViewMode = '2d' | '3d';
```

<!-- api:end -->
