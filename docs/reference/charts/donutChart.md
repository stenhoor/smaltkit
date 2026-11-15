# donutChart

<!-- api:start -->

```ts noplay
import { donutChart } from 'smaltkit/charts';
function donutChart(ctx: ChartContext): void;
```

Donut: as pieChart, with options `hole` (0–1), `center` (show the total) and `total`. Without `total`, the centre
and the label percentages use the sum of the slices. With it (a number the app computed), they use that instead:
for slices that overlap (a sale in two categories), the sum is more than the whole and `total` is the whole.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

With the total in the centre:

```ts
import { chartData, donutChart, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
donutChart({
  el, width: 480, height: 280, options: { hole: 0.6, center: true }, extra: {}, palette: 12, selected: () => null,
  data: chartData([
    col('product', 'category', 'dimension', ['Tea', 'Coffee', 'Cocoa']),
    col('revenue', 'values', 'measure', [120, 340, 90]),
  ], 3),
});
const html = el.innerHTML;
console.log((html.match(/class="sk-mark/g) ?? []).length, 'marks');
const labels = [...html.matchAll(/class="sk-label"[^>]*>([^<]*)</g)].map((m) => m[1]);
if (labels.length) console.log('labels:', labels.join(' '));
console.log('centre:', /sk-donut-total[^>]*>([^<]*)/.exec(html)?.[1]);
```

```text
3 marks
centre: 550
```

Overlapping slices: `total` is the whole, not their sum.

```ts
import { chartData, donutChart, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
donutChart({
  el, width: 480, height: 280, options: { center: true, labels: true, total: 400 }, extra: {}, palette: 12, selected: () => null,
  data: chartData([
    col('product', 'category', 'dimension', ['Tea', 'Coffee', 'Cocoa']),
    col('revenue', 'values', 'measure', [120, 340, 90]),
  ], 3),
});
const html = el.innerHTML;
console.log((html.match(/class="sk-mark/g) ?? []).length, 'marks');
const labels = [...html.matchAll(/class="sk-label"[^>]*>([^<]*)</g)].map((m) => m[1]);
if (labels.length) console.log('labels:', labels.join(' '));
console.log('centre:', /sk-donut-total[^>]*>([^<]*)/.exec(html)?.[1]);
```

```text
3 marks
centre: 400
```

## Demo

In a page: draw into an element, and select a mark's row on click.

```ts
import { chartData, donutChart, type ChartColumn, type ChartContext } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = document.querySelector<HTMLElement>('#chart')!;
let selected: number | null = null;
const draw = () => donutChart({
  el, width: el.clientWidth, height: 280, options: { center: true }, extra: {}, palette: 12,
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

- [`pieChart`](./pieChart).
- [`smaltkit/ui.css`](../styles): the marks' colours.
