# squarify

<!-- api:start -->

```ts noplay
import { squarify } from 'smaltkit/charts';
function squarify(nodes: TreeNode[], rect: Rect): (Rect & {
    i: number;
})[];
```

Squarified treemap layout (Bruls, Huizing, van Wijk): rectangles with areas in proportion to the values, as close to
square as the layout allows.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `nodes` | `TreeNode[]` | The values, each with its index `i`, largest first for the best layout. |
| `rect` | `Rect` | The rectangle to fill. |

## Returns

`(Rect & { i: number; })[]`: A rectangle per node, with its index.

<!-- api:end -->

## Examples

```ts
import { squarify } from 'smaltkit/charts';

const values = [60, 25, 15];
for (const r of squarify(values.map((v, i) => ({ i, v })), { x: 0, y: 0, w: 100, h: 60 })) {
  console.log(r.i, [r.x, r.y, r.w, r.h].map((n) => Math.round(n)));
}
```

```text
0 [ 0, 0, 60, 60 ]
1 [ 60, 0, 40, 38 ]
2 [ 60, 38, 40, 23 ]
```

## See also

- [`treemapChart`](./treemapChart).
