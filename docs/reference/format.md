# smaltkit/format

Number and date formatting for labels, tooltips, tables and cards: presets (`currency0`, `percent`, `month`, …), format objects and patterns, and compact axis labels. Built on `Intl`; formatters are cached.

A format is a preset name (`number`, `integer`, `decimal`, `percent`, `currency`, `currency0`, `compact`,
`currency-compact`, `date`, `datetime`, `month`, `year`, `text`), a small pattern such as `"$#,0.00"` or `"0.0%"`, or
a `FormatSpec` object. Dates never shift time zones: a date is shown as it is stored.

## Examples

```ts
import { formatter, formatDate, axisFormatter } from 'smaltkit/format';

console.log(formatter('currency0')(1234567.8));
console.log(formatter('0.0%')(0.1234));
console.log(formatter({ decimals: 2, suffix: ' kg' })(12.5));
console.log(formatDate('2026-11-14', 'D MMM YYYY'));
console.log(axisFormatter('number')(2500000));
```

```text
$1,234,568
12.3%
12.50 kg
14 Nov 2026
2.5M
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

Each has a page of its own.

| Function | |
| --- | --- |
| [`axisFormatter`](./format/axisFormatter) | A short formatter for axis ticks: compact numbers (`2.5M`), whole percentages, and dates in the format's pattern. |
| [`dateParts`](./format/dateParts) | Parse an ISO-like date string (or epoch number) into its parts without time-zone shifts. |
| [`formatDate`](./format/formatDate) | A date written with a pattern, without time-zone shifts. |
| [`formatSpec`](./format/formatSpec) | The format object a format stands for: a preset's, a pattern's, or the object itself with its `preset` filled in. |
| [`formatter`](./format/formatter) | Build a formatter for a field's format and type. |

### Interfaces

#### FormatSpec {#FormatSpec}

```ts
interface FormatSpec {
    preset?: string;
    decimals?: number;
    currency?: string;
    prefix?: string;
    suffix?: string;
    compact?: boolean;
    percent?: boolean;
    scale?: number;
    locale?: string;
    date?: string;
}
```

| Member | |
| --- | --- |
| `scale?` | Multiply before formatting (e.g. 0.001 to show thousands). |
| `date?` | Date pattern tokens: YYYY YY MMMM MMM MM M DD D HH mm ss Q. |

#### Formatter {#Formatter}

```ts
interface Formatter {
    (v: Value): string;
}
```

### Types

#### ColumnType {#ColumnType}

```ts
type ColumnType = 'number' | 'text' | 'date' | 'datetime' | 'bool' | 'any';
```

What a column holds, for choosing a formatter.

#### Format {#Format}

```ts
type Format = string | FormatSpec;
```

A display format: a preset name (number, integer, decimal, percent, currency, currency0, compact,
currency-compact, date, datetime, month, year, text), a small pattern such as "$#,0.00" or "0.0%",
or an object.

#### Value {#Value}

```ts
type Value = null | number | bigint | string | Uint8Array;
```

A value as smaltdb returns it.

<!-- api:end -->
