# smaltkit/urls

Rewrites pasted data URLs (GitHub and Hugging Face file pages) to raw-file URLs a page can fetch, and explains CORS errors.

A page can read a file from another site only if that server sends CORS headers. Links copied from GitHub (`…/blob/…`
pages and `…/raw/…` redirects) or Hugging Face (`…/blob/…` pages) don't, but the same files at the hosts' raw-file
addresses do.

## Examples

```ts
import { normalizeDataUrl } from 'smaltkit/urls';

const { url, changed } = normalizeDataUrl('https://github.com/stenhoor/smaltdb/blob/main/data/sales.csv');
console.log(changed, url);
```

```text
true https://raw.githubusercontent.com/stenhoor/smaltdb/main/data/sales.csv
```

`corsHint` adds an explanation to an error message that is about CORS, and nothing to one that isn't:

```ts
import { corsHint } from 'smaltkit/urls';

console.log(corsHint('Failed to fetch').length > 0);
console.log(JSON.stringify(corsHint('Table not found')));
```

```text
true
""
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

Each has a page of its own.

| Function | |
| --- | --- |
| [`corsHint`](./urls/corsHint) | Extra help for a CORS / network error message: why it happens and, for GitHub-style links, the URL that works. |
| [`normalizeDataUrl`](./urls/normalizeDataUrl) | Rewrite a pasted data URL to one the browser can fetch: GitHub and Hugging Face file pages become their raw files. |

### Interfaces

#### NormalizedUrl {#NormalizedUrl}

```ts noplay
interface NormalizedUrl {
    url: string;
    changed: boolean;
    note: string;
}
```

<!-- api:end -->
