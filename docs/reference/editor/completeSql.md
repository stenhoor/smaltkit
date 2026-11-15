# completeSql

<!-- api:start -->

```ts noplay
import { completeSql } from 'smaltkit/editor';
function completeSql(text: string, pos: number, schema: EditorSchema, explicit: boolean): {
    items: CompletionItem[];
    start: number;
};
```

SQL completion: columns of the tables in the statement (or of a qualifier's table), tables, functions, keywords.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | The editor's text. |
| `pos` | `number` | The cursor's offset. |
| `schema` | `EditorSchema` | The database's names and tables, with their columns. |
| `explicit` | `boolean` | Whether the user asked for completion (Ctrl+Space), so a list shows with nothing typed. |

## Returns

`{ items: CompletionItem[]; start: number; }`: The candidates matching the word typed, best first, and where that word starts.

<!-- api:end -->

## Examples

Columns of the tables in the statement, and a qualifier's table:

```ts
import { completeSql } from 'smaltkit/editor';

const schema = {
  names: new Set(['sales', 'customers']),
  tables: new Map([
    ['sales', Object.assign([{ name: 'region' }, { name: 'amount', type: 'REAL' }], { kind: 'table' })],
    ['customers', Object.assign([{ name: 'id' }, { name: 'name' }], { kind: 'table' })],
  ]),
};
// The cursor is at the `|`.
const show = (withCursor: string) => {
  const pos = withCursor.indexOf('|');
  const { items, start } = completeSql(withCursor.replace('|', ''), pos, schema, false);
  console.log(start, items.slice(0, 5).map((i) => `${i.kind}:${i.label}`).join(' '));
};
show('SELECT am| FROM sales');
show('SELECT c.| FROM sales s JOIN customers c ON c.id = s.id');
show('SELECT * FROM cu|');
```

```text
7 col:amount
9 col:id col:name
14 table:customers fn:cume_dist kw:CURRENT kw:CURRENT_DATE kw:CURRENT_TIME
```

## See also

- [`sqlLanguage`](../editor#sqlLanguage): the editor's SQL, which uses it.
- [`wordBefore`](../sql/wordBefore) and [`aliasesIn`](../sql/aliasesIn).
- [`completeCypher`](../cypher/completeCypher).
