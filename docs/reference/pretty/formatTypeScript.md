# formatTypeScript

<!-- api:start -->

```ts
import { formatTypeScript } from 'smaltkit/pretty';
function formatTypeScript(code: string, options?: TsFormatOptions): string;
```

TypeScript (or JavaScript) re-indented by bracket depth, with continued lines one level in. Lines inside a template
literal or a block comment keep their text exactly. Only whitespace at the start and end of lines changes, so what the
code does can't change; runs of blank lines become one.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `code` | `string` | The code. |
| `options?` | `TsFormatOptions` | `indent`: spaces per level (default 2). |

## Returns

`string`: The code, re-indented.

<!-- api:end -->

## Examples

```ts
import { formatTypeScript } from 'smaltkit/pretty';

console.log(formatTypeScript('function total(xs: number[]) {\nlet t = 0;\nfor (const x of xs) {\nt += x;\n}\nreturn t;\n}'));
```

```text
function total(xs: number[]) {
  let t = 0;
  for (const x of xs) {
    t += x;
  }
  return t;
}

```

A continued method chain is one level in, and text inside a template literal is left alone:

```ts
import { formatTypeScript } from 'smaltkit/pretty';

console.log(formatTypeScript("table('sales')\n.filter(col('amount').gt(0))\n.head(5);\nconst sql = `\n    SELECT 1\n`;", { indent: 4 }));
```

```text
table('sales')
    .filter(col('amount').gt(0))
    .head(5);
const sql = `
    SELECT 1
`;

```

## Demo

Formatting doesn't change what code does: the same text, line for line, apart from the leading spaces.

```ts
import { formatTypeScript } from 'smaltkit/pretty';

const code = 'if (ok) {\n      run();   \n\n\n}';
const out = formatTypeScript(code);
console.log(out);
console.log(out.split('\n').map((l) => l.trim()).join('') === code.split('\n').map((l) => l.trim()).join(''));
```

```text
if (ok) {
  run();

}

true
```

## See also

- [`formatJson`](./formatJson): lay out JSON.
