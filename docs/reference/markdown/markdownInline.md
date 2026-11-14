# markdownInline

<!-- api:start -->

```ts
import { markdownInline } from 'smaltkit/markdown';
function markdownInline(src: string): string;
```

Inline markdown: code spans first (their text is literal), then bold, italic and links.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `src` | `string` | One line or run of text. |

## Returns

`string`: HTML with everything escaped. Links open in a new tab; a link that isn't http(s) stays as its text.

<!-- api:end -->

## Examples

```ts
import { markdownInline } from 'smaltkit/markdown';

console.log(markdownInline('**Revenue** by _region_, from `sales`'));
console.log(markdownInline('`**not bold**` in code'));
```

```text
<strong>Revenue</strong> by <em>region</em>, from <code>sales</code>
<code>**not bold**</code> in code
```

## Demo

A caption from a field's description:

```ts
import { markdownInline } from 'smaltkit/markdown';

const description = 'Net of returns. See [the policy](https://example.com/returns) & **Q4** notes.';
console.log(`<figcaption>${markdownInline(description)}</figcaption>`);
```

```text
<figcaption>Net of returns. See <a href="https://example.com/returns" target="_blank" rel="noopener">the policy</a> &amp; <strong>Q4</strong> notes.</figcaption>
```

## See also

- [`markdown`](./markdown): whole documents.
