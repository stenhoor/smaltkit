# localFiles

<!-- api:start -->

```ts
import { localFiles } from 'smaltkit/manifest';
function localFiles(steps: readonly ManifestStep[]): string[];
```

Names of the `local:` files the steps read (files kept in this browser).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `steps` | `readonly ManifestStep[]` | The manifest's data steps. |

## Returns

`string[]`: The names, without `local:`, once each.

<!-- api:end -->

## Examples

```ts
import { localFiles } from 'smaltkit/manifest';

console.log(localFiles([
  { import: 'local:budget.csv', table: 'budget' },
  { link: 'local:trips.parquet', table: 'trips' },
  { import: 'data/sales.csv', table: 'sales' },
]));
```

```text
[ 'budget.csv', 'trips.parquet' ]
```

## Demo

Which files a page must ask for again before the steps can run in this browser:

```ts
import { localFiles, type FileStore } from 'smaltkit/manifest';

declare const files: FileStore;
declare const steps: Parameters<typeof localFiles>[0];
const missing: string[] = [];
for (const name of localFiles(steps)) if (!(await files.get(name))) missing.push(name);
console.log(missing);
```


## See also

- [`referencedFiles`](./referencedFiles).
