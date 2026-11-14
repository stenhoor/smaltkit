# opfsAvailable

<!-- api:start -->

```ts
import { opfsAvailable } from 'smaltkit/engine';
function opfsAvailable(): boolean;
```

Whether this page can use OPFS (it needs a secure context).

## Returns

`boolean`: True where databases can be stored in OPFS.

<!-- api:end -->

## Examples

```ts
import { opfsAvailable } from 'smaltkit/engine';

const storage = opfsAvailable() ? 'opfs' : 'memory';
```


## See also

- [`listOpfsDatabases`](./listOpfsDatabases).
