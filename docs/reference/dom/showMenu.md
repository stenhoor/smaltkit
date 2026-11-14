# showMenu

<!-- api:start -->

```ts
import { showMenu } from 'smaltkit/dom';
function showMenu(x: number, y: number, items: MenuItem[]): void;
```

A context / dropdown menu at a point. It closes on a pick, a click elsewhere or Escape; only one is open at a time.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `x` | `number` | The menu's left edge, in page coordinates. |
| `y` | `number` | Its top edge. |
| `items` | `MenuItem[]` | The items: a label, an action and a hint (such as a shortcut), or a separator; disabled items are shown but can't be picked. |

## Returns

`void`

<!-- api:end -->

## Examples

A context menu where the user right-clicks:

```ts
import { showMenu } from 'smaltkit/dom';

document.querySelector('#tables')!.addEventListener('contextmenu', (e) => {
  const event = e as MouseEvent;
  event.preventDefault();
  showMenu(event.pageX, event.pageY, [
    { label: 'Open', action: () => console.log('open') },
    { label: 'Rename', hint: 'F2', action: () => console.log('rename') },
    { separator: true, label: '' },
    { label: 'Drop', disabled: true },
  ]);
});
```


## See also

- [`closeMenu`](./closeMenu).
- [`smaltkit/ui.css`](../styles): `.sk-menu`.
