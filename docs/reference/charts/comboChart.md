# comboChart

<!-- api:start -->

```ts
import { comboChart } from 'smaltkit/charts';
function comboChart(ctx: ChartContext): void;
```

Columns and lines: measures in role `columns` are bars, in role `lines` are lines (option secondaryAxis puts them on
a second axis, titled by y2Title). The axis options of columnChart apply.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

Revenue as columns, margin as a line on a second axis:

```ts
import { chartData, comboChart, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
comboChart({
  el, width: 480, height: 280, options: { secondaryAxis: true, y2Title: 'Margin' }, extra: {}, palette: 12, selected: () => null,
  data: chartData([
    col('month', 'category', 'dimension', ['Jan', 'Feb', 'Mar']),
    col('revenue', 'columns', 'measure', [120, 135, 128]),
    col('margin', 'lines', 'measure', [0.31, 0.28, 0.33]),
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
import { chartData, comboChart, type ChartColumn, type ChartContext } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = document.querySelector<HTMLElement>('#chart')!;
let selected: number | null = null;
const draw = () => comboChart({
  el, width: el.clientWidth, height: 280, options: { secondaryAxis: true }, extra: {}, palette: 12,
  selected: (row) => (selected === null ? null : row === selected),
  data: chartData([
    col('month', 'category', 'dimension', ['Jan', 'Feb', 'Mar']),
    col('revenue', 'columns', 'measure', [120, 135, 128]),
    col('margin', 'lines', 'measure', [0.31, 0.28, 0.33]),
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

- [`columnChart`](./columnChart) and [`lineChart`](./lineChart).
- [`smaltkit/ui.css`](../styles): the marks' colours.
