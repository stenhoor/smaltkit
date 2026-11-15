# arc

<!-- api:start -->

```ts noplay
import { arc } from 'smaltkit/svg';
function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string;
```

SVG path for an annular sector (angles in radians, 0 = 12 o'clock, clockwise), for pies, donuts and gauges.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `cx` | `number` | The centre's x. |
| `cy` | `number` | The centre's y. |
| `r0` | `number` | The inner radius: 0 for a pie slice. |
| `r1` | `number` | The outer radius. |
| `a0` | `number` | The start angle. |
| `a1` | `number` | The end angle. A whole turn draws a full ring. |

## Returns

`string`: The path's `d`.

<!-- api:end -->

## Examples

```ts
import { arc } from 'smaltkit/svg';

console.log(arc(50, 50, 0, 40, 0, Math.PI / 2));
console.log(arc(50, 50, 25, 40, 0, Math.PI));
```

```text
M50,50L50,10A40,40 0 0 1 90,50Z
M50,10A40,40 0 0 1 50,90L50,75A25,25 0 0 0 50,25Z
```

## Demo

A donut's slices:

```ts
import { arc } from 'smaltkit/svg';

const values = [3, 1, 2];
const total = values.reduce((a, b) => a + b);
let a = 0;
for (const v of values) {
  const b = a + (v / total) * Math.PI * 2;
  console.log(`<path d="${arc(60, 60, 30, 50, a, b)}"/>`);
  a = b;
}
```

```text
<path d="M60,10A50,50 0 0 1 60,110L60,90A30,30 0 0 0 60,30Z"/>
<path d="M60,110A50,50 0 0 1 16.7,85L34.02,75A30,30 0 0 0 60,90Z"/>
<path d="M16.7,85A50,50 0 0 1 60,10L60,30A30,30 0 0 0 34.02,75Z"/>
```

## See also

- [`pieChart`](../charts#pieChart) and [`donutChart`](../charts#donutChart).
