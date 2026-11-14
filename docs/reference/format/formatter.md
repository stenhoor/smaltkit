# formatter

<!-- api:start -->

```ts
import { formatter } from 'smaltkit/format';
function formatter(f: Format | undefined, type?: ColumnType, locale?: string): Formatter;
```

Build a formatter for a field's format and type. Formatters are cached by format and locale, so build one per field
and call it per value.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `f` | `Format \| undefined` | The format: a preset name, a pattern or a FormatSpec; undefined formats numbers with up to two decimals. |
| `type?` | `ColumnType` | What the column holds. With `'text'` (or another type that isn't a number), a number without a numeric format is shown as written. Default `'any'`. |
| `locale?` | `string` | A BCP 47 locale for `Intl`, such as `'de-DE'`; the format's own `locale` wins. Default: the page's. |

## Returns

`Formatter`: A function from a value to its text: null is `(Blank)`, bytes are `<n bytes>`.

<!-- api:end -->

## Examples

Presets:

```ts
import { formatter } from 'smaltkit/format';

for (const [preset, value] of [
  ['number', 1234.5678], ['integer', 1234.5678], ['decimal', 1234.5678], ['percent', 0.1234],
  ['currency', 1234.5678], ['currency0', 1234.5678], ['compact', 1234567],
] as const) {
  console.log(preset.padEnd(10), formatter(preset)(value));
}
```

```text
number     1,234.57
integer    1,235
decimal    1,234.57
percent    12.3%
currency   $1,234.57
currency0  $1,235
compact    1.2M
```

A pattern, and a format object:

```ts
import { formatter } from 'smaltkit/format';

console.log(formatter('$#,0.00')(1234.5));
console.log(formatter('0.0%')(0.256));
console.log(formatter({ decimals: 1, suffix: ' kg', scale: 0.001 })(15300));
console.log(formatter({ currency: 'EUR', locale: 'de-DE' })(1234.5));
```

```text
$1,234.50
25.6%
15.3 kg
1.234,50 €
```

Values that aren't numbers:

```ts
import { formatter } from 'smaltkit/format';

const f = formatter('currency0');
console.log(f(null), f('42'), f('n/a'), f(new Uint8Array(3)));
console.log(formatter('month')('2026-11-14'));
```

```text
(Blank) $42 n/a <3 bytes>
Nov 2026
```

## Demo

Formatting a result's columns, one formatter per column:

```ts
import { formatter } from 'smaltkit/format';

const columns = [
  { name: 'month', format: 'month' },
  { name: 'revenue', format: 'currency0' },
  { name: 'margin', format: 'percent' },
];
const rows = [
  ['2026-10-01', 182340, 0.312],
  ['2026-11-01', 201775.5, 0.298],
];
const fmt = columns.map((c) => formatter(c.format));
for (const row of rows) console.log(row.map((v, i) => fmt[i]!(v)).join(' | '));
```

```text
Oct 2026 | $182,340 | 31.2%
Nov 2026 | $201,776 | 29.8%
```

## See also

- [`axisFormatter`](./axisFormatter): shorter labels for axis ticks.
- [`formatSpec`](./formatSpec): the format object a format stands for.
- [`formatDate`](./formatDate): dates with any pattern.
