# sortOrder

<!-- api:start -->

```ts noplay
import { sortOrder } from 'smaltkit/grid';
function sortOrder(rows: GridRow[], col: number, dir: SortDir): number[] | null;
```

The view order for sorting rows by a column: nulls first, then numbers, then strings, then everything else; equal
values keep their order. Null when `dir` is null (unsorted).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `rows` | `GridRow[]` | The rows. |
| `col` | `number` | The column to sort by. |
| `dir` | `SortDir` | `'asc'`, `'desc'`, or null for the rows' own order. |

## Returns

`number[] | null`: Row indexes in view order, or null.

<!-- api:end -->

## Examples

```ts
import { sortOrder } from 'smaltkit/grid';

const rows = [['b', 2], [null, 1], ['a', 10], ['c', 2n]];
console.log(sortOrder(rows, 0, 'asc'));
console.log(sortOrder(rows, 1, 'desc'));
console.log(sortOrder(rows, 1, null));
```

```text
[ 1, 2, 0, 3 ]
[ 2, 0, 3, 1 ]
null
```

## Demo

Rows in view order:

```ts
import { sortOrder } from 'smaltkit/grid';

const rows = [['Tea', 120], ['Coffee', 340], ['Cocoa', 90]];
const order = sortOrder(rows, 1, 'desc') ?? rows.map((_, i) => i);
console.log(order.map((i) => rows[i]![0]));
```

```text
[ 'Coffee', 'Tea', 'Cocoa' ]
```

## See also

- [`Grid`](../grid#Grid): sorts with it when no `onSort` is given.
