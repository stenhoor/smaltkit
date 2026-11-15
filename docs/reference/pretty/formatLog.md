# formatLog

<!-- api:start -->

```ts noplay
import { formatLog } from 'smaltkit/pretty';
function formatLog(values: readonly unknown[], options?: InspectOptions): string;
```

What `console.log(...values)` prints, the same in every runtime: strings as they are, everything else as inspect
shows it, joined by spaces.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `values` | `readonly unknown[]` | The values logged. |
| `options?` | `InspectOptions` | As for inspect. |

## Returns

`string`: The line (or lines, for a value laid out over several).

<!-- api:end -->

## Examples

```ts
import { formatLog } from 'smaltkit/pretty';

console.log(formatLog(['Revenue', 340, 'by', { region: 'South' }]));
```

```text
Revenue 340 by { region: 'South' }
```

## Demo

The docs' examples print through it, in Node and in a page's playground, so a result reads the same in both. A page can
do the same with its own console:

```ts
import { formatLog } from 'smaltkit/pretty';

const lines: string[] = [];
console.log = (...values: unknown[]) => lines.push(formatLog(values));
```

## See also

- [`inspect`](./inspect): one value.
