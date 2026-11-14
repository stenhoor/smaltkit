# smaltkit/markdown

Markdown to HTML, small and safe: headings, paragraphs, bold, italic, code, links (http(s) only), lists, quotes, rules, fenced code and pipe tables.

Everything is escaped: raw HTML shows as text.

## Examples

```ts
import { markdown, markdownInline } from 'smaltkit/markdown';

console.log(markdown('## Sales\n\nUp **12%** on <b>last</b> year.'));
console.log(markdownInline('See [the docs](https://smaltworks.dev) or [this](javascript:alert(1))'));
```

```text
<h2>Sales</h2><p>Up <strong>12%</strong> on &lt;b&gt;last&lt;/b&gt; year.</p>
See <a href="https://smaltworks.dev" target="_blank" rel="noopener">the docs</a> or [this](javascript:alert(1))
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

#### markdown {#markdown}

```ts
function markdown(src: string, options?: MarkdownOptions): string;
```

Markdown to HTML.

#### markdownInline {#markdownInline}

```ts
function markdownInline(src: string): string;
```

Inline markdown: code spans first (their text is literal), then bold, italic and links.

### Interfaces

#### MarkdownOptions {#MarkdownOptions}

```ts
interface MarkdownOptions {
    headingOffset?: number;
}
```

| Member | |
| --- | --- |
| `headingOffset?` | Added to each heading's level: with 1, `#` is an `<h2>` (a text box under a page title). Default 0. |

<!-- api:end -->
