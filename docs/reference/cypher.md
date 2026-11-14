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

#### completeCypher {#completeCypher}

```ts
function completeCypher(text: string, pos: number, vocab: CypherVocabulary | null, explicit: boolean): {
    items: CypherCompletion[];
    start: number;
};
```

Completion candidates at `pos`: labels or relationship types after a `:` in a pattern, property keys after a `.`,
else keywords, functions and the graph's labels. `explicit` (Ctrl+Space) lists them even with nothing typed.

#### cypherStatementAt {#cypherStatementAt}

```ts
function cypherStatementAt(text: string, pos: number): CypherStatement | null;
```

The statement containing (or just before) offset `pos`.

#### cypherWordBefore {#cypherWordBefore}

```ts
function cypherWordBefore(text: string, pos: number): {
    word: string;
    start: number;
    qualifier: string | null;
};
```

The word being typed at `pos`, and its qualifier: `':'` after a colon (a label or relationship type), the variable's
name after a dot (a property key), else null.

#### highlightCypher {#highlightCypher}

```ts
function highlightCypher(text: string): string;
```

HTML for the editor's highlight layer, ending with a newline: keywords, functions, labels and relationship types,
property keys, parameters, strings, numbers and comments.

#### splitCypher {#splitCypher}

```ts
function splitCypher(text: string): CypherStatement[];
```

The statements in the text, split at semicolons outside strings, names and comments.

#### tokenizeCypher {#tokenizeCypher}

```ts
function tokenizeCypher(text: string): CypherToken[];
```

The text's tokens, in order and covering it all. Unterminated strings and comments run to the end.

### Constants

#### CYPHER_FUNCTIONS {#CYPHER_FUNCTIONS}

```ts
const CYPHER_FUNCTIONS: readonly string[];
```

The functions smaltcy's library documents, as Cypher spells them.

#### CYPHER_KEYWORDS {#CYPHER_KEYWORDS}

```ts
const CYPHER_KEYWORDS: readonly string[];
```

The clause and expression keywords smaltcy's parser reads, upper-cased.

### Interfaces

#### CypherCompletion {#CypherCompletion}

```ts
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

```ts
interface CypherStatement {
    sql: string;
    start: number;
    end: number;
}
```

A statement and where it is in the text. (`sql` holds its text, as `Statement` does for SQL.)

#### CypherToken {#CypherToken}

```ts
interface CypherToken {
    type: CypherTokenType;
    text: string;
    start: number;
    end: number;
}
```

#### CypherVocabulary {#CypherVocabulary}

```ts
interface CypherVocabulary {
    labels: readonly string[];
    types: readonly string[];
    properties: readonly string[];
}
```

What completion knows about a graph: its labels, relationship types and property keys.

### Types

#### CypherTokenType {#CypherTokenType}

```ts
type CypherTokenType = 'ws' | 'comment' | 'string' | 'ident' | 'number' | 'param' | 'word' | 'punct';
```

<!-- api:end -->
