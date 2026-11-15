# heatmapChart

<!-- api:start -->

```ts noplay
import { heatmapChart } from 'smaltkit/charts';
function heatmapChart(ctx: ChartContext): void;
```

Heatmap: roles `rows`, `columns` and one measure, coloured along the sequential ramp.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

Rows by columns, coloured by value:

```ts
import { chartData, heatmapChart, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
heatmapChart({
  el, width: 480, height: 280, options: { labels: true }, extra: {}, palette: 12, selected: () => null,
  data: chartData([
    col('day', 'rows', 'dimension', ['Mon', 'Mon', 'Tue', 'Tue']),
    col('hour', 'columns', 'dimension', ['9', '10', '9', '10']),
    col('visits', 'values', 'measure', [12, 30, 8, 45]),
  ], 4),
});
const html = el.innerHTML;
console.log((html.match(/class="sk-mark/g) ?? []).length, 'marks');
const labels = [...html.matchAll(/class="sk-label"[^>]*>([^<]*)</g)].map((m) => m[1]);
if (labels.length) console.log('labels:', labels.join(' '));
```

```text
4 marks
```

## See also

- [`seqColor`](../svg/seqColor): the colours.
- [`matrixView`](../table/matrixView): the same data as numbers.
- [`smaltkit/ui.css`](../styles): the marks' colours.
