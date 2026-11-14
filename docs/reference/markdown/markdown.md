# markdown

<!-- api:start -->

```ts
import { markdown } from 'smaltkit/markdown';
function markdown(src: string, options?: MarkdownOptions): string;
```

Markdown to HTML: headings, paragraphs, bold, italic, code, links, lists, quotes, rules, fenced code and pipe tables.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `src` | `string` | The markdown. |
| `options?` | `MarkdownOptions` | `headingOffset`: added to each heading's level. |

## Returns

`string`: HTML with everything escaped, so raw HTML in `src` shows as text. Style it with ui.css's `.sk-md`.

<!-- api:end -->

## Examples

```ts
import { markdown } from 'smaltkit/markdown';

console.log(markdown('# Sales\n\n- North: **up**\n- South: _flat_'));
```

```text
<h1>Sales</h1><ul><li>North: <strong>up</strong></li><li>South: <em>flat</em></li></ul>
```

Raw HTML is text, and links must be http(s):

```ts
import { markdown } from 'smaltkit/markdown';

console.log(markdown('<script>alert(1)</script> [ok](https://example.com) [no](javascript:alert(1))'));
```

```text
<p>&lt;script&gt;alert(1)&lt;/script&gt; <a href="https://example.com" target="_blank" rel="noopener">ok</a> [no](javascript:alert(1))</p>
```

Headings one level down, for text under a page's own title:

```ts
import { markdown } from 'smaltkit/markdown';

console.log(markdown('# Notes', { headingOffset: 1 }));
```

```text
<h2>Notes</h2>
```

## Demo

A table:

```ts
import { markdown } from 'smaltkit/markdown';

console.log(markdown('| Region | Revenue |\n| --- | ---: |\n| North | 120 |\n| South | 340 |'));
```

```text
<table><thead><tr><th>Region</th><th style="text-align:right">Revenue</th></tr></thead><tbody><tr><td>North</td><td style="text-align:right">120</td></tr><tr><td>South</td><td style="text-align:right">340</td></tr></tbody></table>
```

## See also

- [`markdownInline`](./markdownInline): one line, without blocks.
- [`smaltkit/ui.css`](../styles): `.sk-md` styles the output.
