# unquote

<!-- api:start -->

```ts
import { unquote } from 'smaltkit/sql';
function unquote(s: string): string;
```

An identifier without its quotes: `"a""b"`, `` `a` `` and `[a]` styles.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `s` | `string` | An identifier as written. |

## Returns

`string`: Its name, with doubled quotes made single; a name without quotes as it is.

<!-- api:end -->

## Examples

```ts
import { unquote } from 'smaltkit/sql';

console.log(unquote('"order date"'), unquote('"say ""hi"""'), unquote('`a`'), unquote('[b]'), unquote('plain'));
```

```text
order date say "hi" a b plain
```

## See also

- [`quoteIdent`](./quoteIdent): the other way.
