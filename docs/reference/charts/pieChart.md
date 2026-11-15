# pieChart

<!-- api:start -->

```ts noplay
import { pieChart } from 'smaltkit/charts';
function pieChart(ctx: ChartContext): void;
```

Pie. Roles: `category` and one measure. Options: labels, legend.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

A slice per category:

```ts
import { chartData, pieChart, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
pieChart({
  el, width: 480, height: 280, options: { labels: true, legend: true }, extra: {}, palette: 12, selected: () => null,
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

## Demo

In a page: draw into an element, and select a mark's row on click.

```ts
import { chartData, pieChart, type ChartColumn, type ChartContext } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = document.querySelector<HTMLElement>('#chart')!;
let selected: number | null = null;
const draw = () => pieChart({
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

- [`donutChart`](./donutChart).
- [`arc`](../svg/arc): the slices.
- [`smaltkit/ui.css`](../styles): the marks' colours.
