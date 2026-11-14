# smaltkit/sql

SQL text utilities: a tokenizer and highlighter, statement splitting, parameter scanning, identifier and literal quoting, completion helpers and a light formatter. Text only: nothing here runs SQL.

## Examples

Split a script into statements, with where each one is:

```ts
import { splitStatements, returnsRows } from 'smaltkit/sql';

for (const s of splitStatements('CREATE TABLE t (a INT); SELECT * FROM t;')) {
  console.log(s.start, s.end, returnsRows(s.sql), s.sql);
}
```

```text
0 22 false CREATE TABLE t (a INT)
24 39 true SELECT * FROM t
```

Quote names and values, and find a statement's parameters:

```ts
import { quoteIdent, quoteLiteral, scanParams } from 'smaltkit/sql';

console.log(quoteIdent('order date'), quoteLiteral("it's"), quoteLiteral(null));
console.log(scanParams('SELECT * FROM t WHERE id = $id AND x > ?'));
```

```text
"order date" 'it''s' NULL
[ { label: '$id', index: 1 }, { label: '?2', index: 2 } ]
```

Lay a statement out on lines:

```ts
import { formatSql } from 'smaltkit/sql';

console.log(formatSql('select a, count(*) from t where a > 1 group by a order by 2 desc'));
```

```text
SELECT a,
  count(*)
FROM t
WHERE a > 1
GROUP BY a
ORDER BY 2 DESC

```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

Each has a page of its own.

| Function | |
| --- | --- |
| [`aliasesIn`](./sql/aliasesIn) | Table aliases in a statement, for completing `alias.` with the table's columns. |
| [`changesSchema`](./sql/changesSchema) | Whether a statement changes the schema (the object explorer should refresh): `CREATE`, `DROP`, `ALTER` or `REFRESH`. |
| [`formatSql`](./sql/formatSql) | A light SQL formatter: one clause per line, upper-case keywords. |
| [`highlight`](./sql/highlight) | HTML for the editor's highlight layer: each token in a span classed by its kind (`sk-tk-k` for keywords, `sk-tk-f` functions, `sk-tk-obj` the database's objects, …). |
| [`leadingKeyword`](./sql/leadingKeyword) | First significant keyword of a statement, upper-cased: comments and opening brackets are skipped. |
| [`quoteIdent`](./sql/quoteIdent) | Quote an identifier when needed: a name that isn't a plain word, or that is a keyword, goes in double quotes. |
| [`quoteLiteral`](./sql/quoteLiteral) | A value as a SQL literal. |
| [`returnsRows`](./sql/returnsRows) | Whether a statement produces rows (and should be streamed into a grid rather than run with exec): `SELECT`, `VALUES`, `TABLE`, `EXPLAIN`, `PRAGMA` without `=`, `WITH` unless it writes without `RETURNING`, and any statement with `RETURNING`. |
| [`scanParams`](./sql/scanParams) | Parameter slots in the order the engine numbers them: `?` takes the next number, `?N` is explicit, and a name (`:a`, `@a`, `$a`) takes the next number on first use. |
| [`splitStatements`](./sql/splitStatements) | Split a script into statements, at semicolons outside strings, identifiers and comments. |
| [`statementAt`](./sql/statementAt) | The statement containing (or just before) offset `pos`: the one to run when the cursor is there. |
| [`tableNameFrom`](./sql/tableNameFrom) | A safe table name derived from a file name or URL. |
| [`tokenize`](./sql/tokenize) | The text's tokens, in order and covering it all: whitespace, comments, strings, quoted identifiers, words, numbers, parameters, operators and punctuation. |
| [`unquote`](./sql/unquote) | An identifier without its quotes: `"a""b"`, `` `a` `` and `[a]` styles. |
| [`wordBefore`](./sql/wordBefore) | Identifier-ish word immediately before offset `pos` (for completion). |

### Constants

#### FUNCTIONS {#FUNCTIONS}

```ts
const FUNCTIONS: Set<string>;
```

#### KEYWORDS {#KEYWORDS}

```ts
const KEYWORDS: Set<string>;
```

#### TYPES {#TYPES}

```ts
const TYPES: Set<string>;
```

### Interfaces

#### ParamSlot {#ParamSlot}

```ts
interface ParamSlot {
    label: string;
    index: number;
}
```

A bind parameter slot, numbered as the engine numbers them.

#### Statement {#Statement}

```ts
interface Statement {
    sql: string;
    start: number;
    end: number;
}
```

A statement in a script: its text and its offsets in the script.

#### Token {#Token}

```ts
interface Token {
    type: TokenType;
    start: number;
    end: number;
    text: string;
}
```

### Types

#### SqlValue {#SqlValue}

```ts
type SqlValue = string | number | bigint | Uint8Array | null;
```

A SQL value as smaltdb returns or accepts it.

#### TokenType {#TokenType}

```ts
type TokenType = 'ws' | 'comment' | 'string' | 'ident' | 'word' | 'number' | 'param' | 'op' | 'punct';
```

Tokenize SQL. Every character belongs to exactly one token, so tokens concatenate back to the input.
Types: ws, comment, string, ident (quoted identifier), word, number, param, op, punct.

<!-- api:end -->
