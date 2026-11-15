# band

<!-- api:start -->

```ts noplay
import { band } from 'smaltkit/svg';
function band(n: number, r0: number, r1: number, pad?: number, outer?: number): Band;
```

A band scale over `n` slots in [r0, r1], for bars.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `n` | `number` | How many slots. |
| `r0` | `number` | The start position. |
| `r1` | `number` | The end position. |
| `pad?` | `number` | The gap between bands, as a fraction of the step. Default 0.2. |
| `outer?` | `number` | The gap before the first band and after the last, in steps. Default half of `pad`. |

## Returns

`Band`: The scale: slot `i` to its band's start, with `step` (band and gap) and `bandwidth`.

<!-- api:end -->

## Examples

```ts
import { band } from 'smaltkit/svg';

const x = band(4, 0, 400);
console.log(x.step, x.bandwidth, [0, 1, 2, 3].map((i) => Math.round(x(i))));
const tight = band(4, 0, 400, 0, 0);
console.log(tight.step, tight.bandwidth);
```

```text
100 80 [ 10, 110, 210, 310 ]
100 100
```

## Demo

Bars for a column chart:

```ts
import { band, linear } from 'smaltkit/svg';

const values = [120, 340, 90];
const x = band(values.length, 0, 300);
const y = linear(0, 340, 200, 0);
for (const [i, v] of values.entries()) {
  const [left, top] = [Math.round(x(i)), Math.round(y(v))];
  console.log(`<rect x="${left}" y="${top}" width="${x.bandwidth}" height="${200 - top}"/>`);
}
```

```text
<rect x="10" y="131" width="80" height="69"/>
<rect x="110" y="6" width="80" height="194"/>
<rect x="210" y="149" width="80" height="51"/>
```

## See also

- [`linear`](./linear).
- [`columnChart`](../charts#columnChart): a whole chart.
