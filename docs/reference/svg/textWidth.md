# textWidth

<!-- api:start -->

```ts noplay
import { textWidth } from 'smaltkit/svg';
function textWidth(s: string, fontPx: number): number;
```

Rough text width for layout (avoids measuring the DOM on every render), from per-character widths of a sans serif.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `s` | `string` | The text. |
| `fontPx` | `number` | The font size in pixels. |

## Returns

`number`: The width in pixels, roughly.

<!-- api:end -->

## Examples

```ts
import { textWidth } from 'smaltkit/svg';

console.log(['Revenue', 'mmm', 'iii'].map((s) => textWidth(s, 12).toFixed(1)));
```

```text
[ '45.6', '30.6', '10.8' ]
```

## See also

- [`truncate`](./truncate).
- [`rescale`](./rescale): fit a scale beside labels.
