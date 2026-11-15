# gutterHtml

<!-- api:start -->

```ts noplay
import { gutterHtml } from 'smaltkit/editor';
function gutterHtml(text: string, lines: number, warnings: readonly EditorWarning[]): string;
```

The gutter's HTML for `lines` lines, the lines with warnings marked and titled with their messages.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | The editor's text, to find each warning's line. |
| `lines` | `number` | How many lines to number. |
| `warnings` | `readonly EditorWarning[]` | The warnings, by offset in `text`. |

## Returns

`string`: The line numbers' HTML.

<!-- api:end -->

## Examples

```ts
import { gutterHtml } from 'smaltkit/editor';

const text = 'SELECT 1;\nSELEC 2;\nSELECT 3;';
console.log(gutterHtml(text, 3, [{ start: 10, end: 15, message: 'Unknown keyword SELEC' }]));
```

```text
1
<span class="sk-ed-warnline" title="Unknown keyword SELEC">2</span>
3

```

## See also

- [`markedHtml`](./markedHtml): the same warnings, underlined in the text.
- [`Editor`](../editor#Editor): `setWarnings` draws both.
