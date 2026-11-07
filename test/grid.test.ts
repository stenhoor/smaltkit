// Runs against the built package (dist/). The Grid class needs a DOM; these tests cover what doesn't.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportRows, formatValue, Grid, plainValue, sortOrder, type GridRow } from 'smaltkit/grid';
import * as kit from 'smaltkit';

test('formatValue shows values as the grid does; null is NULL', () => {
  assert.equal(formatValue(null), null);
  assert.equal(formatValue(undefined), null);
  assert.equal(formatValue(3), '3');
  assert.equal(formatValue(0.1 + 0.2), '0.3');
  assert.equal(formatValue(12345678901234567890n), '12345678901234567890');
  assert.equal(formatValue(true), 'true');
  assert.equal(formatValue(new Uint8Array([0, 255])), "x'00ff' (2 B)");
  assert.match(formatValue(new Uint8Array(40))!, /…' \(40 B\)$/);
});

test('plainValue is the text copied and exported', () => {
  assert.equal(plainValue(null), '');
  assert.equal(plainValue(new Uint8Array([1, 2])), "x'0102'");
  assert.equal(plainValue('a,b'), 'a,b');
});

const cols = [{ name: 'id', type: 'int' }, 'name', 'note'];
const rows: GridRow[] = [[1, 'Lee, A', null], [2n, 'Kim "K"', 'line\nbreak']];

test('exportRows: CSV quotes what needs quoting; TSV flattens tabs and newlines', () => {
  assert.equal(exportRows('csv', cols, rows), 'id,name,note\n1,"Lee, A",\n2,"Kim ""K""","line\nbreak"\n');
  assert.equal(exportRows('tsv', cols, rows), 'id\tname\tnote\n1\tLee, A\t\n2\tKim "K"\tline break\n');
});

test('exportRows: JSON, NDJSON and SQL INSERTs', () => {
  assert.deepEqual(JSON.parse(exportRows('json', cols, rows)), [
    { id: 1, name: 'Lee, A', note: null },
    { id: 2, name: 'Kim "K"', note: 'line\nbreak' },
  ]);
  assert.equal(exportRows('ndjson', ['a'], [[1], [2]]), '{"a":1}\n{"a":2}\n');
  assert.equal(
    exportRows('sql', ['id', 'my col'], [[1, "it's"], [2, true]], 'my table'),
    `INSERT INTO "my table" (id, "my col") VALUES (1, 'it''s');\nINSERT INTO "my table" (id, "my col") VALUES (2, 1);\n`,
  );
});

test('sortOrder: nulls first, numbers and bigints together, then strings; stable; null when unsorted', () => {
  const r: GridRow[] = [['b'], [2], [null], [10n], ['a'], [2]];
  assert.deepEqual(sortOrder(r, 0, 'asc'), [2, 1, 5, 3, 4, 0]);
  assert.deepEqual(sortOrder(r, 0, 'desc'), [0, 4, 3, 1, 5, 2]);
  assert.equal(sortOrder(r, 0, null), null);
});

test('the module loads without a DOM, and the root re-exports it', () => {
  assert.equal(typeof Grid, 'function');
  assert.equal(kit.exportRows, exportRows);
});
