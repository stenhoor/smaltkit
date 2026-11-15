# markedHtml

<!-- api:start -->

```ts noplay
import { markedHtml } from 'smaltkit/editor';
function markedHtml(text: string, marks: readonly Mark[], hl: (s: string) => string): string;
```

The highlight layer's HTML for `text` with `marks` wrapped in `<mark>`s, each part highlighted by `hl` (which ends
its HTML with a newline, as the languages' do). Marks are taken in order; one that overlaps an earlier one is left out.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | The editor's text. |
| `marks` | `readonly Mark[]` | Ranges to wrap, each with its class and an optional title. |
| `hl` | `(s: string) => string` | The language's highlighter. |

## Returns

`string`: The HTML, ending with a newline.

<!-- api:end -->

## Examples

```ts
import { markedHtml } from 'smaltkit/editor';
import { highlight } from 'smaltkit/sql';

const text = 'SELEC 1';
console.log(markedHtml(text, [{ start: 0, end: 5, cls: 'sk-warn', title: 'Unknown keyword' }], (s) => highlight(s)));
```

```text
<mark class="sk-warn" title="Unknown keyword">SELEC</mark> <span class="sk-tk-n">1</span>

```

## See also

- [`gutterHtml`](./gutterHtml).
- [`highlight`](../sql/highlight).
