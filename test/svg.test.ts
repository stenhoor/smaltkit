import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceTicks, linear, band, esc, seqColor, toNum } from 'smaltkit/svg';

test('nice ticks', () => {
  assert.deepEqual(niceTicks(0, 97, 5).ticks, [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(niceTicks(-3, 12, 4).ticks, [-5, 0, 5, 10, 15]);
});

test('scales', () => {
  const y = linear(0, 100, 200, 0);
  assert.equal(y(0), 200);
  assert.equal(y(100), 0);
  const x = band(4, 0, 100, 0);
  assert.equal(x.bandwidth, 25);
  assert.equal(x(2), 50);
});

test('helpers', () => {
  assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  assert.match(seqColor(0.5), /var\(--sk-seq-hi\)/);
  assert.equal(toNum('12.5'), 12.5);
  assert.ok(Number.isNaN(toNum(null)));
});
