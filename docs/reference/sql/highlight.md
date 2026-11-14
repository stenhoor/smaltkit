# highlight

<!-- api:start -->

```ts
import { highlight } from 'smaltkit/sql';
function highlight(text: string, names?: Set<string>): string;
```

HTML for the editor's highlight layer: each token in a span classed by its kind (`sk-tk-k` for keywords, `sk-tk-f`
functions, `sk-tk-obj` the database's objects, …).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `text` | `string` | SQL. |
| `names?` | `Set&lt;string>` | Lower-cased names of the database's tables and views, shown as objects. |

## Returns

`string`: The HTML, with the text escaped, ending with a newline.

<!-- api:end -->

## Examples

```ts
import { highlight } from 'smaltkit/sql';

console.log(highlight("SELECT count(*) FROM sales WHERE region = 'North'", new Set(['sales'])));
```

```text
<span class="sk-tk-k">SELECT</span> <span class="sk-tk-f">count</span>(<span class="sk-tk-o">*</span>) <span class="sk-tk-k">FROM</span> <span class="sk-tk-obj">sales</span> <span class="sk-tk-k">WHERE</span> region <span class="sk-tk-o">=</span> <span class="sk-tk-s">'North'</span>

```

## Demo

A highlight layer under a textarea: the same text, coloured, in a `<pre>` behind it.

```ts
import { highlight } from 'smaltkit/sql';

const sql = 'select 1';
console.log(`<pre class="sk-ed-hl" aria-hidden="true">${highlight(sql)}</pre>`);
```

```text
<pre class="sk-ed-hl" aria-hidden="true"><span class="sk-tk-k">select</span> <span class="sk-tk-n">1</span>
</pre>
```

## See also

- [`tokenize`](./tokenize): the tokens it colours.
- [`smaltkit/editor`](../editor): the editor that uses it.
- [`smaltkit/ui.css`](../styles): the `--sk-tk-*` colours.
