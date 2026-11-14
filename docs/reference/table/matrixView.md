# matrixView

<!-- api:start -->

```ts
import { matrixView } from 'smaltkit/table';
function matrixView(ctx: ChartContext): void;
```

Pivot matrix. Roles: `rows` and `columns` (dimensions), `values` (measures). Totals come from
`extra.rowTotals` (rows × measures), `extra.colTotals` (columns × measures) and `extra.grand`.

Options:
- `format`: none, heat, bars.
- `layout`: `stepped` (default: one row-header column, levels indented, parents with a caret to expand or
  collapse them) or `tabular` (a column per row level, parents' labels shown once).
- `subtotals` (stepped, default true): a parent row shows its subtotals, from `extra['sub:<k>']` (the first k row
  fields and the column fields × measures) and, with row totals, `extra['sub:<k>:rt']` (the first k row fields).
  Subtotals are queries of their own, so averages, distinct counts and ratios come out right.
- `collapsed` (stepped): start with every parent collapsed. Clicking a caret toggles a parent (when ctx.el is an
  element); the state lasts while the element does.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `ctx` | `ChartContext` | Where and what to draw: the element (or anything with `innerHTML`), its size, the options, the data as columns by role, the palette and the selection. |

## Returns

`void`: Nothing: the chart is written into `ctx.el` in one `innerHTML` assignment.

<!-- api:end -->

## Examples

A pivot of regions by quarter:

```ts
import { chartData, type ChartColumn } from 'smaltkit/charts';
import { matrixView } from 'smaltkit/table';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const el = { innerHTML: '' };
matrixView({
  el, width: 400, height: 200, options: { layout: 'tabular' }, extra: {}, palette: 12, selected: () => null,
  data: chartData([
    col('region', 'rows', 'dimension', ['North', 'North', 'South', 'South']),
    col('quarter', 'columns', 'dimension', ['Q1', 'Q2', 'Q1', 'Q2']),
    col('revenue', 'values', 'measure', [120, 150, 80, 95]),
  ], 4),
});
const cells = [...el.innerHTML.matchAll(/<t[hd][^>]*>(?:<[^>]+>)*([^<]*)/g)].map((m) => m[1]).filter(Boolean);
console.log(cells.join(' | '));
```

```text
Q1 | Q2 | region | revenue | revenue | North | 120 | 150 | South | 80 | 95
```

## See also

- [`tableView`](./tableView).
- [`heatmapChart`](../charts/heatmapChart): the same data as colours.
- [`smaltkit/ui.css`](../styles): the marks' colours.
