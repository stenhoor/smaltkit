import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markdown, markdownInline } from 'smaltkit/markdown';
import * as kit from 'smaltkit';

test('headings, paragraphs (lines join), bold, italic, code and links', () => {
  assert.equal(markdown('# Regional revenue\nWeekly ETL from the **raw** feed\ninto `orders_clean`, *daily*.'),
    '<h1>Regional revenue</h1><p>Weekly ETL from the <strong>raw</strong> feed into <code>orders_clean</code>, <em>daily</em>.</p>');
  assert.equal(markdownInline('[docs](https://smaltdb.dev) and __strong__ and _em_'),
    '<a href="https://smaltdb.dev" target="_blank" rel="noopener">docs</a> and <strong>strong</strong> and <em>em</em>');
});

test('a heading offset shifts levels, capped at h6 (a text box under a page title)', () => {
  assert.equal(markdown('## Title\nWrite here. Use {0} to show the first value.', { headingOffset: 1 }),
    '<h3>Title</h3><p>Write here. Use {0} to show the first value.</p>');
  assert.equal(markdown('###### deep', { headingOffset: 2 }), '<h6>deep</h6>');
});

test('everything is escaped: raw HTML shows as text, only http(s) links become links', () => {
  assert.equal(markdown('<script>alert(1)</script> & "x"'), '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;</p>');
  assert.equal(markdownInline('[x](javascript:alert(1))'), '[x](javascript:alert(1))');
  // A quote in a URL stays escaped inside the attribute: it can't end it.
  assert.equal(markdownInline('[x](https://a.org/"onmouseover=1)'), '<a href="https://a.org/&quot;onmouseover=1" target="_blank" rel="noopener">x</a>');
  assert.equal(markdownInline('[**see** a_b_c](https://a.org/a_b_c*d*)'), '<a href="https://a.org/a_b_c*d*" target="_blank" rel="noopener"><strong>see</strong> a_b_c</a>');
});

test('code spans keep their text literal', () => {
  assert.equal(markdownInline('`**not bold** <b>`'), '<code>**not bold** &lt;b&gt;</code>');
  assert.equal(markdownInline('``a ` b``'), '<code>a ` b</code>');
  assert.equal(markdownInline('2 * 3 * 4'), '2 * 3 * 4', 'spaced asterisks are not emphasis');
  assert.equal(markdownInline('snake_case_name'), 'snake_case_name');
});

test('lists, numbered lists from their start, continuation lines', () => {
  assert.equal(markdown('- one\n- two\n  more\n* three'), '<ul><li>one</li><li>two more</li><li>three</li></ul>');
  assert.equal(markdown('3. c\n4. d'), '<ol start="3"><li>c</li><li>d</li></ol>');
  assert.equal(markdown('1. a\n- b'), '<ol><li>a</li></ol><ul><li>b</li></ul>');
});

test('fenced code blocks, quotes and rules', () => {
  assert.equal(markdown('```sql\nSELECT *\n  FROM t -- <x>\n```'), '<pre><code class="language-sql">SELECT *\n  FROM t -- &lt;x&gt;</code></pre>');
  assert.equal(markdown('> a\n> **b**\n\nafter'), '<blockquote><p>a <strong>b</strong></p></blockquote><p>after</p>');
  assert.equal(markdown('above\n\n---\n\nbelow'), '<p>above</p><hr><p>below</p>');
});

test('pipe tables, with alignment', () => {
  assert.equal(markdown('| region | revenue |\n|---|---:|\n| north | 79.5 |\n| `east` | 42 |'),
    '<table><thead><tr><th>region</th><th style="text-align:right">revenue</th></tr></thead>'
    + '<tbody><tr><td>north</td><td style="text-align:right">79.5</td></tr><tr><td><code>east</code></td><td style="text-align:right">42</td></tr></tbody></table>');
});

test('the root re-exports it', () => {
  assert.equal(kit.markdown, markdown);
});
