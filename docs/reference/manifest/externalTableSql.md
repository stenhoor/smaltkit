# externalTableSql

<!-- api:start -->

```ts noplay
import { externalTableSql } from 'smaltkit/manifest';
function externalTableSql({ table, location, format, options, connection, columns, ifNotExists }: ExternalTableSpec): string;
```

CREATE EXTERNAL TABLE text for a location (URL, `file:<name>`, or a path under a connection).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `{ table, location, format, options, connection, columns, ifNotExists }` | `ExternalTableSpec` |  |

## Returns

`string`: The statement.

<!-- api:end -->

## Examples

```ts
import { externalTableSql } from 'smaltkit/manifest';

console.log(externalTableSql({ table: 'trips', location: 'https://example.com/trips.parquet', format: 'parquet' }));
console.log(externalTableSql({ table: 'sales', location: 'file:sales.csv', options: { header: true }, ifNotExists: true }));
console.log(externalTableSql({ table: 'logs', location: 'logs/2026.ndjson', connection: 'bucket', columns: [{ name: 'at', type: 'TIMESTAMP' }] }));
```

```text
CREATE EXTERNAL TABLE trips WITH (location = 'https://example.com/trips.parquet', format = 'parquet')
CREATE EXTERNAL TABLE IF NOT EXISTS sales WITH (location = 'file:sales.csv', header = true)
CREATE EXTERNAL TABLE logs (at TIMESTAMP) WITH (location = 'logs/2026.ndjson', connection = 'bucket')
```

## See also

- [`applySteps`](./applySteps).
- [`formatFromName`](./formatFromName).
