# rangeControl

<!-- api:start -->

```ts noplay
import { rangeControl } from 'smaltkit/controls';
function rangeControl(el: ControlElement, o: RangeOptions): void;
```

Two inputs, from and to, for a range of numbers or dates.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `el` | `ControlElement` | The element to draw into. |
| `o` | `RangeOptions` | The kind, the data's extent, the current range and `onChange`. |

## Returns

`void`: Nothing: the control reports a change of either end through `o.onChange`.

<!-- api:end -->

## Examples

```ts
import { rangeControl, type ControlElement } from 'smaltkit/controls';

// A stand-in for an element, as the tests use: what a control writes, and no events.
const el = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] } as unknown as ControlElement;
rangeControl(el, { kind: 'date', min: '2026-01-01', max: '2026-12-31', value: ['2026-11-01', null], onChange: () => {} });
console.log([...el.innerHTML.matchAll(/<input[^>]*value="([^"]*)" placeholder="([^"]*)"/g)].map((m) => `value=${m[1] || '(open)'} placeholder=${m[2]}`));
```

```text
[
  'value=2026-11-01 placeholder=2026-01-01',
  'value=(open) placeholder=2026-12-31'
]
```

## See also

- [`choiceControl`](./choiceControl).
