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

#### aliasesIn {#aliasesIn}

```ts
function aliasesIn(sql: string, tableNames: Set<string>): Map<string, string>;
```

Table aliases in a statement: Map alias(lower) → table name.

#### changesSchema {#changesSchema}

```ts
function changesSchema(sql: string): boolean;
```

Whether a statement changes the schema (the object explorer should refresh).

#### formatSql {#formatSql}

```ts
function formatSql(sql: string): string;
```

A light SQL formatter: one clause per line, upper-case keywords. Comments and literals are kept as written.

#### highlight {#highlight}

```ts
function highlight(text: string, names?: Set<string>): string;
```

HTML for the editor's highlight layer. `names` is an optional Set of lower-cased object names.

#### leadingKeyword {#leadingKeyword}

```ts
function leadingKeyword(sql: string): string;
```

First significant keyword of a statement, upper-cased.

#### quoteIdent {#quoteIdent}

```ts
function quoteIdent(name: string): string;
```

Quote an identifier when needed.

#### quoteLiteral {#quoteLiteral}

```ts
function quoteLiteral(v: SqlValue | boolean | undefined): string;
```

#### returnsRows {#returnsRows}

```ts
function returnsRows(sql: string): boolean;
```

Whether a statement produces rows (and should be streamed into a grid rather than run with exec).

#### scanParams {#scanParams}

```ts
function scanParams(sql: string): ParamSlot[];
```

Parameter slots in the order the engine numbers them: `?` takes the next number, `?N` is explicit,
and a name (`:a`, `@a`, `$a`) takes the next number on first use.

#### splitStatements {#splitStatements}

```ts
function splitStatements(text: string): Statement[];
```

Split a script into statements: [{ sql, start, end }] (offsets into `text`, trimmed of whitespace/semicolon).

#### statementAt {#statementAt}

```ts
function statementAt(text: string, pos: number): Statement | null;
```

The statement containing (or just before) offset `pos`.

#### tableNameFrom {#tableNameFrom}

```ts
function tableNameFrom(source: string): string;
```

A safe table name derived from a file name or URL.

#### tokenize {#tokenize}

```ts
function tokenize(text: string): Token[];
```

#### unquote {#unquote}

```ts
function unquote(s: string): string;
```

#### wordBefore {#wordBefore}

```ts
function wordBefore(text: string, pos: number): {
    word: string;
    start: number;
    qualifier: string | null;
};
```

Identifier-ish word immediately before offset `pos` (for completion).

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
