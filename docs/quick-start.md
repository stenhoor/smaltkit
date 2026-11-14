# Quick start

smaltkit is the code the smalt apps share: one module per job, each its own import. Three steps take you from nothing
to a module running.

## 1. Add it

smaltkit is not on npm yet: depend on a commit of its repository. npm clones that commit and builds `dist/`.

```json
{ "dependencies": { "smaltkit": "github:stenhoor/smaltkit#<commit>" } }
```

Pin a full commit, not a branch, so installs repeat, and move the pin deliberately.

## 2. Import a module

Import a module by its subpath to load only that module, or everything from `smaltkit`. The output is plain ES2022
modules, one file per module, so a page can load them from `node_modules/smaltkit/dist/` without a bundler.

```ts
import { formatter } from 'smaltkit/format';
import { splitStatements, formatSql } from 'smaltkit/sql';
```

## 3. Run it

Most modules are plain functions of their input: they run anywhere, a page or Node.

```ts
import { formatter } from 'smaltkit/format';
import { formatSql } from 'smaltkit/sql';

const money = formatter('currency0');
console.log(money(1234567.8));
console.log(formatSql('select region, sum(amount) from sales group by region'));
```

```text
$1,234,568
SELECT region,
  sum(amount)
FROM sales
GROUP BY region

```

The modules that draw (charts, tables, the grid, the editor) write into an element of the page, styled by
[`smaltkit/ui.css`](./reference/styles). Each module's page in the [Reference](./reference/) says what it does, with
examples, and lists its API.
