# quoteIdent

<!-- api:start -->

```ts
import { quoteIdent } from 'smaltkit/sql';
function quoteIdent(name: string): string;
```

Quote an identifier when needed: a name that isn't a plain word, or that is a keyword, goes in double quotes.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `name` | `string` | A table or column name. |

## Returns

`string`: The name, quoted if it must be.

<!-- api:end -->

## Examples

```ts
import { quoteIdent } from 'smaltkit/sql';

console.log(quoteIdent('sales'), quoteIdent('order date'), quoteIdent('select'), quoteIdent('say "hi"'));
```

```text
sales "order date" "select" "say ""hi"""
```

## Demo

A query over a table whose columns came from a file's header:

```ts
import { quoteIdent } from 'smaltkit/sql';

const columns = ['Region', 'Unit price', 'group'];
console.log(`SELECT ${columns.map(quoteIdent).join(', ')} FROM ${quoteIdent('2026 sales')}`);
```

```text
SELECT Region, "Unit price", "group" FROM "2026 sales"
```

## See also

- [`unquote`](./unquote): the other way.
- [`quoteLiteral`](./quoteLiteral): values.
- [`tableNameFrom`](./tableNameFrom).
