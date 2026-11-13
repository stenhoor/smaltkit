/**
 * The timeline's maths, free of the DOM: where each version sits on the ruler (by commit or by
 * time), the visible window and its zoom and pan limits, the nearest commit to a point, ticks
 * coalesced per pixel, and the spacing of date labels.
 *
 * Positions are in "domain units" u: the point index on the commit axis (version 0 at u = 0, the
 * k-th commit at u = k + 1), epoch milliseconds on the time axis (version 0 just before the first
 * commit). A window [a, b] of u maps onto the ruler's inner width.
 */

export type Axis = 'commit' | 'time';

export interface ScaleCommit {
  version: number;
  time: number;
  size: number;
}

export interface Window {
  a: number;
  b: number;
}

/** Version 0 sits this fraction of the commits' time span before the first commit on the time axis. */
export const EMPTY_LEAD = 0.03;
/** …or this long when the commits all share one time. */
export const EMPTY_LEAD_MIN_MS = 60_000;
/** The narrowest window: this many commits, or on the time axis this many milliseconds. */
export const MIN_SPAN_COMMITS = 4;
export const MIN_SPAN_MS = 60_000;

/**
 * Domain position of every point: index 0 is version 0, index i the commit `commits[i - 1]`. On
 * the time axis positions never decrease (a commit dated before its predecessor sits on it).
 */
export function positions(commits: readonly ScaleCommit[], axis: Axis, out?: Float64Array): Float64Array {
  const n = commits.length + 1;
  const u = out && out.length === n ? out : new Float64Array(n);
  if (axis === 'commit' || commits.length === 0) {
    for (let i = 0; i < n; i++) u[i] = i;
    return u;
  }
  let prev = -Infinity;
  for (let i = 1; i < n; i++) {
    const t = commits[i - 1]!.time;
    prev = Number.isFinite(t) ? Math.max(prev, t) : prev === -Infinity ? 0 : prev;
    u[i] = prev;
  }
  const span = u[n - 1]! - u[1]!;
  u[0] = u[1]! - Math.max(span * EMPTY_LEAD, EMPTY_LEAD_MIN_MS);
  return u;
}

/** The whole domain [first, last], never empty. */
export function domainOf(u: Float64Array): Window {
  const a = u[0] ?? 0;
  const b = u[u.length - 1] ?? 1;
  return b > a ? { a, b } : { a, b: a + 1 };
}

/** The narrowest window allowed for this domain. */
export function minSpan(axis: Axis, domain: Window): number {
  const full = domain.b - domain.a;
  return Math.min(full, axis === 'commit' ? MIN_SPAN_COMMITS : MIN_SPAN_MS);
}

/** Keep a window inside the domain, no narrower than `min` and no wider than the domain. */
export function clampWindow(w: Window, domain: Window, min: number): Window {
  const full = domain.b - domain.a;
  let span = Math.min(Math.max(w.b - w.a, Math.min(min, full)), full);
  if (!(span > 0)) span = full;
  let a = Number.isFinite(w.a) ? w.a : domain.a;
  if (a < domain.a) a = domain.a;
  if (a + span > domain.b) a = domain.b - span;
  return { a, b: a + span };
}

/** Zoom by `factor` (> 1 zooms in) keeping domain point `at` where it is. */
export function zoomWindow(w: Window, domain: Window, at: number, factor: number, min: number): Window {
  const span = w.b - w.a;
  const next = Math.min(Math.max(span / factor, Math.min(min, domain.b - domain.a)), domain.b - domain.a);
  const t = span > 0 ? (at - w.a) / span : 0.5;
  return clampWindow({ a: at - t * next, b: at - t * next + next }, domain, min);
}

/** Move the window by `du` domain units. */
export function panWindow(w: Window, domain: Window, du: number, min: number): Window {
  return clampWindow({ a: w.a + du, b: w.b + du }, domain, min);
}

/** Whether the window shows the whole domain. */
export function isFull(w: Window, domain: Window): boolean {
  const eps = (domain.b - domain.a) * 1e-9;
  return w.a <= domain.a + eps && w.b >= domain.b - eps;
}

/** Shift the window as little as possible so that `u` is inside it, `margin` (a fraction) from the edges. */
export function reveal(w: Window, domain: Window, u: number, min: number, margin = 0.05): Window {
  const span = w.b - w.a;
  const m = span * margin;
  if (u < w.a + m) return clampWindow({ a: u - m, b: u - m + span }, domain, min);
  if (u > w.b - m) return clampWindow({ a: u + m - span, b: u + m }, domain, min);
  return w;
}

/** Pixel x of domain point u, across `width` px. */
export function xOf(u: number, w: Window, width: number): number {
  return ((u - w.a) / (w.b - w.a)) * width;
}

/** Domain point at pixel x. */
export function uOf(x: number, w: Window, width: number): number {
  return w.a + (x / Math.max(width, 1e-9)) * (w.b - w.a);
}

/** First point index with u[i] ≥ value (u ascending); u.length when none. */
export function lowerBound(u: Float64Array, value: number): number {
  let lo = 0, hi = u.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (u[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The point nearest to domain position `value`. Ties go to the later point; among points at the
 * same position (equal times) the last one wins, so a click there shows all of them.
 */
export function nearestIndex(u: Float64Array, value: number): number {
  const n = u.length;
  if (n === 0) return -1;
  const i = lowerBound(u, value);
  if (i >= n) return n - 1;
  if (i === 0) return lastAt(u, 0);
  const before = value - u[i - 1]!, after = u[i]! - value;
  return after <= before ? lastAt(u, i) : i - 1;
}

function lastAt(u: Float64Array, i: number): number {
  while (i + 1 < u.length && u[i + 1] === u[i]) i++;
  return i;
}

/** Point index of a version: 0 for version 0 (or below the first commit), else the last commit at or before it. */
export function indexOfVersion(commits: readonly { version: number }[], version: number): number {
  let lo = 0, hi = commits.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (commits[mid]!.version <= version) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Version at a point index. */
export function versionAt(commits: readonly { version: number }[], index: number): number {
  return index <= 0 ? 0 : commits[Math.min(index, commits.length) - 1]!.version;
}

/** Height of a commit's tick, 0..1: by log(size) relative to the largest commit. */
export function tickHeight(size: number, maxSize: number): number {
  const s = Math.max(0, size), m = Math.max(1, maxSize);
  return 0.25 + 0.75 * (Math.log1p(s) / Math.log1p(m));
}

/**
 * Ticks coalesced per pixel column: `out[x]` is the tallest tick in column x (0..1), or 0 when the
 * column has none; returns how many columns have one. Only visible commits are visited.
 */
export function coalesceTicks(
  u: Float64Array,
  commits: readonly ScaleCommit[],
  w: Window,
  width: number,
  maxSize: number,
  out: Float32Array,
): number {
  const cols = Math.min(out.length, Math.max(0, Math.floor(width)));
  out.fill(0, 0, cols);
  let used = 0;
  const span = w.b - w.a;
  if (cols === 0 || !(span > 0)) return 0;
  for (let i = Math.max(1, lowerBound(u, w.a)); i < u.length && u[i]! <= w.b; i++) {
    const x = Math.min(cols - 1, Math.floor(((u[i]! - w.a) / span) * width));
    const h = tickHeight(commits[i - 1]!.size, maxSize);
    if (out[x] === 0) used++;
    if (h > out[x]!) out[x] = h;
  }
  return used;
}

// ---- dates --------------------------------------------------------------------------------------

export type DateUnit = 'minute' | 'hour' | 'day' | 'month' | 'year';

export interface DateStep {
  unit: DateUnit;
  count: number;
  /** Approximate length in ms (for choosing). */
  ms: number;
}

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
export const DATE_STEPS: readonly DateStep[] = [
  { unit: 'minute', count: 1, ms: MIN },
  { unit: 'minute', count: 5, ms: 5 * MIN },
  { unit: 'minute', count: 15, ms: 15 * MIN },
  { unit: 'minute', count: 30, ms: 30 * MIN },
  { unit: 'hour', count: 1, ms: HOUR },
  { unit: 'hour', count: 3, ms: 3 * HOUR },
  { unit: 'hour', count: 6, ms: 6 * HOUR },
  { unit: 'hour', count: 12, ms: 12 * HOUR },
  { unit: 'day', count: 1, ms: DAY },
  { unit: 'day', count: 2, ms: 2 * DAY },
  { unit: 'day', count: 7, ms: 7 * DAY },
  { unit: 'day', count: 14, ms: 14 * DAY },
  { unit: 'month', count: 1, ms: 30.44 * DAY },
  { unit: 'month', count: 3, ms: 91.3 * DAY },
  { unit: 'month', count: 6, ms: 182.6 * DAY },
  { unit: 'year', count: 1, ms: 365.25 * DAY },
  { unit: 'year', count: 2, ms: 730.5 * DAY },
  { unit: 'year', count: 5, ms: 1826 * DAY },
  { unit: 'year', count: 10, ms: 3652.5 * DAY },
  { unit: 'year', count: 25, ms: 9131 * DAY },
  { unit: 'year', count: 100, ms: 36525 * DAY },
];

/** The finest step whose labels are at least `minPx` apart when `spanMs` covers `widthPx`. */
export function chooseDateStep(spanMs: number, widthPx: number, minPx: number): DateStep {
  const pxPerMs = widthPx / Math.max(spanMs, 1);
  for (const s of DATE_STEPS) if (s.ms * pxPerMs >= minPx) return s;
  return DATE_STEPS[DATE_STEPS.length - 1]!;
}

/** Start of the step containing `t`, in local time (steps align to round values: 15-minute marks, midnight, 1 January …). */
export function floorDate(t: number, step: DateStep): number {
  const d = new Date(t);
  switch (step.unit) {
    case 'minute':
      d.setSeconds(0, 0);
      d.setMinutes(d.getMinutes() - (d.getMinutes() % step.count));
      break;
    case 'hour':
      d.setMinutes(0, 0, 0);
      d.setHours(d.getHours() - (d.getHours() % step.count));
      break;
    case 'day':
      d.setHours(0, 0, 0, 0);
      if (step.count === 7 || step.count === 14) {
        // Weeks start on Monday.
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      } else d.setDate(d.getDate() - ((d.getDate() - 1) % step.count));
      break;
    case 'month':
      d.setHours(0, 0, 0, 0);
      d.setDate(1);
      d.setMonth(d.getMonth() - (d.getMonth() % step.count));
      break;
    case 'year':
      d.setHours(0, 0, 0, 0);
      d.setMonth(0, 1);
      d.setFullYear(d.getFullYear() - (d.getFullYear() % step.count));
      break;
  }
  return d.getTime();
}

/** The step after `t` (which is on a step boundary). */
export function addStep(t: number, step: DateStep): number {
  const d = new Date(t);
  switch (step.unit) {
    case 'minute':
      d.setMinutes(d.getMinutes() + step.count);
      break;
    case 'hour':
      d.setHours(d.getHours() + step.count);
      break;
    case 'day':
      d.setDate(d.getDate() + step.count);
      break;
    case 'month':
      d.setMonth(d.getMonth() + step.count);
      break;
    case 'year':
      d.setFullYear(d.getFullYear() + step.count);
      break;
  }
  return d.getTime();
}

/** Boundaries of `step` within [a, b], at most `limit` of them. */
export function dateTicks(a: number, b: number, step: DateStep, limit = 400): number[] {
  const out: number[] = [];
  let t = floorDate(a, step);
  if (t < a) t = addStep(t, step);
  while (t <= b && out.length < limit) {
    out.push(t);
    const next = addStep(t, step);
    if (!(next > t)) break;
    t = next;
  }
  return out;
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (v: number) => (v < 10 ? `0${v}` : `${v}`);

/** A label for a step boundary: the year, the month (with its year in January), the day, or the time. */
export function dateLabel(t: number, step: DateStep): string {
  const d = new Date(t);
  switch (step.unit) {
    case 'year':
      return `${d.getFullYear()}`;
    case 'month':
      return d.getMonth() === 0 ? `${MONTHS[0]} ${d.getFullYear()}` : MONTHS[d.getMonth()]!;
    case 'day':
      return d.getDate() === 1 && d.getMonth() === 0 ? `1 Jan ${d.getFullYear()}` : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    default:
      return d.getHours() === 0 && d.getMinutes() === 0 ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
}

/** "3 Nov 2026 14:02", in local time. */
export function formatDateTime(t: number): string {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Date labels for the commit axis, where time does not run evenly: a label at the first visible
 * commit of each step, dropped when closer than `minPx` to the one before. Each is named by the
 * commit's date at the step's unit.
 */
export function commitDateLabels(
  u: Float64Array,
  commits: readonly ScaleCommit[],
  w: Window,
  width: number,
  minPx: number,
): { x: number; t: number; step: DateStep }[] {
  const out: { x: number; t: number; step: DateStep }[] = [];
  const first = Math.max(1, lowerBound(u, w.a));
  let last = first;
  while (last < u.length && u[last]! <= w.b) last++;
  if (last <= first) return out;
  const t0 = commits[first - 1]!.time, t1 = commits[last - 2]!.time;
  // Pick the unit from the time per pixel the visible commits cover on average.
  const step = chooseDateStep(Math.max(t1 - t0, 1), width, minPx);
  let prevKey = NaN, prevX = -Infinity;
  for (let i = first; i < last; i++) {
    const t = commits[i - 1]!.time;
    const key = floorDate(t, step);
    if (key === prevKey) continue;
    prevKey = key;
    const x = xOf(u[i]!, w, width);
    if (x - prevX < minPx) continue;
    // Named by the commit's own day (or hour, month, year), not the start of its period.
    out.push({ x, t: floorDate(t, { unit: step.unit, count: 1, ms: 0 }), step });
    prevX = x;
  }
  return out;
}
