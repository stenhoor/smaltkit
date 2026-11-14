# highlightTypeScript

<!-- api:start -->

```ts
import { highlightTypeScript } from 'smaltkit/editor';
function highlightTypeScript(text: string): string;
```

HTML for the editor's highlight layer: TypeScript, with SQL in sql`…` and exec`…` and Cypher in cypher`…` highlighted.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | TypeScript. |

## Returns

`string`: The HTML, with the text escaped, ending with a newline.

<!-- api:end -->

## Examples

```ts
import { highlightTypeScript } from 'smaltkit/editor';

console.log(highlightTypeScript("const n: number = await sql`SELECT 1`;"));
```

```text
<span class="sk-tk-k">const</span> n<span class="sk-tk-o">:</span> number <span class="sk-tk-o">=</span> <span class="sk-tk-k">await</span> <span class="sk-tk-f">sql</span><span class="sk-tk-tpl-sql">`</span><span class="sk-tk-k">SELECT</span> <span class="sk-tk-n">1</span><span class="sk-tk-tpl-sql">`</span>;

```

## See also

- [`typescriptLanguage`](../editor#typescriptLanguage): the editor's TypeScript.
- [`highlight`](../sql/highlight): SQL's.
