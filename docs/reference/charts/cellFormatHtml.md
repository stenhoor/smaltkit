# cellFormatHtml

<!-- api:start -->

```ts noplay
import { cellFormatHtml } from 'smaltkit/charts';
function cellFormatHtml(f: CellFormat | null | undefined): {
    cls: string;
    icon: string;
};
```

The classes and icon markup for a value's conditional format ('' when there is none).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `f` | `CellFormat \| null \| undefined` | The format ctx.cellFormat gave for a value, or null for none. |

## Returns

`{ cls: string; icon: string; }`: `cls`, classes to add to the value's element (`sk-tone-good`, `sk-fill`, …), and `icon`, an inline SVG.

<!-- api:end -->

## Examples

```ts
import { cellFormatHtml } from 'smaltkit/charts';

console.log(cellFormatHtml({ tone: 'good', icon: 'up' }).cls);
console.log(cellFormatHtml({ tone: 'bad', fill: true }).cls);
console.log(cellFormatHtml({ icon: 'check' }).icon.startsWith('<svg'));
console.log(cellFormatHtml(null));
```

```text
 sk-tone-good
 sk-tone-bad sk-fill
true
{ cls: '', icon: '' }
```

## See also

- [`tableView`](../table/tableView) and [`kpiCard`](./kpiCard), which call `ctx.cellFormat`.
- [`smaltkit/ui.css`](../styles): the marks' colours.
