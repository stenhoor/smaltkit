# esc

<!-- api:start -->

```ts
import { esc } from 'smaltkit/svg';
function esc(s: unknown): string;
```

Text escaped for HTML and SVG, in text and in attributes.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `s` | `unknown` | Anything; null and undefined are `''`. |

## Returns

`string`: The text with `& < > " '` escaped.

<!-- api:end -->

## Examples

```ts
import { esc } from 'smaltkit/svg';

console.log(esc(`<b title="x">Tom & Jerry's</b>`), JSON.stringify(esc(null)));
```

```text
&lt;b title=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/b&gt; ""
```

## See also

- [`markdownInline`](../markdown/markdownInline): text with formatting, escaped.
