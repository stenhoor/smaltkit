// The layers the visuals draw with, gathered in one place: the visual piece imports layers only through here.
export { ScatterLayer as Scatter, scatter as scatterLayer } from '../layers/scatter.js';
export { heatmap as heatmapLayer } from '../layers/heatmap.js';
export { AggregateLayer as aggregateLayerClass } from '../layers/aggregate.js';
export { arcs as arcLayer } from '../layers/arcs.js';
export { polygons as polygonLayer } from '../layers/polygons.js';
import { AggregateLayer, type AggregateOptions } from '../layers/aggregate.js';
/** Hexagons or squares (the shape in the options). */
export const aggregateLayer = (options: AggregateOptions): AggregateLayer => new AggregateLayer(options);
