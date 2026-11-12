// Small, dependency-free helpers for hand-written SVG charts: scales, nice ticks, escaping, arcs.
// Charts build markup strings (fast: one innerHTML per render) and style everything through the
// theme's CSS variables.

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** "Nice" tick values covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 5): { ticks: number[]; min: number; max: number } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { ticks: [0, 1], min: 0, max: 1 };
  if (lo === hi) {
    if (lo === 0) return { ticks: [0, 1], min: 0, max: 1 };
    const pad = Math.abs(lo) * 0.1;
    lo -= pad;
    hi += pad;
  }
  const span = hi - lo;
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const min = Math.floor(lo / step + 1e-9) * step;
  const max = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12));
  return { ticks, min, max };
}

export interface Linear {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
  ticks: number[];
  /** A log scale (from logScale). */
  log?: boolean;
}

export function linear(lo: number, hi: number, r0: number, r1: number, opts: { zero?: boolean; nice?: boolean; count?: number } = {}): Linear {
  if (opts.zero !== false) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  let ticks: number[] = [];
  if (opts.nice !== false) {
    const t = niceTicks(lo, hi, opts.count ?? 5);
    lo = t.min;
    hi = t.max;
    ticks = t.ticks;
  }
  const span = hi - lo || 1;
  const f = ((v: number) => r0 + ((v - lo) / span) * (r1 - r0)) as Linear;
  f.domain = [lo, hi];
  f.range = [r0, r1];
  f.ticks = ticks;
  return f;
}

/** A log-10 scale over [lo, hi] (both > 0): ticks at 1, 10, 100… (with 2 and 5 between when there are few decades). */
export function logScale(lo: number, hi: number, r0: number, r1: number): Linear {
  if (!(lo > 0)) lo = 1;
  if (!(hi > lo)) hi = lo * 10;
  const a = Math.floor(Math.log10(lo) + 1e-9);
  const b = Math.ceil(Math.log10(hi) - 1e-9);
  const d0 = 10 ** a;
  const d1 = 10 ** Math.max(b, a + 1);
  const span = Math.log10(d1) - Math.log10(d0);
  const f = ((v: number) => (v > 0 ? r0 + ((Math.log10(v) - Math.log10(d0)) / span) * (r1 - r0) : r0)) as Linear;
  f.domain = [d0, d1];
  f.range = [r0, r1];
  f.log = true;
  const ticks: number[] = [];
  for (let e = a; e <= Math.max(b, a + 1); e++) for (const m of span <= 2 ? [1, 2, 5] : [1]) if (m * 10 ** e <= d1 * (1 + 1e-9)) ticks.push(+(m * 10 ** e).toPrecision(12));
  f.ticks = ticks;
  return f;
}

/**
 * A value axis: linear (from zero unless `min` is given) or, with `log` and positive values, log 10. `min` and `max`
 * fix the ends; the nice ticks inside them are kept.
 */
export function valueScale(lo: number, hi: number, r0: number, r1: number, opts: { count?: number; log?: boolean; min?: number; max?: number } = {}): Linear {
  const { min, max } = opts;
  if (opts.log && (min ?? lo) > 0) {
    const s = logScale(min ?? lo, max ?? hi, r0, r1);
    if (min === undefined && max === undefined) return s;
    return withDomain(s, min ?? s.domain[0], max ?? s.domain[1]);
  }
  const s = linear(min ?? lo, max ?? hi, r0, r1, { count: opts.count, zero: min === undefined });
  if (min === undefined && max === undefined) return s;
  return withDomain(s, min ?? s.domain[0], max ?? s.domain[1]);
}

/** The same kind of scale over a new range (for laying out once the margins are known). */
export function rescale(s: Linear, r0: number, r1: number): Linear {
  const f = s.log ? withDomain(logScale(s.domain[0], s.domain[1], r0, r1), s.domain[0], s.domain[1]) : linear(s.domain[0], s.domain[1], r0, r1, { nice: false, zero: false });
  f.ticks = s.ticks;
  return f;
}

function withDomain(s: Linear, d0: number, d1: number): Linear {
  if (!(d1 > d0)) d1 = d0 + (s.log ? d0 * 9 : 1);
  const [r0, r1] = s.range;
  const t = (v: number) => (s.log ? Math.log10(Math.max(v, Number.MIN_VALUE)) : v);
  const span = t(d1) - t(d0);
  const f = ((v: number) => (s.log && !(v > 0) ? r0 : r0 + ((t(v) - t(d0)) / span) * (r1 - r0))) as Linear;
  f.domain = [d0, d1];
  f.range = [r0, r1];
  f.log = s.log;
  const eps = (d1 - d0) * 1e-9;
  f.ticks = s.ticks.filter((v) => v >= d0 - eps && v <= d1 + eps);
  return f;
}

const DAY = 86400000;

/** A date or time value as milliseconds (UTC), or NaN: ISO strings ("2025-03-01", "2025-03"), epoch numbers. */
export function timeValue(v: unknown): number {
  if (typeof v === 'number') return v > 1e11 ? v : v * 1000;
  if (typeof v !== 'string') return NaN;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (!m) return NaN;
  return Date.UTC(+m[1]!, +m[2]! - 1, m[3] ? +m[3] : 1, m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
}

/**
 * Calendar ticks between two times (ms, UTC): whole days, weeks, months, quarters or years, about `count` of them,
 * with the date pattern that suits the step ("YYYY", "MMM YYYY", "D MMM").
 */
export function timeTicks(lo: number, hi: number, count = 5): { ticks: number[]; pattern: string } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { ticks: [], pattern: 'YYYY-MM-DD' };
  const span = Math.max(hi - lo, DAY);
  const steps: [number, 'd' | 'm' | 'y', string][] = [
    [1, 'd', 'D MMM'], [2, 'd', 'D MMM'], [7, 'd', 'D MMM'], [14, 'd', 'D MMM'],
    [1, 'm', 'MMM YYYY'], [2, 'm', 'MMM YYYY'], [3, 'm', 'MMM YYYY'], [6, 'm', 'MMM YYYY'],
    [1, 'y', 'YYYY'], [2, 'y', 'YYYY'], [5, 'y', 'YYYY'], [10, 'y', 'YYYY'], [25, 'y', 'YYYY'], [50, 'y', 'YYYY'], [100, 'y', 'YYYY'],
  ];
  const approx = (n: number, u: string) => n * (u === 'd' ? DAY : u === 'm' ? 30.44 * DAY : 365.25 * DAY);
  const [n, unit, pattern] = steps.find(([k, u]) => span / approx(k, u) <= Math.max(1, count)) ?? steps.at(-1)!;
  const d = new Date(lo);
  let t: number;
  if (unit === 'd') {
    t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (n === 7 || n === 14) t += ((8 - new Date(t).getUTCDay()) % 7) * DAY; // Mondays
  } else if (unit === 'm') {
    const mo = Math.ceil((d.getUTCMonth() + (d.getUTCDate() > 1 || d.getUTCHours() ? 1 : 0)) / n) * n;
    t = Date.UTC(d.getUTCFullYear(), mo, 1);
  } else {
    const y = d.getUTCFullYear() + (d.getUTCMonth() || d.getUTCDate() > 1 ? 1 : 0);
    t = Date.UTC(Math.ceil(y / n) * n, 0, 1);
  }
  const ticks: number[] = [];
  for (let i = 0; t <= hi && i < 1000; i++) {
    if (t >= lo) ticks.push(t);
    const x = new Date(t);
    t = unit === 'd' ? t + n * DAY : unit === 'm' ? Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1) : Date.UTC(x.getUTCFullYear() + n, 0, 1);
  }
  return { ticks, pattern };
}

export interface Band {
  (i: number): number;
  bandwidth: number;
  step: number;
}

/** A band scale over `n` slots in [r0, r1]. `pad` is the inner gap as a fraction of the step. */
export function band(n: number, r0: number, r1: number, pad = 0.2, outer = pad / 2): Band {
  r1 = Math.max(r0, r1);
  const step = (r1 - r0) / Math.max(1, n - pad + outer * 2);
  const f = ((i: number) => r0 + step * (outer + i)) as Band;
  f.step = step;
  f.bandwidth = step * (1 - pad);
  return f;
}

/** Rough text width for layout (avoids measuring the DOM on every render). */
export function textWidth(s: string, fontPx: number): number {
  let w = 0;
  for (const ch of s) w += /[il.,:;|!'1 ]/.test(ch) ? 0.3 : /[mwMW@%]/.test(ch) ? 0.85 : /[A-Z0-9$€£]/.test(ch) ? 0.62 : 0.53;
  return w * fontPx;
}

export function truncate(s: string, maxPx: number, fontPx: number): string {
  if (textWidth(s, fontPx) <= maxPx) return s;
  let out = s;
  while (out.length > 1 && textWidth(out + '…', fontPx) > maxPx) out = out.slice(0, -1);
  return out + '…';
}

/** SVG path for an annular sector (angles in radians, 0 = 12 o'clock, clockwise). */
export function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
  const p = (r: number, a: number) => `${r2(cx + r * Math.sin(a))},${r2(cy - r * Math.cos(a))}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  if (r0 <= 0) return `M${r2(cx)},${r2(cy)}L${p(r1, a0)}A${r2(r1)},${r2(r1)} 0 ${large} 1 ${p(r1, a1)}Z`;
  return `M${p(r1, a0)}A${r2(r1)},${r2(r1)} 0 ${large} 1 ${p(r1, a1)}L${p(r0, a1)}A${r2(r0)},${r2(r0)} 0 ${large} 0 ${p(r0, a0)}Z`;
}

/** Monotone-ish smooth path through points (Catmull-Rom with tension), or straight segments. */
export function linePath(pts: [number, number][], smooth = false): string {
  if (!pts.length) return '';
  if (!smooth || pts.length < 3) return 'M' + pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join('L');
  let d = `M${r2(pts[0]![0])},${r2(pts[0]![1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += `C${r2(c1[0]!)},${r2(c1[1]!)} ${r2(c2[0]!)},${r2(c2[1]!)} ${r2(p2[0])},${r2(p2[1])}`;
  }
  return d;
}

/** A color between the theme's sequential ramp ends, as a CSS `color-mix()`. t in [0, 1]. */
export function seqColor(t: number): string {
  const p = Math.round(Math.max(0, Math.min(1, t)) * 100);
  return `color-mix(in oklab, var(--sk-seq-hi) ${p}%, var(--sk-seq-lo))`;
}

/** A diverging color: t in [-1, 1]. */
export function divColor(t: number): string {
  const p = Math.round(Math.min(1, Math.abs(t)) * 100);
  return `color-mix(in oklab, var(${t < 0 ? '--sk-div-lo' : '--sk-div-hi'}) ${p}%, var(--sk-div-mid))`;
}

export function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (v === null || v === undefined || v === '') return NaN;
  return Number(v);
}
