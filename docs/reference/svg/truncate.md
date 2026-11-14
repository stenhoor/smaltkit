# truncate

<!-- api:start -->

```ts
import { truncate } from 'smaltkit/svg';
function truncate(s: string, maxPx: number, fontPx: number): string;
```

Text cut to fit a width, with `…`, by textWidth's measure.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `s` | `string` | The text. |
| `maxPx` | `number` | The width it must fit, in pixels. |
| `fontPx` | `number` | The font size in pixels. |

## Returns

`string`: The text as it is when it fits, else as much as fits followed by `…`.

<!-- api:end -->

## Examples

```ts
import { truncate } from 'smaltkit/svg';

console.log(truncate('North America', 200, 12));
console.log(truncate('North America', 60, 12));
```

```text
North America
North A…
```

## See also

- [`textWidth`](./textWidth).
