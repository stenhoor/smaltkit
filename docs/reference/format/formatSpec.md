# formatSpec

<!-- api:start -->

```ts
import { formatSpec } from 'smaltkit/format';
function formatSpec(f: Format | undefined): FormatSpec;
```

The format object a format stands for: a preset's, a pattern's, or the object itself with its `preset` filled in.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `f` | `Format \| undefined` | A preset name, a pattern such as `"$#,0.00"`, a FormatSpec, or undefined for none. |

## Returns

`FormatSpec`: The FormatSpec; `{}` for no format. A pattern it can't read is kept as a prefix.

<!-- api:end -->

## Examples

```ts
import { formatSpec } from 'smaltkit/format';

console.log(formatSpec('currency0'));
console.log(formatSpec('$#,0.00'));
console.log(formatSpec({ preset: 'percent', decimals: 0 }));
console.log(formatSpec(undefined));
```

```text
{ currency: 'USD', decimals: 0 }
{ prefix: '$', decimals: 2, percent: false, suffix: undefined }
{ percent: true, decimals: 0, preset: 'percent' }
{}
```

## Demo

Telling dates from numbers before choosing how to draw a field:

```ts
import { formatSpec } from 'smaltkit/format';

for (const f of ['month', 'currency', '0.0%']) {
  console.log(f, formatSpec(f).date ? 'a date' : 'a number');
}
```

```text
month a date
currency a number
0.0% a number
```

## See also

- [`formatter`](./formatter): format values with it.
