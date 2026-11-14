# diffLines

<!-- api:start -->

```ts
import { diffLines } from 'smaltkit/git';
function diffLines(a: string, b: string): DiffLine[];
```

A line diff of two texts (Myers' algorithm): the fewest lines removed and added to turn `a` into `b`.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `a` | `string` | The old text. |
| `b` | `string` | The new text. |

## Returns

`DiffLine[]`: Every line, in order, as kept, removed (from `a`) or added (from `b`).

<!-- api:end -->

## Examples

```ts
import { diffLines } from 'smaltkit/git';

const before = 'SELECT region,\n  sum(amount)\nFROM sales';
const after = 'SELECT region,\n  sum(amount) AS total\nFROM sales\nGROUP BY region';
for (const d of diffLines(before, after)) console.log({ keep: ' ', remove: '-', add: '+' }[d.op], d.text);
```

```text
  SELECT region,
-   sum(amount)
+   sum(amount) AS total
  FROM sales
+ GROUP BY region
```

## See also

- [`Repository`](../git#Repository): a file at two commits.
