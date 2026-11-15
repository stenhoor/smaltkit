# treemapChart

<!-- api:start -->

```ts noplay
import { treemapChart } from 'smaltkit/charts';
function treemapChart(ctx: ChartContext): void;
```

Treemap (squarified): role `category` and one measure.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

A rectangle per category, its area the value:

```ts
import { chartData, treemapChart, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
treemapChart({
  el, width: 480, height: 280, options: { labels: true }, extra: {}, palette: 12, selected: () => null,
  data: chartData([
    col('product', 'category', 'dimension', ['Tea', 'Coffee', 'Cocoa']),
    col('revenue', 'values', 'measure', [120, 340, 90]),
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

- [`squarify`](./squarify): the layout.
- [`smaltkit/ui.css`](../styles): the marks' colours.
