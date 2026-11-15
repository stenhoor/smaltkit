# formatFromName

<!-- api:start -->

```ts noplay
import { formatFromName } from 'smaltkit/manifest';
function formatFromName(name: string): DataFormat;
```

The format a file name implies (by extension); CSV when it says nothing.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `name` | `string` | A file name, path or URL. |

## Returns

`DataFormat`: `csv`, `tsv`, `json`, `ndjson` or `parquet`.

<!-- api:end -->

## Examples

```ts
import { formatFromName } from 'smaltkit/manifest';

for (const n of ['sales.csv', 'Trips.PARQUET', 'events.jsonl?raw=1', 'notes.txt', 'data']) console.log(n, formatFromName(n));
```

```text
sales.csv csv
Trips.PARQUET parquet
events.jsonl?raw=1 ndjson
notes.txt csv
data csv
```

## See also

- [`tableNameFrom`](../sql/tableNameFrom): the table a file goes into.
