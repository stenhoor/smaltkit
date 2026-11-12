// Tables: a flat table (sortable headers, totals row, data bars or heat colours) and a pivot matrix
// (row and column dimensions, row / column / grand totals). HTML, styled by ui.css.
import type { Value } from './format.js';
import { cellFormatHtml, type ChartColumn, type ChartContext, type ChartData } from './charts.js';
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
        const f = num ? ctx.cellFormat?.(c, r) : null;
        const cf = cellFormatHtml(f);
        // A filled conditional format replaces the heat colour (both are the cell's background).
        const style = num && !(f?.fill && f.tone) ? cellStyle(ctx.options.format, toNum(v), ext[i]!) : '';
        html += `<td class="${(num ? 'sk-num' : '') + cf.cls}"${style}>${cf.icon}${esc(c.fmt(v))}</td>`;
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
 *
 * Options:
 * - `format`: none, heat, bars.
 * - `layout`: `stepped` (default: one row-header column, levels indented, parents with a caret to expand or
 *   collapse them) or `tabular` (a column per row level, parents' labels shown once).
 * - `subtotals` (stepped, default true): a parent row shows its subtotals, from `extra['sub:<k>']` (the first k row
 *   fields and the column fields × measures) and, with row totals, `extra['sub:<k>:rt']` (the first k row fields).
 *   Subtotals are queries of their own, so averages, distinct counts and ratios come out right.
 * - `collapsed` (stepped): start with every parent collapsed. Clicking a caret toggles a parent (when ctx.el is an
 *   element); the state lasts while the element does.
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
  /** Rows of an extra result by the key of its dimension values. */
  const index = (vd: ChartData | undefined): Map<string, number> => {
    const out = new Map<string, number>();
    if (vd) for (let i = 0; i < vd.rows; i++) out.set(keyOf(vd.dims, i), i);
    return out;
  };
  const vals = (cs: ChartColumn[], r: number) => cs.map((c) => normalize(c.values[r]!));
  const rt = ctx.extra.rowTotals;
  const ct = ctx.extra.colTotals;
  const gt = ctx.extra.grand;
  const rtIndex = index(rt);
  const stepped = ctx.options.layout !== 'tabular' && rows.length > 0;
  const deep = stepped && rows.length > 1;
  const headCols = stepped ? 1 : rows.length;
  const span = Math.max(1, ms.length);
  const colCount = Math.max(1, colFirst.length);
  const num = (m: ChartColumn, vd: ChartData | undefined, i: number | undefined, mi: number, cls = '') =>
    `<td class="sk-num${cls}">${i === undefined || !vd ? '' : esc(m.fmt(vd.measures[mi]!.values[i]!))}</td>`;

  let html = '<table class="sk-table sk-matrix' + (stepped ? ' sk-stepped' : '') + '"><thead>';
  // Header rows: one per column dimension, then measure names.
  cols.forEach((c, level) => {
    html += '<tr>' + '<th></th>'.repeat(headCols);
    for (const r of colFirst) html += `<th colspan="${span}" class="sk-colhead">${esc(c.fmt(c.values[r]!))}</th>`;
    if (rt) html += level === 0 ? `<th colspan="${span}" class="sk-colhead sk-total" rowspan="${cols.length}">Total</th>` : '';
    html += '</tr>';
  });
  html += '<tr>' + (stepped ? `<th>${esc(rows.map((r) => r.label).join(' › '))}</th>` : rows.map((r) => `<th>${esc(r.label)}</th>`).join(''));
  for (let c = 0; c < colCount; c++) for (const m of ms) html += `<th class="sk-num">${esc(m.label)}</th>`;
  if (rt) for (const m of ms) html += `<th class="sk-num sk-total">${esc(m.label)}</th>`;
  html += '</tr></thead><tbody>';

  /** A data row's value cells across the columns, and its row total. */
  const valueCells = (fr: number, ri: number) => {
    let out = '';
    for (let c = 0; c < colCount; c++) {
      const r = cell.get(ri + '|' + c);
      ms.forEach((m, mi) => {
        if (r === undefined) out += '<td class="sk-num"></td>';
        else {
          const f = ctx.cellFormat?.(m, r);
          const cf = cellFormatHtml(f);
          const style = f?.fill && f.tone ? '' : cellStyle(ctx.options.format, toNum(m.values[r]!), ext[mi]!);
          out += `<td class="sk-num sk-mark${rowClass(ctx, r)}${cf.cls}" data-row="${r}"${style}>${cf.icon}${esc(m.fmt(m.values[r]!))}</td>`;
        }
      });
    }
    if (rt) {
      const i = rtIndex.get(keyOf(rows, fr));
      ms.forEach((m, mi) => (out += num(m, rt, i, mi, ' sk-total')));
    }
    return out;
  };

  if (!deep) {
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
      html += valueCells(fr, ri) + '</tr>';
    });
  } else {
    // Stepped, more than one row level: parents (with subtotals) above their children, indented by level.
    const subtotals = ctx.options.subtotals !== false;
    const sub = rows.slice(0, -1).map((_, k) => ({ cells: index(ctx.extra[`sub:${k + 1}`]), totals: index(ctx.extra[`sub:${k + 1}:rt`]), vd: ctx.extra[`sub:${k + 1}`], rvd: ctx.extra[`sub:${k + 1}:rt`] }));
    let state = collapseState.get(ctx.el);
    if (!state) {
      state = { collapsed: new Set(), all: !!ctx.options.collapsed };
      collapseState.set(ctx.el, state);
    }
    const isCollapsed = (key: string) => (state!.all ? !state!.collapsed.has(key) : state!.collapsed.has(key));
    let prev: unknown[] | null = null;
    rowFirst.forEach((fr, ri) => {
      const v = vals(rows, fr);
      // The first level where this row differs from the one above: parents from there down start here.
      let from = 0;
      if (prev) while (from < rows.length - 1 && JSON.stringify(prev[from]) === JSON.stringify(v[from])) from++;
      prev = v;
      // Hidden under a collapsed ancestor?
      const hiddenAt = (k: number) => {
        for (let a = 0; a < k; a++) if (isCollapsed(JSON.stringify(v.slice(0, a + 1)))) return true;
        return false;
      };
      for (let k = from; k < rows.length - 1; k++) {
        if (hiddenAt(k)) break;
        const key = JSON.stringify(v.slice(0, k + 1));
        const closed = isCollapsed(key);
        html += `<tr class="sk-parent"><th class="sk-rowhead sk-level-${k}" style="--level:${k}"><button type="button" class="sk-caret" data-key="${esc(key)}" aria-expanded="${!closed}" aria-label="${closed ? 'Expand' : 'Collapse'} ${esc(rows[k]!.fmt(rows[k]!.values[fr]!))}">${closed ? '▸' : '▾'}</button>${esc(rows[k]!.fmt(rows[k]!.values[fr]!))}</th>`;
        const s = sub[k]!;
        for (let c = 0; c < colCount; c++) {
          const want = JSON.stringify([...v.slice(0, k + 1), ...(cols.length ? vals(cols, colFirst[c]!) : [])]);
          const i = subtotals ? s.cells.get(want) : undefined;
          ms.forEach((m, mi) => (html += num(m, s.vd, i, mi, ' sk-subtotal')));
        }
        if (rt) {
          const i = subtotals ? s.totals.get(JSON.stringify(v.slice(0, k + 1))) : undefined;
          ms.forEach((m, mi) => (html += num(m, s.rvd, i, mi, ' sk-subtotal sk-total')));
        }
        html += '</tr>';
      }
      if (hiddenAt(rows.length - 1)) return;
      const k = rows.length - 1;
      html += `<tr><th class="sk-rowhead sk-level-${k}" style="--level:${k}">${esc(rows[k]!.fmt(rows[k]!.values[fr]!))}</th>${valueCells(fr, ri)}</tr>`;
    });
  }
  html += '</tbody>';
  if (ct) {
    html += '<tfoot><tr>' + Array.from({ length: headCols }, (_, i) => `<th>${i === 0 ? 'Total' : ''}</th>`).join('');
    const ctIndex = index(ct);
    for (let c = 0; c < colCount; c++) {
      const i = cols.length ? ctIndex.get(keyOf(cols, colFirst[c]!)) : ct.rows ? 0 : undefined;
      ms.forEach((m, mi) => (html += num(m, ct, i, mi)));
    }
    if (rt) ms.forEach((m, mi) => (html += num(m, gt, gt?.rows ? 0 : undefined, mi, ' sk-total')));
    html += '</tr></tfoot>';
  }
  html += '</table>';
  ctx.el.innerHTML = `<div class="sk-table-wrap">${html}</div>`;
  if (deep) {
    ctx.el.querySelector?.('tbody')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest?.('.sk-caret') as HTMLElement | null;
      if (!btn) return;
      e.stopPropagation();
      const state = collapseState.get(ctx.el)!;
      const key = btn.dataset.key!;
      if (state.collapsed.has(key)) state.collapsed.delete(key);
      else state.collapsed.add(key);
      matrixView(ctx);
    });
  }
}

/** Expanded / collapsed parents of a stepped matrix, per element: `all` flips the meaning (start collapsed). */
const collapseState = new WeakMap<object, { collapsed: Set<string>; all: boolean }>();
