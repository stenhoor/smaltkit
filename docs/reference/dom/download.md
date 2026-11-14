# download

<!-- api:start -->

```ts
import { download } from 'smaltkit/dom';
function download(name: string, data: BlobPart, type?: string): void;
```

Saves data as a file, through a temporary link.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `name` | `string` | The file's name. |
| `data` | `BlobPart` | Its contents: text, bytes or a Blob. |
| `type?` | `string` | Its media type. Default `application/octet-stream`. |

## Returns

`void`

<!-- api:end -->

## Examples

```ts
import { download } from 'smaltkit/dom';

download('notes.txt', 'Revenue is up.', 'text/plain');
download('rows.json', JSON.stringify([{ id: 1 }]), 'application/json');
```


## See also

- [`fileName`](./fileName): a safe name.
- [`exportRows`](../grid/exportRows): a result as CSV, JSON or SQL.
- [`pickFile`](./pickFile): the other way.
