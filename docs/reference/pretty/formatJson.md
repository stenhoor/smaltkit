# formatJson

<!-- api:start -->

```ts
import { formatJson } from 'smaltkit/pretty';
function formatJson(value: unknown, options?: JsonFormatOptions): string;
```

A value as JSON, laid out to fit the width: an object or array stays on one line when it fits, and has one item per
line when it doesn't. Bigints are written as numbers.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `value` | `unknown` | Anything JSON.stringify takes. |
| `options?` | `JsonFormatOptions` | `width`, the widest line to aim for (default 100), and `indent`, spaces per level (default 2). |

## Returns

`string`: The JSON text.

## Errors

- TypeError when the value is circular.

<!-- api:end -->

## Examples

```ts
import { formatJson } from 'smaltkit/pretty';

console.log(formatJson({ id: 7, tags: ['a', 'b'] }));
console.log(formatJson({ id: 7, tags: ['a', 'b'] }, { width: 12, indent: 4 }));
console.log(formatJson({ big: 12345678901234567890n, bytes: new Uint8Array([1, 2]) }));
```

```text
{ "id": 7, "tags": ["a", "b"] }
{
    "id": 7,
    "tags": [
        "a",
        "b"
    ]
}
{ "big": 12345678901234567890, "bytes": [1, 2] }
```

A circular value throws:

```ts
import { formatJson } from 'smaltkit/pretty';

const a: Record<string, unknown> = {};
a.self = a;
try {
  formatJson(a);
} catch (e) {
  console.log((e as Error).message);
}
```

```text
formatJson: the value is circular
```

## Demo

A query plan laid out for reading: short parts stay on a line.

```ts
import { formatJson } from 'smaltkit/pretty';

const plan = {
  op: 'aggregate',
  groupBy: ['region'],
  measures: [{ fn: 'sum', column: 'amount', as: 'revenue' }],
  input: { op: 'filter', where: ['>', 'amount', 0], input: { op: 'scan', table: 'sales' } },
};
console.log(formatJson(plan, { width: 60 }));
```

```text
{
  "op": "aggregate",
  "groupBy": ["region"],
  "measures": [
    { "fn": "sum", "column": "amount", "as": "revenue" }
  ],
  "input": {
    "op": "filter",
    "where": [">", "amount", 0],
    "input": { "op": "scan", "table": "sales" }
  }
}
```

## See also

- [`formatTypeScript`](./formatTypeScript): re-indent code.
