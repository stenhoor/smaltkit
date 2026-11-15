# smaltkit/dom

A small DOM toolkit: the `h()` element builder, menus, dialogs, toasts, downloads and file pickers.

## Examples

```ts
import { h, toast, download } from 'smaltkit/dom';

document.body.append(h('button.primary', { onclick: () => download('rows.csv', csv, 'text/csv') }, 'Download'));
toast('Saved', 'ok');
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

Each has a page of its own.

| Function | |
| --- | --- |
| [`closeMenu`](./dom/closeMenu) | Closes the menu showMenu opened, if one is open. |
| [`debounce`](./dom/debounce) | A function that runs `fn` once calls have paused for `ms` milliseconds, with the last call's arguments. |
| [`dialog`](./dom/dialog) | A modal dialog. |
| [`download`](./dom/download) | Saves data as a file, through a temporary link. |
| [`esc`](./dom/esc) | Text escaped for HTML and SVG, in text and in attributes. |
| [`fileName`](./dom/fileName) | Download-safe file name; `fallback` when nothing is left of `s`. |
| [`h`](./dom/h) | An element, built in one call: `h('button.primary', { onclick }, 'Save')`. |
| [`pickFile`](./dom/pickFile) | Asks the user for a file. |
| [`showMenu`](./dom/showMenu) | A context / dropdown menu at a point. |
| [`toast`](./dom/toast) | A short message in the corner, gone after `ms` milliseconds. |

### Interfaces

#### MenuItem {#MenuItem}

```ts noplay
interface MenuItem {
    label: string;
    action?: () => void;
    disabled?: boolean;
    separator?: boolean;
    hint?: string;
}
```

<!-- api:end -->
