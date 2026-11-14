# smaltkit/pretty

Pretty printing for people to read: `formatJson` lays out JSON (plans, results), and `formatTypeScript` re-indents TypeScript by bracket depth, changing only whitespace at line starts and ends.

## Examples

`formatJson` keeps a value on one line when it fits and puts one item per line when it doesn't:

```ts
import { formatJson } from 'smaltkit/pretty';

const plan = { op: 'filter', input: { op: 'scan', table: 'sales' }, where: ['>', 'amount', 100] };
console.log(formatJson(plan));
console.log(formatJson(plan, { width: 40 }));
```

```text
{ "op": "filter", "input": { "op": "scan", "table": "sales" }, "where": [">", "amount", 100] }
{
  "op": "filter",
  "input": {
    "op": "scan",
    "table": "sales"
  },
  "where": [">", "amount", 100]
}
```

```ts
import { formatTypeScript } from 'smaltkit/pretty';

console.log(formatTypeScript('if (x) {\nreturn 1;\n}'));
```

```text
if (x) {
  return 1;
}

```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

#### formatJson {#formatJson}

```ts
function formatJson(value: unknown, options?: JsonFormatOptions): string;
```

A value as JSON, laid out to fit the width.

#### formatTypeScript {#formatTypeScript}

```ts
function formatTypeScript(code: string, options?: TsFormatOptions): string;
```

TypeScript (or JavaScript) re-indented by bracket depth, with continued lines one level in. Lines inside a template
literal or a block comment keep their text exactly.

### Interfaces

#### JsonFormatOptions {#JsonFormatOptions}

```ts
interface JsonFormatOptions {
    width?: number;
    indent?: number;
}
```

| Member | |
| --- | --- |
| `width?` | The widest line to aim for. Default 100. |
| `indent?` | Spaces per level. Default 2. |

#### TsFormatOptions {#TsFormatOptions}

```ts
interface TsFormatOptions {
    indent?: number;
}
```

| Member | |
| --- | --- |
| `indent?` | Spaces per level. Default 2. |

<!-- api:end -->
