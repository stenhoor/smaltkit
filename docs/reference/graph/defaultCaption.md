# defaultCaption

<!-- api:start -->

```ts
import { defaultCaption } from 'smaltkit/graph';
function defaultCaption(n: ResultNodeLike): string;
```

A node's caption when nothing else is asked for: its `name`, `title`, `label` or `code` property, else its first
label and its id.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `n` | `ResultNodeLike` | A node, as a result holds it. |

## Returns

`string`: The caption.

<!-- api:end -->

## Examples

```ts
import { defaultCaption } from 'smaltkit/graph';

console.log(defaultCaption({ kind: 'node', id: 1, labels: ['Person'], properties: { name: 'Ann', age: 41 } }));
console.log(defaultCaption({ kind: 'node', id: 2, labels: ['Station'], properties: { code: 'CEN' } }));
console.log(defaultCaption({ kind: 'node', id: 3, labels: ['Thing'], properties: {} }));
console.log(defaultCaption({ kind: 'node', id: 4, labels: [], properties: {} }));
```

```text
Ann
CEN
Thing 3
4
```

## See also

- [`resultsToGraph`](./resultsToGraph): its `caption` option replaces it.
