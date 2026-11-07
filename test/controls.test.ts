import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceControl, rangeControl, sameValue, searchControl, type ControlElement } from 'smaltkit/controls';
import type { Value } from 'smaltkit/format';

/** An element stand-in: markup only (no DOM in Node), with no-op queries. */
function el(): ControlElement & { innerHTML: string } {
  return { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] as unknown as NodeListOf<Element> } as unknown as ControlElement & { innerHTML: string };
}

test('list: checkboxes, selection, clear, values kept when filtered out', () => {
  const e = el();
  choiceControl(e, 'list', { values: ['Tea', 'Coffee'], selected: ['Cocoa'], onChange() {} });
  assert.match(e.innerHTML, /^<div class="sk-control sk-list">/);
  assert.equal((e.innerHTML.match(/type="checkbox"/g) ?? []).length, 3);
  assert.match(e.innerHTML, /data-i="2" checked> <span>Cocoa<\/span>/);
  assert.match(e.innerHTML, /class="sk-clear"/);
});

test('list with single: radios in a named group; buttons and dropdown', () => {
  const e = el();
  choiceControl(e, 'list', { values: [1, 2], selected: null, single: true, name: 'slicer-1', onChange() {} });
  assert.equal((e.innerHTML.match(/type="radio" name="slicer-1"/g) ?? []).length, 2);
  assert.doesNotMatch(e.innerHTML, /sk-clear/);
  choiceControl(e, 'buttons', { values: ['<b>', 'x'], selected: ['x'], onChange() {} });
  assert.match(e.innerHTML, /<button type="button" class="sk-chip" aria-pressed="false" data-i="0">&lt;b&gt;<\/button>/);
  assert.match(e.innerHTML, /class="sk-chip sk-on" aria-pressed="true"/);
  choiceControl(e, 'dropdown', { values: ['a', 'b', 'c'], selected: ['a', 'b'], format: (v: Value) => `#${v}`, onChange() {} });
  assert.match(e.innerHTML, /<summary class="sk-input">2 selected<\/summary>/);
  assert.match(e.innerHTML, /> #c<\/label>/);
});

test('range and search', () => {
  const e = el();
  rangeControl(e, { kind: 'date', min: '2024-01-01 00:00', max: '2025-12-31', value: [null, '2025-06-30'], onChange() {} });
  assert.match(e.innerHTML, /type="date" data-i="0" aria-label="From" value="" placeholder="2024-01-01" min="2024-01-01" max="2025-12-31"/);
  assert.match(e.innerHTML, /data-i="1" aria-label="To" value="2025-06-30"/);
  searchControl(e, { value: 'te"a', onChange() {} });
  assert.match(e.innerHTML, /type="search" placeholder="Search…" value="te&quot;a"/);
});

test('values compare across number and bigint', () => {
  assert.ok(sameValue(3, 3n));
  assert.ok(!sameValue(null, 0));
  assert.ok(!sameValue('3', 4n));
});
