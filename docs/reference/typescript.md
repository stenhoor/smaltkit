# smaltkit/typescript

TypeScript for TypeScript tabs and cells, with [smaltty](https://stenhoor.github.io/smaltty/): `stripTypes` replaces the types with spaces, so every line and column of the JavaScript is the one the user wrote.

Code that would make code of its own (enums, namespaces with values, parameter properties, `<T>x`) is refused with a
`TypeScriptSyntaxError` that gives the line, the column and what to write instead. TypeScript's rules apply: an import
of something that is only a type says `type`.

smaltty is there too, as the namespace `smaltty` (its parser, its binder, its node kinds: all of it but the checker),
for code that works on TypeScript's structure. This module loads smaltty's stripping path and binder, never the
checker. smaltty is copied into `dist/smaltty/`, so it loads without a bundler.

## Examples

Types become spaces, so positions stay where they were written:

```ts
import { stripTypes } from 'smaltkit/typescript';

console.log(stripTypes('const total: number = add(1, 2) as number;'));
```

```text
const total         = add(1, 2)          ;
```

What can't be stripped is refused, with where and what to write instead:

```ts
import { stripTypes, TypeScriptSyntaxError } from 'smaltkit/typescript';

try {
  stripTypes('enum Color { Red }');
} catch (e) {
  if (e instanceof TypeScriptSyntaxError) console.log(e.line, e.column, e.message);
}
```

```text
1 1 line 1, column 1: An enum makes code, so it can't be stripped: use an object instead (const Color = { Red: 'red' } as const).
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

Each has a page of its own.

| Function | |
| --- | --- |
| [`stripTypes`](./typescript/stripTypes) | JavaScript for TypeScript `code`: its types replaced by spaces, so every line and column is the one written. |

### Constants

#### TypeScriptSyntaxError {#TypeScriptSyntaxError}

```ts noplay
const TypeScriptSyntaxError: typeof ParseError;
```

A SyntaxError in TypeScript, or code that can't be stripped: `line` and `column` (1-based) say where.

#### typescriptTranspiler {#typescriptTranspiler}

```ts noplay
const typescriptTranspiler: Transpiler;
```

The same, as a Transpiler (`{ name, version, transpile }`), the shape an app takes when it offers more than one.

### Namespaces

#### smaltty {#smaltty}

`smaltkit/typescript` exports `smaltty` as a namespace.

smaltty, for code that works on TypeScript's structure: `smaltty.parse` (TypeScript's syntax tree, stored flat),
`smaltty.bind` (which declaration each name means), `smaltty.strip`, and the node kinds and flags (`K`, `F`): all of
smaltty but its checker, which is smaltkit/typecheck's. A namespace, so its names don't meet smaltkit's own.

### Interfaces

#### TranspileOptions {#TranspileOptions}

```ts noplay
interface TranspileOptions {
    filename?: string;
    jsx?: boolean;
}
```

| Member | |
| --- | --- |
| `filename?` | The file name, used in error messages. |
| `jsx?` | JSX isn't supported: true throws. |

#### Transpiler {#Transpiler}

```ts noplay
interface Transpiler {
    name: string;
    version: string;
    transpile(code: string, options?: TranspileOptions): string;
}
```

Something that turns TypeScript into JavaScript an app can run: the shape apps take for a TypeScript tab.

| Member | |
| --- | --- |
| `transpile` | JavaScript for `code`. Throws a SyntaxError, with the line and column, for code that can't be stripped. |

<!-- api:end -->
