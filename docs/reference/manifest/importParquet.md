# importParquet

<!-- api:start -->

```ts
import { importParquet } from 'smaltkit/manifest';
function importParquet<D extends StepDatabase>(db: D, io: Pick<StepIO<D>, 'registerFile'>, table: string, blob: Blob): Promise<{
    rows: number;
}>;
```

Copy a Parquet file into a table, through a temporary external table (columns and types come from the file's
footer) and INSERT … SELECT. A missing table is created with the file's column types.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `db` | `D` | An open database. |
| `io` | `Pick&lt;StepIO&lt;D>, 'registerFile'>` | The external-tables plugin's `registerFile`. |
| `table` | `string` | The table to copy into. |
| `blob` | `Blob` | The Parquet file. |

## Returns

`Promise<{ rows: number; }>`: How many rows were copied.

<!-- api:end -->

## Examples

```ts
import { importParquet, type StepDatabase, type StepIO } from 'smaltkit/manifest';
import { pickFile } from 'smaltkit/dom';

declare const db: StepDatabase;
// The external-tables plugin's helpers, as the app loaded them (`@smaltdb/external/client`).
declare const io: Pick<StepIO, 'registerFile'>;
const file = await pickFile('.parquet');
if (file) console.log(await importParquet(db, io, 'trips', file)); // { rows: … }
```


## See also

- [`applySteps`](./applySteps): imports by step.
