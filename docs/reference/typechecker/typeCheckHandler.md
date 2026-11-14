# typeCheckHandler

<!-- api:start -->

```ts
import { typeCheckHandler } from 'smaltkit/typechecker';
function typeCheckHandler(): (request: TypeCheckRequest) => TypeCheckReply | undefined;
```

The worker's side: answers requests in order. Exported for typecheck-worker.ts and for tests.

## Returns

`(request: TypeCheckRequest) => TypeCheckReply | undefined`: A handler: a `setup` request sets up the checker, `warm` gets it ready, and `check` returns the code's warnings (or why it couldn't check); setup and warm return nothing.

<!-- api:end -->

## Examples

The worker's whole script:

```ts
import { typeCheckHandler } from 'smaltkit/typechecker';

const handle = typeCheckHandler();
self.onmessage = (e: MessageEvent) => {
  const reply = handle(e.data);
  if (reply) self.postMessage(reply);
};
```


Driven by hand, as the tests do:

```ts
import { typeCheckHandler } from 'smaltkit/typechecker';

const setup = {
  files: { '/df/index.d.ts': 'export declare class Frame { head(n?: number): Frame; }\nexport declare function table(name: string): Frame;' },
  packages: { '@smaltdb/df': '/df/index.d.ts' },
  globals: ['@smaltdb/df'],
};
const handle = typeCheckHandler();
handle({ kind: 'setup', setup });
console.log(handle({ kind: 'check', id: 1, code: "table('t').hed();" }));
```

```text
{
  id: 1,
  warnings: [
    {
      start: 11,
      end: 14,
      line: 1,
      column: 12,
      code: 2551,
      message: "Property 'hed' does not exist on type 'Frame'. Did you mean 'head'?"
    }
  ]
}
```

## See also

- [`typeCheckWorker`](../typecheck/typeCheckWorker): the page's side.
