# tokenize

<!-- api:start -->

```ts
import { tokenize } from 'smaltkit/sql';
function tokenize(text: string): Token[];
```

The text's tokens, in order and covering it all: whitespace, comments, strings, quoted identifiers, words, numbers,
parameters, operators and punctuation. Unterminated strings and comments run to the end.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | SQL, whole or partial: tokenizing never fails. |

## Returns

`Token[]`: The tokens, each with its type, its text and its offsets in `text`.

<!-- api:end -->

## Examples

```ts
import { tokenize } from 'smaltkit/sql';

for (const t of tokenize("SELECT name FROM t WHERE id = ? -- one")) {
  if (t.type !== 'ws') console.log(t.type.padEnd(8), JSON.stringify(t.text));
}
```

```text
word     "SELECT"
word     "name"
word     "FROM"
word     "t"
word     "WHERE"
word     "id"
op       "="
param    "?"
comment  "-- one"
```

## Demo

Counting a script's string literals without being fooled by quotes in comments:

```ts
import { tokenize } from 'smaltkit/sql';

const script = "SELECT 'a;b' AS x; -- it's a comment\nSELECT 'c'";
console.log(tokenize(script).filter((t) => t.type === 'string').map((t) => t.text));
```

```text
[ "'a;b'", "'c'" ]
```

## See also

- [`highlight`](./highlight): the tokens as HTML.
- [`splitStatements`](./splitStatements): statements, by the tokens.
