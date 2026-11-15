# linear

<!-- api:start -->

```ts noplay
import { linear } from 'smaltkit/svg';
function linear(lo: number, hi: number, r0: number, r1: number, opts?: {
    zero?: boolean;
    nice?: boolean;
    count?: number;
}): Linear;
```

A linear scale from values in [lo, hi] to positions in [r0, r1].

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `lo` | `number` | The smallest value. |
| `hi` | `number` | The largest value. |
| `r0` | `number` | The position of `lo`, such as the bottom of a plot. |
| `r1` | `number` | The position of `hi`. |
| `opts?` | `{ zero?: boolean; nice?: boolean; count?: number; }` | `zero`: include 0 (default true). `nice`: extend to nice ticks (default true). `count`: about how many. |

## Returns

`Linear`: The scale, a function with its `domain`, `range` and `ticks`.

<!-- api:end -->

## Examples

```ts
import { linear } from 'smaltkit/svg';

const y = linear(12, 87, 300, 0);
console.log(y.domain, y.ticks, y(0), y(50), y(100));
const x = linear(12, 87, 0, 100, { zero: false, nice: false });
console.log(x.domain, x(12), x(87));
```

```text
[ 0, 100 ] [ 0, 20, 40, 60, 80, 100 ] 300 150 0
[ 12, 87 ] 0 100
```

## Demo

A y axis's gridlines, drawn as SVG:

```ts
import { linear } from 'smaltkit/svg';

const y = linear(0, 340, 200, 0, { count: 4 });
for (const t of y.ticks) console.log(`<line x1="0" x2="300" y1="${y(t)}" y2="${y(t)}"/><text y="${y(t)}">${t}</text>`);
```

```text
<line x1="0" x2="300" y1="200" y2="200"/><text y="200">0</text>
<line x1="0" x2="300" y1="150" y2="150"/><text y="150">100</text>
<line x1="0" x2="300" y1="100" y2="100"/><text y="100">200</text>
<line x1="0" x2="300" y1="50" y2="50"/><text y="50">300</text>
<line x1="0" x2="300" y1="0" y2="0"/><text y="0">400</text>
```

## See also

- [`valueScale`](./valueScale): with log and fixed ends.
- [`band`](./band): for categories.
- [`niceTicks`](./niceTicks).
