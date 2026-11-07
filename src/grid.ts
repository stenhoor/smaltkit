// A virtualized data grid: renders only the visible rows, with resizable columns, sortable headers, cell selection with
// keyboard navigation, copy, and optional in-place editing. Styled by ui.css (.sk-grid).
//
// Rows come from an array (`setData`), or from a source that knows the row count and fetches blocks of rows as they
// scroll into view (`setSource`), so a page never holds a result it doesn't show.

import { esc } from './svg.js';

export type GridValue = string | number | bigint | boolean | Uint8Array | null | undefined;
export type GridRow = GridValue[];
export type SortDir = 'asc' | 'desc' | null;

/** A grid column: a name, plus an optional type and primary-key flag for the header. */
export interface GridColumn {
  name: string;
  type?: string | null;
  pk?: boolean;
}

/** Rows fetched on demand: the grid asks for blocks of rows as they scroll into view. */
export interface RowSource {
  columns: (string | GridColumn)[];
  rowCount: number;
  /** Rows `offset` to `offset + limit - 1`, in the source's order. */
  fetch(offset: number, limit: number): Promise<GridRow[]>;
  /** Rows already known, from row 0 (for example a preview sent with the result). */
  initial?: GridRow[];
}

export interface GridOptions {
  /** Sorting done by the caller (a query, a source). Without it, `setData` grids sort on the client and source grids don't sort. */
  onSort?: (col: number, dir: SortDir) => void;
  editable?: (row: number, col: number) => boolean;
  onEdit?: (row: number, col: number, value: string | null) => Promise<void>;
  onSelect?: (row: number, col: number) => void;
  onOpenValue?: (row: number, col: number) => void;
  emptyText?: string;
  /** Rows per fetch from a source. Default 200. */
  blockSize?: number;
}

export type ExportFormat = 'csv' | 'tsv' | 'json' | 'ndjson' | 'sql';

const ROW_H = 26;
const OVERSCAN = 12;

/** A value as the grid shows it; null for NULL. */
export function formatValue(v: GridValue): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Uint8Array) {
    const hex = [...v.subarray(0, 32)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `x'${hex}${v.length > 32 ? '…' : ''}' (${v.length} B)`;
  }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e12) / 1e12);
  return String(v);
}

/** A value as text for copying and export. */
export function plainValue(v: GridValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Uint8Array) return "x'" + [...v].map((b) => b.toString(16).padStart(2, '0')).join('') + "'";
  return String(v);
}

/** The nearest ancestor of an event's target that matches `sel`. */
function closest<T extends HTMLElement = HTMLElement>(e: Event, sel: string): T | null {
  return (e.target as Element | null)?.closest<T>(sel) ?? null;
}

export class Grid {
  opts: GridOptions;
  host: HTMLElement;
  columns: GridColumn[] = [];
  /** The rows of `setData`, or the rows fetched so far from a source (holes are rows not fetched yet). */
  rows: GridRow[] = [];
  /** Client-side sort permutation (view index → row index), or null when unsorted. */
  order: number[] | null = null;
  sort: { col: number; dir: SortDir } = { col: -1, dir: null };
  widths: number[] = [];
  sel = { row: -1, col: -1 };
  range: [number, number] = [-1, -1];
  scroller: HTMLDivElement;
  table: HTMLTableElement;
  colgroup: HTMLTableColElement;
  headRow: HTMLTableRowElement;
  body: HTMLTableSectionElement;
  empty: HTMLDivElement;
  editing = false;
  justResized = false;
  #source: RowSource | null = null;
  #total = 0;
  #pending = new Set<number>();
  #generation = 0;
  #resize: ResizeObserver;

  constructor(host: HTMLElement, opts: GridOptions = {}) {
    this.opts = opts;
    this.host = host;
    host.classList.add('sk-grid');
    host.tabIndex = 0;
    host.innerHTML = `<div class="sk-grid-scroll"><table class="sk-grid-table"><colgroup></colgroup><thead><tr></tr></thead><tbody></tbody></table><div class="sk-grid-empty"></div></div>`;
    this.scroller = host.querySelector<HTMLDivElement>('.sk-grid-scroll')!;
    this.table = host.querySelector('table')!;
    this.colgroup = host.querySelector('colgroup')!;
    this.headRow = host.querySelector<HTMLTableRowElement>('thead tr')!;
    this.body = host.querySelector('tbody')!;
    this.empty = host.querySelector<HTMLDivElement>('.sk-grid-empty')!;
    this.scroller.addEventListener('scroll', () => this.renderRows());
    this.#resize = new ResizeObserver(() => this.renderRows(true));
    this.#resize.observe(this.scroller);
    this.body.addEventListener('mousedown', (e) => this.onCellDown(e));
    this.body.addEventListener('dblclick', (e) => this.onCellDbl(e));
    this.headRow.addEventListener('click', (e) => this.onHeadClick(e));
    this.headRow.addEventListener('mousedown', (e) => this.onResizeStart(e));
    host.addEventListener('keydown', (e) => this.onKey(e));
    this.setData([], []);
  }

  /** Shows these rows. `serverSort` marks the column the caller sorted by. */
  setData(columns: (string | GridColumn)[], rows: GridRow[], { serverSort = null, keepScroll = false }: { serverSort?: { col: number; dir: SortDir } | null; keepScroll?: boolean } = {}): void {
    this.#source = null;
    this.#generation++;
    this.#pending.clear();
    this.#show(columns, rows, rows.length, serverSort, keepScroll);
  }

  /** Shows rows from a source: only the blocks that scroll into view are fetched. */
  setSource(source: RowSource, { serverSort = null }: { serverSort?: { col: number; dir: SortDir } | null } = {}): void {
    this.#source = source;
    this.#generation++;
    this.#pending.clear();
    const rows: GridRow[] = new Array(source.rowCount);
    (source.initial ?? []).slice(0, source.rowCount).forEach((r, i) => (rows[i] = r));
    this.#show(source.columns, rows, source.rowCount, serverSort, false);
  }

  #show(columns: (string | GridColumn)[], rows: GridRow[], total: number, serverSort: { col: number; dir: SortDir } | null, keepScroll: boolean) {
    this.columns = columns.map((c) => (typeof c === 'string' ? { name: c } : c));
    this.rows = rows;
    this.#total = total;
    this.order = null;
    this.sort = serverSort ?? { col: -1, dir: null };
    this.sel = { row: -1, col: -1 };
    this.computeWidths();
    this.renderHead();
    if (!keepScroll) this.scroller.scrollTop = 0;
    this.renderRows(true);
  }

  /** Adds rows to a `setData` grid. */
  append(rows: GridRow[]): void {
    for (const r of rows) this.rows.push(r);
    this.#total = this.rows.length;
    this.refresh();
  }

  /** Re-renders after the row array changed in place. */
  refresh(): void {
    if (this.order) this.applyClientSort();
    this.renderRows(true);
  }

  /** Stops watching the grid's size. Call it when the grid is removed. */
  destroy(): void {
    this.#resize.disconnect();
    this.#generation++;
  }

  get rowCount(): number {
    return this.#total;
  }

  /** The row at a view index; undefined while a source row hasn't been fetched. */
  rowAt(viewIndex: number): GridRow | undefined {
    return this.rows[this.order ? this.order[viewIndex]! : viewIndex];
  }

  /** Underlying row index for a view index. */
  sourceIndex(viewIndex: number): number {
    return this.order ? this.order[viewIndex]! : viewIndex;
  }

  computeWidths(): void {
    const sample: GridRow[] = [];
    for (let i = 0; i < Math.min(200, this.rows.length); i++) if (this.rows[i]) sample.push(this.rows[i]!);
    this.widths = this.columns.map((c, i) => {
      let w = c.name.length + (c.type ? c.type.length * 0.8 + 2 : 0) + (c.pk ? 2 : 0) + 3;
      for (const r of sample) {
        const s = formatValue(r[i]);
        w = Math.max(w, s === null ? 4 : Math.min(s.length, 60));
      }
      return Math.max(64, Math.min(420, Math.round(w * 7.6 + 22)));
    });
  }

  renderHead(): void {
    this.colgroup.innerHTML = `<col style="width:52px">` + this.widths.map((w) => `<col style="width:${w}px">`).join('');
    this.table.style.width = 52 + this.widths.reduce((a, b) => a + b, 0) + 'px';
    const sortable = !this.#source || !!this.opts.onSort;
    this.headRow.innerHTML =
      `<th class="sk-grid-rownum">#</th>` +
      this.columns
        .map((c, i) => {
          const dir = this.sort.col === i ? this.sort.dir : null;
          const arrow = dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '';
          const type = c.type ? `<span class="sk-grid-type">${esc(c.type)}</span>` : '';
          const key = c.pk ? `<span class="sk-grid-pk" title="primary key">⚿</span>` : '';
          return `<th data-col="${i}"${sortable ? '' : ' class="sk-grid-nosort"'} title="${esc(c.name)}${c.type ? ' · ' + esc(c.type) : ''}">${key}<span class="sk-grid-name">${esc(c.name)}</span>${type}<span class="sk-grid-sort">${arrow}</span><span class="sk-grid-resize" data-resize="${i}"></span></th>`;
        })
        .join('');
  }

  renderRows(force = false): void {
    const n = this.#total;
    const headH = this.headRow.offsetHeight || ROW_H;
    const top = Math.max(0, this.scroller.scrollTop - headH);
    const h = this.scroller.clientHeight || 400;
    const first = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN);
    const last = Math.min(n, Math.ceil((top + h) / ROW_H) + OVERSCAN);
    if (!force && first === this.range[0] && last === this.range[1]) return;
    this.range = [first, last];
    this.empty.textContent = n === 0 ? (this.opts.emptyText ?? (this.columns.length ? 'No rows' : '')) : '';
    this.empty.style.display = n === 0 && this.empty.textContent ? '' : 'none';
    let html = first > 0 ? `<tr class="sk-grid-spacer" style="height:${first * ROW_H}px"><td colspan="${this.columns.length + 1}"></td></tr>` : '';
    let missing = false;
    for (let v = first; v < last; v++) {
      const row = this.rowAt(v);
      if (!row) {
        missing = true;
        html += `<tr data-row="${v}" class="sk-grid-loading"><td class="sk-grid-rownum">${v + 1}</td><td colspan="${this.columns.length}"></td></tr>`;
        continue;
      }
      const selRow = v === this.sel.row;
      html += `<tr data-row="${v}"${selRow ? ' class="sk-grid-sel-row"' : ''}><td class="sk-grid-rownum">${v + 1}</td>`;
      for (let c = 0; c < this.columns.length; c++) {
        const val = row[c];
        const s = formatValue(val);
        const cls = [];
        if (s === null) cls.push('sk-grid-null');
        else if (typeof val === 'number' || typeof val === 'bigint') cls.push('sk-grid-num');
        else if (val instanceof Uint8Array) cls.push('sk-grid-blob');
        if (selRow && c === this.sel.col) cls.push('sk-grid-sel');
        const title = s !== null && s.length > 40 ? ` title="${esc(s.slice(0, 2000))}"` : '';
        html += `<td data-col="${c}"${cls.length ? ` class="${cls.join(' ')}"` : ''}${title}>${s === null ? 'NULL' : esc(s.length > 500 ? s.slice(0, 500) + '…' : s)}</td>`;
      }
      html += '</tr>';
    }
    if (last < n) html += `<tr class="sk-grid-spacer" style="height:${(n - last) * ROW_H}px"><td colspan="${this.columns.length + 1}"></td></tr>`;
    this.body.innerHTML = html;
    if (missing) this.#fetch(first, last);
  }

  /** Fetches the blocks of a source that rows first..last-1 fall in and aren't fetched or being fetched. */
  #fetch(first: number, last: number) {
    const source = this.#source;
    if (!source) return;
    const size = this.opts.blockSize ?? 200;
    const generation = this.#generation;
    for (let b = Math.floor(first / size); b * size < last; b++) {
      const offset = b * size;
      if (this.#pending.has(b)) continue;
      let complete = true;
      for (let i = offset; i < Math.min(offset + size, this.#total); i++) if (!this.rows[i]) { complete = false; break; }
      if (complete) continue;
      this.#pending.add(b);
      source.fetch(offset, Math.min(size, this.#total - offset)).then(
        (rows) => {
          if (generation !== this.#generation) return;
          rows.forEach((r, i) => (this.rows[offset + i] = r));
          this.#pending.delete(b);
          this.renderRows(true);
        },
        () => {
          // Leave the rows empty; scrolling past them again retries.
          if (generation === this.#generation) this.#pending.delete(b);
        },
      );
    }
  }

  cellFromEvent(e: Event): { row: number; col: number; td: HTMLTableCellElement } | null {
    const td = closest<HTMLTableCellElement>(e, 'td[data-col]');
    const tr = closest<HTMLTableRowElement>(e, 'tr[data-row]');
    if (!td || !tr) return null;
    return { row: Number(tr.dataset.row), col: Number(td.dataset.col), td };
  }

  onCellDown(e: MouseEvent): void {
    const cell = this.cellFromEvent(e);
    if (!cell) {
      const tr = closest<HTMLTableRowElement>(e, 'tr[data-row]');
      if (tr) this.select(Number(tr.dataset.row), Math.max(0, this.sel.col));
      return;
    }
    this.select(cell.row, cell.col);
  }

  onCellDbl(e: MouseEvent): void {
    const cell = this.cellFromEvent(e);
    if (!cell) return;
    if (this.opts.editable?.(this.sourceIndex(cell.row), cell.col)) this.beginEdit(cell.row, cell.col);
    else this.opts.onOpenValue?.(this.sourceIndex(cell.row), cell.col);
  }

  select(row: number, col: number, scroll = false): void {
    const n = this.#total;
    if (n === 0) return;
    row = Math.max(0, Math.min(n - 1, row));
    col = Math.max(0, Math.min(this.columns.length - 1, col));
    this.sel = { row, col };
    if (scroll) {
      const headH = this.headRow.offsetHeight || ROW_H;
      const y = row * ROW_H;
      const viewTop = this.scroller.scrollTop;
      const viewH = this.scroller.clientHeight - headH;
      if (y < viewTop) this.scroller.scrollTop = y;
      else if (y + ROW_H > viewTop + viewH) this.scroller.scrollTop = y + ROW_H - viewH;
      const left = 52 + this.widths.slice(0, col).reduce((a, b) => a + b, 0);
      const right = left + (this.widths[col] ?? 0);
      if (left - 52 < this.scroller.scrollLeft) this.scroller.scrollLeft = left - 52;
      else if (right > this.scroller.scrollLeft + this.scroller.clientWidth) this.scroller.scrollLeft = right - this.scroller.clientWidth;
    }
    // Update classes in place: rebuilding the rows here would detach the cell between the two clicks of a double-click.
    this.renderRows();
    for (const el of this.body.querySelectorAll('.sk-grid-sel, .sk-grid-sel-row')) el.classList.remove('sk-grid-sel', 'sk-grid-sel-row');
    const tr = this.body.querySelector(`tr[data-row="${row}"]`);
    tr?.classList.add('sk-grid-sel-row');
    tr?.querySelector(`td[data-col="${col}"]`)?.classList.add('sk-grid-sel');
    this.opts.onSelect?.(this.sourceIndex(row), col);
  }

  selectedValue(): GridValue {
    if (this.sel.row < 0) return undefined;
    return this.rowAt(this.sel.row)?.[this.sel.col];
  }

  selectedSourceRow(): number {
    return this.sel.row < 0 ? -1 : this.sourceIndex(this.sel.row);
  }

  onKey(e: KeyboardEvent): void {
    if (this.editing) return;
    const { row, col } = this.sel;
    const page = Math.max(1, Math.floor(this.scroller.clientHeight / ROW_H) - 2);
    const mod = e.ctrlKey || e.metaKey;
    let handled = true;
    switch (e.key) {
      case 'ArrowDown':
        this.select(mod ? this.#total - 1 : row + 1, Math.max(col, 0), true);
        break;
      case 'ArrowUp':
        this.select(mod ? 0 : row - 1, Math.max(col, 0), true);
        break;
      case 'ArrowRight':
      case 'Tab':
        if (e.key === 'Tab' && e.shiftKey) this.select(row, col - 1, true);
        else this.select(Math.max(row, 0), mod ? this.columns.length - 1 : col + 1, true);
        break;
      case 'ArrowLeft':
        this.select(Math.max(row, 0), mod ? 0 : col - 1, true);
        break;
      case 'PageDown':
        this.select(row + page, Math.max(col, 0), true);
        break;
      case 'PageUp':
        this.select(row - page, Math.max(col, 0), true);
        break;
      case 'Home':
        this.select(mod ? 0 : row, 0, true);
        break;
      case 'End':
        this.select(mod ? this.#total - 1 : row, this.columns.length - 1, true);
        break;
      case 'Enter':
      case 'F2':
        if (row >= 0 && this.opts.editable?.(this.sourceIndex(row), col)) this.beginEdit(row, col);
        else if (row >= 0) this.opts.onOpenValue?.(this.sourceIndex(row), col);
        break;
      case 'c':
      case 'C': {
        const r = row >= 0 ? this.rowAt(row) : undefined;
        if (mod && r) {
          const text = e.shiftKey ? r.map(plainValue).join('\t') : plainValue(this.selectedValue());
          navigator.clipboard?.writeText(text);
          this.flash();
        } else handled = false;
        break;
      }
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  }

  flash(): void {
    const td = this.body.querySelector('td.sk-grid-sel');
    td?.classList.add('sk-grid-copied');
    setTimeout(() => td?.classList.remove('sk-grid-copied'), 400);
  }

  beginEdit(viewRow: number, col: number): void {
    this.select(viewRow, col, true);
    const td = this.body.querySelector(`tr[data-row="${viewRow}"] td[data-col="${col}"]`);
    const row = this.rowAt(viewRow);
    if (!td || !row) return;
    const val = row[col];
    const input = document.createElement('input');
    input.className = 'sk-grid-edit';
    input.value = val === null || val === undefined ? '' : plainValue(val);
    input.placeholder = val === null ? 'NULL' : '';
    td.textContent = '';
    td.appendChild(input);
    input.focus();
    input.select();
    this.editing = true;
    let done = false;
    const finish = async (commit: boolean, setNull = false) => {
      if (done) return;
      done = true;
      this.editing = false;
      if (commit) {
        const v = setNull ? null : input.value;
        try {
          await this.opts.onEdit?.(this.sourceIndex(viewRow), col, v);
        } catch {
          // The caller reports errors; the grid just re-renders the old value.
        }
      }
      this.renderRows(true);
      this.host.focus();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
      else if (e.key === 'Delete' && (e.ctrlKey || e.metaKey)) finish(true, true);
    });
    input.addEventListener('blur', () => finish(false));
  }

  onHeadClick(e: MouseEvent): void {
    if (closest(e, '[data-resize]') || this.justResized) return;
    const th = closest(e, 'th[data-col]');
    if (!th) return;
    if (this.#source && !this.opts.onSort) return; // a source's rows can't be sorted here
    const col = Number(th.dataset.col);
    const dir: SortDir = this.sort.col !== col ? 'asc' : this.sort.dir === 'asc' ? 'desc' : this.sort.dir === 'desc' ? null : 'asc';
    this.sort = { col: dir ? col : -1, dir };
    if (this.opts.onSort) this.opts.onSort(col, dir);
    else {
      this.applyClientSort();
      this.renderHead();
      this.renderRows(true);
    }
  }

  applyClientSort(): void {
    this.order = sortOrder(this.rows, this.sort.col, this.sort.dir);
  }

  onResizeStart(e: MouseEvent): void {
    const handle = closest(e, '[data-resize]');
    if (!handle) return;
    e.preventDefault();
    const col = Number(handle.dataset.resize);
    const startX = e.clientX;
    const startW = this.widths[col] ?? 64;
    const colEl = this.colgroup.children[col + 1] as HTMLElement;
    const move = (ev: MouseEvent) => {
      this.widths[col] = Math.max(40, startW + ev.clientX - startX);
      colEl.style.width = this.widths[col] + 'px';
      this.table.style.width = 52 + this.widths.reduce((a, b) => a + b, 0) + 'px';
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      this.justResized = true;
      setTimeout(() => (this.justResized = false), 50);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  /** Rows in view order (for export); for a source, the rows fetched so far. */
  viewRows(): GridRow[] {
    const rows = this.order ? this.order.map((i) => this.rows[i]!) : this.rows;
    return this.#source ? rows.filter((r): r is GridRow => !!r) : rows;
  }
}

/**
 * The view order for sorting rows by a column: nulls first, then numbers, then strings, then everything else; equal
 * values keep their order. Null when `dir` is null (unsorted).
 */
export function sortOrder(rows: GridRow[], col: number, dir: SortDir): number[] | null {
  if (!dir) return null;
  const rank = (v: GridValue): number => (v === null || v === undefined ? 0 : typeof v === 'number' || typeof v === 'bigint' ? 1 : typeof v === 'string' ? 2 : 3);
  const cmp = (a: GridValue, b: GridValue): number => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    // Same rank 1 (numbers/bigints) or 2 (strings): compare with < and >, which work across number and bigint.
    if (ra === 1 || ra === 2) {
      const x = a as number | bigint | string;
      const y = b as number | bigint | string;
      return x < y ? -1 : x > y ? 1 : 0;
    }
    return 0;
  };
  const idx = rows.map((_, i) => i);
  idx.sort((x, y) => cmp(rows[x]![col], rows[y]![col]) * (dir === 'asc' ? 1 : -1) || x - y);
  return idx;
}

/** CSV / TSV / JSON / NDJSON / SQL INSERT text for rows. */
export function exportRows(format: ExportFormat, columns: (string | GridColumn)[], rows: GridRow[], tableName = 'result'): string {
  const names = columns.map((c) => (typeof c === 'string' ? c : c.name));
  if (format === 'json') {
    return JSON.stringify(
      rows.map((r) => Object.fromEntries(names.map((n, i) => [n, jsonValue(r[i])]))),
      null,
      2,
    );
  }
  if (format === 'ndjson') return rows.map((r) => JSON.stringify(Object.fromEntries(names.map((n, i) => [n, jsonValue(r[i])])))).join('\n') + '\n';
  if (format === 'sql') {
    const q = (s: string): string => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : '"' + s.replace(/"/g, '""') + '"');
    const lit = (v: GridValue): string => (v === null || v === undefined ? 'NULL' : typeof v === 'number' || typeof v === 'bigint' ? String(v) : typeof v === 'boolean' ? (v ? '1' : '0') : v instanceof Uint8Array ? plainValue(v) : "'" + String(v).replace(/'/g, "''") + "'");
    return rows.map((r) => `INSERT INTO ${q(tableName)} (${names.map(q).join(', ')}) VALUES (${r.map(lit).join(', ')});`).join('\n') + '\n';
  }
  const d = format === 'tsv' ? '\t' : ',';
  const cell = (v: GridValue): string => {
    const s = plainValue(v);
    return format === 'tsv' ? s.replace(/[\t\n\r]/g, ' ') : /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [names.map(cell).join(d), ...rows.map((r) => r.map(cell).join(d))].join('\n') + '\n';
}

function jsonValue(v: GridValue): unknown {
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
  if (v instanceof Uint8Array) return plainValue(v);
  return v;
}
