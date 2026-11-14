# sameValue

<!-- api:start -->

```ts
import { sameValue } from 'smaltkit/controls';
function sameValue(a: Value, b: Value): boolean;
```

Equal values, across number and bigint (an integer column can come back as either).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `a` | `Value` | A value. |
| `b` | `Value` | Another. |

## Returns

`boolean`: True when they are the same value.

<!-- api:end -->

## Examples

```ts
import { sameValue } from 'smaltkit/controls';

console.log(sameValue(3, 3n), sameValue(3n, '3'), sameValue(null, null), sameValue(null, 0), sameValue('a', 'a'));
```

```text
true true true false true
```

## Demo

Whether a selection holds a value that came back as a bigint:

```ts
import { sameValue } from 'smaltkit/controls';

const selected = [2024, 2026];
console.log(selected.some((v) => sameValue(v, 2026n)));
```

```text
true
```

## See also

- [`choiceControl`](./choiceControl), which compares with it.
