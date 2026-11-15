# inspect

<!-- api:start -->

```ts noplay
import { inspect } from 'smaltkit/pretty';
function inspect(value: unknown, options?: InspectOptions): string;
```

A value as a console shows it, the same in every runtime: `'text'`, `12n`, `[ 1, 2 ]`, `{ a: 1 }`,
`Map(1) { 'a' => 1 }`, `Uint8Array(2) [ 1, 2 ]`. A value that fits the width stays on one line; one that doesn't
has an item per line, indented two spaces. Circular references are `[Circular]`.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `value` | `unknown` | Anything. |
| `options?` | `InspectOptions` | `width`: the widest line to aim for (default 80). |

## Returns

`string`: The text.

<!-- api:end -->

## Examples

```ts
import { inspect } from 'smaltkit/pretty';

console.log(inspect("it's"), inspect(12n), inspect([1, null, undefined]));
console.log(inspect({ id: 7, tags: new Set(['a']), scores: new Map([['ann', 3]]), bytes: new Uint8Array([1, 255]) }));
```

```text
"it's" 12n [ 1, null, undefined ]
{
  id: 7,
  tags: Set(1) { 'a' },
  scores: Map(1) { 'ann' => 3 },
  bytes: Uint8Array(2) [ 1, 255 ]
}
```

A value too wide for the line has an item per line:

```ts
import { inspect } from 'smaltkit/pretty';

console.log(inspect([{ region: 'North', revenue: 120 }, { region: 'South', revenue: 340 }], { width: 40 }));
```

```text
[
  { region: 'North', revenue: 120 },
  { region: 'South', revenue: 340 }
]
```

## See also

- [`formatLog`](./formatLog): what `console.log` prints.
- [`formatJson`](./formatJson): JSON, for data.
