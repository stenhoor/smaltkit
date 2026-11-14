# tableView

<!-- api:start -->

```ts
import { tableView } from 'smaltkit/table';
function tableView(ctx: ChartContext): void;
```

Table. Roles: `columns` (dimensions) and `values` (measures); `extra.totals` (one row of the same
measures) adds a totals row. Clicking a header sorts by it (when ctx.el is an element).

Options:
- format (none, bars, heat), density (compact, normal, relaxed).
- pageSize: rows per page (0 or none: every row). A pager under the table moves between pages.
- widths: column widths in px, by field (`ref`) or label. Dragging a header's right edge resizes a column and
  calls ctx.setOption('widths', …) so the app can keep it.
- freeze: how many leading columns stay in view when the table scrolls sideways (0 by default).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

A table with a totals row:

```ts
import { chartData, type ChartColumn } from 'smaltkit/charts';
import { tableView } from 'smaltkit/table';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
tableView({
  el, width: 400, height: 200, options: {}, palette: 12, selected: () => null,
  data: chartData([col('region', 'columns', 'dimension', ['North', 'South']), col('revenue', 'values', 'measure', [120, 340])], 2),
  extra: { totals: chartData([col('revenue', 'values', 'measure', [460])], 1) },
});
const cells = [...el.innerHTML.matchAll(/<t[hd][^>]*>(?:<[^>]+>)*([^<]*)/g)].map((m) => m[1]).filter(Boolean);
console.log(cells.join(' | '));
```

```text
region | revenue | North | 120 | South | 340 | Total | 460
```

## Demo

In a page: draw into an element, and select a mark's row on click.

```ts
import { chartData, type ChartColumn, type ChartContext } from 'smaltkit/charts';
import { tableView } from 'smaltkit/table';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = document.querySelector<HTMLElement>('#chart')!;
let selected: number | null = null;
const draw = () => tableView({
  el, width: el.clientWidth, height: 280, options: { format: 'bars', pageSize: 50, freeze: 1 }, extra: {}, palette: 12,
  selected: (row) => (selected === null ? null : row === selected),
  data: chartData([
    col('region', 'columns', 'dimension', ['North', 'South']),
    col('revenue', 'values', 'measure', [120, 340]),
  ], 2),
} satisfies ChartContext);
el.addEventListener('click', (e) => {
  const row = (e.target as Element).closest('[data-row]')?.getAttribute('data-row');
  selected = row === undefined || row === null ? null : Number(row);
  draw();
});
draw();
```


## See also

- [`matrixView`](./matrixView): a pivot.
- [`Grid`](../grid#Grid): for results of any size.
- [`cellFormatHtml`](../charts/cellFormatHtml).
- [`smaltkit/ui.css`](../styles): the marks' colours.
