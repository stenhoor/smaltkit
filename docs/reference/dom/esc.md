# esc

<!-- api:start -->

```ts
import { esc } from 'smaltkit/dom';
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

`smaltkit/dom` exports the same `esc` as [`smaltkit/svg`](../svg/esc):

```ts
import { esc } from 'smaltkit/dom';

console.log(`<td title="${esc('5" floppy')}">${esc('<none>')}</td>`);
```

```text
<td title="5&quot; floppy">&lt;none&gt;</td>
```

## See also

- [`esc`](../svg/esc) in `smaltkit/svg`.
- [`h`](./h): builds elements without escaping by hand.
