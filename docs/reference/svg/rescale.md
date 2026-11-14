# rescale

<!-- api:start -->

```ts
import { rescale } from 'smaltkit/svg';
function rescale(s: Linear, r0: number, r1: number): Linear;
```

The same kind of scale over a new range (for laying out once the margins are known).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `s` | `Linear` | A scale from linear, logScale or valueScale. |
| `r0` | `number` | The new start position. |
| `r1` | `number` | The new end position. |

## Returns

`Linear`: A scale with the same domain and ticks over [r0, r1].

<!-- api:end -->

## Examples

```ts
import { rescale } from 'smaltkit/svg';

import { linear } from 'smaltkit/svg';

const draft = linear(0, 97, 0, 1);
const y = rescale(draft, 260, 20);
console.log(y.domain, y.ticks, y(0), y(100));
```

```text
[ 0, 100 ] [ 0, 20, 40, 60, 80, 100 ] 260 20
```

## Demo

Measure the labels first, then fit the scale into what's left:

```ts
import { linear, rescale, textWidth } from 'smaltkit/svg';

const width = 400;
const draft = linear(0, 125000, 0, 1);
const margin = Math.max(...draft.ticks.map((t) => textWidth(String(t), 11))) + 8;
const x = rescale(draft, margin, width);
console.log(Math.round(margin), x.range.map(Math.round));
```

```text
45 [ 45, 400 ]
```

## See also

- [`valueScale`](./valueScale).
