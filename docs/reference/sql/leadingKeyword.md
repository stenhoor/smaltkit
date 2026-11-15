# leadingKeyword

<!-- api:start -->

```ts noplay
import { leadingKeyword } from 'smaltkit/sql';
function leadingKeyword(sql: string): string;
```

First significant keyword of a statement, upper-cased: comments and opening brackets are skipped.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `sql` | `string` | A statement. |

## Returns

`string`: The keyword, such as `SELECT`, or `''`.

<!-- api:end -->

## Examples

```ts
import { leadingKeyword } from 'smaltkit/sql';

console.log(leadingKeyword('  -- note\n(select 1)'));
console.log(leadingKeyword('insert into t values (1)'));
console.log(JSON.stringify(leadingKeyword("'text'")));
```

```text
SELECT
INSERT
""
```

## See also

- [`returnsRows`](./returnsRows) and [`changesSchema`](./changesSchema), built on it.
