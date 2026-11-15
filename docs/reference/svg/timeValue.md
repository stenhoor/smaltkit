# timeValue

<!-- api:start -->

```ts noplay
import { timeValue } from 'smaltkit/svg';
function timeValue(v: unknown): number;
```

A date or time value as milliseconds (UTC), or NaN: ISO strings ("2025-03-01", "2025-03"), epoch numbers.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `v` | `unknown` | A date as text (`YYYY-MM`, `YYYY-MM-DD`, with a time after a space or `T`), or an epoch number: seconds, or milliseconds above 10¹¹. |

## Returns

`number`: Milliseconds since the epoch, UTC, or NaN for anything else.

<!-- api:end -->

## Examples

```ts
import { timeValue } from 'smaltkit/svg';

for (const v of ['2026-11-14', '2026-11', '2026-11-14T09:30', 1794614400, 'soon']) console.log(v, timeValue(v));
```

```text
2026-11-14 1794614400000
2026-11 1793491200000
2026-11-14T09:30 1794648600000
1794614400 1794614400000
soon NaN
```

## See also

- [`timeTicks`](./timeTicks).
- [`dateParts`](../format/dateParts): a date's parts.
