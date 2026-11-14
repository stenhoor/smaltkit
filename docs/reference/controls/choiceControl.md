# choiceControl

<!-- api:start -->

```ts
import { choiceControl } from 'smaltkit/controls';
function choiceControl(el: ControlElement, style: ChoiceStyle, o: ChoiceOptions): void;
```

Choose values from a list. `list`: checkboxes (radios when `single`); `dropdown`: the same in a &lt;details> menu, with
"All" or "n selected" as its label; `buttons`: chips, Ctrl/Cmd-click to add to the selection. A "Clear" button
appears while something is selected.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `el` | `ControlElement` | The element to draw into. |
| `style` | `ChoiceStyle` | `'list'`, `'dropdown'` or `'buttons'`. |
| `o` | `ChoiceOptions` | The values, the selection, how values are shown, and `onChange`. |

## Returns

`void`: Nothing: the control is drawn into `el` and reports through `o.onChange`. Call it again to redraw.

<!-- api:end -->

## Examples

What each style draws:

```ts
import { choiceControl, type ControlElement } from 'smaltkit/controls';

// A stand-in for an element, as the tests use: what a control writes, and no events.
const el = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] } as unknown as ControlElement;
for (const style of ['list', 'dropdown', 'buttons'] as const) {
  choiceControl(el, style, { values: ['North', 'South', 'East'], selected: ['South'], onChange: () => {} });
  const text = el.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const checked = (el.innerHTML.match(/ checked|sk-on/g) ?? []).length;
  console.log(style.padEnd(8), `${text} (${checked} selected)`);
}
```

```text
list     North South East Clear (1 selected)
dropdown South North South East Clear (1 selected)
buttons  North South East Clear (1 selected)
```

## Demo

A filter in a page: redraw with the new selection, and use it.

```ts
import { choiceControl, type ChoiceOptions } from 'smaltkit/controls';
import type { Value } from 'smaltkit/format';

const el = document.querySelector<HTMLElement>('#region')!;
let selected: Value[] | null = null;
const draw = () => choiceControl(el, 'dropdown', {
  values: ['North', 'South', 'East'],
  selected,
  onChange: (values) => {
    selected = values.length ? values : null;
    draw();
    console.log('filter', selected ?? 'all');
  },
} satisfies ChoiceOptions);
draw();
```


## See also

- [`rangeControl`](./rangeControl) and [`searchControl`](./searchControl).
- [`smaltkit/ui.css`](../styles): `.sk-control`.
