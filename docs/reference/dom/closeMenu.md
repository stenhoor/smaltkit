# closeMenu

<!-- api:start -->

```ts
import { closeMenu } from 'smaltkit/dom';
function closeMenu(): void;
```

Closes the menu showMenu opened, if one is open.

## Returns

`void`

<!-- api:end -->

## Examples

Close an open menu when the view changes:

```ts
import { closeMenu } from 'smaltkit/dom';

window.addEventListener('resize', closeMenu);
```


## See also

- [`showMenu`](./showMenu).
