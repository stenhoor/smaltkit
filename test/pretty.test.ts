import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatJson, formatTypeScript } from 'smaltkit/pretty';
import * as kit from 'smaltkit';

test('formatJson: short values stay on one line', () => {
  assert.equal(formatJson({ a: 1, b: [1, 2, 3], c: 'x' }), '{ "a": 1, "b": [1, 2, 3], "c": "x" }');
  assert.equal(formatJson([]), '[]');
  assert.equal(formatJson({}), '{}');
  assert.equal(formatJson(null), 'null');
  assert.equal(formatJson('a"b'), '"a\\"b"');
});

test('formatJson: what does not fit breaks one item per line, and inner values that fit stay flat', () => {
  const plan = { kind: 'select', from: { kind: 'scan', table: 'orders' }, columns: ['id', 'customer_id', 'total'] };
  assert.equal(
    formatJson(plan, { width: 60 }),
    ['{', '  "kind": "select",', '  "from": { "kind": "scan", "table": "orders" },', '  "columns": ["id", "customer_id", "total"]', '}'].join('\n'),
  );
  assert.equal(formatJson([[1, 2], [3, 4]], { width: 9 }), '[\n  [1, 2],\n  [3, 4]\n]');
  // The comma after an item counts: "  [1, 2]," is 9 wide, so at 8 the first item breaks too.
  assert.equal(formatJson([[1, 2], [3, 4]], { width: 8 }), '[\n  [\n    1,\n    2\n  ],\n  [3, 4]\n]');
  assert.equal(formatJson({ a: [1, 2] }, { width: 6, indent: 4 }), '{\n    "a": [\n        1,\n        2\n    ]\n}');
});

test('formatJson: values JSON.stringify would drop or change', () => {
  assert.equal(formatJson({ a: undefined, f: () => 1, b: 2 }), '{ "b": 2 }');
  assert.equal(formatJson([undefined, () => 1]), '[null, null]');
  assert.equal(formatJson([NaN, Infinity]), '[null, null]');
  assert.equal(formatJson(12345678901234567890n), '12345678901234567890');
  assert.equal(formatJson(new Date(0)), '"1970-01-01T00:00:00.000Z"');
  assert.equal(formatJson(new Float64Array([1.5, 2])), '[1.5, 2]');
  assert.equal(formatJson(new Map([['k', 1]])), '{ "k": 1 }');
  assert.equal(formatJson(new Set([1, 2])), '[1, 2]');
  assert.equal(formatJson(undefined), 'undefined');
});

test('formatJson: the same object twice is fine, a cycle is an error', () => {
  const shared = { x: 1 };
  assert.equal(formatJson([shared, shared]), '[{ "x": 1 }, { "x": 1 }]');
  const loop: Record<string, unknown> = {};
  loop.self = loop;
  assert.throws(() => formatJson(loop), /circular/);
});

test('formatTypeScript: re-indents by bracket depth, trims, and collapses blank lines', () => {
  const src = ['const sales = table("orders")', '.filter(col("total").gt(100))', '   .select("id", "total");', '', '', '', 'if (x) {', 'show(sales,   "big")', '     }  '].join('\n');
  assert.equal(
    formatTypeScript(src),
    ['const sales = table("orders")', '  .filter(col("total").gt(100))', '  .select("id", "total");', '', 'if (x) {', '  show(sales,   "big")', '}', ''].join('\n'),
  );
});

test('formatTypeScript: closers and nesting', () => {
  const src = 'const a = {\nb: [\n1,\n2,\n],\nc: f(\nx,\n),\n};';
  assert.equal(formatTypeScript(src), 'const a = {\n  b: [\n    1,\n    2,\n  ],\n  c: f(\n    x,\n  ),\n};\n');
  assert.equal(formatTypeScript('}) ;\n'), '}) ;\n', 'never goes below zero');
  assert.equal(formatTypeScript(''), '');
});

test('formatTypeScript: brackets in strings, comments and regular expressions do not count', () => {
  const src = ['const s = "{(";', "const t = '}';", 'const r = /[{(]/g;', 'const d = a / b / c;', '// {', '/* ( */', 'f();'].join('\n');
  assert.equal(formatTypeScript(src), src + '\n');
  assert.equal(formatTypeScript('if (ok) return /}/.test(s);\nx();'), 'if (ok) return /}/.test(s);\nx();\n');
});

test('formatTypeScript: template literals and block comments keep their lines exactly', () => {
  const src = ['const q = `', '   select {', '     ${ f({ a: 1 }) }', '`;', 'g();', '/*', '      kept  ', '*/', 'h();'].join('\n');
  assert.equal(formatTypeScript(src), ['const q = `', '   select {', '     ${ f({ a: 1 }) }', '`;', 'g();', '/*', '      kept', '*/', 'h();', ''].join('\n'));
});

test('formatTypeScript: continued operators go one level in; spread is not a continuation', () => {
  const src = 'const total = a\n+ b\n?? c;\nconst o = {\n...rest,\n};\n++i;\n--j;\n/** doc */\nk();';
  assert.equal(formatTypeScript(src, { indent: 4 }), 'const total = a\n    + b\n    ?? c;\nconst o = {\n    ...rest,\n};\n++i;\n--j;\n/** doc */\nk();\n');
});

test('formatTypeScript only changes whitespace at line starts and ends', () => {
  const src = '  x  =  1 ;\n\ty( 2 ,3 )\n';
  const out = formatTypeScript(src);
  assert.deepEqual(out.split('\n').map((l) => l.trim()), src.split('\n').map((l) => l.trim()));
});

test('re-exported from smaltkit', () => {
  assert.equal(kit.formatJson, formatJson);
  assert.equal(kit.formatTypeScript, formatTypeScript);
});
