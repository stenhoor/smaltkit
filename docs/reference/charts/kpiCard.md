# kpiCard

<!-- api:start -->

```ts
import { kpiCard } from 'smaltkit/charts';
function kpiCard(ctx: ChartContext): void;
```

KPI card: roles `values`, optional `target` (comparison); `extra.trend` draws a sparkline. Options: `compare` (delta, value, none), `goodWhen` (up, down), `caption`.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

A value, compared with a target:

```ts
import { chartData, kpiCard, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
kpiCard({
  el, width: 480, height: 280, options: { compare: 'delta', goodWhen: 'up', caption: 'Revenue' }, extra: {}, palette: 12, selected: () => null,
  data: chartData([
    col('revenue', 'values', 'measure', [340]),
    col('last year', 'target', 'measure', [300]),
  ], 1),
});
console.log(el.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
```

```text
340 Revenue ▲ 13.3% vs last year
```

## See also

- [`gaugeChart`](./gaugeChart).
- [`cellFormatHtml`](./cellFormatHtml): a value's tone.
- [`smaltkit/ui.css`](../styles): the marks' colours.
