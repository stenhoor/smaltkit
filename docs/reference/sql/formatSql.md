# formatSql

<!-- api:start -->

```ts
import { formatSql } from 'smaltkit/sql';
function formatSql(sql: string): string;
```

A light SQL formatter: one clause per line, upper-case keywords. Comments and literals are kept as written.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `sql` | `string` | A statement or a script. |

## Returns

`string`: The SQL, laid out.

<!-- api:end -->

## Examples

```ts
import { formatSql } from 'smaltkit/sql';

console.log(formatSql("select region, sum(amount) as total from sales where year = 2026 and note <> 'a, b' group by region having sum(amount) > 0 order by total desc limit 5"));
```

```text
SELECT region,
  sum(amount) AS total
FROM sales
WHERE year = 2026
  AND note <> 'a, b'
GROUP BY region
HAVING sum(amount) > 0
ORDER BY total DESC
LIMIT 5

```

## Demo

Comments stay where they were:

```ts
import { formatSql } from 'smaltkit/sql';

console.log(formatSql('select a -- the key\nfrom t'));
```

```text
SELECT a -- the key
FROM t

```

## See also

- [`formatJson`](../pretty/formatJson) and [`formatTypeScript`](../pretty/formatTypeScript).
