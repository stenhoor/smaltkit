# scanParams

<!-- api:start -->

```ts
import { scanParams } from 'smaltkit/sql';
function scanParams(sql: string): ParamSlot[];
```

Parameter slots in the order the engine numbers them: `?` takes the next number, `?N` is explicit,
and a name (`:a`, `@a`, `$a`) takes the next number on first use.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `sql` | `string` | A statement. |

## Returns

`ParamSlot[]`: A slot for every number from 1 to the highest used, with its label as written (`?N` for a bare `?`, and for a number nothing names).

<!-- api:end -->

## Examples

```ts
import { scanParams } from 'smaltkit/sql';

console.log(scanParams('SELECT * FROM t WHERE a = ? AND b = :name AND c = :name'));
console.log(scanParams('SELECT ?3'));
```

```text
[ { label: '?1', index: 1 }, { label: ':name', index: 2 } ]
[
  { label: '?1', index: 1 },
  { label: '?2', index: 2 },
  { label: '?3', index: 3 }
]
```

## Demo

Asking for a value per parameter, and binding them in order:

```ts
import { scanParams } from 'smaltkit/sql';

const sql = 'SELECT * FROM sales WHERE region = :region AND amount > $min';
const given: Record<string, unknown> = { ':region': 'North', $min: 100 };
const params = scanParams(sql).map((p) => given[p.label]);
console.log(params);
```

```text
[ 'North', 100 ]
```

## See also

- [`quoteLiteral`](./quoteLiteral): write a value into the SQL instead.
