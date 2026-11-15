# deleteOpfsDatabase

<!-- api:start -->

```ts noplay
import { deleteOpfsDatabase } from 'smaltkit/engine';
function deleteOpfsDatabase(name: string): Promise<void>;
```

Delete a database and its side files. It must not be open in any tab.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `name` | `string` | The database's name, as listOpfsDatabases gives it. |

## Returns

`Promise<void>`

## Errors

- The browser's error when a file is open elsewhere (the promise rejects).

<!-- api:end -->

## Examples

```ts
import { deleteOpfsDatabase, listOpfsDatabases } from 'smaltkit/engine';
import { toast } from 'smaltkit/dom';

try {
  await deleteOpfsDatabase('scratch');
} catch {
  toast('Close the database in other tabs first', 'error');
}
console.log((await listOpfsDatabases()).map((d) => d.name));
```


## See also

- [`listOpfsDatabases`](./listOpfsDatabases).
