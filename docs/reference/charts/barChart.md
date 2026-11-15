# barChart

<!-- api:start -->

```ts noplay
import { barChart } from 'smaltkit/charts';
function barChart(ctx: ChartContext): void;
```

Horizontal bars. Roles: `category`, optional `series` and `multiples` (small multiples), measures. Options: stack
(none, stacked, percent), labels, legend, and the value axis: yScale (linear, log), yMin, yMax, refLines, xTitle,
yTitle.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

Bars for one measure by category:

```ts
import { chartData, barChart, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
barChart({
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
labels: 120 340 90
```

Stacked, with a series:

```ts
import { chartData, barChart, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
barChart({
  el, width: 480, height: 280, options: { stack: 'stacked', legend: true }, extra: {}, palette: 12, selected: () => null,
  data: chartData([
    col('quarter', 'category', 'dimension', ['Q1', 'Q1', 'Q2', 'Q2']),
    col('region', 'series', 'dimension', ['North', 'South', 'North', 'South']),
    col('revenue', 'values', 'measure', [120, 80, 150, 95]),
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

## Demo

In a page: draw into an element, and select a mark's row on click.

```ts
import { chartData, barChart, type ChartColumn, type ChartContext } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = document.querySelector<HTMLElement>('#chart')!;
let selected: number | null = null;
const draw = () => barChart({
  el, width: el.clientWidth, height: 280, options: { labels: true }, extra: {}, palette: 12,
  selected: (row) => (selected === null ? null : row === selected),
  data: chartData([
    col('product', 'category', 'dimension', ['Tea', 'Coffee', 'Cocoa']),
    col('revenue', 'values', 'measure', [120, 340, 90]),
  ], 3),
} satisfies ChartContext);
el.addEventListener('click', (e) => {
  const row = (e.target as Element).closest('[data-row]')?.getAttribute('data-row');
  selected = row === undefined || row === null ? null : Number(row);
  draw();
});
draw();
```


## See also

- [`columnChart`](./columnChart): the same, upright.
- [`smaltkit/ui.css`](../styles): the marks' colours.
