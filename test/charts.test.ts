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

test('axis options: continuous dates, log scale, fixed ends, reference lines, titles', () => {
  // Uneven dates: the gap between Jan and Jun is five times the gap between Jun and Jul.
  const dates = col('d', 'category', 'dimension', ['2025-07-01', '2025-01-01', '2025-06-01']);
  dates.type = 'date';
  const v = col('v', 'values', 'measure', [30, 10, 20]);
  const c = ctx([dates, v], { xAxis: 'continuous' });
  charts.lineChart(c);
  const xs = [...c.el.innerHTML.matchAll(/<circle[^>]*data-row="(\d)" cx="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(xs.map(([r]) => r), [1, 2, 0], 'sorted by date');
  const [a, b, d] = xs.map(([, x]) => x);
  assert.ok(Math.abs((b! - a!) / (d! - b!) - 151 / 30) < 0.05, `positions follow the dates: ${xs}`);
  assert.match(c.el.innerHTML, />Mar 2025</, 'calendar ticks');
  // Categories that aren't dates or numbers stay as bands.
  const bands = ctx([col('c', 'category', 'dimension', cats), col('v', 'values', 'measure', revenue)], { xAxis: 'continuous' });
  charts.lineChart(bands);
  assert.match(bands.el.innerHTML, />Coffee</);

  const big = col('v', 'values', 'measure', [5, 500, 50000]);
  const lg = ctx([col('c', 'category', 'dimension', cats), big], { yScale: 'log', yTitle: 'Revenue', xTitle: 'Product' });
  charts.columnChart(lg);
  for (const t of ['1', '10', '100', '1K', '10K', '100K']) assert.match(lg.el.innerHTML, new RegExp(`class="sk-tick"[^>]*>${t}<`), `log tick ${t}`);
  assert.match(lg.el.innerHTML, /class="sk-axis-title" transform="[^"]*rotate\(-90\)"[^>]*>Revenue</);
  assert.match(lg.el.innerHTML, /class="sk-axis-title" x="[^"]*"[^>]*>Product</);

  const fixed = ctx([col('c', 'category', 'dimension', cats), col('v', 'values', 'measure', revenue)], { yMin: 100, yMax: 200, refLines: [{ stat: 'avg' }, { value: 150, label: 'Target', tone: 'good' }] });
  charts.columnChart(fixed);
  assert.doesNotMatch(fixed.el.innerHTML, /class="sk-tick"[^>]*>(0|50|250)</, 'ticks inside the fixed ends');
  assert.match(fixed.el.innerHTML, /<g clip-path="url\(#sk-clip-\d+\)"><rect/, 'marks are clipped to the plot');
  assert.match(fixed.el.innerHTML, /class="sk-ref sk-tone-good"[^>]*\/><text class="sk-ref-label sk-tone-good"[^>]*>Target: 150</);
});

test('small multiples: a panel per value, one scale, rows kept', () => {
  const region = col('g', 'multiples', 'dimension', ['EU', 'EU', 'US', 'US']);
  const product = col('c', 'category', 'dimension', ['Tea', 'Coffee', 'Tea', 'Coffee']);
  const v = col('v', 'values', 'measure', [10, 20, 30, 400]);
  const c = ctx([region, product, v], { legend: 'none' });
  charts.columnChart(c);
  const panels = c.el.innerHTML.match(/<div class="sk-panel">/g) ?? [];
  assert.equal(panels.length, 2);
  assert.match(c.el.innerHTML, /sk-panel-title">EU</);
  for (const r of [0, 1, 2, 3]) assert.match(c.el.innerHTML, new RegExp(`data-row="${r}"`));
  // The same value scale in both panels: the EU panel's ticks reach 400 too.
  const eu = c.el.innerHTML.split('sk-panel-title">US')[0]!;
  assert.match(eu, /class="sk-tick"[^>]*>400</);
});

test('stepped matrix: parents with subtotals, collapse, tabular layout', () => {
  const region = col('r', 'rows', 'dimension', ['EU', 'EU', 'EU', 'US']);
  const country = col('c', 'rows', 'dimension', ['DE', 'DE', 'FR', 'NY']);
  const product = col('k', 'columns', 'dimension', ['Tea', 'Coffee', 'Tea', 'Tea']);
  const value = col('v', 'values', 'measure', [1, 2, 3, 4]);
  const sub = chartData([col('r', 'rows', 'dimension', ['EU', 'EU', 'US']), col('k', 'columns', 'dimension', ['Tea', 'Coffee', 'Tea']), col('v', 'values', 'measure', [4, 2, 4])], 3);
  const subRt = chartData([col('r', 'rows', 'dimension', ['EU', 'US']), col('v', 'values', 'measure', [6, 4])], 2);
  const rowTotals = chartData([col('r', 'rows', 'dimension', ['EU', 'EU', 'US']), col('c', 'rows', 'dimension', ['DE', 'FR', 'NY']), col('v', 'values', 'measure', [3, 3, 4])], 3);
  const m = { ...ctx([region, country, product, value]), extra: { 'sub:1': sub, 'sub:1:rt': subRt, rowTotals } };
  matrixView(m);
  const html = m.el.innerHTML;
  assert.match(html, /sk-stepped/);
  assert.match(html, /<th>r › c<\/th>/, 'one header column, labels joined');
  const parents = html.match(/<tr class="sk-parent">.*?<\/tr>/g)!;
  assert.equal(parents.length, 2, 'EU and US');
  assert.match(parents[0]!, /aria-expanded="true"[^>]*>▾<\/button>EU<\/th><td class="sk-num sk-subtotal">4<\/td><td class="sk-num sk-subtotal">2<\/td><td class="sk-num sk-subtotal sk-total">6<\/td>/);
  assert.match(html, /sk-level-1" style="--level:1">FR</);
  assert.equal((html.match(/data-row=/g) ?? []).length, 4, 'only leaves are marks');
  // Sorted by value, a parent's rows still come together under it.
  const order = [3, 0, 2, 1];
  const pick = (c: ChartColumn) => ({ ...c, values: order.map((i) => c.values[i]!) });
  const v2 = { ...ctx([region, country, product, value].map(pick)), extra: { 'sub:1': sub } };
  matrixView(v2);
  assert.equal((v2.el.innerHTML.match(/sk-parent/g) ?? []).length, 2);
  assert.deepEqual([...v2.el.innerHTML.matchAll(/sk-level-\d"[^>]*>(?:<button[^>]*>.<\/button>)?(\w+)</g)].map((m) => m[1]), ['US', 'NY', 'EU', 'DE', 'FR']);
  // Start collapsed: only the parents show.
  const c = { ...ctx([region, country, product, value], { collapsed: true }), extra: { 'sub:1': sub } };
  matrixView(c);
  assert.equal((c.el.innerHTML.match(/<tr/g) ?? []).length - 2, 2, 'two parent rows under the two header rows');
  assert.doesNotMatch(c.el.innerHTML, /data-row=/);
  // Without subtotals the parent cells are empty; tabular keeps a column per level.
  const n = { ...ctx([region, country, product, value], { subtotals: false }), extra: { 'sub:1': sub } };
  matrixView(n);
  assert.match(n.el.innerHTML, /EU<\/th><td class="sk-num sk-subtotal"><\/td>/);
  const t = ctx([region, country, product, value], { layout: 'tabular' });
  matrixView(t);
  assert.doesNotMatch(t.el.innerHTML, /sk-parent|sk-stepped/);
  assert.match(t.el.innerHTML, /<th>r<\/th><th>c<\/th>/);
});

test('conditional formatting: tone, fill and icon in tables, matrices and KPI cards', () => {
  const values = col('v', 'values', 'measure', revenue);
  // Above 100 is good (filled), below 100 bad with a down arrow.
  const cellFormat = (c: ChartColumn, row: number) => {
    const v = Number(c.values[row]);
    return v > 100 ? { tone: 'good' as const, fill: true } : { tone: 'bad' as const, icon: 'down' as const };
  };
  const t = { ...ctx([col('c', 'columns', 'dimension', cats), values], { format: 'heat' }), cellFormat };
  tableView(t);
  const cells = t.el.innerHTML.match(/<td class="sk-num[^"]*"[^>]*>.*?<\/td>/g)!;
  assert.equal(cells.length, 3);
  assert.match(cells[0]!, /class="sk-num sk-tone-good sk-fill">120</, 'filled: no heat style, which would hide the fill');
  assert.match(cells[2]!, /class="sk-num sk-tone-bad" style="background:[^"]*"><svg class="sk-cf-icon"[^>]*><path d="M12 21/, 'text tone keeps the heat colour; down arrow first');
  // Dimensions are never formatted.
  assert.doesNotMatch(t.el.innerHTML, /<td class=" ?sk-tone/);

  const m = { ...ctx([col('r', 'rows', 'dimension', ['EU', 'EU', 'US']), col('k', 'columns', 'dimension', ['Tea', 'Coffee', 'Tea']), col('v', 'values', 'measure', [50, 150, 250])]), cellFormat };
  matrixView(m);
  assert.equal((m.el.innerHTML.match(/sk-tone-good sk-fill/g) ?? []).length, 2);
  assert.equal((m.el.innerHTML.match(/sk-tone-bad/g) ?? []).length, 1);

  const k = { ...ctx([col('v', 'values', 'measure', [42])]), cellFormat };
  charts.kpiCard(k);
  assert.match(k.el.innerHTML, /<div class="sk-kpi-value sk-tone-bad"><svg class="sk-cf-icon"/);
  // Without a hook, nothing changes.
  const plain = ctx([col('v', 'values', 'measure', [42])]);
  charts.kpiCard(plain);
  assert.match(plain.el.innerHTML, /<div class="sk-kpi-value">42</);
});
