# exportRows

<!-- api:start -->

```ts noplay
import { exportRows } from 'smaltkit/grid';
function exportRows(format: ExportFormat, columns: (string | GridColumn)[], rows: GridRow[], tableName?: string): string;
```

CSV / TSV / JSON / NDJSON / SQL INSERT text for rows.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `format` | `ExportFormat` | `'csv'`, `'tsv'`, `'json'`, `'ndjson'` or `'sql'`. |
| `columns` | `(string \| GridColumn)[]` | The column names, or the grid's columns. |
| `rows` | `GridRow[]` | The rows, in column order. |
| `tableName?` | `string` | The table the SQL inserts into. Default `result`. |

## Returns

`string`: The text, ending with a newline (JSON's array doesn't). CSV quotes what needs it; TSV turns tabs and line breaks into spaces; JSON writes a bigint as a number when it's safe, else as text.

<!-- api:end -->

## Examples

The same rows in each format:

```ts
import { exportRows } from 'smaltkit/grid';

const columns = ['region', 'note', 'amount'];
const rows = [['North', 'a, "b"', 120], ['South', null, 9007199254740993n]];
for (const f of ['csv', 'tsv', 'ndjson', 'sql'] as const) console.log(exportRows(f, columns, rows, 'sales'));
console.log(exportRows('json', columns, rows.slice(0, 1)));
```

```text
region,note,amount
North,"a, ""b""",120
South,,9007199254740993

region	note	amount
North	a, "b"	120
South		9007199254740993

{"region":"North","note":"a, \"b\"","amount":120}
{"region":"South","note":null,"amount":"9007199254740993"}

INSERT INTO sales (region, note, amount) VALUES ('North', 'a, "b"', 120);
INSERT INTO sales (region, note, amount) VALUES ('South', NULL, 9007199254740993);

[
  {
    "region": "North",
    "note": "a, \"b\"",
    "amount": 120
  }
]
```

## Demo

Saving a result as a file:

```ts
import { exportRows } from 'smaltkit/grid';
import { download, fileName } from 'smaltkit/dom';

declare const result: { columns: string[]; rows: unknown[][] };
download(`${fileName('Sales by region')}.csv`, exportRows('csv', result.columns, result.rows as never), 'text/csv');
```


## See also

- [`plainValue`](./plainValue): how each value is written.
- [`quoteLiteral`](../sql/quoteLiteral) and [`quoteIdent`](../sql/quoteIdent).
- [`download`](../dom/download).
