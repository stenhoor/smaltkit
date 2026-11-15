# highlightCypher

<!-- api:start -->

```ts noplay
import { highlightCypher } from 'smaltkit/cypher';
function highlightCypher(text: string): string;
```

HTML for the editor's highlight layer, ending with a newline: keywords, functions, labels and relationship types,
property keys, parameters, strings, numbers and comments.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | Cypher. |

## Returns

`string`: The HTML, with the text escaped.

<!-- api:end -->

## Examples

```ts
import { highlightCypher } from 'smaltkit/cypher';

console.log(highlightCypher("MATCH (p:Person)-[:KNOWS]->(f) WHERE p.name = 'Ann' RETURN count(f)"));
```

```text
<span class="sk-tk-k">MATCH</span> (p:<span class="sk-tk-obj">Person</span>)<span class="sk-tk-o">-</span>[:<span class="sk-tk-obj">KNOWS</span>]<span class="sk-tk-o">-</span><span class="sk-tk-o">&gt;</span>(f) <span class="sk-tk-k">WHERE</span> p.<span class="sk-tk-i">name</span> <span class="sk-tk-o">=</span> <span class="sk-tk-s">&#39;Ann&#39;</span> <span class="sk-tk-k">RETURN</span> <span class="sk-tk-f">count</span>(f)

```

## See also

- [`tokenizeCypher`](./tokenizeCypher).
- [`cypherLanguage`](../editor#cypherLanguage): the editor's Cypher.
