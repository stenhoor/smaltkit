# timeTicks

<!-- api:start -->

```ts noplay
import { timeTicks } from 'smaltkit/svg';
function timeTicks(lo: number, hi: number, count?: number): {
    ticks: number[];
    pattern: string;
};
```

Calendar ticks between two times (ms, UTC): whole days, weeks, months, quarters or years, about `count` of them,
with the date pattern that suits the step ("YYYY", "MMM YYYY", "D MMM").

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `lo` | `number` | The first time, in milliseconds (UTC). |
| `hi` | `number` | The last time. |
| `count?` | `number` | About how many ticks. Default 5. |

## Returns

`{ ticks: number[]; pattern: string; }`: The ticks, in milliseconds, and a pattern for formatDate.

<!-- api:end -->

## Examples

```ts
import { timeTicks, timeValue } from 'smaltkit/svg';
import { formatDate } from 'smaltkit/format';

for (const [lo, hi] of [['2026-11-01', '2026-11-14'], ['2026-01-01', '2026-12-31'], ['2019-01-01', '2026-01-01']]) {
  const { ticks, pattern } = timeTicks(timeValue(lo), timeValue(hi));
  console.log(pattern.padEnd(9), ticks.map((t) => formatDate(t, pattern)).join(' · '));
}
```

```text
D MMM     2 Nov · 9 Nov
MMM YYYY  Jan 2026 · Apr 2026 · Jul 2026 · Oct 2026
YYYY      2020 · 2022 · 2024 · 2026
```

## See also

- [`timeValue`](./timeValue).
- [`formatDate`](../format/formatDate): the labels.
