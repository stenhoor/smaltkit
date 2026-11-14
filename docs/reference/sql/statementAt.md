# statementAt

<!-- api:start -->

```ts
import { statementAt } from 'smaltkit/sql';
function statementAt(text: string, pos: number): Statement | null;
```

The statement containing (or just before) offset `pos`: the one to run when the cursor is there.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | A script. |
| `pos` | `number` | An offset in `text`, such as the cursor's. |

## Returns

`Statement | null`: The statement, or null for a script with none.

<!-- api:end -->

## Examples

```ts
import { statementAt } from 'smaltkit/sql';

const script = 'SELECT 1;\nSELECT 2;\n';
console.log(statementAt(script, 3)?.sql);
console.log(statementAt(script, 12)?.sql);
console.log(statementAt(script, script.length)?.sql);
console.log(statementAt('  ', 1));
```

```text
SELECT 1
SELECT 2
SELECT 2
null
```

## Demo

Run at the cursor: the statement the cursor is in, or the one it just left.

```ts
import { statementAt } from 'smaltkit/sql';

const editor = { value: 'SELECT 1;\nSELECT 2', selectionStart: 9 };
console.log(statementAt(editor.value, editor.selectionStart)?.sql);
```

```text
SELECT 1
```

## See also

- [`splitStatements`](./splitStatements): all of a script's statements.
