# legendHtml

<!-- api:start -->

```ts
import { legendHtml } from 'smaltkit/charts';
function legendHtml(names: string[], palette: number, offset?: number): string;
```

A legend (HTML) for series names, each with its palette colour.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `names` | `string[]` | The series names, in palette order. |
| `palette` | `number` | How many palette colours there are: names past it reuse them. |
| `offset?` | `number` | The palette colour of the first name. Default 0. |

## Returns

`string`: The legend's HTML, its names escaped.

<!-- api:end -->

## Examples

```ts
import { legendHtml } from 'smaltkit/charts';

console.log(legendHtml(['North', 'South & East'], 12));
console.log(legendHtml(['A', 'B'], 2, 1));
```

```text
<div class="sk-legend"><span class="sk-legend-item sk-c0"><i></i>North</span><span class="sk-legend-item sk-c1"><i></i>South &amp; East</span></div>
<div class="sk-legend"><span class="sk-legend-item sk-c1"><i></i>A</span><span class="sk-legend-item sk-c0"><i></i>B</span></div>
```

## See also

- [`smaltkit/ui.css`](../styles): the marks' colours.
