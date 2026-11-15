# seqColor

<!-- api:start -->

```ts noplay
import { seqColor } from 'smaltkit/svg';
function seqColor(t: number): string;
```

A color between the theme's sequential ramp ends (`--sk-seq-lo` and `--sk-seq-hi`), as a CSS `color-mix()`.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `t` | `number` | Where on the ramp, from 0 to 1; outside it is clamped. |

## Returns

`string`: A CSS colour.

<!-- api:end -->

## Examples

```ts
import { seqColor } from 'smaltkit/svg';

console.log(seqColor(0));
console.log(seqColor(0.42));
console.log(seqColor(2));
```

```text
color-mix(in oklab, var(--sk-seq-hi) 0%, var(--sk-seq-lo))
color-mix(in oklab, var(--sk-seq-hi) 42%, var(--sk-seq-lo))
color-mix(in oklab, var(--sk-seq-hi) 100%, var(--sk-seq-lo))
```

## See also

- [`divColor`](./divColor).
- [`smaltkit/ui.css`](../styles): the `--sk-seq-*` ends.
