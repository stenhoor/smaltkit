# listOpfsDatabases

<!-- api:start -->

```ts
import { listOpfsDatabases } from 'smaltkit/engine';
function listOpfsDatabases(): Promise<OpfsDatabase[]>;
```

The databases smaltdb has stored in this origin's OPFS, sorted by name.

## Returns

`Promise<OpfsDatabase[]>`: Each database's name, its size (with its write-ahead log) and when it last changed; size and time are null while another tab holds the file open. Empty where OPFS isn't available.

<!-- api:end -->

## Examples

A list of stored databases, with their sizes:

```ts
import { listOpfsDatabases } from 'smaltkit/engine';
import { formatter } from 'smaltkit/format';

const size = formatter({ compact: true, suffix: 'B' });
for (const d of await listOpfsDatabases()) {
  console.log(d.name, d.size === null ? 'open in another tab' : size(d.size));
}
```


## See also

- [`deleteOpfsDatabase`](./deleteOpfsDatabase).
- [`opfsAvailable`](./opfsAvailable).
