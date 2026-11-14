# funnelChart

<!-- api:start -->

```ts
import { funnelChart } from 'smaltkit/charts';
function funnelChart(ctx: ChartContext): void;
```

Funnel: roles `category` (stage) and one measure.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

Stages of a funnel:

```ts
import { chartData, funnelChart, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
funnelChart({
  el, width: 480, height: 280, options: { labels: true }, extra: {}, palette: 12, selected: () => null,
  data: chartData([
    col('stage', 'category', 'dimension', ['Visited', 'Signed up', 'Paid']),
    col('people', 'values', 'measure', [1000, 240, 60]),
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

- [`barChart`](./barChart).
- [`smaltkit/ui.css`](../styles): the marks' colours.
