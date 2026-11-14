# smaltkit/table

A flat table (sortable headers, totals, data bars, heat colours, pages, column widths set by dragging, frozen leading columns) and a pivot matrix with row, column and grand totals, stepped or tabular.

Both take a `ChartContext`, as the [charts](./charts) do. With the charts' `cellFormat` hook, measure values take a
tone (good, bad, warning, accent) as text or background colour, and an icon.

## Examples

```ts
import { chartData, type ChartColumn } from 'smaltkit/charts';
import { tableView } from 'smaltkit/table';

const columns: ChartColumn[] = [
  { key: 'r', role: 'rows', label: 'Region', kind: 'dimension', values: ['North', 'South'], fmt: String },
  { key: 'v', role: 'values', label: 'Revenue', kind: 'measure', values: [120, 340], fmt: String },
];
tableView({
  el: document.querySelector('#table')!, width: 480, height: 280, options: {},
  data: chartData(columns, 2), extra: {}, palette: 12, selected: () => null,
});
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

#### matrixView {#matrixView}

```ts
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

#### tableView {#tableView}

```ts
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

<!-- api:end -->
