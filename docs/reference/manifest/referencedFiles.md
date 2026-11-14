# referencedFiles

<!-- api:start -->

```ts
import { referencedFiles } from 'smaltkit/manifest';
function referencedFiles(steps: readonly ManifestStep[]): string[];
```

Relative paths of the files the steps read (to copy them when publishing a static site).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `steps` | `readonly ManifestStep[]` | The manifest's data steps. |

## Returns

`string[]`: The paths of SQL files, imports and linked files, once each; anything with a scheme (a URL, `local:`) is left out.

<!-- api:end -->

## Examples

```ts
import { referencedFiles } from 'smaltkit/manifest';

console.log(referencedFiles([
  { sqlFile: 'setup.sql' },
  { import: 'data/sales.csv', table: 'sales' },
  { link: 'https://example.com/trips.parquet', table: 'trips' },
  { link: 'local:mine.csv', table: 'mine' },
  { import: 'data/sales.csv', table: 'sales_again' },
]));
```

```text
[ 'setup.sql', 'data/sales.csv' ]
```

## See also

- [`localFiles`](./localFiles).
