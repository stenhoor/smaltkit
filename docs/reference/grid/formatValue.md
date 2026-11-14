# formatValue

<!-- api:start -->

```ts
import { formatValue } from 'smaltkit/grid';
function formatValue(v: GridValue): string | null;
```

A value as the grid shows it; null for NULL.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `v` | `GridValue` | A result value. |

## Returns

`string | null`: Its text: whole numbers as written, others to 12 decimal places at most, bytes as a hex preview with their size (`x'0102' (2 B)`); null for null.

<!-- api:end -->

## Examples

```ts
import { formatValue } from 'smaltkit/grid';

console.log([42, 0.1 + 0.2, 12n, 'text', null, new Uint8Array([1, 2, 255])].map(formatValue));
```

```text
[ '42', '0.3', '12', 'text', null, "x'0102ff' (3 B)" ]
```

## See also

- [`plainValue`](./plainValue): the full value, for copying.
- [`formatter`](../format/formatter): formats for reports.
