# inflate

<!-- api:start -->

```ts
import { inflate } from 'smaltkit/git';
function inflate(data: Uint8Array): Promise<Uint8Array>;
```

zlib-inflates `data` (the whole stream, no trailing bytes), with the platform's DecompressionStream.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `data` | `Uint8Array` | zlib data, as git stores objects. |

## Returns

`Promise<Uint8Array>`: The inflated bytes.

<!-- api:end -->

## Examples

```ts
import { inflate } from 'smaltkit/git';

const deflated = await new Response(new Blob(['hello, git']).stream().pipeThrough(new CompressionStream('deflate'))).bytes();
console.log(new TextDecoder().decode(await inflate(deflated)));
```

```text
hello, git
```

## See also

- [`openRepository`](./openRepository): reads objects with it.
