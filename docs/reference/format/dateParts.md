# dateParts

<!-- api:start -->

```ts
import { dateParts } from 'smaltkit/format';
function dateParts(v: Value): {
    y: number;
    mo: number;
    d: number;
    h: number;
    mi: number;
    s: number;
} | null;
```

Parse an ISO-like date string (or epoch number) into its parts without time-zone shifts.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `v` | `Value` | A date as `YYYY-MM`, `YYYY-MM-DD` or `YYYY-MM-DD HH:mm[:ss]` (a `T` works too), or an epoch number: seconds, or milliseconds above 10¹¹, read in UTC. |

## Returns

`{ y: number; mo: number; d: number; h: number; mi: number; s: number; } | null`: The year, month (1–12), day, hours, minutes and seconds, or null for a value that isn't a date.

<!-- api:end -->

## Examples

```ts
import { dateParts } from 'smaltkit/format';

console.log(dateParts('2026-11-14 09:05:30'));
console.log(dateParts('2026-11'));
console.log(dateParts(1794614400000));
console.log(dateParts('next week'));
```

```text
{ y: 2026, mo: 11, d: 14, h: 9, mi: 5, s: 30 }
{ y: 2026, mo: 11, d: 1, h: 0, mi: 0, s: 0 }
{ y: 2026, mo: 11, d: 14, h: 0, mi: 0, s: 0 }
null
```

## Demo

Grouping dates by month without a time zone moving any of them:

```ts
import { dateParts } from 'smaltkit/format';

const counts = new Map<string, number>();
for (const d of ['2026-10-31T23:30', '2026-11-01T00:10', '2026-11-14']) {
  const p = dateParts(d)!;
  const key = `${p.y}-${String(p.mo).padStart(2, '0')}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
console.log(counts);
```

```text
Map(2) { '2026-10' => 1, '2026-11' => 2 }
```

## See also

- [`formatDate`](./formatDate): write a date with a pattern.
