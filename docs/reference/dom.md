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

#### closeMenu {#closeMenu}

```ts
function closeMenu(): void;
```

#### debounce {#debounce}

```ts
function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void;
```

#### dialog {#dialog}

```ts
function dialog<T = unknown>(title: string, body: Node, buttons?: {
    label: string;
    primary?: boolean;
    value?: () => T | Promise<T> | undefined;
}[], opts?: {
    wide?: boolean;
}): Promise<T | null>;
```

A modal dialog. Resolves with the value passed to close(), or null when dismissed.

#### download {#download}

```ts
function download(name: string, data: BlobPart, type?: string): void;
```

#### esc {#esc}

```ts
function esc(s: unknown): string;
```

Text escaped for HTML and SVG, in text and in attributes.

- `@param` s Anything; null and undefined are `''`.
- `@returns` The text with `& < > " '` escaped.

#### fileName {#fileName}

```ts
function fileName(s: string, fallback?: string): string;
```

Download-safe file name; `fallback` when nothing is left of `s`.

#### h {#h}

```ts
function h<K extends keyof HTMLElementTagNameMap>(sel: K, attrs?: Attrs, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K];
function h(sel: string, attrs?: Attrs, ...children: (Child | Child[])[]): HTMLElement;
```

h('button.primary', { onclick }, 'Save')

#### pickFile {#pickFile}

```ts
function pickFile(accept: string): Promise<File | null>;
```

#### showMenu {#showMenu}

```ts
function showMenu(x: number, y: number, items: MenuItem[]): void;
```

A context / dropdown menu at a point.

#### toast {#toast}

```ts
function toast(text: string, kind?: 'info' | 'error' | 'ok', ms?: number): void;
```

### Interfaces

#### MenuItem {#MenuItem}

```ts
interface MenuItem {
    label: string;
    action?: () => void;
    disabled?: boolean;
    separator?: boolean;
    hint?: string;
}
```

<!-- api:end -->
