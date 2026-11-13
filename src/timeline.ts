/**
 * A timeline of a graph's history: a ruler with a tick per commit, a handle to drag through the
 * versions, play, step and zoom. Framework-free DOM; it knows nothing of the graph, only commits,
 * and reports the version to show through `onChange`.
 */
import {
  type Axis, type Window, clampWindow, coalesceTicks, commitDateLabels, chooseDateStep, dateLabel, dateTicks,
  domainOf, formatDateTime, indexOfVersion, isFull, minSpan, nearestIndex, panWindow, positions, reveal, tickHeight,
  uOf, versionAt, xOf, zoomWindow,
} from './timeline/scale.js';
import { injectStyles } from './timeline/style.js';

export interface TimelineCommit {
  version: number;
  /** Epoch milliseconds. */
  time: number;
  author?: string;
  message?: string;
  /** Number of changes in the commit. */
  size: number;
}

export interface TimelineOptions {
  /** Ascending by version; may be empty. */
  commits: readonly TimelineCommit[];
  /** The version shown; defaults to the last (or 0). */
  value?: number;
  /** 'commit' (default): even spacing per commit. 'time': by real time, so gaps show quiet periods. */
  axis?: Axis;
  /** Without one, the timeline follows the system's colour scheme. */
  theme?: 'light' | 'dark';
  /** Called as the value changes. `final` is false while dragging or playing, true on release, click, key, or play stop. */
  onChange?: (version: number, info: { final: boolean }) => void;
}

export interface Timeline {
  readonly value: number;
  /** Show a version (snapped to the last commit at or before it); does not call onChange. */
  setValue(version: number): void;
  /** Replace the commits. With `follow`, a timeline that was at the last version moves to the new last one. */
  setCommits(commits: readonly TimelineCommit[], options?: { follow?: boolean }): void;
  setAxis(axis: Axis): void;
  setTheme(theme: 'light' | 'dark'): void;
  /** Step through the versions at `speed` commits per second (default 8), from the start when at the end. */
  play(options?: { speed?: number }): void;
  pause(): void;
  readonly playing: boolean;
  destroy(): void;
}

export type { Axis } from './timeline/scale.js';

/** Ruler geometry in CSS pixels. */
const PAD = 12;
const TICK_BASE = 36;
const TICK_MAX = 26;
const TRACK_Y = 44;
const TRACK_H = 4;
const LABEL_Y = 66;
const LABEL_MIN_PX = 76;
const DRAG_PX = 3;

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Icons in the family's Chevron style: solid bars, 45° and 90° angles. */
const ICONS = {
  play: 'M7 4.5 14.5 12 7 19.5Z',
  pause: 'M6.5 5h4v14h-4zM13.5 5h4v14h-4z',
  back: 'M5 5h3.5v14H5zM18.5 5 11.5 12 18.5 19z',
  forward: 'M15.5 5H19v14h-3.5zM5.5 5l7 7-7 7z',
};

function icon(doc: Document, path: string): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = doc.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', path);
  svg.appendChild(p);
  return svg;
}

const changes = (n: number) => `${n.toLocaleString('en')} ${n === 1 ? 'change' : 'changes'}`;

interface Colors {
  track: string;
  text2: string;
  primary: string;
  accent: string;
  bg: string;
  mono: string;
}

export function createTimeline(host: HTMLElement, options: TimelineOptions): Timeline {
  const doc = host.ownerDocument;
  const win = doc.defaultView ?? globalThis;
  injectStyles(doc);

  // ---- state -----------------------------------------------------------------------------------
  let commits: readonly TimelineCommit[] = options.commits;
  let axis: Axis = options.axis ?? 'commit';
  let u = positions(commits, axis);
  let domain = domainOf(u);
  let view: Window = { ...domain };
  let maxSize = 1;
  let index = commits.length;
  let hover = -1;
  let lastFinal = NaN;
  let pendingEmit = false;
  let raf = 0;
  let dirty = true;
  let colors: Colors | null = null;
  let ticks = new Float32Array(0);
  let width = 0;
  let dpr = 1;
  let destroyed = false;
  // Playing.
  let playingNow = false;
  let playSpeed = 8;
  let playT0 = 0;
  let playFrom = 0;

  const sizeMax = () => {
    let m = 1;
    for (const c of commits) if (c.size > m) m = c.size;
    return m;
  };
  maxSize = sizeMax();
  if (options.value !== undefined) index = indexOfVersion(commits, options.value);
  const versionNow = () => versionAt(commits, index);
  const last = () => commits.length;
  lastFinal = versionNow();

  // ---- DOM -------------------------------------------------------------------------------------
  const root = doc.createElement('div');
  root.className = 'sk-tl';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'History');
  if (options.theme) root.dataset.theme = options.theme;

  const ruler = doc.createElement('div');
  ruler.className = 'sk-tl-ruler';
  const canvas = doc.createElement('canvas');
  canvas.className = 'sk-tl-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const handle = doc.createElement('div');
  handle.className = 'sk-tl-handle';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-label', 'Version');
  handle.setAttribute('aria-valuemin', '0');
  handle.setAttribute('aria-orientation', 'horizontal');
  const tip = doc.createElement('div');
  tip.className = 'sk-tl-tip';
  tip.setAttribute('role', 'tooltip');
  tip.id = `sk-tl-tip-${Math.random().toString(36).slice(2, 9)}`;
  tip.hidden = true;
  ruler.append(canvas, handle, tip);

  const controls = doc.createElement('div');
  controls.className = 'sk-tl-controls';
  const button = (cls: string, label: string, content: Node | string): HTMLButtonElement => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = `sk-tl-btn ${cls}`;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.append(content);
    return b;
  };
  const backBtn = button('sk-tl-back', 'Previous version', icon(doc, ICONS.back));
  const playBtn = button('sk-tl-play', 'Play', icon(doc, ICONS.play));
  const fwdBtn = button('sk-tl-forward', 'Next version', icon(doc, ICONS.forward));
  const nowBtn = button('sk-tl-now', 'Latest version', 'Now');
  const group = doc.createElement('div');
  group.className = 'sk-tl-group';
  group.append(backBtn, playBtn, fwdBtn, nowBtn);

  const readout = doc.createElement('div');
  readout.className = 'sk-tl-readout';
  readout.setAttribute('aria-hidden', 'true');

  const seg = doc.createElement('div');
  seg.className = 'sk-tl-seg';
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Spacing');
  const byCommit = button('sk-tl-by-commit', 'Space versions evenly', 'By commit');
  const byTime = button('sk-tl-by-time', 'Space versions by time', 'By time');
  seg.append(byCommit, byTime);
  const fitBtn = button('sk-tl-fit', 'Show the whole history', 'Fit');
  fitBtn.hidden = true;
  controls.append(group, readout, seg, fitBtn);
  root.append(ruler, controls);
  host.appendChild(root);

  // ---- geometry --------------------------------------------------------------------------------
  const inner = () => Math.max(1, width - 2 * PAD);
  const xAt = (i: number) => PAD + xOf(u[i]!, view, inner());
  const indexAtX = (x: number) => {
    const i = nearestIndex(u, uOf(x - PAD, view, inner()));
    return i < 0 ? 0 : i;
  };
  const minS = () => minSpan(axis, domain);

  // ---- text ------------------------------------------------------------------------------------
  const describe = (i: number): { when: string; who: string; what: string } => {
    if (i <= 0) return { when: '', who: '', what: 'empty graph' };
    const c = commits[i - 1]!;
    return { when: Number.isFinite(c.time) ? formatDateTime(c.time) : '', who: c.author ?? '', what: c.message ?? '' };
  };

  const updateText = () => {
    const v = versionNow();
    const total = last() === 0 ? 0 : commits[last() - 1]!.version;
    handle.setAttribute('aria-valuemax', String(total));
    handle.setAttribute('aria-valuenow', String(v));
    const d = describe(index);
    const parts = [d.when, d.who, d.what].filter(Boolean);
    handle.setAttribute('aria-valuetext', `Version ${v} of ${total}${parts.length ? `, ${parts.join(', ')}` : ''}`);
    readout.replaceChildren();
    const eyebrow = doc.createElement('span');
    eyebrow.className = 'sk-tl-eyebrow';
    eyebrow.textContent = 'Version';
    const num = doc.createElement('b');
    num.textContent = String(v);
    readout.append(eyebrow, ' ', num, ` of ${total}`);
    for (const p of parts) {
      const sep = doc.createElement('span');
      sep.className = 'sk-tl-sep';
      sep.textContent = ' · ';
      readout.append(sep, p);
    }
    readout.title = readout.textContent ?? '';
    const atStart = index <= 0, atEnd = index >= last();
    backBtn.disabled = atStart;
    fwdBtn.disabled = atEnd;
    nowBtn.disabled = atEnd && !playingNow;
  };

  const showTip = (i: number) => {
    if (i < 0) {
      tip.hidden = true;
      handle.removeAttribute('aria-describedby');
      return;
    }
    const v = versionAt(commits, i);
    tip.replaceChildren();
    const head = doc.createElement('span');
    head.className = 'sk-tl-eyebrow';
    head.textContent = `Version ${v}`;
    tip.append(head);
    const line = (cls: string, text: string) => {
      const el = doc.createElement('div');
      el.className = cls;
      el.textContent = text;
      tip.append(el);
    };
    if (i === 0) line('sk-tl-tip-msg', 'The empty graph, before the first commit');
    else {
      const c = commits[i - 1]!;
      if (c.message) line('sk-tl-tip-msg', c.message);
      const meta = [Number.isFinite(c.time) ? formatDateTime(c.time) : '', c.author ?? ''].filter(Boolean).join(' · ');
      if (meta) line('sk-tl-tip-meta', meta);
      line('sk-tl-tip-meta', changes(c.size));
    }
    tip.hidden = false;
    // Above the ruler when there is room in the window, else below it; kept inside the ruler's width.
    const x = xAt(i);
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const left = Math.min(Math.max(0, x - tw / 2), Math.max(0, width - tw));
    tip.style.left = `${left}px`;
    const above = ruler.getBoundingClientRect().top >= th + 4;
    tip.style.top = above ? `${-th - 4}px` : `${ruler.offsetHeight + 4}px`;
  };

  // ---- drawing ---------------------------------------------------------------------------------
  const readColors = (): Colors => {
    const cs = win.getComputedStyle(root);
    const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    return {
      track: v('--_track', '#D6DBE4'),
      text2: v('--_text2', '#3F4656'),
      primary: v('--_primary', '#003399'),
      accent: v('--_accent', '#E5622F'),
      bg: v('--_bg', '#FFFFFF'),
      mono: v('--_mono', 'monospace'),
    };
  };

  const draw = () => {
    dirty = false;
    width = ruler.clientWidth;
    const height = ruler.clientHeight;
    dpr = win.devicePixelRatio || 1;
    const W = Math.max(1, Math.round(width * dpr)), H = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const g = canvas.getContext('2d');
    if (!g) return;
    colors ??= readColors();
    const c = colors;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const iw = inner();
    const vx = xAt(index);

    // Ticks, one per pixel column: the commits up to the value in the primary colour, the rest muted.
    const cols = Math.ceil(iw) + 1;
    if (ticks.length < cols) ticks = new Float32Array(cols);
    coalesceTicks(u, commits, view, iw, maxSize, ticks);
    const px = 1 / dpr;
    const tickW = Math.max(px, Math.min(2, iw / Math.max(1, commits.length) - px));
    for (let pass = 0; pass < 2; pass++) {
      g.beginPath();
      for (let x = 0; x < cols; x++) {
        const h = ticks[x]!;
        if (h <= 0) continue;
        const sx = PAD + x;
        if ((sx <= vx + 0.5) !== (pass === 0)) continue;
        const th = Math.max(2, h * TICK_MAX);
        g.rect(sx, TICK_BASE - th, tickW, th);
      }
      g.fillStyle = pass === 0 ? c.primary : c.text2;
      g.globalAlpha = pass === 0 ? 0.85 : 0.38;
      g.fill();
    }
    g.globalAlpha = 1;

    // Track, and the part up to the value.
    const x0 = PAD + xOf(u[0]!, view, iw);
    const tl = Math.max(PAD, x0), tr = PAD + iw;
    g.fillStyle = c.track;
    roundRect(g, tl - TRACK_H / 2, TRACK_Y - TRACK_H / 2, tr - tl + TRACK_H, TRACK_H, TRACK_H / 2);
    g.fill();
    if (vx > tl) {
      g.fillStyle = c.primary;
      roundRect(g, tl - TRACK_H / 2, TRACK_Y - TRACK_H / 2, Math.min(vx, tr) - tl + TRACK_H, TRACK_H, TRACK_H / 2);
      g.fill();
    }

    // The hovered commit.
    if (hover >= 0) {
      const hx = Math.round(xAt(hover) * dpr) / dpr;
      g.fillStyle = c.accent;
      g.fillRect(hx - 0.5, 6, 1.5, TRACK_Y - 6);
      if (hover > 0) {
        const th = Math.max(2, tickHeight(commits[hover - 1]!.size, maxSize) * TICK_MAX);
        g.fillRect(hx - 1, TICK_BASE - th, 3, th);
      }
    }

    // Date labels (and "empty" at version 0).
    g.font = `10.5px ${c.mono}`;
    g.textBaseline = 'alphabetic';
    g.fillStyle = c.text2;
    let minX = -Infinity;
    if (x0 >= PAD - 1) {
      g.fillText('empty', Math.max(0, x0 - 4), LABEL_Y);
      minX = x0 - 4 + g.measureText('empty').width + 10;
    }
    const labels: { x: number; text: string }[] = [];
    if (commits.length > 0) {
      if (axis === 'time') {
        const step = chooseDateStep(view.b - view.a, iw, LABEL_MIN_PX);
        for (const t of dateTicks(view.a, view.b, step)) {
          labels.push({ x: PAD + xOf(t, view, iw), text: dateLabel(t, step) });
        }
      } else {
        for (const l of commitDateLabels(u, commits, view, iw, LABEL_MIN_PX)) labels.push({ x: PAD + l.x, text: dateLabel(l.t, l.step) });
      }
    }
    // Each label with a short mark above it; labels that would overlap or overflow are left out.
    g.beginPath();
    for (const l of labels) {
      const w = g.measureText(l.text).width;
      if (l.x < minX || l.x < PAD - 1 || l.x + w > width + 2) continue;
      g.fillText(l.text, l.x + 3, LABEL_Y);
      g.rect(Math.round(l.x * dpr) / dpr, TRACK_Y + 6, px, 5);
      minX = l.x + w + 12;
    }
    g.globalAlpha = 0.5;
    g.fill();
    g.globalAlpha = 1;

    handle.style.transform = `translateX(${vx}px)`;
    fitBtn.hidden = isFull(view, domain);
  };

  // ---- frame loop: only while something is pending -----------------------------------------------
  const frame = (now: number) => {
    raf = 0;
    if (destroyed) return;
    if (playingNow) {
      const target = Math.min(last(), playFrom + Math.floor(((now - playT0) * playSpeed) / 1000));
      if (target !== index) {
        index = Math.max(index, target);
        view = reveal(view, domain, u[index]!, minS(), 0.1);
        afterChange();
        if (index >= last()) {
          stopPlaying(true);
        } else emit(false);
      }
      if (playingNow) request();
    }
    if (pendingEmit) {
      pendingEmit = false;
      emit(false);
    }
    if (dirty) draw();
  };
  const request = () => {
    if (!raf && !destroyed) raf = win.requestAnimationFrame(frame);
  };
  const redraw = () => {
    dirty = true;
    request();
  };

  const emit = (final: boolean) => {
    const v = versionNow();
    if (final) {
      pendingEmit = false;
      lastFinal = v;
    }
    options.onChange?.(v, { final });
  };
  /** After a final change: tell the listener unless it already has this version as final. */
  const emitFinal = (force = false) => {
    if (force || versionNow() !== lastFinal) emit(true);
    else pendingEmit = false;
  };

  const afterChange = () => {
    updateText();
    if (hover >= 0 && !tip.hidden) showTip(hover);
    redraw();
  };

  const setIndex = (i: number, reason: 'scrub' | 'final' | 'silent') => {
    const next = Math.max(0, Math.min(last(), i));
    const changed = next !== index;
    index = next;
    view = reveal(view, domain, u[index]!, minS());
    afterChange();
    if (reason === 'scrub' && changed) {
      pendingEmit = true;
      request();
    } else if (reason === 'final') emitFinal();
  };

  // ---- playing ---------------------------------------------------------------------------------
  const setPlayButton = () => {
    playBtn.replaceChildren(icon(doc, playingNow ? ICONS.pause : ICONS.play));
    const label = playingNow ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-label', label);
    playBtn.title = label;
    updateText();
  };
  const stopPlaying = (final: boolean) => {
    if (!playingNow) return;
    playingNow = false;
    setPlayButton();
    if (final) emitFinal(true);
  };
  const play = (opts?: { speed?: number }) => {
    if (destroyed || last() === 0) return;
    const s = opts?.speed;
    playSpeed = s !== undefined && Number.isFinite(s) && s > 0 ? s : 8;
    if (playingNow) return;
    if (index >= last()) {
      index = 0;
      view = reveal(view, domain, u[0]!, minS());
      afterChange();
      emit(false);
    }
    playingNow = true;
    playFrom = index;
    playT0 = win.performance?.now?.() ?? Date.now();
    setPlayButton();
    request();
  };

  // ---- pointer input ---------------------------------------------------------------------------
  type Gesture =
    | { kind: 'scrub'; id: number; x0: number; moved: boolean }
    | { kind: 'pan'; id: number; x0: number; from: Window }
    | { kind: 'pinch'; d0: number; from: Window; at: number; mid0: number };
  let gesture: Gesture | null = null;
  const pointers = new Map<number, number>();
  const localX = (e: PointerEvent | WheelEvent) => e.clientX - ruler.getBoundingClientRect().left;

  const startPinch = () => {
    const xs = [...pointers.values()];
    const d0 = Math.abs(xs[0]! - xs[1]!);
    const mid0 = (xs[0]! + xs[1]!) / 2;
    gesture = { kind: 'pinch', d0: Math.max(d0, 1), from: { ...view }, at: uOf(mid0 - PAD, view, inner()), mid0 };
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const x = localX(e);
    pointers.set(e.pointerId, x);
    try {
      ruler.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable (synthetic event) */
    }
    if (pointers.size === 2) {
      if (gesture?.kind === 'scrub') emitFinal();
      startPinch();
      return;
    }
    if (pointers.size > 2) return;
    handle.focus({ preventScroll: true });
    hover = -1;
    tip.hidden = true;
    if (e.shiftKey) {
      gesture = { kind: 'pan', id: e.pointerId, x0: x, from: { ...view } };
      ruler.classList.add('sk-tl-panning');
      return;
    }
    if (playingNow) stopPlaying(false);
    gesture = { kind: 'scrub', id: e.pointerId, x0: x, moved: false };
    root.classList.add('sk-tl-dragging');
    // A press jumps to the nearest commit; it is reported when the press ends (or the drag moves).
    const i = indexAtX(x);
    if (i !== index) {
      index = i;
      afterChange();
    }
  };

  const onMove = (e: PointerEvent) => {
    const x = localX(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, x);
    const gs = gesture;
    if (!gs) {
      if (e.pointerType === 'touch') return;
      const i = indexAtX(x);
      if (i !== hover) {
        hover = i;
        showTip(i);
        handle.setAttribute('aria-describedby', tip.id);
        redraw();
      }
      return;
    }
    if (gs.kind === 'scrub' && gs.id === e.pointerId) {
      if (!gs.moved && Math.abs(x - gs.x0) < DRAG_PX) return;
      gs.moved = true;
      setIndex(indexAtX(x), 'scrub');
    } else if (gs.kind === 'pan' && gs.id === e.pointerId) {
      const du = ((gs.x0 - x) / inner()) * (gs.from.b - gs.from.a);
      view = panWindow(gs.from, domain, du, minS());
      redraw();
    } else if (gs.kind === 'pinch' && pointers.size >= 2) {
      const xs = [...pointers.values()];
      const d = Math.max(1, Math.abs(xs[0]! - xs[1]!));
      const mid = (xs[0]! + xs[1]!) / 2;
      const zoomed = zoomWindow(gs.from, domain, gs.at, d / gs.d0, minS());
      view = panWindow(zoomed, domain, ((gs.mid0 - mid) / inner()) * (zoomed.b - zoomed.a), minS());
      redraw();
    }
  };

  const onUp = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    const gs = gesture;
    if (gs?.kind === 'pinch') {
      if (pointers.size < 2) gesture = null;
      return;
    }
    if (!gs || ('id' in gs && gs.id !== e.pointerId)) return;
    gesture = null;
    ruler.classList.remove('sk-tl-panning');
    root.classList.remove('sk-tl-dragging');
    if (gs.kind === 'scrub') {
      if (e.type !== 'pointercancel' && gs.moved) setIndex(indexAtX(localX(e)), 'silent');
      emitFinal();
    }
  };

  const onLeave = () => {
    if (hover < 0) return;
    hover = -1;
    tip.hidden = true;
    handle.removeAttribute('aria-describedby');
    redraw();
  };

  const onWheel = (e: WheelEvent) => {
    if (last() === 0) return;
    e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * k, dy = e.deltaY * k;
    if (Math.abs(dx) > Math.abs(dy) || e.shiftKey) {
      const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      view = panWindow(view, domain, (d / inner()) * (view.b - view.a), minS());
    } else {
      const at = uOf(localX(e) - PAD, view, inner());
      view = zoomWindow(view, domain, at, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002)), minS());
    }
    if (hover >= 0) showTip(hover);
    redraw();
  };

  ruler.addEventListener('pointerdown', onDown);
  ruler.addEventListener('pointermove', onMove);
  ruler.addEventListener('pointerup', onUp);
  ruler.addEventListener('pointercancel', onUp);
  ruler.addEventListener('pointerleave', onLeave);
  ruler.addEventListener('wheel', onWheel, { passive: false });

  // ---- keyboard and buttons ----------------------------------------------------------------------
  const onHandleKey = (e: KeyboardEvent) => {
    const n = last();
    const big = Math.max(1, Math.round(n * 0.1));
    let i = index;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        i -= e.shiftKey ? 10 : 1;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        i += e.shiftKey ? 10 : 1;
        break;
      case 'PageDown':
        i -= big;
        break;
      case 'PageUp':
        i += big;
        break;
      case 'Home':
        i = 0;
        break;
      case 'End':
        i = n;
        break;
      default:
        return;
    }
    e.preventDefault();
    if (playingNow) stopPlaying(false);
    setIndex(i, 'final');
  };
  const onRootKey = (e: KeyboardEvent) => {
    if (e.key !== ' ' && e.key !== 'Spacebar') return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.isContentEditable)) return;
    e.preventDefault();
    if (playingNow) api.pause();
    else play();
  };
  handle.addEventListener('keydown', onHandleKey);
  root.addEventListener('keydown', onRootKey);

  const step = (d: number) => {
    if (playingNow) stopPlaying(false);
    setIndex(index + d, 'final');
  };
  backBtn.addEventListener('click', () => step(-1));
  fwdBtn.addEventListener('click', () => step(1));
  nowBtn.addEventListener('click', () => {
    if (playingNow) stopPlaying(false);
    setIndex(last(), 'final');
  });
  playBtn.addEventListener('click', () => (playingNow ? api.pause() : play()));
  byCommit.addEventListener('click', () => api.setAxis('commit'));
  byTime.addEventListener('click', () => api.setAxis('time'));
  fitBtn.addEventListener('click', () => {
    view = { ...domain };
    redraw();
    handle.focus({ preventScroll: true });
  });

  // ---- size and colour scheme ----------------------------------------------------------------------
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => redraw()) : null;
  ro?.observe(ruler);
  const scheme = win.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
  const onScheme = () => {
    colors = null;
    redraw();
  };
  scheme?.addEventListener?.('change', onScheme);
  // Fonts may arrive after the first draw.
  doc.fonts?.ready.then(() => {
    if (!destroyed) redraw();
  });

  const setAxisButtons = () => {
    byCommit.setAttribute('aria-pressed', String(axis === 'commit'));
    byTime.setAttribute('aria-pressed', String(axis === 'time'));
  };

  // ---- API ------------------------------------------------------------------------------------------
  const api: Timeline = {
    get value() {
      return versionNow();
    },
    get playing() {
      return playingNow;
    },
    setValue(version: number) {
      if (destroyed) return;
      const i = indexOfVersion(commits, version);
      if (playingNow) {
        playFrom = i;
        playT0 = win.performance?.now?.() ?? Date.now();
      }
      setIndex(i, 'silent');
      lastFinal = versionNow();
    },
    setCommits(next: readonly TimelineCommit[], opts?: { follow?: boolean }) {
      if (destroyed) return;
      const wasAtEnd = index >= last();
      const v = versionNow();
      const full = isFull(view, domain);
      commits = next;
      maxSize = sizeMax();
      u = positions(commits, axis);
      domain = domainOf(u);
      view = full ? { ...domain } : clampWindow(view, domain, minS());
      index = opts?.follow && wasAtEnd ? last() : indexOfVersion(commits, v);
      if (opts?.follow && wasAtEnd) view = reveal(view, domain, u[index]!, minS());
      if (hover > last()) hover = -1;
      if (versionNow() !== v) lastFinal = versionNow();
      afterChange();
    },
    setAxis(next: Axis) {
      if (destroyed || next === axis) return;
      const full = isFull(view, domain);
      const iw = inner();
      const i0 = indexAtX(PAD), i1 = indexAtX(PAD + iw);
      axis = next;
      u = positions(commits, axis);
      domain = domainOf(u);
      view = full ? { ...domain } : clampWindow({ a: u[i0]!, b: u[i1]! }, domain, minS());
      view = reveal(view, domain, u[index]!, minS());
      setAxisButtons();
      if (hover >= 0) showTip(hover);
      redraw();
    },
    setTheme(theme: 'light' | 'dark') {
      if (destroyed) return;
      root.dataset.theme = theme;
      colors = null;
      redraw();
    },
    play,
    pause() {
      stopPlaying(true);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      playingNow = false;
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0;
      ro?.disconnect();
      scheme?.removeEventListener?.('change', onScheme);
      root.remove();
    },
  };

  setAxisButtons();
  setPlayButton();
  redraw();
  return api;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  r = Math.min(r, w / 2, h / 2);
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
