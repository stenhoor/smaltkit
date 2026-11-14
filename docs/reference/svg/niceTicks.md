# niceTicks

<!-- api:start -->

```ts
import { niceTicks } from 'smaltkit/svg';
function niceTicks(lo: number, hi: number, count?: number): {
    ticks: number[];
    min: number;
    max: number;
};
```

"Nice" tick values covering [lo, hi]: steps of 1, 2 or 5 times a power of ten.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `lo` | `number` | The smallest value. |
| `hi` | `number` | The largest value. |
| `count?` | `number` | About how many ticks. Default 5. |

## Returns

`{ ticks: number[]; min: number; max: number; }`: The ticks, and the axis ends they reach, which cover `lo` and `hi`.

<!-- api:end -->

## Examples

```ts
import { niceTicks } from 'smaltkit/svg';

console.log(niceTicks(0, 97));
console.log(niceTicks(-3.2, 7.9, 4));
console.log(niceTicks(1234, 1290));
```

```text
{ ticks: [ 0, 20, 40, 60, 80, 100 ], min: 0, max: 100 }
{
  ticks: [
    -4, -2, 0, 2,
     4,  6, 8
  ],
  min: -4,
  max: 8
}
{
  ticks: [
    1230, 1240,
    1250, 1260,
    1270, 1280,
    1290
  ],
  min: 1230,
  max: 1290
}
```

## See also

- [`linear`](./linear): a scale with these ticks.
- [`axisFormatter`](../format/axisFormatter): their labels.
