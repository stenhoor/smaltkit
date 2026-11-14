# tokenizeCypher

<!-- api:start -->

```ts
import { tokenizeCypher } from 'smaltkit/cypher';
function tokenizeCypher(text: string): CypherToken[];
```

The text's tokens, in order and covering it all. Unterminated strings and comments run to the end.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | Cypher, whole or partial: tokenizing never fails. |

## Returns

`CypherToken[]`: The tokens, each with its type, its text and its offsets in `text`.

<!-- api:end -->

## Examples

```ts
import { tokenizeCypher } from 'smaltkit/cypher';

for (const t of tokenizeCypher('MATCH (p:Person {name: $name}) RETURN p')) {
  if (t.type !== 'ws') console.log(t.type.padEnd(6), t.text);
}
```

```text
word   MATCH
punct  (
word   p
punct  :
word   Person
punct  {
word   name
punct  :
param  $name
punct  }
punct  )
word   RETURN
word   p
```

## See also

- [`highlightCypher`](./highlightCypher).
- [`tokenize`](../sql/tokenize): SQL's.
