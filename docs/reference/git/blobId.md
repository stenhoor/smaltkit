# blobId

<!-- api:start -->

```ts
import { blobId } from 'smaltkit/git';
function blobId(data: Uint8Array): Promise<string>;
```

The id git gives a file's contents (`git hash-object`): how a working file is compared with a commit's.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `data` | `Uint8Array` | The file's bytes. |

## Returns

`Promise<string>`: The blob id, 40 hex digits.

<!-- api:end -->

## Examples

```ts
import { blobId } from 'smaltkit/git';

console.log(await blobId(new TextEncoder().encode('hello\n')));
console.log(await blobId(new Uint8Array()));
```

```text
ce013625030ba8dba906f756967f9e9ca394464a
e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
```

## Demo

Whether a working file differs from the commit's:

```ts
import { blobId } from 'smaltkit/git';

declare const working: Uint8Array;
declare const committedId: string;
console.log((await blobId(working)) === committedId ? 'unchanged' : 'changed');
```


## See also

- [`sha1`](./sha1).
