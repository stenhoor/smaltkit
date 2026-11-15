# typeChecker

<!-- api:start -->

```ts noplay
import { typeChecker } from 'smaltkit/typechecker';
function typeChecker(setup: TypeCheckSetup): TypeChecker;
```

A checker for `setup`, in this thread: call it with the code, get its warnings. Prepared libraries are read in place
of their text, where this smaltty can read them; else `files` is read (`fallback` isn't fetched here).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `setup` | `TypeCheckSetup` | The libraries the code can use, their import names and the page's globals. |

## Returns

`TypeChecker`: The checker: call it with code for its warnings; `warm()` gets it ready.

<!-- api:end -->

## Examples

```ts
import { typeChecker } from 'smaltkit/typechecker';

const setup = {
  files: { '/df/index.d.ts': 'export declare class Frame { head(n?: number): Frame; }\nexport declare function table(name: string): Frame;' },
  packages: { '@smaltdb/df': '/df/index.d.ts' },
  globals: ['@smaltdb/df'],
};
const check = typeChecker(setup);
console.log(check("table('sales').head(5);"));
for (const w of check("table('sales').hed(5);\ntable(1);")) console.log(`${w.line}:${w.column} TS${w.code} ${w.message}`);
```

```text
[]
1:16 TS2551 Property 'hed' does not exist on type 'Frame'. Did you mean 'head'?
2:7 TS2345 Argument of type 'number' is not assignable to parameter of type 'string'.
```

## See also

- [`typeCheckWorker`](../typecheck/typeCheckWorker): in a worker.
- [`preparedReadable`](./preparedReadable).
