# logScale

<!-- api:start -->

```ts
import { logScale } from 'smaltkit/svg';
function logScale(lo: number, hi: number, r0: number, r1: number): Linear;
```

A log-10 scale over [lo, hi] (both > 0): ticks at 1, 10, 100… (with 2 and 5 between when there are few decades).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `lo` | `number` | The smallest value, above 0. |
| `hi` | `number` | The largest value. |
| `r0` | `number` | The position of `lo`. |
| `r1` | `number` | The position of `hi`. |

## Returns

`Linear`: The scale, with `log` true.

<!-- api:end -->

## Examples

```ts
import { logScale } from 'smaltkit/svg';

const s = logScale(3, 4200, 0, 300);
console.log(s.domain, s.ticks, Math.round(s(100)), s.log);
console.log(logScale(2, 40, 0, 100).ticks);
```

```text
[ 1, 10000 ] [ 1, 10, 100, 1000, 10000 ] 150 true
[
   1,  2,   5, 10,
  20, 50, 100
]
```

## See also

- [`valueScale`](./valueScale): picks log or linear.
