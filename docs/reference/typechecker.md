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

Each has a page of its own.

| Function | |
| --- | --- |
| [`preparedReadable`](./typechecker/preparedReadable) | Whether `setup`'s prepared libraries are ones this smaltty reads (true when it has none): where they aren't, a worker fetches the setup's `fallback`. |
| [`typeChecker`](./typechecker/typeChecker) | A checker for `setup`, in this thread: call it with the code, get its warnings. |
| [`typeCheckHandler`](./typechecker/typeCheckHandler) | The worker's side: answers requests in order. |

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
