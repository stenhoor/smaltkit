# axisFormatter

<!-- api:start -->

```ts noplay
import { axisFormatter } from 'smaltkit/format';
function axisFormatter(f: Format | undefined, locale?: string): Formatter;
```

A short formatter for axis ticks: compact numbers (`2.5M`), whole percentages, and dates in the format's pattern.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `f` | `Format \| undefined` | The field's format, as for formatter. |
| `locale?` | `string` | A BCP 47 locale, as for formatter. |

## Returns

`Formatter`: A function from a tick value to its label.

<!-- api:end -->

## Examples

```ts
import { axisFormatter } from 'smaltkit/format';

const money = axisFormatter('currency');
console.log([0, 250000, 1500000, 12000000].map(money).join('  '));
console.log([0, 0.25, 0.5].map(axisFormatter('percent')).join('  '));
console.log(axisFormatter('month')('2026-11-01'));
```

```text
$0  $250K  $1.5M  $12M
0%  25%  50%
Nov 2026
```

## Demo

Labels for an axis's ticks:

```ts
import { axisFormatter } from 'smaltkit/format';
import { niceTicks } from 'smaltkit/svg';

const { ticks } = niceTicks(0, 4_200_000);
console.log(ticks.map(axisFormatter('number')).join(' · '));
```

```text
0 · 1M · 2M · 3M · 4M · 5M
```

## See also

- [`formatter`](./formatter): the full formatter, for labels and tables.
- [`niceTicks`](../svg#niceTicks): the tick values.
