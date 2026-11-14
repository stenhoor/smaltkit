# sha1

<!-- api:start -->

```ts
import { sha1 } from 'smaltkit/git';
function sha1(data: Uint8Array): Promise<string>;
```

SHA-1, as hex, with the platform's Web Crypto.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `data` | `Uint8Array` | The bytes. |

## Returns

`Promise<string>`: The hash, 40 hex digits.

<!-- api:end -->

## Examples

```ts
import { sha1 } from 'smaltkit/git';

console.log(await sha1(new TextEncoder().encode('abc')));
```

```text
a9993e364706816aba3e25717850c26c9cd0d89d
```

## See also

- [`blobId`](./blobId): git's id for a file, a SHA-1 over a header and the bytes.
