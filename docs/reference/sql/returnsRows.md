# returnsRows

<!-- api:start -->

```ts
import { returnsRows } from 'smaltkit/sql';
function returnsRows(sql: string): boolean;
```

Whether a statement produces rows (and should be streamed into a grid rather than run with exec): `SELECT`,
`VALUES`, `TABLE`, `EXPLAIN`, `PRAGMA` without `=`, `WITH` unless it writes without `RETURNING`, and any statement
with `RETURNING`.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `sql` | `string` | A statement. |

## Returns

`boolean`: True when it returns rows.

<!-- api:end -->

## Examples

```ts
import { returnsRows } from 'smaltkit/sql';

for (const sql of [
  'SELECT 1',
  'WITH x AS (SELECT 1) SELECT * FROM x',
  'WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x',
  'INSERT INTO t VALUES (1) RETURNING id',
  'PRAGMA table_info(t)',
  'PRAGMA cache_size = 100',
  'DELETE FROM t',
]) console.log(returnsRows(sql), sql);
```

```text
true SELECT 1
true WITH x AS (SELECT 1) SELECT * FROM x
false WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x
true INSERT INTO t VALUES (1) RETURNING id
true PRAGMA table_info(t)
false PRAGMA cache_size = 100
false DELETE FROM t
```

## See also

- [`changesSchema`](./changesSchema): whether to refresh the schema after it.
- [`splitStatements`](./splitStatements).
