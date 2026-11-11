// Runs against the built package (dist/). The Editor class needs a DOM; these tests cover the languages and SQL text
// utilities, which don't.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aliasesIn, formatSql, highlight, quoteIdent, quoteLiteral, returnsRows, scanParams, splitStatements, statementAt,
  tableNameFrom, tokenize, wordBefore,
} from 'smaltkit/sql';
import { completeSql, Editor, gutterHtml, highlightTypeScript, markedHtml, sqlLanguage, typescriptLanguage, type EditorSchema } from 'smaltkit/editor';
import * as kit from 'smaltkit';

/** The text a highlight layer shows: tags removed, entities decoded. */
const shown = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

const tsSamples = [
  "import { cell, sql } from 'smaltnb';\ncell('raw', { lang: 'sql' });\nexport const raw = sql<{ id: number }>`SELECT * FROM t WHERE x > ${a + 1} AND y = ${`n${b}`}`;\n",
  'const s = "a ${not} b" + \'it\\\'s\'; // ${ comment }\n/* block ` */ const t = `plain ${x} text`;',
  'await exec`DELETE FROM t WHERE id IN (${ids.map((i) => i * 2)})`;\nclass A<T> extends B { m(): T[] { return [] } }',
  'const unterminated = `abc ${x',
  "const regexish = a / b / c; const n = 0x1F + 1_000n + .5e3;",
];

test('the TypeScript highlight layer shows exactly the text, so it lines up with the textarea', () => {
  for (const s of tsSamples) assert.equal(shown(highlightTypeScript(s)), s + '\n', s);
});

test('the SQL highlight layer shows exactly the text', () => {
  const s = "SELECT a, 'it''s' AS \"q\", x'00ff', ?1, :name -- note\nFROM [t] /* c */ WHERE b >= 1.5e3;";
  assert.equal(shown(highlight(s)), s + '\n');
  assert.equal(tokenize(s).map((t) => t.text).join(''), s);
});

test('SQL in sql`…` and exec`…` templates is highlighted as SQL; ${} is TypeScript; other templates are strings', () => {
  const html = highlightTypeScript('const q = sql<Row>`SELECT id FROM t WHERE x = ${limit}`;');
  assert.match(html, /<span class="sk-tk-k">SELECT<\/span>/);
  assert.match(html, /<span class="sk-tk-interp">\$\{limit\}<\/span>/);
  assert.match(html, /<span class="sk-tk-f">sql<\/span>/);
  const plain = highlightTypeScript('const s = `SELECT ${x}`;');
  assert.doesNotMatch(plain, /sk-tk-k">SELECT/);
  assert.match(plain, /<span class="sk-tk-s">SELECT <\/span>/);
  assert.match(highlightTypeScript('await exec`DROP TABLE t`'), /sk-tk-k">DROP/);
});

test('TypeScript keywords, types, calls, numbers, strings and comments', () => {
  const html = highlightTypeScript("export const n: Order = col('qty').gt(0); // done");
  assert.match(html, /sk-tk-k">export</);
  assert.match(html, /sk-tk-t">Order</);
  assert.match(html, /sk-tk-f">col</);
  assert.match(html, /sk-tk-s">&#39;qty&#39;</);
  assert.match(html, /sk-tk-n">0</);
  assert.match(html, /sk-tk-c">\/\/ done</);
  assert.doesNotMatch(highlightTypeScript('a.type = 1'), /sk-tk-k">type/, 'a property named like a keyword');
});

test('languages: SQL has statements and completion; TypeScript has // comments and no statements', () => {
  assert.equal(sqlLanguage.lineComment, '--');
  assert.equal(typescriptLanguage.lineComment, '//');
  assert.ok(sqlLanguage.statementAt && sqlLanguage.complete);
  assert.equal(typescriptLanguage.statementAt, undefined);
});

test('SQL completion: columns of a qualifier through its alias, then tables, functions and keywords', () => {
  const cols = Object.assign([{ name: 'region', type: 'TEXT' }, { name: 'qty', type: 'INTEGER' }], { kind: 'table' });
  const schema: EditorSchema = { names: new Set(['orders']), tables: new Map([['orders', cols]]) };
  const text = 'SELECT o.re FROM orders o';
  const r = completeSql(text, 'SELECT o.re'.length, schema, false);
  assert.deepEqual(r.items.map((i) => i.label), ['region']);
  assert.equal(r.start, 'SELECT o.'.length);
  const all = completeSql('SELECT su', 9, schema, false).items.map((i) => `${i.kind}:${i.label}`);
  assert.ok(all.includes('fn:sum'));
});

test('splitStatements and statementAt, with semicolons inside trigger bodies', () => {
  const s = 'SELECT 1; CREATE TRIGGER t AFTER INSERT ON a BEGIN UPDATE b SET c = 1; END; SELECT 2';
  assert.deepEqual(splitStatements(s).map((x) => x.sql), ['SELECT 1', 'CREATE TRIGGER t AFTER INSERT ON a BEGIN UPDATE b SET c = 1; END', 'SELECT 2']);
  assert.equal(statementAt(s, s.length)!.sql, 'SELECT 2');
});

test('returnsRows, scanParams and quoting', () => {
  assert.equal(returnsRows('WITH x AS (SELECT 1) SELECT * FROM x'), true);
  assert.equal(returnsRows('WITH x AS (SELECT 1) DELETE FROM t'), false);
  assert.equal(returnsRows('INSERT INTO t VALUES (1) RETURNING id'), true);
  assert.deepEqual(scanParams('SELECT ?, :a, ?5, :a').map((p) => p.label), ['?1', ':a', '?3', '?4', '?5']);
  assert.equal(quoteIdent('order'), '"order"');
  assert.equal(quoteIdent('qty'), 'qty');
  assert.equal(quoteLiteral("it's"), "'it''s'");
  assert.equal(quoteLiteral(new Uint8Array([10])), "x'0a'");
});

test('completion helpers: wordBefore and aliasesIn', () => {
  assert.deepEqual(wordBefore('SELECT o.reg', 12), { word: 'reg', start: 9, qualifier: 'o' });
  assert.deepEqual([...aliasesIn('SELECT * FROM orders AS o JOIN regions r ON 1', new Set(['orders', 'regions']))], [
    ['o', 'orders'], ['orders', 'orders'], ['r', 'regions'], ['regions', 'regions'],
  ]);
});

test('formatSql puts clauses on lines; tableNameFrom makes a safe name', () => {
  assert.equal(formatSql('select a,b from t where x=1 and y=2'), 'SELECT a,\n  b\nFROM t\nWHERE x=1\n  AND y=2\n');
  assert.equal(tableNameFrom('https://x.org/data/2024 Sales.csv'), 't_2024_sales');
});

test('the modules load without a DOM, and the root re-exports them', () => {
  assert.equal(typeof Editor, 'function');
  assert.equal(kit.highlightTypeScript, highlightTypeScript);
  assert.equal(kit.splitStatements, splitStatements);
});

test('warnings: marked in the highlight layer with their messages, the text unchanged', () => {
  const text = "table('t').hed(1);\nconst n: number = 'a';\n";
  const marks = [
    { start: 11, end: 14, cls: 'sk-ed-warn', title: "Property 'hed' does not exist. Did you mean 'head'?" },
    { start: 25, end: 26, cls: 'sk-ed-warn', title: 'Type <string> & "number"' },
    { start: 12, end: 13, cls: 'sk-ed-warn', title: 'overlaps the first: left out' },
  ];
  const html = markedHtml(text, marks, highlightTypeScript);
  assert.equal(shown(html), text + '\n');
  assert.equal(html.match(/<mark /g)?.length, 2);
  assert.match(html, /<mark class="sk-ed-warn" title="Property &#39;hed&#39; does not exist. Did you mean &#39;head&#39;\?">hed<\/mark>/);
  assert.match(html, /title="Type &lt;string&gt; &amp; &quot;number&quot;"/);
  assert.equal(markedHtml(text, [{ start: 5, end: 99, cls: 'x' }], highlightTypeScript), markedHtml(text, [], highlightTypeScript), 'a range past the end is left out');
});

test("warnings: the gutter numbers every line, the warnings' lines marked with their messages", () => {
  const text = 'a.b;\nc.d;\ne.f;';
  const html = gutterHtml(text, 3, [{ start: 2, end: 3, message: 'one' }, { start: 12, end: 13, message: 'two' }, { start: 11, end: 12, message: 'three' }]);
  assert.equal(shown(html), '1\n2\n3\n');
  assert.match(html, /<span class="sk-ed-warnline" title="one">1<\/span>/);
  assert.match(html, /<span class="sk-ed-warnline" title="two\nthree">3<\/span>/);
  assert.equal(gutterHtml(text, 3, []), '1\n2\n3\n');
});
