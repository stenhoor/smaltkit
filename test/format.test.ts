import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatter, formatDate, axisFormatter, dateParts } from 'smaltkit/format';

test('number formats', () => {
  assert.equal(formatter({ currency: 'USD', decimals: 0 }, 'number', 'en-US')(1234.5), '$1,235');
  assert.equal(formatter('percent', 'number', 'en-US')(0.1234), '12.3%');
  assert.equal(formatter('integer', 'number', 'en-US')(1234.56), '1,235');
  assert.equal(formatter('$#,0.00', 'number', 'en-US')(1234.5), '$1,234.50');
  assert.equal(formatter(undefined, 'number', 'en-US')(null), '(Blank)');
  assert.equal(axisFormatter(undefined, 'en-US')(1500000), '1.5M');
  assert.equal(formatter(undefined, 'text')('Tea'), 'Tea');
});

test('date formats do not shift time zones', () => {
  assert.equal(formatDate('2025-01-01', 'MMM YYYY'), 'Jan 2025');
  assert.equal(formatDate('2025-03', 'MMM YYYY'), 'Mar 2025');
  assert.equal(formatDate('2025-08-09 13:05:00', 'YYYY-MM-DD HH:mm'), '2025-08-09 13:05');
  assert.equal(formatDate('2025-08-09', 'Q'), '3');
  assert.equal(formatter('month')('2025-11'), 'Nov 2025');
  assert.equal(dateParts('not a date'), null);
});
