# pickFile

<!-- api:start -->

```ts
import { pickFile } from 'smaltkit/dom';
function pickFile(accept: string): Promise<File | null>;
```

Asks the user for a file.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `accept` | `string` | The file types to offer, as an input's `accept` (`.csv,.parquet`). |

## Returns

`Promise<File | null>`: The file, or null when none was picked.

<!-- api:end -->

## Examples

```ts
import { pickFile } from 'smaltkit/dom';

const file = await pickFile('.csv,.tsv,.parquet');
if (file) console.log(file.name, file.size);
```


## See also

- [`download`](./download).
- [`tableNameFrom`](../sql/tableNameFrom): a table name for the file.
