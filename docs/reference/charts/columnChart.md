# columnChart

<!-- api:start -->

```ts noplay
import { columnChart } from 'smaltkit/charts';
function columnChart(ctx: ChartContext): void;
```

Vertical columns. Same roles and options as barChart, and xAxis: category (default) or continuous (dates, numbers).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

Columns:

```ts
import { chartData, columnChart, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
columnChart({
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

A continuous date axis, a log scale and a reference line:

```ts
import { chartData, columnChart, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
columnChart({
  el, width: 480, height: 280, options: { xAxis: 'continuous', yScale: 'log', refLines: [{ value: 1000, label: 'goal' }] }, extra: {}, palette: 12, selected: () => null,
  data: chartData([
    col('day', 'category', 'dimension', ['2026-11-01', '2026-11-02', '2026-11-05']),
    col('visits', 'values', 'measure', [12, 340, 5600]),
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
import { chartData, columnChart, type ChartColumn, type ChartContext } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = document.querySelector<HTMLElement>('#chart')!;
let selected: number | null = null;
const draw = () => columnChart({
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

- [`barChart`](./barChart): horizontal, with the stack options.
- [`comboChart`](./comboChart): columns and lines.
- [`smaltkit/ui.css`](../styles): the marks' colours.
