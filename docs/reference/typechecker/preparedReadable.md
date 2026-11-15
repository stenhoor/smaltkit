# preparedReadable

<!-- api:start -->

```ts noplay
import { preparedReadable } from 'smaltkit/typechecker';
function preparedReadable(setup: TypeCheckSetup): boolean;
```

Whether `setup`'s prepared libraries are ones this smaltty reads (true when it has none): where they aren't, a
worker fetches the setup's `fallback`.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `setup` | `TypeCheckSetup` | A setup with or without `prepared`. |

## Returns

`boolean`: True when there is nothing to fetch.

<!-- api:end -->

## Examples

```ts
import { preparedReadable } from 'smaltkit/typechecker';

console.log(preparedReadable({ files: {} }));
console.log(preparedReadable({ files: {}, prepared: new Uint8Array([1, 2, 3]) }));
```

```text
true
false
```

## See also

- [`typeCheckWorker`](../typecheck/typeCheckWorker): fetches `fallback` when this is false.
