# h

<!-- api:start -->

```ts
import { h } from 'smaltkit/dom';
function h<K extends keyof HTMLElementTagNameMap>(sel: K, attrs?: Attrs, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K];
function h(sel: string, attrs?: Attrs, ...children: (Child | Child[])[]): HTMLElement;
```

An element, built in one call: `h('button.primary', { onclick }, 'Save')`.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `sel` | `K` | A tag with classes after dots (`div.card.wide`); no tag is a `div`. |
| `attrs?` | `Attrs` | Attributes and properties: `on…` functions are event listeners, `class` adds classes, `html` sets the inner HTML, other non-text values are set as properties, `true` is an empty attribute, and null, undefined and false are skipped. |
| `children` | `(Child \| Child[])[]` | Nodes and text to append; null, undefined and false are skipped, arrays are flattened. |

## Returns

`HTMLElementTagNameMap[K]`: The element.

<!-- api:end -->

## Examples

```ts
import { h } from 'smaltkit/dom';

const button = h('button.sk-primary', { type: 'button', disabled: false, onclick: () => console.log('saved') }, 'Save');
const card = h('section.card', { 'aria-label': 'Totals' }, h('h2', {}, 'Totals'), [h('p', {}, '460'), null]);
document.body.append(card, button);
```


## See also

- [`dialog`](./dialog), [`showMenu`](./showMenu) and [`toast`](./toast), built with it.
