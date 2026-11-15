# plainValue

<!-- api:start -->

```ts noplay
import { plainValue } from 'smaltkit/grid';
function plainValue(v: GridValue): string;
```

A value as text for copying and export: everything, unlike formatValue's preview.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `v` | `GridValue` | A result value. |

## Returns

`string`: Its text; bytes in full as `x'…'`; `''` for null.

<!-- api:end -->

## Examples

```ts
import { plainValue } from 'smaltkit/grid';

console.log([42, 0.1 + 0.2, 12n, 'text', null, new Uint8Array([1, 2, 255])].map(plainValue));
```

```text
[ '42', '0.30000000000000004', '12', 'text', '', "x'0102ff'" ]
```

## See also

- [`formatValue`](./formatValue): the grid's preview.
- [`exportRows`](./exportRows).
