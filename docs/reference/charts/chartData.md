# chartData

<!-- api:start -->

```ts
import { chartData } from 'smaltkit/charts';
function chartData(columns: ChartColumn[], rows: number): ChartData;
```

Build ChartData from columns: the columns, the dimensions and the measures, and `role(name)` to find them.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `columns` | `ChartColumn[]` | The result's columns, each tagged with a role and a kind. |
| `rows` | `number` | How many rows the columns hold. |

## Returns

`ChartData`: The data for a ChartContext.

<!-- api:end -->

## Examples

```ts
import { chartData, type ChartColumn } from 'smaltkit/charts';
import type { Value } from 'smaltkit/format';

const col = (key: string, role: string, kind: 'dimension' | 'measure', values: Value[]): ChartColumn =>
  ({ key, role, label: key, kind, values, fmt: String });
const data = chartData([
  col('region', 'category', 'dimension', ['North', 'South']),
  col('revenue', 'values', 'measure', [120, 340]),
  col('units', 'values', 'measure', [12, 30]),
], 2);
console.log(data.rows, data.dims.map((c) => c.key), data.measures.map((c) => c.key));
console.log(data.role('values').map((c) => c.label));
```

```text
2 [ 'region' ] [ 'revenue', 'units' ]
[ 'revenue', 'units' ]
```

## Demo

Columns from a query result, formatted by field:

```ts
import { chartData, type ChartColumn } from 'smaltkit/charts';
import { formatter } from 'smaltkit/format';

const result = { columns: ['month', 'revenue'], rows: [['2026-10-01', 182340], ['2026-11-01', 201775]] };
const fields = [{ role: 'category', kind: 'dimension', format: 'month' }, { role: 'values', kind: 'measure', format: 'currency0' }] as const;
const columns: ChartColumn[] = result.columns.map((key, i) => ({
  key, label: key, role: fields[i]!.role, kind: fields[i]!.kind, format: fields[i]!.format,
  values: result.rows.map((r) => r[i]!), fmt: formatter(fields[i]!.format),
}));
const data = chartData(columns, result.rows.length);
console.log(data.role('category')[0]!.fmt('2026-10-01'), data.measures[0]!.fmt(182340));
```

```text
Oct 2026 $182,340
```

## See also

- Every renderer takes it, in `ctx.data`: [`columnChart`](./columnChart), [`tableView`](../table/tableView), …
- [`formatter`](../format/formatter): each column's `fmt`.
