# areaChart

<!-- api:start -->

```ts
import { areaChart } from 'smaltkit/charts';
function areaChart(ctx: ChartContext): void;
```

Areas. Roles as barChart. Options: stack, smooth, markers, labels, legend, and the axis options of columnChart.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

Areas, stacked:

```ts
import { chartData, areaChart, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
areaChart({
  el, width: 480, height: 280, options: { stack: 'stacked', legend: true }, extra: {}, palette: 12, selected: () => null,
  data: chartData([
    col('quarter', 'category', 'dimension', ['Q1', 'Q1', 'Q2', 'Q2']),
    col('region', 'series', 'dimension', ['North', 'South', 'North', 'South']),
    col('revenue', 'values', 'measure', [120, 80, 150, 95]),
  ], 4),
});
const html = el.innerHTML;
const count = (cls: string) => (html.match(new RegExp(`class="${cls} `, 'g')) ?? []).length;
console.log(count('sk-line'), 'lines,', count('sk-area'), 'areas,', count('sk-hit'), 'points');
const labels = [...html.matchAll(/class="sk-label"[^>]*>([^<]*)</g)].map((m) => m[1]);
if (labels.length) console.log('labels:', labels.join(' '));
```

```text
2 lines, 2 areas, 4 points
```

## Demo

In a page: draw into an element, and select a mark's row on click.

```ts
import { chartData, areaChart, type ChartColumn, type ChartContext } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = document.querySelector<HTMLElement>('#chart')!;
let selected: number | null = null;
const draw = () => areaChart({
  el, width: el.clientWidth, height: 280, options: { labels: true }, extra: {}, palette: 12,
  selected: (row) => (selected === null ? null : row === selected),
  data: chartData([
    col('month', 'category', 'dimension', ['Jan', 'Feb', 'Mar', 'Apr']),
    col('revenue', 'values', 'measure', [120, 135, 128, 160]),
  ], 4),
} satisfies ChartContext);
el.addEventListener('click', (e) => {
  const row = (e.target as Element).closest('[data-row]')?.getAttribute('data-row');
  selected = row === undefined || row === null ? null : Number(row);
  draw();
});
draw();
```


## See also

- [`lineChart`](./lineChart).
- [`smaltkit/ui.css`](../styles): the marks' colours.
