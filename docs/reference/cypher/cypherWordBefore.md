# cypherWordBefore

<!-- api:start -->

```ts
import { cypherWordBefore } from 'smaltkit/cypher';
function cypherWordBefore(text: string, pos: number): {
    word: string;
    start: number;
    qualifier: string | null;
};
```

The word being typed at `pos`, and its qualifier: `':'` after a colon (a label or relationship type), the variable's
name after a dot (a property key), else null.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | Cypher. |
| `pos` | `number` | An offset in `text`, such as the cursor's. |

## Returns

`{ word: string; start: number; qualifier: string | null; }`: The word, where it starts, and its qualifier.

<!-- api:end -->

## Examples

```ts
import { cypherWordBefore } from 'smaltkit/cypher';

console.log(cypherWordBefore('MATCH (p:Per', 12));
console.log(cypherWordBefore('MATCH (p) RETURN p.na', 21));
console.log(cypherWordBefore('MATCH (p) RET', 13));
```

```text
{ word: 'Per', start: 9, qualifier: ':' }
{ word: 'na', start: 19, qualifier: 'p' }
{ word: 'RET', start: 10, qualifier: null }
```

## See also

- [`completeCypher`](./completeCypher): completion built on it.
