# applyDelta

<!-- api:start -->

```ts
import { applyDelta } from 'smaltkit/git';
function applyDelta(base: Uint8Array, delta: Uint8Array): Uint8Array;
```

Applies a git delta to its base, as packs store most objects.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `base` | `Uint8Array` | The base object's bytes. |
| `delta` | `Uint8Array` | The delta. |

## Returns

`Uint8Array`: The object the delta describes.

## Errors

- GitError for a delta that doesn't fit the base or is malformed.

<!-- api:end -->

## Examples

A delta that copies the base's first 5 bytes and inserts 3:

```ts
import { applyDelta } from 'smaltkit/git';

const base = new TextEncoder().encode('hello world');
// base size 11, result size 8; copy offset 0 size 5 (0x90 0x05); insert 3 bytes
const delta = new Uint8Array([11, 8, 0x90, 5, 3, ...new TextEncoder().encode(', g')]);
console.log(new TextDecoder().decode(applyDelta(base, delta)));
```

```text
hello, g
```

## Demo

A delta for another base is refused:

```ts
import { applyDelta, GitError } from 'smaltkit/git';

try {
  applyDelta(new Uint8Array(4), new Uint8Array([11, 1, 1, 0x21]));
} catch (e) {
  if (e instanceof GitError) console.log(e.message);
}
```

```text
a delta expects a base of 11 bytes, not 4
```

## See also

- [`inflate`](./inflate).
