# gaugeChart

<!-- api:start -->

```ts
import { gaugeChart } from 'smaltkit/charts';
function gaugeChart(ctx: ChartContext): void;
```

Gauge: roles `values`, optional `target` and `max`; option `maxValue` when there is no max column.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

A value against a target, out of a maximum:

```ts
import { chartData, gaugeChart, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
gaugeChart({
  el, width: 480, height: 280, options: { maxValue: 500 }, extra: {}, palette: 12, selected: () => null,
  data: chartData([
    col('revenue', 'values', 'measure', [340]),
    col('goal', 'target', 'measure', [400]),
  ], 1),
});
console.log(el.innerHTML.includes('sk-gauge'), [...el.innerHTML.matchAll(/<text[^>]*>([^<]*)</g)].map((m) => m[1]).join(' '));
```

```text
true 340 0 500 Target 400
```

## See also

- [`kpiCard`](./kpiCard).
- [`smaltkit/ui.css`](../styles): the marks' colours.
