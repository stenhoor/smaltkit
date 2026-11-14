# fileName

<!-- api:start -->

```ts
import { fileName } from 'smaltkit/dom';
function fileName(s: string, fallback?: string): string;
```

Download-safe file name; `fallback` when nothing is left of `s`.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `s` | `string` | Any text, such as a title. |
| `fallback?` | `string` | The name when nothing is left. Default `download`. |

## Returns

`string`: The text lower-cased, with runs of anything but letters, digits, `_`, `.` and `-` made `-`.

<!-- api:end -->

## Examples

```ts
import { fileName } from 'smaltkit/dom';

console.log(fileName('Sales by region (2026)'), fileName('Q4/Q1: notes.md'), fileName('***'), fileName('', 'report'));
```

```text
sales-by-region-2026 q4-q1-notes.md download report
```

## See also

- [`download`](./download).
- [`tableNameFrom`](../sql/tableNameFrom): the same idea, for table names.
