# dialog

<!-- api:start -->

```ts
import { dialog } from 'smaltkit/dom';
function dialog<T = unknown>(title: string, body: Node, buttons?: {
    label: string;
    primary?: boolean;
    value?: () => T | Promise<T> | undefined;
}[], opts?: {
    wide?: boolean;
}): Promise<T | null>;
```

A modal dialog. Resolves with the value passed to close(), or null when dismissed.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `title` | `string` | The dialog's title. |
| `body` | `Node` | Its content. |
| `buttons?` | `{ label: string; primary?: boolean; value?: () => T \| Promise&lt;T> \| undefined; }[]` | Its buttons, in order: a label, whether it's the primary one, and `value`, whose result closes the dialog with it (undefined keeps it open, and an error it throws is shown as a toast); a button without `value` closes it with null. Default: one Close button. |
| `opts?` | `{ wide?: boolean; }` | `wide`: a wider dialog. |

## Returns

`Promise<T | null>`: The value of the button that closed it, or null when it was dismissed.

<!-- api:end -->

## Examples

Ask for a name; `undefined` from `value` keeps the dialog open:

```ts
import { dialog, h } from 'smaltkit/dom';

const input = h('input', { value: 'sales' });
const name = await dialog<string>('Save as', input, [
  { label: 'Cancel' },
  { label: 'Save', primary: true, value: () => (input.value.trim() ? input.value.trim() : undefined) },
]);
console.log(name ?? 'cancelled');
```


## See also

- [`h`](./h): its body.
- [`toast`](./toast): where a `value`'s error shows.
