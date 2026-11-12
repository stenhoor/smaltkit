// Charts as SVG / HTML strings: bar, column, line, area, combo, pie, donut, funnel, treemap,
// waterfall, gauge, KPI card, scatter and heatmap. Each renderer reads columns by role from
// `ctx.data`, draws into `ctx.el` in one innerHTML write, and styles everything through CSS classes
// and the --sk-* variables in ui.css (defaulting to the smalt brand tokens).
//
// Marks carry data-row="<row index>" so the page can add selection, tooltips and drill on top, and
// get `sk-dim` / `sk-on` when `ctx.selected(row)` says so.
import { axisFormatter, formatDate, type ColumnType, type Format, type Value } from './format.js';
import { arc, band, esc, linear, linePath, niceTicks, r2, rescale, seqColor, textWidth, timeTicks, timeValue, toNum, truncate, valueScale } from './svg.js';

/** One column of a result, tagged with the role it plays in a chart (category, series, values, …). */
export interface ChartColumn {
  key: string;
  role: string;
  label: string;
  /** Dimensions are grouped by; measures are the numbers drawn. */
  kind: 'dimension' | 'measure';
  /** Optional id of the field the column comes from (used to match totals to columns). */
  ref?: string;
  type?: ColumnType;
  format?: Format;
  values: ArrayLike<Value>;
  /** Formats one value for labels and tooltips. */
  fmt: (v: Value) => string;
}

export interface ChartData {
  rows: number;
  columns: ChartColumn[];
  dims: ChartColumn[];
  measures: ChartColumn[];
  /** Columns of a role, in order. */
  role(name: string): ChartColumn[];
}

/** Build ChartData from columns. */
export function chartData(columns: ChartColumn[], rows: number): ChartData {
  return {
    rows,
    columns,
    dims: columns.filter((c) => c.kind === 'dimension'),
    measures: columns.filter((c) => c.kind === 'measure'),
    role: (name) => columns.filter((c) => c.role === name),
  };
}

export interface ChartContext {
  /** Where to draw: anything with innerHTML (an element; a plain object in tests). */
  el: { innerHTML: string } & Partial<Pick<HTMLElement, 'querySelector' | 'addEventListener'>>;
  width: number;
  height: number;
  options: Record<string, unknown>;
  data: ChartData;
  /** Results of additional queries (table totals, a KPI card's trend). */
  extra: Record<string, ChartData>;
  /** Number of palette colours (series classes cycle sk-c0 … sk-c{n-1}). */
  palette: number;
  /** null when nothing is selected, else whether row `i` is selected. */
  selected(row: number): boolean | null;
  /** Row limit the data was fetched with (tables say when they hit it). */
  limit?: number;
  /**
   * Conditional formatting: how to show one measure value (a table cell, a matrix cell, a KPI card's value) of a
   * column at a data row. The app decides from its own rules; null or undefined leaves the value plain.
   */
  cellFormat?(column: ChartColumn, row: number): CellFormat | null | undefined;
  /**
   * The reader changed an option by hand (a table's column widths): the app may keep it (the designer saves it with the
   * visual). Without it the change lasts while the element does.
   */
  setOption?(key: string, value: unknown): void;
}

/** A value's tone: its text colour, or its background with `fill`. Status tones always come with the value itself. */
export type CellTone = 'good' | 'bad' | 'warn' | 'accent';
export type CellIcon = 'up' | 'down' | 'flat' | 'check' | 'cross' | 'warn' | 'dot';

export interface CellFormat {
  tone?: CellTone;
  /** Colour the cell's background with the tone instead of the text. */
  fill?: boolean;
  /** An icon before the value, in the tone's colour. */
  icon?: CellIcon;
}

const ICON_PATHS: Record<CellIcon, string> = {
  // Chevron style (smalt-brand): solid shapes, edges at 0°, 45° and 90°.
  up: 'M12 3L21 12H15V21H9V12H3Z',
  down: 'M12 21L3 12H9V3H15V12H21Z',
  flat: 'M3 9.5H15V5L22 12L15 19V14.5H3Z',
  check: 'M3 12.5L6.5 9L10 12.5L17.5 5L21 8.5L10 19.5Z',
  cross: 'M5.5 3L12 9.5L18.5 3L21 5.5L14.5 12L21 18.5L18.5 21L12 14.5L5.5 21L3 18.5L9.5 12L3 5.5Z',
  warn: 'M10 3H14V15H10ZM10 17H14V21H10Z',
  dot: 'M7 7H17V17H7Z',
};

/** The classes and icon markup for a value's conditional format ('' when there is none). */
export function cellFormatHtml(f: CellFormat | null | undefined): { cls: string; icon: string } {
  if (!f) return { cls: '', icon: '' };
  const cls = (f.tone ? ` sk-tone-${f.tone}` : '') + (f.fill && f.tone ? ' sk-fill' : '');
  const icon = f.icon && ICON_PATHS[f.icon] ? `<svg class="sk-cf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_PATHS[f.icon]}"/></svg>` : '';
  return { cls, icon };
}

/** A legend (HTML) for series names. */
export function legendHtml(names: string[], palette: number, offset = 0): string {
  return '<div class="sk-legend">' + names.map((n, i) => `<span class="sk-legend-item sk-c${(i + offset) % palette}"><i></i>${esc(n)}</span>`).join('') + '</div>';
}

type Kind = 'bar' | 'line' | 'area';

interface Series {
  /** What the series is (a series value, or a measure's key): matches series across small multiples. */
  key: unknown;
  name: string;
  kind: Kind;
  axis: 0 | 1;
  color: number;
  values: number[];
  rows: number[];
  col: ChartColumn;
  /** Stack bounds per category. */
  y0?: number[];
  y1?: number[];
}

interface Prepared {
  cats: { value: Value; label: string }[];
  series: Series[];
}

function prepare(ctx: ChartContext, kindFor: (role: string, i: number) => Kind, axisFor: (role: string) => 0 | 1, rowList?: number[], seed?: Prepared): Prepared {
  const { data } = ctx;
  const cat = data.role('category')[0];
  const ser = data.role('series')[0];
  const measures = data.measures.filter((m) => m.role !== 'multiples');
  const catIndex = new Map<unknown, number>();
  const cats: Prepared['cats'] = [];
  const norm = (v: Value | undefined) => (typeof v === 'bigint' ? Number(v) : v);
  // Small multiples: every panel has the same categories and series, in the same places (colours match).
  for (const c of seed?.cats ?? []) {
    catIndex.set(norm(c.value), cats.length);
    cats.push({ ...c });
  }
  const catOf = (r: number) => {
    const v = cat ? cat.values[r]! : null;
    const k = norm(v);
    let i = catIndex.get(k);
    if (i === undefined) {
      i = cats.length;
      catIndex.set(k, i);
      cats.push({ value: v, label: cat ? cat.fmt(v) : '' });
    }
    return i;
  };
  const rowsOf = rowList ?? Array.from({ length: data.rows }, (_, r) => r);
  const series: Series[] = [];
  if (ser && measures.length) {
    const m = measures[0]!;
    const sIndex = new Map<unknown, number>();
    for (const s of seed?.series ?? []) {
      sIndex.set(s.key, series.length);
      series.push({ ...s, values: [], rows: [], y0: undefined, y1: undefined });
    }
    for (const r of rowsOf) {
      const ci = catOf(r);
      const sv = norm(ser.values[r]);
      let si = sIndex.get(sv);
      if (si === undefined) {
        si = series.length;
        sIndex.set(sv, si);
        series.push({ key: sv, name: ser.fmt(ser.values[r] ?? null), kind: kindFor(m.role, 0), axis: axisFor(m.role), color: si % ctx.palette, values: [], rows: [], col: m });
      }
      series[si]!.values[ci] = toNum(m.values[r]);
      series[si]!.rows[ci] = r;
    }
  } else {
    measures.forEach((m, i) => series.push({ key: m.key, name: m.label, kind: kindFor(m.role, i), axis: axisFor(m.role), color: i % ctx.palette, values: [], rows: [], col: m }));
    for (const r of rowsOf) {
      const ci = catOf(r);
      measures.forEach((m, i) => {
        series[i]!.values[ci] = toNum(m.values[r]);
        series[i]!.rows[ci] = r;
      });
    }
  }
  for (const s of series) for (let i = 0; i < cats.length; i++) if (s.values[i] === undefined) s.values[i] = NaN;
  return { cats, series };
}

function stackSeries(p: Prepared, mode: string, kinds: Kind[]): void {
  const n = p.cats.length;
  const group = p.series.filter((s) => kinds.includes(s.kind) && s.axis === 0);
  if (mode === 'none' || group.length === 0) return;
  for (let i = 0; i < n; i++) {
    let pos = 0;
    let neg = 0;
    let total = 0;
    for (const s of group) total += Math.abs(s.values[i]! || 0);
    for (const s of group) {
      let v = s.values[i]! || 0;
      if (mode === 'percent') v = total ? v / total : 0;
      (s.y0 ??= [])[i] = v >= 0 ? pos : neg;
      if (v >= 0) pos += v;
      else neg += v;
      (s.y1 ??= [])[i] = v >= 0 ? pos : neg;
    }
  }
}

/** A reference line across the plot: a fixed value, or a statistic of the first series. */
export interface RefLine {
  value?: number;
  stat?: 'avg' | 'median' | 'min' | 'max';
  label?: string;
  tone?: CellTone;
}

interface ChartOpts {
  horizontal: boolean;
  stack: string;
  smooth: boolean;
  markers: boolean;
  labels: boolean;
  legend: string;
  secondary: boolean;
  /** Category axis: bands (default) or continuous, by date or number. */
  continuous: boolean;
  log: boolean;
  min?: number;
  max?: number;
  xTitle: string;
  yTitle: string;
  y2Title: string;
  refLines: RefLine[];
  /** Fixed value extents (small multiples share one scale). */
  ext?: [number, number][];
}

let clipSeq = 0;

/** Value extents per axis (stacks included), widened by reference lines. */
function extents(p: Prepared, o: ChartOpts): [number, number][] {
  const ext = [
    [Infinity, -Infinity],
    [Infinity, -Infinity],
  ] as [number, number][];
  for (const s of p.series) {
    const e = ext[s.axis]!;
    for (let i = 0; i < p.cats.length; i++) {
      const lo = s.y0 ? Math.min(s.y0[i]!, s.y1![i]!) : s.values[i]!;
      const hi = s.y0 ? Math.max(s.y0[i]!, s.y1![i]!) : s.values[i]!;
      if (Number.isFinite(lo)) e[0] = Math.min(e[0], lo);
      if (Number.isFinite(hi)) e[1] = Math.max(e[1], hi);
    }
  }
  for (const r of refValues(p, o)) {
    ext[0][0] = Math.min(ext[0][0], r.v);
    ext[0][1] = Math.max(ext[0][1], r.v);
  }
  return ext;
}

function refValues(p: Prepared, o: ChartOpts): { v: number; label: string; tone?: CellTone }[] {
  const first = p.series.find((s) => s.axis === 0);
  const vals = first ? first.values.filter(Number.isFinite).sort((a, b) => a - b) : [];
  const out: { v: number; label: string; tone?: CellTone }[] = [];
  for (const r of o.refLines) {
    let v = r.value;
    if (r.stat && vals.length) {
      v = r.stat === 'min' ? vals[0]! : r.stat === 'max' ? vals.at(-1)! : r.stat === 'avg' ? vals.reduce((a, b) => a + b, 0) / vals.length : vals.length % 2 ? vals[(vals.length - 1) / 2]! : (vals[vals.length / 2 - 1]! + vals[vals.length / 2]!) / 2;
    }
    if (v === undefined || !Number.isFinite(v)) continue;
    const name = r.label ?? (r.stat ? { avg: 'Average', median: 'Median', min: 'Min', max: 'Max' }[r.stat] : '');
    out.push({ v, label: name ? `${name}: ${first ? first.col.fmt(v) : v}` : first ? first.col.fmt(v) : String(v), tone: r.tone });
  }
  return out;
}

/** The categories as numbers (dates as ms) when every one is a date or a number; else null. */
function continuousCats(p: Prepared, ctx: ChartContext): { xs: number[]; time: boolean } | null {
  const cat = ctx.data.role('category')[0];
  if (!cat || !p.cats.length) return null;
  const time = cat.type === 'date' || cat.type === 'datetime' || p.cats.some((c) => typeof c.value === 'string');
  const xs = p.cats.map((c) => (time ? timeValue(c.value) : toNum(c.value)));
  return xs.every(Number.isFinite) ? { xs, time } : null;
}

/** Sort categories (and every series with them) by their position on a continuous axis. */
function sortCats(p: Prepared, xs: number[]): number[] {
  const order = xs.map((_, i) => i).sort((a, b) => xs[a]! - xs[b]!);
  p.cats = order.map((i) => p.cats[i]!);
  for (const s of p.series) {
    s.values = order.map((i) => s.values[i]!);
    s.rows = order.map((i) => s.rows[i]!);
  }
  return order.map((i) => xs[i]!);
}

interface Frame {
  width: number;
  height: number;
  palette: number;
  selected(row: number): boolean | null;
}

function cartesianHtml(ctx: ChartContext, f: Frame, p: Prepared, o: ChartOpts, legend: string): string {
  const { width, height } = f;
  const fs = 11;
  const { series } = p;
  if (!p.cats.length || !series.length) return '<div class="sk-empty">No data</div>';
  // Continuous: positions from the category values (gaps and uneven dates show as such), sorted.
  const cont = !o.horizontal && o.continuous ? continuousCats(p, ctx) : null;
  const xsSorted = cont ? sortCats(p, cont.xs) : null;
  const cats = p.cats;
  if (!o.ext) stackSeries(p, o.stack, o.horizontal ? ['bar'] : ['bar', 'area']);
  const legendH = legend ? 24 : 0;
  const H = Math.max(40, height - legendH);
  const W = Math.max(60, width);
  const ext = o.ext ?? extents(p, o);
  for (const e of ext) if (!Number.isFinite(e[0])) [e[0], e[1]] = [0, 1];
  const log = o.log && o.stack === 'none';
  const fmtAxis = o.stack === 'percent' ? axisFormatter('percent') : axisFormatter(series[0]!.col.format);
  const fmtAxis2 = axisFormatter(series.find((s) => s.axis === 1)?.col.format);
  const hasY2 = series.some((s) => s.axis === 1);
  const refs = refValues(p, o);
  const clip = `sk-clip-${++clipSeq}`;
  const sel = (row: number | undefined) => {
    if (row === undefined) return '';
    const s = f.selected(row);
    return s === false ? ' sk-dim' : s ? ' sk-on' : '';
  };
  const titleH = (t: string) => (t ? 16 : 0);

  let svg = '';
  let plot = '';
  /** Drawn over the marks: reference lines and their labels. */
  let over = '';
  const catLabels = cats.map((c) => c.label);
  if (o.horizontal) {
    // Categories down the left, values along the bottom.
    const yT = titleH(o.yTitle);
    const left = Math.ceil(Math.min(W * 0.4, Math.max(...catLabels.map((l) => textWidth(l, fs))) + 10)) + yT;
    const top = 4;
    const bottom = 20 + titleH(o.xTitle);
    const count = Math.max(2, Math.floor((W - left) / 90));
    const probe = valueScale(ext[0][0], ext[0][1], 0, 1, { count, log, min: o.min, max: o.max });
    const right = Math.max(12 + (o.labels ? 40 : 0), textWidth(fmtAxis(probe.ticks.at(-1) ?? 0), fs) / 2 + 4);
    const x = rescale(probe, left, W - right);
    const y = band(cats.length, top, H - bottom, 0.25);
    for (const t of x.ticks) svg += `<line class="sk-gridline" x1="${r2(x(t))}" x2="${r2(x(t))}" y1="${top}" y2="${H - bottom}"/><text class="sk-tick" x="${r2(x(t))}" y="${H - bottom + 14}" text-anchor="middle">${esc(fmtAxis(t))}</text>`;
    const bars = series.filter((s) => s.kind === 'bar');
    const grouped = o.stack === 'none' && bars.length > 1;
    const sub = grouped ? band(bars.length, 0, y.bandwidth, 0.08, 0) : null;
    cats.forEach((c, i) => {
      if (y.step >= fs * 0.9 || i % Math.ceil((fs * 1.1) / y.step) === 0)
        svg += `<text class="sk-tick sk-cat" x="${r2(left - 6)}" y="${r2(y(i) + y.bandwidth / 2 + 4)}" text-anchor="end">${esc(truncate(c.label, left - yT - 10, fs))}</text>`;
    });
    const base = x.log ? x.domain[0] : 0;
    bars.forEach((s, si) => {
      for (let i = 0; i < cats.length; i++) {
        const v = s.values[i]!;
        if (!Number.isFinite(v)) continue;
        const a = s.y0 ? s.y0[i]! : base;
        const b = s.y1 ? s.y1[i]! : v;
        const x0 = x(Math.min(a, b));
        const w = Math.max(1, Math.abs(x(b) - x(a)));
        const yy = y(i) + (sub ? sub(si) : 0);
        const hh = sub ? sub.bandwidth : y.bandwidth;
        plot += `<rect class="sk-mark sk-bar sk-c${s.color}${sel(s.rows[i])}" data-row="${s.rows[i]}" x="${r2(x0)}" y="${r2(yy)}" width="${r2(w)}" height="${r2(hh)}"/>`;
        if (o.labels && (!s.y0 || si === bars.length - 1)) svg += `<text class="sk-label" x="${r2(x(b) + 4)}" y="${r2(yy + hh / 2 + 4)}">${esc(s.col.fmt(s.y0 ? s.y1![i]! : v))}</text>`;
      }
    });
    const zero = x.log ? left : x(Math.min(Math.max(0, x.domain[0]), x.domain[1]));
    svg += `<line class="sk-axis" x1="${r2(zero)}" x2="${r2(zero)}" y1="${top}" y2="${H - bottom}"/>`;
    for (const r of refs) {
      const xx = r2(x(r.v));
      if (xx < left - 0.5 || xx > W - right + 0.5) continue;
      over += `<line class="sk-ref${r.tone ? ` sk-tone-${r.tone}` : ''}" x1="${xx}" x2="${xx}" y1="${top}" y2="${H - bottom}"/><text class="sk-ref-label${r.tone ? ` sk-tone-${r.tone}` : ''}" x="${r2(xx + 3)}" y="${top + 10}">${esc(r.label)}</text>`;
    }
    if (o.yTitle) svg += `<text class="sk-axis-title" transform="translate(${fs + 1},${r2((top + H - bottom) / 2)}) rotate(-90)" text-anchor="middle">${esc(o.yTitle)}</text>`;
    if (o.xTitle) svg += `<text class="sk-axis-title" x="${r2((left + W - right) / 2)}" y="${H - 3}" text-anchor="middle">${esc(o.xTitle)}</text>`;
    svg = `<defs><clipPath id="${clip}"><rect x="${left}" y="${top - 1}" width="${r2(W - right - left)}" height="${r2(H - bottom - top + 2)}"/></clipPath></defs>` + svg;
  } else {
    const count = Math.max(2, Math.floor(H / 50));
    const yA = valueScale(ext[0][0], ext[0][1], 0, 1, { count, log, min: o.min, max: o.max });
    const yB = hasY2 && o.secondary ? valueScale(ext[1][0], ext[1][1], 0, 1, { count, log }) : null;
    const yT = titleH(o.yTitle);
    const left = Math.ceil(Math.max(...yA.ticks.map((t) => textWidth(fmtAxis(t), fs))) + 12) + yT;
    const right = (yB ? Math.max(...yB.ticks.map((t) => textWidth(fmtAxis2(t), fs))) + 12 : 10) + (yB ? titleH(o.y2Title) : 0);
    const top = 8;
    const maxLabel = Math.max(...catLabels.map((l) => textWidth(l, fs)));
    const hasBars = series.some((s) => s.kind === 'bar');
    let xb = band(cats.length, left, W - right, hasBars ? 0.25 : 0, hasBars ? 0.125 : 0.5);
    // Very few categories: keep bars from becoming slabs.
    const maxBar = 72 * Math.max(1, series.filter((s) => s.kind === 'bar').length * (o.stack === 'none' ? 0.6 : 0.4));
    if (hasBars && xb.bandwidth > maxBar) {
      const shift = (xb.bandwidth - maxBar) / 2;
      const base = xb;
      const nb = ((i: number) => base(i) + shift) as typeof xb;
      nb.step = base.step;
      nb.bandwidth = maxBar;
      xb = nb;
    }
    // Where each category sits (its centre), and how wide its bars may be.
    let cx = (i: number) => xb(i) + xb.bandwidth / 2;
    let barW = xb.bandwidth;
    let xTicks: { x: number; label: string }[] | null = null;
    if (xsSorted) {
      const lo = xsSorted[0]!;
      const hi = xsSorted.at(-1)!;
      let gap = Infinity;
      for (let i = 1; i < xsSorted.length; i++) if (xsSorted[i]! > xsSorted[i - 1]!) gap = Math.min(gap, xsSorted[i]! - xsSorted[i - 1]!);
      const span = hi - lo || 1;
      // Bars need half a bar of room at each end.
      const n = Number.isFinite(gap) ? span / gap + 1 : 1;
      const pad = hasBars ? (W - right - left) / n / 2 : 6;
      const sx = (v: number) => left + pad + ((v - lo) / span) * (W - right - left - 2 * pad);
      cx = (i: number) => sx(xsSorted[i]!);
      barW = hasBars ? Math.min(maxBar, Math.max(1, ((W - right - left - 2 * pad) / span) * (Number.isFinite(gap) ? gap : span) * 0.75)) : 0;
      const tickCount = Math.max(2, Math.floor((W - left - right) / 80));
      if (cont!.time) {
        const tt = timeTicks(lo, hi, tickCount);
        xTicks = tt.ticks.map((t) => ({ x: sx(t), label: formatDate(new Date(t).toISOString().slice(0, 19), tt.pattern) }));
      } else {
        const nt = niceTicks(lo, hi, tickCount);
        const catCol = ctx.data.role('category')[0];
        xTicks = nt.ticks.filter((t) => t >= lo - span * 1e-9 && t <= hi + span * 1e-9).map((t) => ({ x: sx(t), label: catCol ? catCol.fmt(t) : String(t) }));
      }
    }
    const rotate = !xTicks && maxLabel > xb.step * 0.95 && cats.length > 1;
    const xT = titleH(o.xTitle);
    const bottom = (rotate ? Math.min(H * 0.35, Math.min(maxLabel, 90) * 0.7 + 14) : 20) + xT;
    const y = rescale(yA, H - bottom, top);
    const y2 = yB ? rescale(yB, H - bottom, top) : null;
    const yOf = (s: Series) => (s.axis === 1 && y2 ? y2 : y);
    for (const t of y.ticks) svg += `<line class="sk-gridline" x1="${left}" x2="${W - right}" y1="${r2(y(t))}" y2="${r2(y(t))}"/><text class="sk-tick" x="${r2(left - 6)}" y="${r2(y(t) + 4)}" text-anchor="end">${esc(fmtAxis(t))}</text>`;
    if (y2) for (const t of y2.ticks) svg += `<text class="sk-tick" x="${W - right + 6}" y="${r2(y2(t) + 4)}">${esc(fmtAxis2(t))}</text>`;
    const tickY = H - bottom + 14;
    if (xTicks) {
      for (const t of xTicks) svg += `<line class="sk-axis" x1="${r2(t.x)}" x2="${r2(t.x)}" y1="${H - bottom}" y2="${H - bottom + 4}"/><text class="sk-tick sk-cat" x="${r2(t.x)}" y="${tickY}" text-anchor="middle">${esc(t.label)}</text>`;
    } else {
      const every = rotate ? Math.max(1, Math.ceil((fs * 1.2) / xb.step)) : Math.max(1, Math.ceil((maxLabel + 8) / xb.step));
      cats.forEach((c, i) => {
        if (i % every) return;
        if (rotate) svg += `<text class="sk-tick sk-cat" transform="translate(${r2(cx(i) + 3)},${r2(H - bottom + 8)}) rotate(-40)" text-anchor="end">${esc(truncate(c.label, 90, fs))}</text>`;
        else svg += `<text class="sk-tick sk-cat" x="${r2(cx(i))}" y="${tickY}" text-anchor="middle">${esc(c.label)}</text>`;
      });
    }
    // Bars
    const bars = series.filter((s) => s.kind === 'bar');
    const grouped = o.stack === 'none' && bars.length > 1;
    const sub = grouped ? band(bars.length, 0, barW, 0.08, 0) : null;
    bars.forEach((s, si) => {
      const ys = yOf(s);
      const base = ys.log ? ys.domain[0] : 0;
      for (let i = 0; i < cats.length; i++) {
        const v = s.values[i]!;
        if (!Number.isFinite(v)) continue;
        const a = s.y0 ? s.y0[i]! : base;
        const b = s.y1 ? s.y1[i]! : v;
        const y0 = ys(Math.max(a, b));
        const h = Math.max(1, Math.abs(ys(a) - ys(b)));
        const xx = cx(i) - barW / 2 + (sub ? sub(si) : 0);
        const ww = sub ? sub.bandwidth : barW;
        plot += `<rect class="sk-mark sk-bar sk-c${s.color}${sel(s.rows[i])}" data-row="${s.rows[i]}" x="${r2(xx)}" y="${r2(y0)}" width="${r2(ww)}" height="${r2(h)}"/>`;
        if (o.labels && ww > 14 && (!s.y0 || si === bars.length - 1)) svg += `<text class="sk-label" x="${r2(xx + ww / 2)}" y="${r2(y0 - 4)}" text-anchor="middle">${esc(s.col.fmt(s.y0 ? s.y1![i]! : v))}</text>`;
      }
    });
    // Areas and lines
    for (const s of series.filter((x) => x.kind !== 'bar')) {
      const ys = yOf(s);
      const pts: [number, number][] = [];
      const base: [number, number][] = [];
      const segs: [number, number][][] = [];
      const floor = ys.log ? ys.domain[0] : 0;
      for (let i = 0; i < cats.length; i++) {
        const v = s.y1 ? s.y1[i]! : s.values[i]!;
        if (!Number.isFinite(s.values[i]!)) {
          if (pts.length) segs.push(pts.splice(0));
          continue;
        }
        pts.push([cx(i), ys(v)]);
        base.push([cx(i), ys(s.y0 ? s.y0[i]! : floor)]);
      }
      if (pts.length) segs.push(pts);
      if (s.kind === 'area') {
        const all = segs.flat();
        if (all.length) plot += `<path class="sk-area sk-c${s.color}" d="${linePath(all, o.smooth)}L${base
          .slice()
          .reverse()
          .map(([a, b]) => `${r2(a)},${r2(b)}`)
          .join('L')}Z"/>`;
      }
      for (const seg of segs) plot += `<path class="sk-line sk-c${s.color}" d="${linePath(seg, o.smooth)}"/>`;
      for (let i = 0; i < cats.length; i++) {
        const v = s.y1 ? s.y1[i]! : s.values[i]!;
        if (!Number.isFinite(s.values[i]!)) continue;
        const px = r2(cx(i));
        const py = r2(ys(v));
        plot += `<circle class="sk-hit sk-mark sk-c${s.color}${sel(s.rows[i])}${o.markers ? ' sk-marker' : ''}" data-row="${s.rows[i]}" cx="${px}" cy="${py}" r="${o.markers ? 3.5 : 6}"/>`;
        if (o.labels) svg += `<text class="sk-label" x="${px}" y="${r2(py - 7)}" text-anchor="middle">${esc(s.col.fmt(s.values[i]!))}</text>`;
      }
    }
    if (!y.log && y.domain[0] < 0 && y.domain[1] > 0) svg += `<line class="sk-axis" x1="${left}" x2="${W - right}" y1="${r2(y(0))}" y2="${r2(y(0))}"/>`;
    svg += `<line class="sk-axis" x1="${left}" x2="${W - right}" y1="${H - bottom}" y2="${H - bottom}"/>`;
    for (const r of refs) {
      const yy = r2(y(r.v));
      if (yy < top - 0.5 || yy > H - bottom + 0.5) continue;
      over += `<line class="sk-ref${r.tone ? ` sk-tone-${r.tone}` : ''}" x1="${left}" x2="${W - right}" y1="${yy}" y2="${yy}"/><text class="sk-ref-label${r.tone ? ` sk-tone-${r.tone}` : ''}" x="${W - right - 3}" y="${r2(yy - 4)}" text-anchor="end">${esc(r.label)}</text>`;
    }
    if (o.yTitle) svg += `<text class="sk-axis-title" transform="translate(${fs + 1},${r2((top + H - bottom) / 2)}) rotate(-90)" text-anchor="middle">${esc(o.yTitle)}</text>`;
    if (y2 && o.y2Title) svg += `<text class="sk-axis-title" transform="translate(${W - 5},${r2((top + H - bottom) / 2)}) rotate(90)" text-anchor="middle">${esc(o.y2Title)}</text>`;
    if (o.xTitle) svg += `<text class="sk-axis-title" x="${r2((left + W - right) / 2)}" y="${H - 3}" text-anchor="middle">${esc(o.xTitle)}</text>`;
    // Marks outside fixed ends are cut at the plot (with room for line markers).
    svg = `<defs><clipPath id="${clip}"><rect x="${left - 6}" y="${top - 6}" width="${r2(W - right - left + 12)}" height="${r2(H - bottom - top + 6)}"/></clipPath></defs>` + svg;
  }
  const legendTop = o.legend !== 'bottom';
  return `<div class="sk-chart">${legendTop ? legend : ''}<svg class="sk-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg}<g clip-path="url(#${clip})">${plot}</g>${over}</svg>${legendTop ? '' : legend}</div>`;
}

/** Draw a cartesian chart: one plot, or with a `multiples` field a grid of small plots sharing one scale. */
function render(ctx: ChartContext, kindFor: (role: string, i: number) => Kind, axisFor: (role: string) => 0 | 1, o: ChartOpts): void {
  const all = prepare(ctx, kindFor, axisFor);
  const legendOf = (p: Prepared) => {
    const show = o.legend !== 'none' && (p.series.length > 1 || o.legend !== 'auto');
    return show ? legendHtml(p.series.map((s) => s.name), ctx.palette) : '';
  };
  const facet = ctx.data.role('multiples')[0];
  if (!facet || !ctx.data.rows) {
    ctx.el.innerHTML = cartesianHtml(ctx, ctx, all, o, legendOf(all));
    return;
  }
  // Small multiples: a panel per value of the field, the same categories, series and value scale in each.
  const groups = new Map<unknown, number[]>();
  for (let r = 0; r < ctx.data.rows; r++) {
    const v = facet.values[r];
    const k = typeof v === 'bigint' ? Number(v) : v;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(r);
  }
  const MAX = 24;
  const keys = [...groups.keys()];
  const shown = keys.slice(0, MAX);
  const panels = shown.map((k) => ({ title: facet.fmt(facet.values[groups.get(k)![0]!]!), p: prepare(ctx, kindFor, axisFor, groups.get(k), all) }));
  for (const { p } of panels) stackSeries(p, o.stack, o.horizontal ? ['bar'] : ['bar', 'area']);
  const ext = [
    [Infinity, -Infinity],
    [Infinity, -Infinity],
  ] as [number, number][];
  for (const { p } of panels) {
    const e = extents(p, o);
    for (const a of [0, 1]) {
      ext[a]![0] = Math.min(ext[a]![0], e[a]![0]);
      ext[a]![1] = Math.max(ext[a]![1], e[a]![1]);
    }
  }
  const legend = legendOf(all);
  const legendH = legend ? 24 : 0;
  const W = Math.max(60, ctx.width);
  const H = Math.max(40, ctx.height - legendH - (keys.length > MAX ? 18 : 0));
  const n = panels.length;
  // Columns so that panels come out about 1.4 times as wide as they are tall.
  let cols = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * W) / (H * 1.4)))));
  while (cols < n && W / cols > 140 && Math.ceil(n / cols) * 90 > H) cols++;
  const rows = Math.ceil(n / cols);
  const pw = Math.floor((W - (cols - 1) * 8) / cols);
  const ph = Math.max(60, Math.floor((H - (rows - 1) * 8) / rows) - 18);
  const po: ChartOpts = { ...o, legend: 'none', ext, xTitle: '', yTitle: '', y2Title: '' };
  const cells = panels.map(({ title, p }) => `<div class="sk-panel"><div class="sk-panel-title">${esc(title)}</div>${cartesianHtml(ctx, { ...ctx, width: pw, height: ph }, p, po, '')}</div>`).join('');
  const more = keys.length > MAX ? `<div class="sk-more">Showing ${MAX} of ${keys.length} panels</div>` : '';
  const legendTop = o.legend !== 'bottom';
  ctx.el.innerHTML = `<div class="sk-chart sk-multiples-wrap">${legendTop ? legend : ''}<div class="sk-multiples" style="grid-template-columns:repeat(${cols},${pw}px)">${cells}</div>${more}${legendTop ? '' : legend}</div>`;
}

function dim(ctx: ChartContext, row: number | undefined): string {
  if (row === undefined) return '';
  const s = ctx.selected(row);
  return s === false ? ' sk-dim' : s ? ' sk-on' : '';
}

function opts(ctx: ChartContext, horizontal: boolean): ChartOpts {
  const o = ctx.options;
  const num = (v: unknown) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    horizontal,
    stack: String(o.stack ?? 'none'),
    smooth: !!o.smooth,
    markers: !!o.markers,
    labels: !!o.labels,
    legend: String(o.legend ?? 'auto'),
    secondary: o.secondaryAxis !== false,
    continuous: o.xAxis === 'continuous',
    log: o.yScale === 'log',
    min: num(o.yMin),
    max: num(o.yMax),
    xTitle: str(o.xTitle),
    yTitle: str(o.yTitle),
    y2Title: str(o.y2Title),
    refLines: Array.isArray(o.refLines) ? (o.refLines as RefLine[]) : [],
  };
}

/**
 * Horizontal bars. Roles: `category`, optional `series` and `multiples` (small multiples), measures. Options: stack
 * (none, stacked, percent), labels, legend, and the value axis: yScale (linear, log), yMin, yMax, refLines, xTitle,
 * yTitle.
 */
export function barChart(ctx: ChartContext): void {
  render(ctx, () => 'bar', () => 0, opts(ctx, true));
}

/** Vertical columns. Same roles and options as barChart, and xAxis: category (default) or continuous (dates, numbers). */
export function columnChart(ctx: ChartContext): void {
  render(ctx, () => 'bar', () => 0, opts(ctx, false));
}

/** Lines. Roles as barChart. Options: smooth, markers, labels, legend, xAxis and the axis options of columnChart. */
export function lineChart(ctx: ChartContext): void {
  render(ctx, () => 'line', () => 0, opts(ctx, false));
}

/** Areas. Roles as barChart. Options: stack, smooth, markers, labels, legend, and the axis options of columnChart. */
export function areaChart(ctx: ChartContext): void {
  render(ctx, () => 'area', () => 0, opts(ctx, false));
}

/**
 * Columns and lines: measures in role `columns` are bars, in role `lines` are lines (option secondaryAxis puts them on
 * a second axis, titled by y2Title). The axis options of columnChart apply.
 */
export function comboChart(ctx: ChartContext): void {
  render(
    ctx,
    (role) => (role === 'lines' ? 'line' : 'bar'),
    (role) => (role === 'lines' && ctx.options.secondaryAxis !== false ? 1 : 0),
    { ...opts(ctx, false), markers: true },
  );
}

/** Pie. Roles: `category` and one measure. Options: labels, legend. */
export function pieChart(ctx: ChartContext): void {
  renderPie(ctx, false);
}

/** Donut: as pieChart, with options `hole` (0–1) and `center` (show the total). */
export function donutChart(ctx: ChartContext): void {
  renderPie(ctx, true);
}


function empty(ctx: ChartContext, msg = 'No data'): boolean {
  if (ctx.data.rows > 0 && ctx.data.measures.length) return false;
  ctx.el.innerHTML = `<div class="sk-empty">${esc(msg)}</div>`;
  return true;
}

function renderPie(ctx: ChartContext, donut: boolean): void {
  if (empty(ctx)) return;
  const cat = ctx.data.role('category')[0];
  const m = ctx.data.measures[0]!;
  const n = ctx.data.rows;
  const vals = Array.from({ length: n }, (_, i) => Math.max(0, toNum(m.values[i])));
  const total = vals.reduce((a, b) => a + (b || 0), 0) || 1;
  const names = Array.from({ length: n }, (_, i) => (cat ? cat.fmt(cat.values[i]!) : m.label));
  const legendPos = String(ctx.options.legend ?? 'auto');
  const showLegend = legendPos !== 'none';
  const side = showLegend && (legendPos === 'right' || (legendPos === 'auto' && ctx.width > ctx.height * 1.4));
  const legendW = side ? Math.min(ctx.width * 0.4, Math.max(...names.map((s) => textWidth(s, 11))) + 30) : 0;
  const legendH = showLegend && !side ? 26 : 0;
  const W = Math.max(20, ctx.width - legendW);
  const H = Math.max(20, ctx.height - legendH);
  const R = Math.max(10, Math.min(W, H) / 2 - (ctx.options.labels ? 22 : 6));
  const r0 = donut ? R * Number(ctx.options.hole ?? 0.6) : 0;
  const cx = W / 2;
  const cy = H / 2;
  let a = 0;
  let svg = '';
  vals.forEach((v, i) => {
    const da = (v / total) * Math.PI * 2;
    if (da <= 0) return;
    svg += `<path class="sk-mark sk-slice sk-c${i % ctx.palette}${dim(ctx, i)}" data-row="${i}" d="${arc(cx, cy, r0, R, a, a + da)}"/>`;
    if (ctx.options.labels && da > 0.25) {
      const mid = a + da / 2;
      const lr = donut ? (r0 + R) / 2 : R * 0.65;
      svg += `<text class="sk-label sk-on-mark" x="${r2(cx + lr * Math.sin(mid))}" y="${r2(cy - lr * Math.cos(mid) + 4)}" text-anchor="middle">${esc(Math.round((v / total) * 100) + '%')}</text>`;
    }
    a += da;
  });
  if (donut && ctx.options.center !== false) {
    svg += `<text class="sk-donut-total" x="${cx}" y="${r2(cy + 2)}" text-anchor="middle">${esc(axisFormatter(m.format)(total))}</text><text class="sk-donut-caption" x="${cx}" y="${r2(cy + 18)}" text-anchor="middle">${esc(truncate(m.label, r0 * 1.6, 11))}</text>`;
  }
  const legend = showLegend ? legendHtml(names, ctx.palette) : '';
  ctx.el.innerHTML = `<div class="sk-chart ${side ? 'sk-legend-right' : ''}">${side ? '' : legend}<svg class="sk-svg" width="${W}" height="${H}">${svg}</svg>${side ? legend : ''}</div>`;
}

export interface TreeNode {
  i: number;
  v: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Squarified treemap layout (Bruls, Huizing, van Wijk). */
export function squarify(nodes: TreeNode[], rect: Rect): (Rect & { i: number })[] {
  const out: (Rect & { i: number })[] = [];
  const total = nodes.reduce((a, n) => a + n.v, 0);
  if (!total) return out;
  const scale = (rect.w * rect.h) / total;
  const items = nodes.map((n) => ({ i: n.i, a: n.v * scale })).filter((n) => n.a > 0);
  let { x, y, w, h } = rect;
  let row: { i: number; a: number }[] = [];
  const worst = (r: { a: number }[], side: number) => {
    const s = r.reduce((acc, n) => acc + n.a, 0);
    let mx = 0;
    for (const n of r) mx = Math.max(mx, Math.max((side * side * n.a) / (s * s), (s * s) / (side * side * n.a)));
    return mx;
  };
  const flush = () => {
    const s = row.reduce((acc, n) => acc + n.a, 0);
    if (w >= h) {
      const cw = s / h;
      let yy = y;
      for (const n of row) {
        const ch = n.a / cw;
        out.push({ i: n.i, x, y: yy, w: cw, h: ch });
        yy += ch;
      }
      x += cw;
      w -= cw;
    } else {
      const ch = s / w;
      let xx = x;
      for (const n of row) {
        const cw = n.a / ch;
        out.push({ i: n.i, x: xx, y, w: cw, h: ch });
        xx += cw;
      }
      y += ch;
      h -= ch;
    }
    row = [];
  };
  for (const it of items) {
    const side = Math.min(w, h);
    if (row.length && worst([...row, it], side) > worst(row, side)) flush();
    row.push(it);
  }
  if (row.length) flush();
  return out;
}


/** Funnel: roles `category` (stage) and one measure. */
export function funnelChart(ctx: ChartContext): void {
    if (empty(ctx)) return;
    const cat = ctx.data.role('category')[0];
    const m = ctx.data.measures[0]!;
    const n = ctx.data.rows;
    const vals = Array.from({ length: n }, (_, i) => Math.max(0, toNum(m.values[i]) || 0));
    const max = Math.max(...vals) || 1;
    const first = vals[0] || 1;
    const labelW = Math.min(ctx.width * 0.3, Math.max(...Array.from({ length: n }, (_, i) => textWidth(cat ? cat.fmt(cat.values[i]!) : '', 11))) + 12);
    const W = ctx.width - labelW;
    const y = band(n, 0, ctx.height, 0.15);
    let svg = '';
    vals.forEach((v, i) => {
      const w = Math.max(2, (v / max) * (W - 8));
      const x = labelW + (W - w) / 2;
      svg += `<rect class="sk-mark sk-bar sk-c0${dim(ctx, i)}" data-row="${i}" x="${r2(x)}" y="${r2(y(i))}" width="${r2(w)}" height="${r2(y.bandwidth)}"/>`;
      const txt = m.fmt(v) + (ctx.options.percent !== false && i > 0 ? `  ·  ${Math.round((v / first) * 100)}%` : '');
      svg += `<text class="sk-label sk-on-mark" x="${r2(labelW + W / 2)}" y="${r2(y(i) + y.bandwidth / 2 + 4)}" text-anchor="middle">${esc(txt)}</text>`;
      if (cat) svg += `<text class="sk-tick sk-cat" x="${r2(labelW - 8)}" y="${r2(y(i) + y.bandwidth / 2 + 4)}" text-anchor="end">${esc(truncate(cat.fmt(cat.values[i]!), labelW - 10, 11))}</text>`;
    });
    ctx.el.innerHTML = `<svg class="sk-svg" width="${ctx.width}" height="${ctx.height}">${svg}</svg>`;
  }

/** Treemap (squarified): role `category` and one measure. */
export function treemapChart(ctx: ChartContext): void {
    if (empty(ctx)) return;
    const cat = ctx.data.role('category')[0];
    const m = ctx.data.measures[0]!;
    const nodes: TreeNode[] = [];
    for (let i = 0; i < ctx.data.rows; i++) nodes.push({ i, v: Math.max(0, toNum(m.values[i]) || 0) });
    nodes.sort((a, b) => b.v - a.v);
    const rects = squarify(nodes, { x: 0, y: 0, w: ctx.width, h: ctx.height });
    let svg = '';
    for (const r of rects) {
      svg += `<rect class="sk-mark sk-tile sk-c${r.i % ctx.palette}${dim(ctx, r.i)}" data-row="${r.i}" x="${r2(r.x + 1)}" y="${r2(r.y + 1)}" width="${r2(Math.max(0, r.w - 2))}" height="${r2(Math.max(0, r.h - 2))}"/>`;
      if (r.w > 40 && r.h > 22) {
        const name = cat ? cat.fmt(cat.values[r.i]!) : m.label;
        svg += `<text class="sk-label sk-on-mark" x="${r2(r.x + 7)}" y="${r2(r.y + 17)}">${esc(truncate(name, r.w - 12, 11))}</text>`;
        if (r.h > 38 && ctx.options.labels !== false) svg += `<text class="sk-label sk-on-mark sk-sub" x="${r2(r.x + 7)}" y="${r2(r.y + 32)}">${esc(truncate(m.fmt(m.values[r.i]!), r.w - 12, 11))}</text>`;
      }
    }
    ctx.el.innerHTML = `<svg class="sk-svg" width="${ctx.width}" height="${ctx.height}">${svg}</svg>`;
  }

/** Waterfall: role `category` and one measure (the change); option `total` adds a total bar. */
export function waterfallChart(ctx: ChartContext): void {
    if (empty(ctx)) return;
    const cat = ctx.data.role('category')[0];
    const m = ctx.data.measures[0]!;
    const n = ctx.data.rows;
    const steps: { label: string; a: number; b: number; row: number; kind: 'up' | 'down' | 'total' }[] = [];
    let run = 0;
    for (let i = 0; i < n; i++) {
      const v = toNum(m.values[i]) || 0;
      steps.push({ label: cat ? cat.fmt(cat.values[i]!) : String(i + 1), a: run, b: run + v, row: i, kind: v >= 0 ? 'up' : 'down' });
      run += v;
    }
    if (ctx.options.total !== false) steps.push({ label: 'Total', a: 0, b: run, row: -1, kind: 'total' });
    const lo = Math.min(0, ...steps.map((s) => Math.min(s.a, s.b)));
    const hi = Math.max(0, ...steps.map((s) => Math.max(s.a, s.b)));
    const fmt = axisFormatter(m.format);
    const yt = linear(lo, hi, 0, 1, { count: Math.max(2, Math.floor(ctx.height / 50)) });
    const left = Math.ceil(Math.max(...yt.ticks.map((t) => textWidth(fmt(t), 11))) + 12);
    const bottom = 20;
    const y = linear(yt.domain[0], yt.domain[1], ctx.height - bottom, 8, { nice: false, zero: false });
    const x = band(steps.length, left, ctx.width - 8, 0.3);
    let svg = '';
    for (const t of yt.ticks) svg += `<line class="sk-gridline" x1="${left}" x2="${ctx.width - 8}" y1="${r2(y(t))}" y2="${r2(y(t))}"/><text class="sk-tick" x="${r2(left - 6)}" y="${r2(y(t) + 4)}" text-anchor="end">${esc(fmt(t))}</text>`;
    const every = Math.max(1, Math.ceil(60 / x.step));
    steps.forEach((s, i) => {
      const top = y(Math.max(s.a, s.b));
      const h = Math.max(1, Math.abs(y(s.a) - y(s.b)));
      const cls = s.kind === 'up' ? 'sk-pos' : s.kind === 'down' ? 'sk-neg' : 'sk-c0';
      svg += `<rect class="sk-mark sk-bar ${cls}${s.row >= 0 ? dim(ctx, s.row) : ''}" ${s.row >= 0 ? `data-row="${s.row}"` : ''} x="${r2(x(i))}" y="${r2(top)}" width="${r2(x.bandwidth)}" height="${r2(h)}"/>`;
      if (i < steps.length - 1 && s.kind !== 'total') svg += `<line class="sk-connector" x1="${r2(x(i) + x.bandwidth)}" x2="${r2(x(i + 1))}" y1="${r2(y(s.b))}" y2="${r2(y(s.b))}"/>`;
      if (ctx.options.labels) svg += `<text class="sk-label" x="${r2(x(i) + x.bandwidth / 2)}" y="${r2(top - 4)}" text-anchor="middle">${esc(m.fmt(s.kind === 'total' ? s.b : s.b - s.a))}</text>`;
      if (i % every === 0) svg += `<text class="sk-tick sk-cat" x="${r2(x(i) + x.bandwidth / 2)}" y="${ctx.height - 6}" text-anchor="middle">${esc(truncate(s.label, x.step * every - 4, 11))}</text>`;
    });
    svg += `<line class="sk-axis" x1="${left}" x2="${ctx.width - 8}" y1="${r2(y(0))}" y2="${r2(y(0))}"/>`;
    ctx.el.innerHTML = `<svg class="sk-svg" width="${ctx.width}" height="${ctx.height}">${svg}</svg>`;
  }

/** Gauge: roles `values`, optional `target` and `max`; option `maxValue` when there is no max column. */
export function gaugeChart(ctx: ChartContext): void {
    const v = ctx.data.role('values')[0];
    if (!v || !ctx.data.rows) {
      ctx.el.innerHTML = '<div class="sk-empty">Add a value</div>';
      return;
    }
    const val = toNum(v.values[0]) || 0;
    const tgtCol = ctx.data.role('target')[0];
    const tgt = tgtCol ? toNum(tgtCol.values[0]) : NaN;
    const maxCol = ctx.data.role('max')[0];
    const max = (maxCol ? toNum(maxCol.values[0]) : Number(ctx.options.maxValue)) || Math.max(val, Number.isFinite(tgt) ? tgt : 0) * 1.25 || 1;
    const W = ctx.width;
    const H = ctx.height;
    const R = Math.max(20, Math.min(W / 2 - 8, H - 34));
    const cx = W / 2;
    const cy = 8 + R;
    const th = R * 0.22;
    const ang = (x: number) => -Math.PI / 2 + Math.max(0, Math.min(1, x / max)) * Math.PI;
    let svg = `<path class="sk-gauge-track" d="${arc(cx, cy, R - th, R, -Math.PI / 2, Math.PI / 2)}"/>`;
    svg += `<path class="sk-mark sk-c0" data-row="0" d="${arc(cx, cy, R - th, R, -Math.PI / 2, ang(val))}"/>`;
    if (Number.isFinite(tgt)) {
      const a = ang(tgt);
      svg += `<line class="sk-gauge-target" x1="${r2(cx + (R - th - 4) * Math.sin(a))}" y1="${r2(cy - (R - th - 4) * Math.cos(a))}" x2="${r2(cx + (R + 4) * Math.sin(a))}" y2="${r2(cy - (R + 4) * Math.cos(a))}"/>`;
    }
    svg += `<text class="sk-gauge-value" x="${cx}" y="${r2(cy - 4)}" text-anchor="middle">${esc(v.fmt(val))}</text>`;
    svg += `<text class="sk-tick" x="${r2(cx - R + th / 2)}" y="${r2(cy + 16)}" text-anchor="middle">0</text><text class="sk-tick" x="${r2(cx + R - th / 2)}" y="${r2(cy + 16)}" text-anchor="middle">${esc(axisFormatter(v.format)(max))}</text>`;
    if (Number.isFinite(tgt)) svg += `<text class="sk-tick" x="${cx}" y="${r2(cy + 18)}" text-anchor="middle">Target ${esc(v.fmt(tgt))}</text>`;
    ctx.el.innerHTML = `<svg class="sk-svg" width="${W}" height="${H}">${svg}</svg>`;
  }

/** KPI card: roles `values`, optional `target` (comparison); `extra.trend` draws a sparkline. Options: `compare` (delta, value, none), `goodWhen` (up, down), `caption`. */
export function kpiCard(ctx: ChartContext): void {
    const v = ctx.data.role('values')[0];
    if (!v) {
      ctx.el.innerHTML = '<div class="sk-empty">Add a value</div>';
      return;
    }
    const val = ctx.data.rows ? v.values[0]! : null;
    const t = ctx.data.role('target')[0];
    let cmp = '';
    if (t && ctx.data.rows && ctx.options.compare !== 'none') {
      const a = toNum(val);
      const b = toNum(t.values[0]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const up = a >= b;
        const good = ctx.options.goodWhen === 'down' ? !up : up;
        const txt = ctx.options.compare === 'value' ? `${t.label}: ${t.fmt(b)}` : b ? `${up ? '▲' : '▼'} ${Math.abs(((a - b) / Math.abs(b)) * 100).toFixed(1)}% vs ${t.label}` : '';
        cmp = `<div class="sk-kpi-cmp ${good ? 'sk-good' : 'sk-bad'}">${esc(txt)}</div>`;
      }
    }
    let spark = '';
    const tr = ctx.extra.trend;
    if (tr && tr.rows > 1) {
      const m = tr.measures[0]!;
      const all = Array.from({ length: tr.rows }, (_, i) => toNum(m.values[i]));
      const idx = [...all.keys()].filter((i) => Number.isFinite(all[i]!));
      const lo = Math.min(...idx.map((i) => all[i]!));
      const hi = Math.max(...idx.map((i) => all[i]!));
      const w = Math.max(40, ctx.width);
      const h = Math.max(16, Math.min(48, ctx.height * 0.3));
      const xOf = (i: number) => r2((i / (all.length - 1)) * w);
      const pts = idx.map((i) => `${xOf(i)},${r2(h - 2 - ((all[i]! - lo) / (hi - lo || 1)) * (h - 4))}`);
      if (pts.length > 1)
        spark = `<svg class="sk-spark" width="${w}" height="${h}" preserveAspectRatio="none"><path class="sk-area sk-c0" d="M${xOf(idx[0]!)},${h}L${pts.join('L')}L${xOf(idx[idx.length - 1]!)},${h}Z"/><path class="sk-line sk-c0" d="M${pts.join('L')}"/></svg>`;
    }
    const caption = String(ctx.options.caption || v.label);
    const cf = cellFormatHtml(ctx.data.rows ? ctx.cellFormat?.(v, 0) : null);
    ctx.el.innerHTML = `<div class="sk-kpi"><div class="sk-kpi-value${cf.cls}">${cf.icon}${esc(v.fmt(val))}</div><div class="sk-kpi-caption">${esc(caption)}</div>${cmp}${spark}</div>`;
  }

/** Scatter / bubble chart: roles `x`, `y`, optional `size` and `legend`; one point per row. */
export function scatterChart(ctx: ChartContext): void {
    const xc = ctx.data.role('x')[0];
    const yc = ctx.data.role('y')[0];
    if (!xc || !yc || !ctx.data.rows) {
      ctx.el.innerHTML = `<div class="sk-empty">${xc && yc ? 'No data' : 'Add X and Y values'}</div>`;
      return;
    }
    const sc = ctx.data.role('size')[0];
    const lc = ctx.data.role('legend')[0];
    const n = ctx.data.rows;
    const xs = Array.from({ length: n }, (_, i) => toNum(xc.values[i]));
    const ys = Array.from({ length: n }, (_, i) => toNum(yc.values[i]));
    const ss = sc ? Array.from({ length: n }, (_, i) => Math.max(0, toNum(sc.values[i]) || 0)) : null;
    const smax = ss ? Math.max(...ss) || 1 : 1;
    const groups = new Map<unknown, number>();
    const names: string[] = [];
    const color = (i: number) => {
      if (!lc) return 0;
      const v = lc.values[i];
      let g = groups.get(v);
      if (g === undefined) {
        g = groups.size;
        groups.set(v, g);
        names.push(lc.fmt(v ?? null));
      }
      return g % ctx.palette;
    };
    const colors = Array.from({ length: n }, (_, i) => color(i));
    const showLegend = lc && ctx.options.legend !== 'none';
    const legendH = showLegend ? 24 : 0;
    const W = ctx.width;
    const H = Math.max(20, ctx.height - legendH);
    const fx = axisFormatter(xc.format);
    const fy = axisFormatter(yc.format);
    const fin = (a: number[]) => a.filter(Number.isFinite);
    const zero = !!ctx.options.zero;
    const ytmp = linear(Math.min(...fin(ys)), Math.max(...fin(ys)), 0, 1, { zero, count: Math.max(2, Math.floor(H / 50)) });
    const left = Math.ceil(Math.max(...ytmp.ticks.map((t) => textWidth(fy(t), 11))) + 12);
    const bottom = 34;
    const xcount = Math.max(2, Math.floor(W / 90));
    const xLast = linear(Math.min(...fin(xs)), Math.max(...fin(xs)), 0, 1, { zero, count: xcount }).ticks.at(-1) ?? 0;
    const x = linear(Math.min(...fin(xs)), Math.max(...fin(xs)), left + 6, W - Math.max(10, textWidth(fx(xLast), 11) / 2 + 2), { zero, count: xcount });
    const y = linear(ytmp.domain[0], ytmp.domain[1], H - bottom, 8, { nice: false, zero: false });
    let svg = '';
    for (const t of ytmp.ticks) svg += `<line class="sk-gridline" x1="${left}" x2="${W - 10}" y1="${r2(y(t))}" y2="${r2(y(t))}"/><text class="sk-tick" x="${r2(left - 6)}" y="${r2(y(t) + 4)}" text-anchor="end">${esc(fy(t))}</text>`;
    for (const t of x.ticks) svg += `<line class="sk-gridline" y1="8" y2="${H - bottom}" x1="${r2(x(t))}" x2="${r2(x(t))}"/><text class="sk-tick" y="${H - bottom + 15}" x="${r2(x(t))}" text-anchor="middle">${esc(fx(t))}</text>`;
    svg += `<text class="sk-axis-title" x="${r2((left + W) / 2)}" y="${H - 4}" text-anchor="middle">${esc(xc.label)}</text>`;
    const maxR = Math.max(6, Math.min(W, H) / 14);
    const order = ss ? [...xs.keys()].sort((a, b) => ss[b]! - ss[a]!) : [...xs.keys()];
    for (const i of order) {
      if (!Number.isFinite(xs[i]!) || !Number.isFinite(ys[i]!)) continue;
      const r = ss ? 3 + Math.sqrt(ss[i]! / smax) * maxR : 4.5;
      svg += `<circle class="sk-mark sk-dot sk-c${colors[i]}${dim(ctx, i)}" data-row="${i}" cx="${r2(x(xs[i]!))}" cy="${r2(y(ys[i]!))}" r="${r2(r)}"/>`;
    }
    const legend = showLegend ? legendHtml(names, ctx.palette) : '';
    ctx.el.innerHTML = `<div class="sk-chart">${legend}<svg class="sk-svg" width="${W}" height="${H}">${svg}</svg></div>`;
  }

/** Heatmap: roles `rows`, `columns` and one measure, coloured along the sequential ramp. */
export function heatmapChart(ctx: ChartContext): void {
    const rc = ctx.data.role('rows')[0];
    const cc = ctx.data.role('columns')[0];
    const m = ctx.data.measures[0];
    if (!rc || !cc || !m || !ctx.data.rows) {
      ctx.el.innerHTML = `<div class="sk-empty">${rc && cc && m ? 'No data' : 'Add rows, columns and a value'}</div>`;
      return;
    }
    const rIdx = new Map<unknown, number>();
    const cIdx = new Map<unknown, number>();
    const rl: string[] = [];
    const cl: string[] = [];
    const cells: { r: number; c: number; v: number; row: number }[] = [];
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < ctx.data.rows; i++) {
      const rv = rc.values[i];
      const cv = cc.values[i];
      if (!rIdx.has(rv)) {
        rIdx.set(rv, rl.length);
        rl.push(rc.fmt(rv ?? null));
      }
      if (!cIdx.has(cv)) {
        cIdx.set(cv, cl.length);
        cl.push(cc.fmt(cv ?? null));
      }
      const v = toNum(m.values[i]);
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      cells.push({ r: rIdx.get(rv)!, c: cIdx.get(cv)!, v, row: i });
    }
    const left = Math.ceil(Math.min(ctx.width * 0.3, Math.max(...rl.map((s) => textWidth(s, 11))) + 10));
    const top = 20;
    const x = band(cl.length, left, ctx.width, 0.06, 0);
    const y = band(rl.length, top, ctx.height, 0.06, 0);
    let svg = '';
    cl.forEach((l, i) => {
      if (x.step > 18) svg += `<text class="sk-tick" x="${r2(x(i) + x.bandwidth / 2)}" y="13" text-anchor="middle">${esc(truncate(l, x.step - 2, 11))}</text>`;
    });
    rl.forEach((l, i) => {
      if (y.step > 9) svg += `<text class="sk-tick" x="${r2(left - 6)}" y="${r2(y(i) + y.bandwidth / 2 + 4)}" text-anchor="end">${esc(truncate(l, left - 8, 11))}</text>`;
    });
    for (const c of cells) {
      const t = (c.v - lo) / (hi - lo || 1);
      svg += `<rect class="sk-mark sk-cell${dim(ctx, c.row)}" data-row="${c.row}" x="${r2(x(c.c))}" y="${r2(y(c.r))}" width="${r2(x.bandwidth)}" height="${r2(y.bandwidth)}" style="fill:${Number.isFinite(c.v) ? seqColor(t) : 'transparent'}"/>`;
      if (ctx.options.labels !== false && x.bandwidth > 34 && y.bandwidth > 14)
        svg += `<text class="sk-label ${t > 0.55 ? 'sk-on-mark' : ''}" x="${r2(x(c.c) + x.bandwidth / 2)}" y="${r2(y(c.r) + y.bandwidth / 2 + 4)}" text-anchor="middle">${esc(truncate(m.fmt(c.v), x.bandwidth - 4, 11))}</text>`;
    }
    ctx.el.innerHTML = `<svg class="sk-svg" width="${ctx.width}" height="${ctx.height}">${svg}</svg>`;
  }
