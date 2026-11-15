# divColor

<!-- api:start -->

```ts noplay
import { divColor } from 'smaltkit/svg';
function divColor(t: number): string;
```

A diverging color: from `--sk-div-mid` at 0 towards `--sk-div-lo` (below 0) or `--sk-div-hi` (above).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `t` | `number` | From -1 to 1; beyond is clamped. |

## Returns

`string`: A CSS colour.

<!-- api:end -->

## Examples

```ts
import { divColor } from 'smaltkit/svg';

console.log(divColor(-0.5));
console.log(divColor(0));
console.log(divColor(0.8));
```

```text
color-mix(in oklab, var(--sk-div-lo) 50%, var(--sk-div-mid))
color-mix(in oklab, var(--sk-div-hi) 0%, var(--sk-div-mid))
color-mix(in oklab, var(--sk-div-hi) 80%, var(--sk-div-mid))
```

## See also

- [`seqColor`](./seqColor).
- [`smaltkit/ui.css`](../styles): the `--sk-div-*` colours.
