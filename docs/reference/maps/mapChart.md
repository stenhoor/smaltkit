# mapChart

<!-- api:start -->

```ts noplay
import { mapChart } from 'smaltkit/maps';
function mapChart(ctx: ChartContext): void;
```

Map. Shapes come in options.shapes (parsed GeoJSON or TopoJSON; options.object picks a TopoJSON object).

- Filled regions: role `location` (a dimension whose values name regions: matched against options.key, default
  `name`, then the feature's id and common name / ISO code properties) and `values` (one measure, coloured low to
  high on the sequential ramp).
- Points: roles `latitude` and `longitude` (numbers), optional `size` (a measure, area-scaled) and `values`
  (colour). Drawn over the shapes when there are any.

Options: shapes, object, key, projection (mercator, equirectangular), legend (true by default for filled regions).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

Regions filled by value; the shapes come in `options.shapes`:

```ts
import { chartData, type ChartColumn } from 'smaltkit/charts';
import { mapChart } from 'smaltkit/maps';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const geo = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'West' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } },
    { type: 'Feature', properties: { name: 'East' }, geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] } },
  ],
};
const el = { innerHTML: '' };
mapChart({
  el, width: 400, height: 200, options: { shapes: geo, projection: 'equirectangular' }, extra: {}, palette: 12, selected: () => null,
  data: chartData([col('region', 'location', 'dimension', ['West', 'East']), col('sales', 'values', 'measure', [10, 40])], 2),
});
console.log((el.innerHTML.match(/<path[^>]*data-row/g) ?? []).length, 'regions drawn');
```

```text
2 regions drawn
```

## See also

- [`toFeatures`](./toFeatures), [`fitProjection`](./fitProjection), [`geoPath`](./geoPath).
- [`smaltkit/ui.css`](../styles): the marks' colours.
