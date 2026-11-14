# searchControl

<!-- api:start -->

```ts
import { searchControl } from 'smaltkit/controls';
function searchControl(el: ControlElement, o: SearchOptions): void;
```

A search box that reports its text after typing pauses.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `el` | `ControlElement` | The element to draw into. |
| `o` | `SearchOptions` | The text, a placeholder, the pause and `onChange`. |

## Returns

`void`: Nothing: the control reports through `o.onChange`.

<!-- api:end -->

## Examples

In a page, filtering a list as the user types:

```ts
import { searchControl } from 'smaltkit/controls';

const names = ['North', 'South', 'East'];
searchControl(document.querySelector<HTMLElement>('#search')!, {
  value: '',
  placeholder: 'Find a region',
  delay: 200,
  onChange: (text) => console.log(names.filter((n) => n.toLowerCase().includes(text.toLowerCase()))),
});
```


## See also

- [`debounce`](../dom/debounce): the same pause, for anything.
