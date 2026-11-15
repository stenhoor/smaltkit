# formatDate

<!-- api:start -->

```ts noplay
import { formatDate } from 'smaltkit/format';
function formatDate(v: Value, pattern: string): string;
```

A date written with a pattern, without time-zone shifts.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `v` | `Value` | A date, as dateParts reads it. |
| `pattern` | `string` | Text with the tokens `YYYY YY MMMM MMM MM M DD D HH mm ss Q` (Q is the quarter); other text is kept. |

## Returns

`string`: The date in the pattern; for a value that isn't a date, the value as text (`''` for null).

<!-- api:end -->

## Examples

```ts
import { formatDate } from 'smaltkit/format';

console.log(formatDate('2026-11-14', 'D MMMM YYYY'));
console.log(formatDate('2026-11-14 09:05', 'YYYY-MM-DD HH:mm'));
console.log(formatDate('2026-11-14', 'YYYY, quarter Q'));
console.log(formatDate(1794614400, 'DD/MM/YY'));
```

```text
14 November 2026
2026-11-14 09:05
2026, quarter 4
14/11/26
```

No time-zone shift: a date is shown as it is stored, wherever the page runs.

```ts
import { formatDate } from 'smaltkit/format';

console.log(formatDate('2026-01-01T00:30', 'D MMM YYYY HH:mm'));
console.log(JSON.stringify(formatDate(null, 'YYYY')), formatDate('soon', 'YYYY'));
```

```text
1 Jan 2026 00:30
"" soon
```

## Demo

A heading for each quarter:

```ts
import { formatDate } from 'smaltkit/format';

for (const d of ['2026-02-10', '2026-05-03', '2026-08-21', '2026-11-14']) console.log(formatDate(d, 'Q·YYYY'));
```

```text
1·2026
2·2026
3·2026
4·2026
```

## See also

- [`dateParts`](./dateParts): a date's parts as numbers.
- [`formatter`](./formatter): the date presets (`date`, `datetime`, `month`, `year`).
