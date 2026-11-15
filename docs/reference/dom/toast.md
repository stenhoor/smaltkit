# toast

<!-- api:start -->

```ts noplay
import { toast } from 'smaltkit/dom';
function toast(text: string, kind?: 'info' | 'error' | 'ok', ms?: number): void;
```

A short message in the corner, gone after `ms` milliseconds.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | The message. |
| `kind?` | `'info' \| 'error' \| 'ok'` | `'info'`, `'error'` or `'ok'`. Default `'info'`. |
| `ms?` | `number` | How long it shows. Default 3500. |

## Returns

`void`

<!-- api:end -->

## Examples

```ts
import { toast } from 'smaltkit/dom';

toast('Saved', 'ok');
toast('The file could not be read', 'error', 6000);
```


## See also

- [`dialog`](./dialog).
- [`smaltkit/ui.css`](../styles): `.sk-toast` and `--sk-toast-*`.
