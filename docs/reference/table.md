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

Each has a page of its own.

| Function | |
| --- | --- |
| [`matrixView`](./table/matrixView) | Pivot matrix. |
| [`tableView`](./table/tableView) | Table. |

<!-- api:end -->
