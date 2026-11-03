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
