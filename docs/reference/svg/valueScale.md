# valueScale

<!-- api:start -->

```ts noplay
import { valueScale } from 'smaltkit/svg';
function valueScale(lo: number, hi: number, r0: number, r1: number, opts?: {
    count?: number;
    log?: boolean;
    min?: number;
    max?: number;
}): Linear;
```

A value axis: linear (from zero unless `min` is given) or, with `log` and positive values, log 10. `min` and `max`
fix the ends; the nice ticks inside them are kept.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `lo` | `number` | The smallest value. |
| `hi` | `number` | The largest value. |
| `r0` | `number` | The position of the axis's start. |
| `r1` | `number` | The position of its end. |
| `opts?` | `{ count?: number; log?: boolean; min?: number; max?: number; }` | `count`: about how many ticks. `log`: a log scale. `min`, `max`: fixed ends. |

## Returns

`Linear`: The scale.

<!-- api:end -->

## Examples

```ts
import { valueScale } from 'smaltkit/svg';

console.log(valueScale(12, 87, 0, 100).domain);
console.log(valueScale(12, 87, 0, 100, { min: 10, max: 90 }).domain);
console.log(valueScale(5, 50000, 0, 100, { log: true }).ticks);
```

```text
[ 0, 100 ]
[ 10, 90 ]
[ 1, 10, 100, 1000, 10000, 100000 ]
```

## See also

- [`linear`](./linear) and [`logScale`](./logScale).
- [`rescale`](./rescale).
