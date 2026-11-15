# corsHint

<!-- api:start -->

```ts noplay
import { corsHint } from 'smaltkit/urls';
function corsHint(message: unknown): string;
```

Extra help for a CORS / network error message: why it happens and, for GitHub-style links, the
URL that works.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `message` | `unknown` | An error or its message, such as a failed fetch's. |

## Returns

`string`: A sentence to show under the error: the raw file's URL when the message names a link that has one, else why the browser blocks the read and what to do. `''` when the message is not about CORS or the network.

<!-- api:end -->

## Examples

A message about CORS that names a GitHub file page gets the URL that works:

```ts
import { corsHint } from 'smaltkit/urls';

console.log(corsHint('Failed to fetch https://github.com/owner/repo/blob/main/sales.csv'));
```

```text
Use the raw file instead: https://raw.githubusercontent.com/owner/repo/main/sales.csv
```

Any other error gets nothing, so the hint can be added without checking first:

```ts
import { corsHint } from 'smaltkit/urls';

console.log(JSON.stringify(corsHint(new Error('Table sales not found'))));
```

```text
""
```

## Demo

An error message with its hint under it:

```ts
import { corsHint } from 'smaltkit/urls';

function explain(error: unknown): string {
  const hint = corsHint(error);
  return hint ? `${String(error)}\n${hint}` : String(error);
}
console.log(explain(new TypeError('NetworkError when attempting to fetch resource.')));
```

```text
TypeError: NetworkError when attempting to fetch resource.
The browser blocks reading files from servers that do not send CORS headers (Access-Control-Allow-Origin). Use a host that does, such as raw.githubusercontent.com, a CORS-enabled bucket or a CDN, or download the file and import it from your computer.
```

## See also

- [`normalizeDataUrl`](./normalizeDataUrl): rewrite the URL before fetching it.
