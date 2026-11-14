# aliasesIn

<!-- api:start -->

```ts
import { aliasesIn } from 'smaltkit/sql';
function aliasesIn(sql: string, tableNames: Set<string>): Map<string, string>;
```

Table aliases in a statement, for completing `alias.` with the table's columns.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `sql` | `string` | A statement. |
| `tableNames` | `Set&lt;string>` | The database's table names, lower-cased. |

## Returns

`Map<string, string>`: Lower-cased alias (and each table's own name) to table name, for tables after `FROM`, `JOIN`, `UPDATE`, `INTO` or a comma.

<!-- api:end -->

## Examples

```ts
import { aliasesIn } from 'smaltkit/sql';

const sql = 'SELECT s.region, c.name FROM sales AS s JOIN customers c ON c.id = s.customer';
console.log(aliasesIn(sql, new Set(['sales', 'customers'])));
```

```text
Map(4) {
  's' => 'sales',
  'sales' => 'sales',
  'c' => 'customers',
  'customers' => 'customers'
}
```

## Demo

Completing `s.` with the right table's columns:

```ts
import { aliasesIn, wordBefore } from 'smaltkit/sql';

const columns: Record<string, string[]> = { sales: ['region', 'amount'], customers: ['id', 'name'] };
const sql = 'SELECT s. FROM sales s';
const { qualifier } = wordBefore(sql, 9);
const table = aliasesIn(sql, new Set(Object.keys(columns))).get(qualifier!.toLowerCase());
console.log(columns[table!]);
```

```text
[ 'region', 'amount' ]
```

## See also

- [`wordBefore`](./wordBefore).
