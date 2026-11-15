# linePath

<!-- api:start -->

```ts noplay
import { linePath } from 'smaltkit/svg';
function linePath(pts: [
    number,
    number
][], smooth?: boolean): string;
```

Monotone-ish smooth path through points (Catmull-Rom with tension), or straight segments.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `pts` | `[ number, number ][]` | The points, as `[x, y]`. |
| `smooth?` | `boolean` | Curves instead of straight segments. Default false. |

## Returns

`string`: The path's `d`, with coordinates rounded to hundredths; `''` for no points.

<!-- api:end -->

## Examples

```ts
import { linePath } from 'smaltkit/svg';

const pts: [number, number][] = [[0, 50], [50, 10], [100, 40]];
console.log(linePath(pts));
console.log(linePath(pts, true));
console.log(JSON.stringify(linePath([])));
```

```text
M0,50L50,10L100,40
M0,50C9,42.8 32,11.8 50,10C68,8.2 91,34.6 100,40
""
```

## See also

- [`lineChart`](../charts#lineChart): a whole chart.
