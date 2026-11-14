# quoteLiteral

<!-- api:start -->

```ts
import { quoteLiteral } from 'smaltkit/sql';
function quoteLiteral(v: SqlValue | boolean | undefined): string;
```

A value as a SQL literal.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `v` | `SqlValue \| boolean \| undefined` | The value. Booleans are 1 and 0, bytes are a hex blob (`x'0102'`). |

## Returns

`string`: The literal: `NULL`, a number, a quoted string with its quotes doubled, or a blob.

<!-- api:end -->

## Examples

```ts
import { quoteLiteral } from 'smaltkit/sql';

console.log([null, 42, 9007199254740993n, true, "it's", new Uint8Array([1, 255])].map(quoteLiteral).join(', '));
```

```text
NULL, 42, 9007199254740993, 1, 'it''s', x'01ff'
```

## Demo

Rows as `INSERT` statements:

```ts
import { quoteIdent, quoteLiteral } from 'smaltkit/sql';

const rows = [['North', 120, null], ["O'Brien", 3.5, true]];
for (const r of rows) console.log(`INSERT INTO ${quoteIdent('my table')} VALUES (${r.map(quoteLiteral).join(', ')});`);
```

```text
INSERT INTO "my table" VALUES ('North', 120, NULL);
INSERT INTO "my table" VALUES ('O''Brien', 3.5, 1);
```

## See also

- [`quoteIdent`](./quoteIdent).
- [`scanParams`](./scanParams): bind values instead.
- [`exportRows`](../grid#exportRows): a whole result as SQL.
