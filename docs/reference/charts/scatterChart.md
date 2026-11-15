# scatterChart

<!-- api:start -->

```ts noplay
import { scatterChart } from 'smaltkit/charts';
function scatterChart(ctx: ChartContext): void;
```

Scatter / bubble chart: roles `x`, `y`, optional `size` and `legend`; one point per row.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

A point per row; `size` makes it a bubble chart:

```ts
import { chartData, scatterChart, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
scatterChart({
  el, width: 480, height: 280, options: {}, extra: {}, palette: 12, selected: () => null,
  data: chartData([
    col('price', 'x', 'measure', [2.5, 4, 6.5]),
    col('sold', 'y', 'measure', [300, 220, 90]),
    col('stock', 'size', 'measure', [40, 10, 25]),
  ], 3),
});
const html = el.innerHTML;
console.log((html.match(/class="sk-mark/g) ?? []).length, 'marks');
const labels = [...html.matchAll(/class="sk-label"[^>]*>([^<]*)</g)].map((m) => m[1]);
if (labels.length) console.log('labels:', labels.join(' '));
```

```text
3 marks
```

## See also

- [`linear`](../svg/linear): the axes.
- [`smaltkit/ui.css`](../styles): the marks' colours.
