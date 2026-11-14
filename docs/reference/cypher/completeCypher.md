# completeCypher

<!-- api:start -->

```ts
import { completeCypher } from 'smaltkit/cypher';
function completeCypher(text: string, pos: number, vocab: CypherVocabulary | null, explicit: boolean): {
    items: CypherCompletion[];
    start: number;
};
```

Completion candidates at `pos`: labels or relationship types after a `:` in a pattern, property keys after a `.`,
else keywords, functions and the graph's labels. `explicit` (Ctrl+Space) lists them even with nothing typed.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | Cypher. |
| `pos` | `number` | The cursor's offset in `text`. |
| `vocab` | `CypherVocabulary \| null` | The graph's labels, relationship types and property keys, or null for none. |
| `explicit` | `boolean` | Whether the user asked for completion, so a list shows with nothing typed. |

## Returns

`{ items: CypherCompletion[]; start: number; }`: The candidates whose names start with the word typed, and where that word starts (what a pick replaces).

<!-- api:end -->

## Examples

```ts
import { completeCypher } from 'smaltkit/cypher';

const vocab = { labels: ['Person', 'City'], types: ['KNOWS', 'LIVES_IN'], properties: ['name', 'age'] };
const show = (text: string) => {
  const { items, start } = completeCypher(text, text.length, vocab, false);
  console.log(start, items.map((i) => `${i.kind}:${i.label}`).join(' '));
};
show('MATCH (p:P');
show('MATCH (p)-[:L');
show('MATCH (p) RETURN p.');
show('MATCH (p) RET');
```

```text
9 label:Person
12 type:LIVES_IN
19 prop:name prop:age
10 kw:RETURN
```

## Demo

With nothing typed, a list shows only when asked for (Ctrl+Space):

```ts
import { completeCypher } from 'smaltkit/cypher';

console.log(completeCypher('MATCH (p:', 9, { labels: ['Person'], types: [], properties: [] }, false).items.length);
console.log(completeCypher('MATCH (p:', 9, { labels: ['Person'], types: [], properties: [] }, true).items);
```

```text
1
[ { label: 'Person', kind: 'label', detail: '' } ]
```

## See also

- [`cypherWordBefore`](./cypherWordBefore).
- [`cypherLanguage`](../editor#cypherLanguage): the editor's Cypher, which uses it.
