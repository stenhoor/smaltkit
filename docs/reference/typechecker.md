# smaltkit/typechecker

The checks of [`smaltkit/typecheck`](./typecheck) in the page's thread, loading the checker there: `typeChecker(setup)`, `typeCheckHandler()` (the worker's side of `typeCheckWorker`) and `preparedReadable(setup)`.

## Examples

Call the checker with the code and get its warnings:

```ts
import { typeChecker } from 'smaltkit/typechecker';

const check = typeChecker({
  files: {
    '/df/index.d.ts': 'export declare class Frame { head(n?: number): Frame; }\nexport declare function table(name: string): Frame;',
  },
  packages: { '@smaltdb/df': '/df/index.d.ts' },
  globals: ['@smaltdb/df'],
});
for (const w of check("table('sales').hed(5);")) console.log(w.line, w.column, w.code, w.message);
```

```text
1 16 2551 Property 'hed' does not exist on type 'Frame'. Did you mean 'head'?
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

#### preparedReadable {#preparedReadable}

```ts
function preparedReadable(setup: TypeCheckSetup): boolean;
```

Whether `setup`'s prepared libraries are ones this smaltty reads (true when it has none): where they aren't, a
worker fetches the setup's `fallback`.

#### typeChecker {#typeChecker}

```ts
function typeChecker(setup: TypeCheckSetup): TypeChecker;
```

A checker for `setup`, in this thread: call it with the code, get its warnings. Prepared libraries are read in place
of their text, where this smaltty can read them; else `files` is read (`fallback` isn't fetched here).

#### typeCheckHandler {#typeCheckHandler}

```ts
function typeCheckHandler(): (request: TypeCheckRequest) => TypeCheckReply | undefined;
```

The worker's side: answers requests in order. Exported for typecheck-worker.ts and for tests.

### Interfaces

#### TypeChecker {#TypeChecker}

```ts
interface TypeChecker {
    (code: string): TypeWarning[];
    warm(): void;
}
```

A checker in this thread: call it with the code, get its warnings.

| Member | |
| --- | --- |
| `warm` | Gets ready for the first check: the prepared libraries read, and a check of nothing. |

<!-- api:end -->
