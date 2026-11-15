# splitStatements

<!-- api:start -->

```ts noplay
import { splitStatements } from 'smaltkit/sql';
function splitStatements(text: string): Statement[];
```

Split a script into statements, at semicolons outside strings, identifiers and comments.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | A script. |

## Returns

`Statement[]`: The statements, each with its text (trimmed of whitespace and its semicolon) and its offsets in `text`. Empty statements are left out.

<!-- api:end -->

## Examples

```ts
import { splitStatements } from 'smaltkit/sql';

const script = "INSERT INTO t VALUES ('a;b');\n-- done;\nSELECT * FROM t;;";
for (const s of splitStatements(script)) console.log(s.start, s.end, JSON.stringify(s.sql));
```

```text
0 28 "INSERT INTO t VALUES ('a;b')"
39 54 "SELECT * FROM t"
```

## Demo

Running a script one statement at a time, rows or not:

```ts
import { splitStatements, returnsRows } from 'smaltkit/sql';

const script = 'CREATE TABLE t (a INT); INSERT INTO t VALUES (1), (2); SELECT a FROM t';
for (const { sql } of splitStatements(script)) console.log(returnsRows(sql) ? 'query' : 'exec ', sql);
```

```text
exec  CREATE TABLE t (a INT)
exec  INSERT INTO t VALUES (1), (2)
query SELECT a FROM t
```

## See also

- [`statementAt`](./statementAt): the statement at the cursor.
- [`returnsRows`](./returnsRows): how to run each one.
