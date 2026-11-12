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

test('download-safe file names', async () => {
  const { fileName } = await import('smaltkit/dom');
  assert.equal(fileName('Sales Report 2025!'), 'sales-report-2025');
  assert.equal(fileName('***'), 'download');
  assert.equal(fileName('', 'report'), 'report');
});

test('log, value and time scales', async () => {
  const { logScale, valueScale, rescale, timeTicks, timeValue } = await import('smaltkit/svg');
  const l = logScale(3, 4500, 0, 300);
  assert.deepEqual(l.domain, [1, 10000]);
  assert.deepEqual(l.ticks, [1, 10, 100, 1000, 10000]);
  assert.equal(l(100), 150);
  assert.equal(l(0), 0, 'zero and below sit at the start');
  assert.deepEqual(logScale(2, 50, 0, 1).ticks, [1, 2, 5, 10, 20, 50, 100], 'few decades: 1, 2, 5');
  // Fixed ends keep the nice ticks between them; a minimum lifts the zero baseline.
  const v = valueScale(120, 480, 0, 1, { min: 100, max: 450 });
  assert.deepEqual(v.domain, [100, 450]);
  assert.ok(v.ticks.every((t) => t >= 100 && t <= 450) && v.ticks.includes(200));
  assert.deepEqual(valueScale(120, 480, 0, 1).domain[0], 0);
  assert.equal(valueScale(-5, 10, 0, 1, { log: true }).log, undefined, 'log needs positive values');
  const r = rescale(valueScale(5, 900, 0, 1, { log: true }), 200, 0);
  assert.ok(r.log && r(1) === 200 && r(1000) === 0);
  assert.equal(timeValue('2025-03-01'), Date.UTC(2025, 2, 1));
  assert.equal(timeValue('2025-03'), Date.UTC(2025, 2, 1));
  assert.ok(Number.isNaN(timeValue('Q1')));
  const months = timeTicks(Date.UTC(2025, 0, 15), Date.UTC(2025, 5, 20), 6);
  assert.equal(months.pattern, 'MMM YYYY');
  assert.deepEqual(months.ticks.map((t) => new Date(t).toISOString().slice(0, 10)), ['2025-02-01', '2025-03-01', '2025-04-01', '2025-05-01', '2025-06-01']);
  const years = timeTicks(Date.UTC(2015, 0, 1), Date.UTC(2025, 0, 1), 5);
  assert.equal(years.pattern, 'YYYY');
  assert.deepEqual(years.ticks.map((t) => new Date(t).getUTCFullYear()), [2015, 2020, 2025]);
});
