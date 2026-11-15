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

Each has a page of its own.

| Function | |
| --- | --- |
| [`formatJson`](./pretty/formatJson) | A value as JSON, laid out to fit the width: an object or array stays on one line when it fits, and has one item per line when it doesn't. |
| [`formatLog`](./pretty/formatLog) | What `console.log(...values)` prints, the same in every runtime: strings as they are, everything else as inspect shows it, joined by spaces. |
| [`formatTypeScript`](./pretty/formatTypeScript) | TypeScript (or JavaScript) re-indented by bracket depth, with continued lines one level in. |
| [`inspect`](./pretty/inspect) | A value as a console shows it, the same in every runtime: `'text'`, `12n`, `[ 1, 2 ]`, `{ a: 1 }`, `Map(1) { 'a' => 1 }`, `Uint8Array(2) [ 1, 2 ]`. |

### Interfaces

#### InspectOptions {#InspectOptions}

```ts noplay
interface InspectOptions {
    width?: number;
}
```

| Member | |
| --- | --- |
| `width?` | The widest line to aim for: a value that doesn't fit has one item per line. Default 80. |

#### JsonFormatOptions {#JsonFormatOptions}

```ts noplay
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

```ts noplay
interface TsFormatOptions {
    indent?: number;
}
```

| Member | |
| --- | --- |
| `indent?` | Spaces per level. Default 2. |

<!-- api:end -->
