# tableNameFrom

<!-- api:start -->

```ts noplay
import { tableNameFrom } from 'smaltkit/sql';
function tableNameFrom(source: string): string;
```

A safe table name derived from a file name or URL.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `source` | `string` | A file name, path or URL. |

## Returns

`string`: Its last part without a data file's extension, lower-cased, with anything but letters, digits and `_` made `_`; `t_` before a leading digit, and `data` when nothing is left.

<!-- api:end -->

## Examples

```ts
import { tableNameFrom } from 'smaltkit/sql';

for (const s of ['sales.csv', 'https://example.com/data/2026 Orders.parquet', 'Événements.json.gz', '../']) {
  console.log(tableNameFrom(s));
}
```

```text
sales
t_2026_orders
v_nements
data
```

## See also

- [`quoteIdent`](./quoteIdent).
- [`normalizeDataUrl`](../urls/normalizeDataUrl): the URL to read.
