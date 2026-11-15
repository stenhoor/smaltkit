# toNum

<!-- api:start -->

```ts noplay
import { toNum } from 'smaltkit/svg';
function toNum(v: unknown): number;
```

A value as a number, for plotting.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `v` | `unknown` | A number, bigint or numeric text. |

## Returns

`number`: The number; NaN for null, undefined, `''` and text that isn't a number.

<!-- api:end -->

## Examples

```ts
import { toNum } from 'smaltkit/svg';

console.log([3, 12n, '4.5', '', null, 'n/a'].map(toNum));
```

```text
[ 3, 12, 4.5, NaN, NaN, NaN ]
```

## See also

- [`timeValue`](./timeValue): dates as numbers.
