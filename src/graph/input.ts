/**
 * Pointer, wheel and keyboard input.
 *
 * - 2D: drag the background to pan, drag a node to move it, wheel or pinch to zoom at the cursor.
 * - 3D: drag to orbit (tilt and turn), drag a node to move it in the plane facing the camera, wheel or
 *   pinch to dolly.
 * - Pan in either mode: two fingers (moving together, while pinching zooms), or drag with Shift, the
 *   right or middle button, or Space held. These pan over a node too, instead of dragging it.
 * - Keyboard, with the canvas focused: arrow keys pan (Shift: further), + and - zoom.
 *
 * A press that does not move is a click.
 */
import type { Hit, ViewMode } from './types.js';

export interface InputHost {
  mode(): ViewMode;
  /** Device pixels per CSS pixel of the canvas. */
  scale(): number;
  pan(dx: number, dy: number): void;
  orbit(dx: number, dy: number): void;
  zoomAt(x: number, y: number, factor: number): void;
  hover(x: number, y: number): void;
  leave(): void;
  pick(x: number, y: number): Promise<Hit | null>;
  /** The last hover result and where it was picked. */
  lastHover(): { hit: Hit | null; x: number; y: number };
  dragStart(node: number, x: number, y: number): void;
  dragMove(x: number, y: number): void;
  dragEnd(): void;
  click(hit: Hit | null): void;
  /** The user moved the camera (stops auto-fit). */
  interacted(): void;
}

type Gesture =
  | { kind: 'none' }
  /** `pan`: the press asked to pan (Shift, right or middle button, or Space held). */
  | { kind: 'pending'; id: number; x: number; y: number; button: number; pan: boolean; moved: boolean }
  | { kind: 'camera'; id: number; x: number; y: number; orbit: boolean; moved: boolean; sx: number; sy: number }
  | { kind: 'node'; id: number; node: number; moved: boolean; sx: number; sy: number }
  | { kind: 'pinch' };

const CLICK_SLOP = 4;
/** CSS pixels an arrow key pans by (Shift: four times as far). */
const KEY_PAN = 40;
const KEY_ZOOM = 1.25;

export class InputController {
  private gesture: Gesture = { kind: 'none' };
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private pinchMid = { x: 0, y: 0 };
  /** Space is held while the pointer is over the canvas: drags pan. */
  private space = false;
  private inside = false;
  private readonly abort = new AbortController();

  constructor(private readonly canvas: HTMLCanvasElement, private readonly host: InputHost) {
    const o = { signal: this.abort.signal };
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.down, o);
    canvas.addEventListener('pointermove', this.move, o);
    canvas.addEventListener('pointerup', this.up, o);
    canvas.addEventListener('pointercancel', this.cancel, o);
    canvas.addEventListener('pointerleave', this.leave, o);
    canvas.addEventListener('wheel', this.wheel, { signal: this.abort.signal, passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), o);
    canvas.addEventListener('pointerenter', () => (this.inside = true), o);
    canvas.addEventListener('keydown', this.key, o);
    // The canvas takes focus, for the keyboard, unless the page gave it a tabindex of its own.
    if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;
    const doc = canvas.ownerDocument;
    doc.addEventListener('keydown', this.spaceDown, o);
    doc.addEventListener('keyup', this.spaceUp, o);
    doc.defaultView?.addEventListener('blur', () => (this.space = false), o);
  }

  private readonly spaceDown = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || !this.inside) return;
    const t = e.target as HTMLElement | null;
    // Space still types in text fields.
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) return;
    e.preventDefault(); // the page doesn't scroll
    this.space = true;
  };

  private readonly spaceUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') this.space = false;
  };

  private readonly key = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = this.host.scale() * KEY_PAN * (e.shiftKey ? 4 : 1);
    const pans: Record<string, [number, number]> = { ArrowLeft: [k, 0], ArrowRight: [-k, 0], ArrowUp: [0, k], ArrowDown: [0, -k] };
    const r = this.canvas.getBoundingClientRect();
    const s = this.host.scale();
    const mid = { x: (r.width / 2) * s, y: (r.height / 2) * s };
    if (pans[e.key]) {
      this.host.interacted();
      this.host.pan(...pans[e.key]!);
    } else if (e.key === '+' || e.key === '=') {
      this.host.interacted();
      this.host.zoomAt(mid.x, mid.y, KEY_ZOOM);
    } else if (e.key === '-' || e.key === '_') {
      this.host.interacted();
      this.host.zoomAt(mid.x, mid.y, 1 / KEY_ZOOM);
    } else return;
    e.preventDefault();
  };

  private at(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const k = this.host.scale();
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  }

  private readonly down = (e: PointerEvent) => {
    const p = this.at(e);
    this.pointers.set(e.pointerId, p);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events have no capture */
    }
    if (this.pointers.size === 2) {
      if (this.gesture.kind === 'node') this.host.dragEnd();
      this.gesture = { kind: 'pinch' };
      this.pinchDist = this.pinchDistance();
      this.pinchMid = this.pinchCentre();
      return;
    }
    if (this.pointers.size > 2) return;
    const pan = e.shiftKey || e.button === 1 || e.button === 2 || this.space;
    const g = { kind: 'pending' as const, id: e.pointerId, x: p.x, y: p.y, button: e.button, pan, moved: false };
    this.gesture = g;
    // A press that pans never drags a node: no need to ask the GPU what's under it.
    if (pan) return this.decide(g, null);
    const last = this.host.lastHover();
    const near = Math.hypot(last.x - p.x, last.y - p.y) < 2 * this.host.scale();
    if (e.pointerType === 'mouse' && near) this.decide(g, last.hit);
    else void this.host.pick(p.x, p.y).then((hit) => this.gesture === g && this.decide(g, hit));
  };

  private decide(g: Extract<Gesture, { kind: 'pending' }>, hit: Hit | null): void {
    const cur = this.pointers.get(g.id) ?? { x: g.x, y: g.y };
    if (hit?.kind === 'node' && g.button === 0 && !g.pan) {
      this.gesture = { kind: 'node', id: g.id, node: hit.index, moved: g.moved, sx: g.x, sy: g.y };
      this.host.dragStart(hit.index, cur.x, cur.y);
      if (g.moved) this.host.dragMove(cur.x, cur.y);
      return;
    }
    const orbit = this.host.mode() === '3d' && g.button === 0 && !g.pan;
    this.gesture = { kind: 'camera', id: g.id, x: g.x, y: g.y, orbit, moved: g.moved, sx: g.x, sy: g.y };
    if (g.moved) this.applyCamera(this.gesture, cur.x, cur.y);
  }

  private applyCamera(g: Extract<Gesture, { kind: 'camera' }>, x: number, y: number): void {
    const dx = x - g.x, dy = y - g.y;
    g.x = x;
    g.y = y;
    if (dx === 0 && dy === 0) return;
    this.host.interacted();
    if (g.orbit) this.host.orbit(dx, dy);
    else this.host.pan(dx, dy);
  }

  private readonly move = (e: PointerEvent) => {
    const p = this.at(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    switch (g.kind) {
      case 'none':
        if (e.pointerType === 'mouse') this.host.hover(p.x, p.y);
        return;
      case 'pending':
        if (e.pointerId === g.id && Math.hypot(p.x - g.x, p.y - g.y) > CLICK_SLOP * this.host.scale()) g.moved = true;
        return;
      case 'camera':
        if (e.pointerId !== g.id) return;
        if (Math.hypot(p.x - g.sx, p.y - g.sy) > CLICK_SLOP * this.host.scale()) g.moved = true;
        if (g.moved) this.applyCamera(g, p.x, p.y);
        return;
      case 'node':
        if (e.pointerId !== g.id) return;
        if (Math.hypot(p.x - g.sx, p.y - g.sy) > CLICK_SLOP * this.host.scale()) g.moved = true;
        if (g.moved) this.host.dragMove(p.x, p.y);
        return;
      case 'pinch': {
        // Two fingers: the midpoint moving pans, the distance changing zooms about the midpoint.
        if (this.pointers.size < 2) return;
        const d = this.pinchDistance();
        const c = this.pinchCentre();
        const dx = c.x - this.pinchMid.x;
        const dy = c.y - this.pinchMid.y;
        if (dx !== 0 || dy !== 0 || (this.pinchDist > 0 && d > 0 && d !== this.pinchDist)) this.host.interacted();
        if (dx !== 0 || dy !== 0) this.host.pan(dx, dy);
        if (this.pinchDist > 0 && d > 0 && d !== this.pinchDist) this.host.zoomAt(c.x, c.y, d / this.pinchDist);
        this.pinchDist = d;
        this.pinchMid = c;
        return;
      }
    }
  };

  private readonly up = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId) ?? this.at(e);
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (g.kind === 'pinch') {
      // Lifting one finger ends the two-finger gesture; the other doesn't start a drag.
      if (this.pointers.size === 0) this.gesture = { kind: 'none' };
      return;
    }
    if (g.kind === 'none' || ('id' in g && g.id !== e.pointerId)) return;
    // A quick drag that ended before the pick came back still moves the camera.
    if (g.kind === 'pending' && g.moved) {
      this.decide(g, null);
      if (this.gesture.kind === 'camera') this.applyCamera(this.gesture, p.x, p.y);
    }
    this.gesture = { kind: 'none' };
    if (g.kind === 'node') {
      this.host.dragEnd();
      if (!g.moved) this.host.click({ kind: 'node', index: g.node });
    } else if (!g.moved) {
      void this.host.pick(p.x, p.y).then((hit) => this.host.click(hit));
    }
    if (e.pointerType === 'mouse') this.host.hover(p.x, p.y);
  };

  private readonly cancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.gesture.kind === 'node') this.host.dragEnd();
    this.gesture = { kind: 'none' };
  };

  private readonly leave = (e: PointerEvent) => {
    this.inside = false;
    if (e.pointerType === 'mouse' && this.gesture.kind === 'none') this.host.leave();
  };

  private readonly wheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = this.at(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dy = Math.max(-200, Math.min(200, e.deltaY * unit));
    this.host.interacted();
    this.host.zoomAt(p.x, p.y, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
  };

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private pinchCentre(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()];
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 };
  }

  destroy(): void {
    this.abort.abort();
  }
}
