# normalizeDataUrl

<!-- api:start -->

```ts noplay
import { normalizeDataUrl } from 'smaltkit/urls';
function normalizeDataUrl(input: string | null | undefined): NormalizedUrl;
```

Rewrite a pasted data URL to one the browser can fetch: GitHub and Hugging Face file pages become their raw files.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `input` | `string \| null \| undefined` | What was pasted. Text that isn't an http(s) URL comes back trimmed and unchanged. |

## Returns

`NormalizedUrl`: `url`, the URL to fetch; `changed`, whether it differs from the input; `note`, a sentence for people that explains a rewrite or why a URL can't work (a GitHub folder), or `''`.

<!-- api:end -->

## Examples

A GitHub file page becomes its raw file:

```ts
import { normalizeDataUrl } from 'smaltkit/urls';

const r = normalizeDataUrl('https://github.com/owner/repo/blob/main/data/sales.csv');
console.log(r.url);
console.log(r.changed);
```

```text
https://raw.githubusercontent.com/owner/repo/main/data/sales.csv
true
```

A URL that already works, and text that isn't a URL, come back as they are:

```ts
import { normalizeDataUrl } from 'smaltkit/urls';

console.log(normalizeDataUrl('https://example.com/sales.csv'));
console.log(normalizeDataUrl('  sales.csv '));
```

```text
{ url: 'https://example.com/sales.csv', changed: false, note: '' }
{ url: 'sales.csv', changed: false, note: '' }
```

A GitHub folder can't be read as a file; the note says what to do:

```ts
import { normalizeDataUrl } from 'smaltkit/urls';

console.log(normalizeDataUrl('https://github.com/owner/repo/tree/main/data').note);
```

```text
That is a GitHub folder, not a file: open the file on GitHub and copy its link (or its “Raw” link).
```

## Demo

What a page does with a URL a user pastes: fetch the rewritten one and show the note.

```ts
import { normalizeDataUrl } from 'smaltkit/urls';

for (const pasted of [
  'https://huggingface.co/datasets/owner/trips/blob/main/trips.parquet',
  'https://github.com/owner/repo/raw/main/sales.csv',
]) {
  const { url, note } = normalizeDataUrl(pasted);
  console.log(`fetch ${url}`);
  if (note) console.log(`  ${note.split(':')[0]}`);
}
```

```text
fetch https://huggingface.co/datasets/owner/trips/resolve/main/trips.parquet
  Hugging Face file pages can't be read by other sites, so the raw file is used instead
fetch https://raw.githubusercontent.com/owner/repo/main/sales.csv
  GitHub file pages can't be read by other sites, so the raw file is used instead
```

## See also

- [`corsHint`](./corsHint): help for the error when a fetch is blocked.
