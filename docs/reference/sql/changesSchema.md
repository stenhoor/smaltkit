# changesSchema

<!-- api:start -->

```ts
import { changesSchema } from 'smaltkit/sql';
function changesSchema(sql: string): boolean;
```

Whether a statement changes the schema (the object explorer should refresh): `CREATE`, `DROP`, `ALTER` or `REFRESH`.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `sql` | `string` | A statement. |

## Returns

`boolean`: True when it changes the schema.

<!-- api:end -->

## Examples

```ts
import { changesSchema } from 'smaltkit/sql';

console.log(changesSchema('CREATE TABLE t (a INT)'), changesSchema('drop view v'), changesSchema('SELECT 1'));
```

```text
true true false
```

## Demo

Refreshing an object list only when a script changes the schema:

```ts
import { splitStatements, changesSchema } from 'smaltkit/sql';

const script = 'INSERT INTO t VALUES (1); ALTER TABLE t ADD COLUMN b INT';
console.log(splitStatements(script).some((s) => changesSchema(s.sql)) ? 'refresh the schema' : 'nothing to refresh');
```

```text
refresh the schema
```

## See also

- [`returnsRows`](./returnsRows).
- [`leadingKeyword`](./leadingKeyword).
