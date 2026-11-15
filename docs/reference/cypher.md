# smaltkit/cypher

Cypher text utilities (smaltcy's dialect): a tokenizer and highlighter, statement splitting, and completion of keywords, functions, labels, relationship types and property keys. Text only: nothing here runs Cypher.

The editor's `cypherLanguage` is built on it.

## Examples

```ts
import { splitCypher, tokenizeCypher } from 'smaltkit/cypher';

console.log(splitCypher('MATCH (n) RETURN n; MATCH (m:Person) RETURN m.name').map((s) => s.sql));
console.log(tokenizeCypher('MATCH (p:Person)').filter((t) => t.type !== 'ws').map((t) => `${t.type}:${t.text}`).join(' '));
```

```text
[ 'MATCH (n) RETURN n', 'MATCH (m:Person) RETURN m.name' ]
word:MATCH punct:( word:p punct:: word:Person punct:)
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

Each has a page of its own.

| Function | |
| --- | --- |
| [`completeCypher`](./cypher/completeCypher) | Completion candidates at `pos`: labels or relationship types after a `:` in a pattern, property keys after a `.`, else keywords, functions and the graph's labels. |
| [`cypherStatementAt`](./cypher/cypherStatementAt) | The statement containing (or just before) offset `pos`: the one to run when the cursor is there. |
| [`cypherWordBefore`](./cypher/cypherWordBefore) | The word being typed at `pos`, and its qualifier: `':'` after a colon (a label or relationship type), the variable's name after a dot (a property key), else null. |
| [`highlightCypher`](./cypher/highlightCypher) | HTML for the editor's highlight layer, ending with a newline: keywords, functions, labels and relationship types, property keys, parameters, strings, numbers and comments. |
| [`splitCypher`](./cypher/splitCypher) | The statements in the text, split at semicolons outside strings, names and comments. |
| [`tokenizeCypher`](./cypher/tokenizeCypher) | The text's tokens, in order and covering it all. |

### Constants

#### CYPHER_FUNCTIONS {#CYPHER_FUNCTIONS}

```ts noplay
const CYPHER_FUNCTIONS: readonly string[];
```

The functions smaltcy's library documents, as Cypher spells them.

#### CYPHER_KEYWORDS {#CYPHER_KEYWORDS}

```ts noplay
const CYPHER_KEYWORDS: readonly string[];
```

The clause and expression keywords smaltcy's parser reads, upper-cased.

### Interfaces

#### CypherCompletion {#CypherCompletion}

```ts noplay
interface CypherCompletion {
    label: string;
    kind: string;
    detail: string;
}
```

| Member | |
| --- | --- |
| `kind` | 'label', 'type', 'prop', 'fn' or 'kw' (the popup shows it, so `detail` is left empty). |

#### CypherStatement {#CypherStatement}

```ts noplay
interface CypherStatement {
    sql: string;
    start: number;
    end: number;
}
```

A statement and where it is in the text. (`sql` holds its text, as `Statement` does for SQL.)

#### CypherToken {#CypherToken}

```ts noplay
interface CypherToken {
    type: CypherTokenType;
    text: string;
    start: number;
    end: number;
}
```

#### CypherVocabulary {#CypherVocabulary}

```ts noplay
interface CypherVocabulary {
    labels: readonly string[];
    types: readonly string[];
    properties: readonly string[];
}
```

What completion knows about a graph: its labels, relationship types and property keys.

### Types

#### CypherTokenType {#CypherTokenType}

```ts noplay
type CypherTokenType = 'ws' | 'comment' | 'string' | 'ident' | 'number' | 'param' | 'word' | 'punct';
```

<!-- api:end -->
