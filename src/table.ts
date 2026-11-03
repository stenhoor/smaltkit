// Tables: a flat table (sortable headers, totals row, data bars or heat colours) and a pivot matrix
// (row and column dimensions, row / column / grand totals). HTML, styled by ui.css.
import type { Value } from './format.js';
import type { ChartColumn, ChartContext, ChartData } from './charts.js';
import { esc, seqColor, toNum } from './svg.js';

function rowClass(ctx: ChartContext, row: number): string {
  const s = ctx.selected(row);
  return s === false ? ' sk-dim' : s ? ' sk-on' : '';
}

function extent(col: ChartColumn, n: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = toNum(col.values[i]);
    if (Number.isFinite(v)) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  return [lo, hi];
}

function cellStyle(mode: unknown, v: number, [lo, hi]: [number, number]): string {
  if (!Number.isFinite(v)) return '';
  if (mode === 'bars') {
    const p = Math.max(0, Math.min(100, (Math.max(0, v) / (hi > 0 ? hi : 1)) * 100));
    return ` style="--bar:${p.toFixed(1)}%" data-bar`;
  }
  if (mode === 'heat') {
    // Past the middle of the ramp the cell is strong (dark smalt in light mode, pale smalt in dark
    // mode): its text switches to the theme's on-mark colour so it stays readable in both.
    const t = (v - lo) / (hi - lo || 1);
    return ` style="background:${seqColor(t)}${t > 0.55 ? ';color:var(--sk-on-mark)' : ''}"`;
  }
  return '';
}

const sortState = new WeakMap<object, { col: number; dir: 1 | -1 }>();

/**
 * Table. Roles: `columns` (dimensions) and `values` (measures); `extra.totals` (one row of the same
 * measures) adds a totals row. Options: format (none, bars, heat), density (compact, normal, relaxed).
 * Clicking a header sorts by it (when ctx.el is an element).
 */
export function tableView(ctx: ChartContext): void {
    const { data } = ctx;
    if (!data.columns.length) {
      ctx.el.innerHTML = '<div class="sk-empty">Add columns</div>';
      return;
    }
    const cols = [...data.role('columns'), ...data.role('values')];
    const n = data.rows;
    const order = [...Array(n).keys()];
    const st = sortState.get(ctx.el);
    if (st && cols[st.col]) {
      const c = cols[st.col]!;
      order.sort((a, b) => cmp(c.values[a]!, c.values[b]!) * st.dir);
    }
    const ext = cols.map((c) => (c.kind === 'measure' ? extent(c, n) : ([0, 0] as [number, number])));
    let html = `<table class="sk-table sk-density-${esc(ctx.options.density)}"><thead><tr>`;
    cols.forEach((c, i) => {
      const arrow = st?.col === i ? (st.dir === 1 ? ' ▲' : ' ▼') : '';
      html += `<th data-col="${i}" class="${c.kind === 'measure' ? 'sk-num' : ''}">${esc(c.label)}${arrow}</th>`;
    });
    html += '</tr></thead><tbody>';
    for (const r of order) {
      html += `<tr class="sk-mark${rowClass(ctx, r)}" data-row="${r}">`;
      cols.forEach((c, i) => {
        const v = c.values[r]!;
        const num = c.kind === 'measure';
        html += `<td class="${num ? 'sk-num' : ''}"${num ? cellStyle(ctx.options.format, toNum(v), ext[i]!) : ''}>${esc(c.fmt(v))}</td>`;
      });
      html += '</tr>';
    }
    html += '</tbody>';
    const tot = ctx.extra.totals;
    if (tot && tot.rows) {
      html += '<tfoot><tr>';
      cols.forEach((c, i) => {
        if (c.kind !== 'measure') html += `<td>${i === 0 ? 'Total' : ''}</td>`;
        else {
          const t = tot.columns.find((x) => x.ref === c.ref && x.label === c.label) ?? tot.measures[cols.filter((x) => x.kind === 'measure').indexOf(c)];
          html += `<td class="sk-num">${t ? esc(c.fmt(t.values[0]!)) : ''}</td>`;
        }
      });
      html += '</tr></tfoot>';
    }
    html += '</table>';
    if (n >= (ctx.limit ?? 1000)) html += `<div class="sk-note">Showing the first ${n} rows</div>`;
    ctx.el.innerHTML = `<div class="sk-table-wrap">${html}</div>`;
    ctx.el.querySelector?.('thead')?.addEventListener('click', (e) => {
      const th = (e.target as HTMLElement).closest('th');
      if (!th) return;
      const col = Number(th.dataset.col);
      const cur = sortState.get(ctx.el);
      sortState.set(ctx.el, { col, dir: cur?.col === col ? (-cur.dir as 1 | -1) : cols[col]!.kind === 'measure' ? -1 : 1 });
      tableView(ctx);
    });
  }

function cmp(a: Value, b: Value): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

// ------------------------------------------------------------------ matrix

function keyOf(cols: ChartColumn[], r: number): string {
  return JSON.stringify(cols.map((c) => normalize(c.values[r]!)));
}
function normalize(v: Value): unknown {
  return typeof v === 'bigint' ? Number(v) : v instanceof Uint8Array ? null : v;
}

/**
 * Pivot matrix. Roles: `rows` and `columns` (dimensions), `values` (measures). Totals come from
 * `extra.rowTotals` (rows × measures), `extra.colTotals` (columns × measures) and `extra.grand`.
 * Option format: none, heat, bars.
 */
export function matrixView(ctx: ChartContext): void {
    const { data } = ctx;
    const rows = data.role('rows');
    const cols = data.role('columns');
    const ms = data.role('values');
    if (!rows.length && !cols.length) {
      ctx.el.innerHTML = '<div class="sk-empty">Add rows or columns</div>';
      return;
    }
    const n = data.rows;
    const rowKeys = new Map<string, number>();
    const colKeys = new Map<string, number>();
    const rowFirst: number[] = [];
    const colFirst: number[] = [];
    const cell = new Map<string, number>();
    for (let r = 0; r < n; r++) {
      const rk = keyOf(rows, r);
      const ck = keyOf(cols, r);
      if (!rowKeys.has(rk)) {
        rowKeys.set(rk, rowFirst.length);
        rowFirst.push(r);
      }
      if (!colKeys.has(ck)) {
        colKeys.set(ck, colFirst.length);
        colFirst.push(r);
      }
      cell.set(rowKeys.get(rk) + '|' + colKeys.get(ck), r);
    }
    const ext = ms.map((m) => extent(m, n));
    const lookup = (vd: ChartData | undefined, dimsOf: ChartColumn[], r: number) => {
      if (!vd) return null;
      const want = keyOf(dimsOf, r);
      for (let i = 0; i < vd.rows; i++) if (keyOf(vd.dims, i) === want) return i;
      return null;
    };
    const rt = ctx.extra.rowTotals;
    const ct = ctx.extra.colTotals;
    const gt = ctx.extra.grand;
    let html = '<table class="sk-table sk-matrix"><thead>';
    // Header rows: one per column dimension, then measure names.
    const span = Math.max(1, ms.length);
    cols.forEach((c, level) => {
      html += '<tr>' + rows.map(() => '<th></th>').join('');
      for (const r of colFirst) html += `<th colspan="${span}" class="sk-colhead">${esc(c.fmt(c.values[r]!))}</th>`;
      if (rt) html += level === 0 ? `<th colspan="${span}" class="sk-colhead sk-total" rowspan="${cols.length}">Total</th>` : '';
      html += '</tr>';
    });
    html += '<tr>' + rows.map((r) => `<th>${esc(r.label)}</th>`).join('');
    const colCount = Math.max(1, colFirst.length);
    for (let c = 0; c < colCount; c++) for (const m of ms) html += `<th class="sk-num">${esc(m.label)}</th>`;
    if (rt) for (const m of ms) html += `<th class="sk-num sk-total">${esc(m.label)}</th>`;
    html += '</tr></thead><tbody>';
    let prev: string[] = [];
    rowFirst.forEach((fr, ri) => {
      html += '<tr>';
      const labels = rows.map((c) => c.fmt(c.values[fr]!));
      labels.forEach((l, i) => {
        // Repeat a parent label only when it changes (stepped look without collapse).
        const same = labels.slice(0, i + 1).every((x, j) => prev[j] === x);
        html += `<th class="sk-rowhead">${same && i < labels.length - 1 ? '' : esc(l)}</th>`;
      });
      prev = labels;
      for (let c = 0; c < colCount; c++) {
        const r = cell.get(ri + '|' + c);
        ms.forEach((m, mi) => {
          if (r === undefined) html += '<td class="sk-num"></td>';
          else html += `<td class="sk-num sk-mark${rowClass(ctx, r)}" data-row="${r}"${cellStyle(ctx.options.format, toNum(m.values[r]!), ext[mi]!)}>${esc(m.fmt(m.values[r]!))}</td>`;
        });
      }
      if (rt) {
        const i = lookup(rt, rows, fr);
        ms.forEach((m, mi) => (html += `<td class="sk-num sk-total">${i === null ? '' : esc(m.fmt(rt.measures[mi]!.values[i]!))}</td>`));
      }
      html += '</tr>';
    });
    html += '</tbody>';
    if (ct) {
      html += '<tfoot><tr>' + rows.map((_, i) => `<th>${i === 0 ? 'Total' : ''}</th>`).join('');
      for (let c = 0; c < colCount; c++) {
        const i = cols.length ? lookup(ct, cols, colFirst[c]!) : 0;
        ms.forEach((m, mi) => (html += `<td class="sk-num">${i === null || !ct.rows ? '' : esc(m.fmt(ct.measures[mi]!.values[i]!))}</td>`));
      }
      if (rt) ms.forEach((m, mi) => (html += `<td class="sk-num sk-total">${gt?.rows ? esc(m.fmt(gt.measures[mi]!.values[0]!)) : ''}</td>`));
      html += '</tr></tfoot>';
    }
    html += '</table>';
    ctx.el.innerHTML = `<div class="sk-table-wrap">${html}</div>`;
  }
