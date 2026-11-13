/** Public data types of the graph renderer. */

export interface RenderNode {
  id: string | number;
  label?: string;
  group?: string;
  /** Relative size; 1 is the default. */
  size?: number;
}

export interface RenderEdge {
  /**
   * Identity across `setGraph` calls, for animated transitions. Without one, an edge is identified by
   * its source id, target id and label.
   */
  id?: string | number;
  /** Index into `nodes`. */
  source: number;
  /** Index into `nodes`. */
  target: number;
  label?: string;
  group?: string;
}

export interface RenderGraph {
  nodes: RenderNode[];
  edges: RenderEdge[];
}

export interface SetGraphOptions {
  /** Nodes whose id was already shown keep their position; new ones start next to a neighbour. */
  keepPositions?: boolean;
  /**
   * Animate the change from the graph shown: new nodes and edges fade and grow in, removed ones fade
   * and shrink out where they were (they are no longer picked), and the nodes in `changed` flash. A
   * call while a transition runs takes over from where it is, so calls can follow each other every frame.
   */
  animate?: boolean;
  /** Ids of nodes whose properties changed: with `animate`, they get a brief ring. */
  changed?: readonly (string | number)[];
}

export type ViewMode = '2d' | '3d';
/**
 * `'force'`: the force-directed layout (physics on the GPU). `'fixed'`: no physics; every node in a
 * slot of its group's cluster, spread out so each one can be seen.
 */
export type LayoutMode = 'force' | 'fixed';
export type Theme = 'light' | 'dark';

export interface GraphViewOptions {
  mode?: ViewMode;
  theme?: Theme;
  labels?: boolean;
  /** Categorical colours for node groups; defaults to the family palette of the theme. */
  palette?: string[];
  /** `'transparent'` (default) lets the page show through; `'theme'` clears to the theme background. */
  background?: 'transparent' | 'theme';
  /** Ticks the layout takes to cool to rest (default 300): fewer settles sooner and less evenly. */
  layoutTicks?: number;
  /** `'force'` (default) or `'fixed'`. */
  layoutMode?: LayoutMode;
  /** How far apart nodes are, as a factor of the normal layout (default 1, clamped to 0.2..5). */
  spread?: number;
}

export interface Hit {
  kind: 'node' | 'edge';
  index: number;
}

export interface LayoutControl {
  /** Run the forces (force mode; nothing to run in fixed mode). */
  start(): void;
  stop(): void;
  /** The forces are running, or (fixed mode) nodes are easing to their slots. */
  readonly running: boolean;
  /** Restart the forces from full heat; in fixed mode, lay the graph out afresh. */
  reheat(): void;
}

export interface GraphViewStats {
  nodes: number;
  edges: number;
  fps: number;
  layoutMsPerTick: number;
}

export interface GraphView {
  /** Replace the graph. With `keepPositions`, nodes whose id was already shown keep their position. */
  setGraph(g: RenderGraph, opts?: SetGraphOptions): void;
  /** Switch between 2D and 3D, reusing the layout. */
  setMode(mode: ViewMode): void;
  setTheme(theme: Theme): void;
  setLabels(on: boolean): void;
  /**
   * `'fixed'` eases every node to a slot of its group's cluster and stops the physics (dragging a
   * node then moves only that node); `'force'` resumes the physics from where the nodes are.
   */
  setLayoutMode(mode: LayoutMode): void;
  readonly layoutMode: LayoutMode;
  /**
   * Move the nodes closer together (< 1) or farther apart (> 1), clamped to 0.2..5. Fixed: around the
   * layout's centre, eased; force: the layout's link distance and repulsion scale, and it settles to
   * the new size. Cheap enough to call on every frame of a slider drag. It holds the camera (as a pan
   * or zoom does) so the nodes visibly move apart; `fit()` frames them again.
   */
  setSpread(spread: number): void;
  readonly spread: number;
  /** Highlighted nodes and their incident edges are drawn at full strength, the rest dimmed; null clears. */
  highlight(indices: number[] | null): void;
  /** Case-insensitive match on label, id and group; highlights and returns the matching indices. */
  search(text: string): number[];
  /** Animate the camera to the node. */
  focus(index: number): void;
  /** Frame the whole graph. */
  fit(): void;
  onHover(cb: (hit: Hit | null) => void): void;
  onClick(cb: (hit: Hit | null) => void): void;
  readonly layout: LayoutControl;
  /**
   * GPU pick at a point in CSS pixels relative to the canvas: the node or edge drawn there, or null.
   */
  pick(x: number, y: number): Promise<Hit | null>;
  /**
   * Where a node is on the canvas, in CSS pixels, from the last positions read back from the GPU
   * (call `sync()` first for the current ones); null when it is behind the 3D camera.
   */
  screenPosition(index: number): { x: number; y: number } | null;
  /** Read the current layout positions back from the GPU for `screenPosition`. */
  sync(): Promise<void>;
  /** Read back xyz per node. */
  positions(): Promise<Float32Array>;
  stats(): GraphViewStats;
  resize(): void;
  destroy(): void;
}
