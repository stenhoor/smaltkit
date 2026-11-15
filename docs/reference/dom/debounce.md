# debounce

<!-- api:start -->

```ts noplay
import { debounce } from 'smaltkit/dom';
function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void;
```

A function that runs `fn` once calls have paused for `ms` milliseconds, with the last call's arguments.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `fn` | `(...a: A) => void` | The function. |
| `ms` | `number` | The pause, in milliseconds. |

## Returns

`(...a: A) => void`: The debounced function.

<!-- api:end -->

## Examples

```ts
import { debounce } from 'smaltkit/dom';

const save = debounce((text: string) => console.log('saved', text), 50);
save('a');
save('ab');
save('abc');
setTimeout(() => save('abcd'), 100);
```

```text
saved abc
saved abcd
```

## See also

- [`searchControl`](../controls/searchControl): a search box with the pause built in.
