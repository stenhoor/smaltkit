# typeCheckWorker

<!-- api:start -->

```ts noplay
import { typeCheckWorker } from 'smaltkit/typecheck';
function typeCheckWorker(setup: TypeCheckSetup, options?: {
    workerUrl?: string | URL;
    warm?: boolean;
}): TypeCheckWorker;
```

A type checker for `setup` in a worker (`typecheck-worker.js`, beside this module, unless `workerUrl` names
another). Throws where workers can't start; an app then does without warnings. With `warm`, the worker gets ready
as soon as it starts (it reads the prepared libraries and checks nothing): start it while the page is idle, before
the first check is wanted.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `setup` | `TypeCheckSetup` | The libraries the code can use, their import names and the page's globals. |
| `options?` | `{ workerUrl?: string \| URL; warm?: boolean; }` | `workerUrl`: the worker script. `warm`: get ready at once. |

## Returns

`TypeCheckWorker`: The checker: `check(code)` and `close()`.

## Errors

- Error where workers can't start.

<!-- api:end -->

## Examples

Check on every edit, show only the latest result:

```ts
import { typeCheckWorker } from 'smaltkit/typecheck';
import type { Editor } from 'smaltkit/editor';

declare const editor: Editor;
const setup = {
  files: { '/df/index.d.ts': 'export declare class Frame { head(n?: number): Frame; }\nexport declare function table(name: string): Frame;' },
  packages: { '@smaltdb/df': '/df/index.d.ts' },
  globals: ['@smaltdb/df'],
};
const checker = typeCheckWorker(setup, { warm: true });
async function onEdit(code: string) {
  const warnings = await checker.check(code);
  if (warnings) editor.setWarnings(warnings);
}
```


## See also

- [`typeChecker`](../typechecker/typeChecker): the same checks, in the page's thread.
- [`stripTypes`](../typescript/stripTypes): run the code.
