import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as charts from 'smaltkit/charts';
import { chartData, squarify, type ChartColumn, type ChartContext } from 'smaltkit/charts';
import { tableView, matrixView } from 'smaltkit/table';
import type { Value } from 'smaltkit/format';

function col(key: string, role: string, kind: ChartColumn['kind'], values: Value[]): ChartColumn {
  return { key, role, label: key, kind, values, type: kind === 'measure' ? 'number' : 'text', fmt: (v) => String(v ?? '') };
}

function ctx(columns: ChartColumn[], options: Record<string, unknown> = {}, selected: (r: number) => boolean | null = () => null): ChartContext {
  const rows = columns[0]?.values.length ?? 0;
  return { el: { innerHTML: '' }, width: 400, height: 240, options, data: chartData(columns, rows), extra: {}, palette: 12, selected };
}

const cats = ['Tea', 'Coffee', 'Cocoa'];
const revenue = [120, 340, 45];

test('chartData groups columns by kind and role', () => {
  const d = chartData([col('c', 'category', 'dimension', cats), col('v', 'values', 'measure', revenue)], 3);
  assert.equal(d.dims.length, 1);
  assert.equal(d.measures.length, 1);
  assert.equal(d.role('values')[0]!.key, 'v');
});

test('every chart renders one mark per row, tagged with data-row', () => {
  const renderers = {
    barChart: 'category', columnChart: 'category', lineChart: 'category', areaChart: 'category',
    pieChart: 'category', donutChart: 'category', funnelChart: 'category', treemapChart: 'category',
    waterfallChart: 'category', heatmapChart: 'rows',
  } as const;
  for (const [name, role] of Object.entries(renderers)) {
    const columns = [col('c', role, 'dimension', cats), col('v', 'values', 'measure', revenue)];
    if (role === 'rows') columns.push(col('k', 'columns', 'dimension', ['A', 'A', 'B']));
    const c = ctx(columns);
    (charts as unknown as Record<string, (c: ChartContext) => void>)[name]!(c);
    assert.match(c.el.innerHTML, /^<(div|svg) class="sk-/, name);
    for (const r of [0, 1, 2]) assert.match(c.el.innerHTML, new RegExp(`data-row="${r}"`), `${name} row ${r}`);
    assert.doesNotMatch(c.el.innerHTML, /NaN|undefined|sb-|\d\.\d{5}/, name);
  }
});

test('selection dims the other marks', () => {
  const c = ctx([col('c', 'category', 'dimension', cats), col('v', 'values', 'measure', revenue)], {}, (r) => r === 1);
  charts.columnChart(c);
  assert.equal((c.el.innerHTML.match(/sk-dim/g) ?? []).length, 2);
  assert.equal((c.el.innerHTML.match(/sk-on/g) ?? []).length, 1);
});

test('series, scatter, KPI and gauge', () => {
  const c = ctx([
    col('c', 'category', 'dimension', ['Q1', 'Q1', 'Q2', 'Q2']),
    col('s', 'series', 'dimension', ['Tea', 'Coffee', 'Tea', 'Coffee']),
    col('v', 'values', 'measure', [1, 2, 3, 4]),
  ], { stack: 'stacked' });
  charts.columnChart(c);
  assert.match(c.el.innerHTML, /sk-legend-item sk-c1/);

  const s = ctx([col('d', 'details', 'dimension', cats), col('x', 'x', 'measure', [1, 2, 3]), col('y', 'y', 'measure', revenue)]);
  charts.scatterChart(s);
  assert.equal((s.el.innerHTML.match(/sk-dot/g) ?? []).length, 3);

  const k = ctx([col('v', 'values', 'measure', [1234])]);
  charts.kpiCard(k);
  assert.match(k.el.innerHTML, /sk-kpi-value[^>]*>1234</);

  const g = ctx([col('v', 'values', 'measure', [40]), col('m', 'max', 'measure', [100])]);
  charts.gaugeChart(g);
  assert.match(g.el.innerHTML, /sk-gauge-track/);
});

test('empty data shows a message instead of a chart', () => {
  const c = ctx([col('c', 'category', 'dimension', []), col('v', 'values', 'measure', [])]);
  charts.barChart(c);
  assert.match(c.el.innerHTML, /sk-empty/);
});

test('treemap layout fills the rectangle', () => {
  const rects = squarify([6, 6, 4, 3, 2, 1].map((v, i) => ({ i, v })), { x: 0, y: 0, w: 600, h: 400 });
  const area = rects.reduce((a, r) => a + r.w * r.h, 0);
  assert.ok(Math.abs(area - 600 * 400) < 1);
  for (const r of rects) assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 600 + 1e-6 && r.y + r.h <= 400 + 1e-6);
});

test('table and matrix', () => {
  const t = ctx([col('c', 'columns', 'dimension', cats), col('v', 'values', 'measure', revenue)], { format: 'bars' });
  tableView(t);
  assert.match(t.el.innerHTML, /<table class="sk-table/);
  assert.equal((t.el.innerHTML.match(/data-bar/g) ?? []).length, 3);

  const m = ctx([
    col('r', 'rows', 'dimension', ['EU', 'EU', 'US']),
    col('k', 'columns', 'dimension', ['Tea', 'Coffee', 'Tea']),
    col('v', 'values', 'measure', [1, 2, 3]),
  ]);
  matrixView(m);
  assert.match(m.el.innerHTML, /sk-matrix/);
  assert.match(m.el.innerHTML, /sk-rowhead[^>]*>EU</);
});
