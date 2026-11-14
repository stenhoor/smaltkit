# stripTypes

<!-- api:start -->

```ts
import { stripTypes } from 'smaltkit/typescript';
function stripTypes(code: string, options?: {
    filename?: string;
}): string;
```

JavaScript for TypeScript `code`: its types replaced by spaces, so every line and column is the one written.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `code` | `string` | TypeScript, as a module. |
| `options?` | `{ filename?: string; }` | `filename`: named in error messages. |

## Returns

`string`: The JavaScript, as long as the code.

## Errors

- TypeScriptSyntaxError for a syntax error, or for code that would make code of its own (an enum, a namespace with values, a parameter property, `<T>x`), with the line, the column and what to write instead.

<!-- api:end -->

## Examples

Types become spaces, so the JavaScript has the same lines and columns:

```ts
import { stripTypes } from 'smaltkit/typescript';

const ts = 'function area(r: number): number {\n  return Math.PI * r ** 2;\n}';
const js = stripTypes(ts);
console.log(js);
console.log(js.length === ts.length);
```

```text
function area(r        )         {
  return Math.PI * r ** 2;
}
true
```

Type-only imports and declarations go too, leaving spaces and the `;` that ends each one:

```ts
import { stripTypes } from 'smaltkit/typescript';

console.log(JSON.stringify(stripTypes("import type { Frame } from 'df';\ninterface Row { id: number }\nconst n = 1 as const;")));
```

```text
";                               \n;                           \nconst n = 1         ;"
```

## Errors

Code that would make code of its own is refused, with what to write instead:

```ts
import { stripTypes, TypeScriptSyntaxError } from 'smaltkit/typescript';

for (const code of ['enum E { A }', 'class P { constructor(private x: number) {} }', 'const n = <number>x;']) {
  try {
    stripTypes(code, { filename: 'tab.ts' });
  } catch (e) {
    if (e instanceof TypeScriptSyntaxError) console.log(e.message);
  }
}
```

```text
tab.ts, line 1, column 1: An enum makes code, so it can't be stripped: use an object instead (const Color = { Red: 'red' } as const).
tab.ts, line 1, column 23: A parameter property makes code, so it can't be stripped: declare the field, and assign it in the constructor.
tab.ts, line 1, column 11: A <T>x type assertion can't be stripped: write x as T.
```

## Demo

Running a TypeScript snippet in a page: strip it, then import it as a module.

```ts
import { stripTypes } from 'smaltkit/typescript';

const js = stripTypes(code, { filename: 'tab.ts' });
const url = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }));
await import(url);
URL.revokeObjectURL(url);
```

## See also

- [`smaltkit/typecheck`](../typecheck): check the code's types too.
- [smaltty's guide to stripping](https://stenhoor.github.io/smaltty/guide/stripping).
