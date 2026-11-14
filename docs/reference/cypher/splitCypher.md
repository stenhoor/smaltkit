# splitCypher

<!-- api:start -->

```ts
import { splitCypher } from 'smaltkit/cypher';
function splitCypher(text: string): CypherStatement[];
```

The statements in the text, split at semicolons outside strings, names and comments.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | A script. |

## Returns

`CypherStatement[]`: The statements, each with its text (in `sql`, trimmed) and its offsets in `text`.

<!-- api:end -->

## Examples

```ts
import { splitCypher } from 'smaltkit/cypher';

const script = "CREATE (:City {name: 'A;B'});\n// a comment;\nMATCH (c:City) RETURN c.name";
for (const s of splitCypher(script)) console.log(s.start, s.end, s.sql);
```

```text
0 28 CREATE (:City {name: 'A;B'})
44 72 MATCH (c:City) RETURN c.name
```

## See also

- [`cypherStatementAt`](./cypherStatementAt).
- [`splitStatements`](../sql/splitStatements): SQL's.
