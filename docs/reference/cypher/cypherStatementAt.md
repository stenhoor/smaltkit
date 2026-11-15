# cypherStatementAt

<!-- api:start -->

```ts noplay
import { cypherStatementAt } from 'smaltkit/cypher';
function cypherStatementAt(text: string, pos: number): CypherStatement | null;
```

The statement containing (or just before) offset `pos`: the one to run when the cursor is there.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | A script. |
| `pos` | `number` | An offset in `text`, such as the cursor's. |

## Returns

`CypherStatement | null`: The statement, or null for a script with none.

<!-- api:end -->

## Examples

```ts
import { cypherStatementAt } from 'smaltkit/cypher';

const script = 'MATCH (a) RETURN a;\nMATCH (b) RETURN b';
console.log(cypherStatementAt(script, 4)?.sql);
console.log(cypherStatementAt(script, script.length)?.sql);
```

```text
MATCH (a) RETURN a
MATCH (b) RETURN b
```

## See also

- [`splitCypher`](./splitCypher).
