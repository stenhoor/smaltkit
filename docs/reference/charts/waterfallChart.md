# waterfallChart

<!-- api:start -->

```ts
import { waterfallChart } from 'smaltkit/charts';
function waterfallChart(ctx: ChartContext): void;
```

Waterfall: role `category` and one measure (the change); option `total` adds a total bar.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

Changes, and a total bar:

```ts
import { chartData, waterfallChart, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
waterfallChart({
  el, width: 480, height: 280, options: { labels: true, total: true }, extra: {}, palette: 12, selected: () => null,
  data: chartData([
    col('step', 'category', 'dimension', ['Start', 'Sales', 'Returns', 'Costs']),
    col('change', 'values', 'measure', [500, 220, -40, -180]),
  ], 4),
});
const html = el.innerHTML;
console.log((html.match(/class="sk-mark/g) ?? []).length, 'marks');
const labels = [...html.matchAll(/class="sk-label"[^>]*>([^<]*)</g)].map((m) => m[1]);
if (labels.length) console.log('labels:', labels.join(' '));
```

```text
5 marks
labels: 500 220 -40 -180 500
```

## See also

- [`columnChart`](./columnChart).
- [`smaltkit/ui.css`](../styles): the marks' colours.
