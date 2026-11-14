# wordBefore

<!-- api:start -->

```ts
import { wordBefore } from 'smaltkit/sql';
function wordBefore(text: string, pos: number): {
    word: string;
    start: number;
    qualifier: string | null;
};
```

Identifier-ish word immediately before offset `pos` (for completion).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | SQL. |
| `pos` | `number` | An offset in `text`, such as the cursor's. |

## Returns

`{ word: string; start: number; qualifier: string | null; }`: The word, where it starts, and the name before a dot in front of it (`t` in `t.na`), or null.

<!-- api:end -->

## Examples

```ts
import { wordBefore } from 'smaltkit/sql';

console.log(wordBefore('SELECT na', 9));
console.log(wordBefore('SELECT s.re FROM sales s', 11));
console.log(wordBefore('SELECT ', 7));
```

```text
{ word: 'na', start: 7, qualifier: null }
{ word: 're', start: 9, qualifier: 's' }
{ word: '', start: 7, qualifier: null }
```

## See also

- [`aliasesIn`](./aliasesIn): what a qualifier names.
- [`completeSql`](../editor#completeSql): completion built on it.
