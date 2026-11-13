/**
 * Pointer, wheel, touch and keyboard input: drag to pan (with momentum), wheel or pinch to zoom about the pointer,
 * right-drag (or Ctrl-drag) sideways to rotate and up or down to tilt, two-finger twist to rotate, double-click to zoom
 * in, arrows and +/− on the keyboard, Shift with up and down arrows to tilt.
 */
import type { Camera } from '../core/camera.js';

export interface InputCallbacks {
  /** The camera changed. */
  changed(): void;
  /** The pointer moved over the map, not while dragging (CSS pixels on the canvas). */
  hover(x: number, y: number): void;
  /** The pointer left the map. */
  leave(): void;
  /** A click that was not a drag. */
  click(x: number, y: number): void;
}

export function attachInput(el: HTMLElement, camera: Camera, cb: InputCallbacks): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let rotating = false;
  let moved = 0;
  let downAt = 0;
  let velocity: [number, number] = [0, 0];
  let lastMove = 0;
  let momentum = 0;
  let wheelTarget: number | undefined;
  let wheelAnchor: [number, number] = [0, 0];
  let wheelFrame = 0;

  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const stopMomentum = () => {
    if (momentum) cancelAnimationFrame(momentum);
    momentum = 0;
  };

  const pinch = () => {
    const [a, b] = [...pointers.values()];
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  let lastPinch: ReturnType<typeof pinch> | undefined;

  const down = (e: PointerEvent) => {
    stopMomentum();
    // Capture can fail (a synthetic event, a pointer already gone): dragging still works without it.
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Not captured.
    }
    const [x, y] = local(e);
    pointers.set(e.pointerId, { x, y });
    dragging = true;
    rotating = e.button === 2 || (e.button === 0 && (e.ctrlKey || e.altKey));
    moved = 0;
    downAt = performance.now();
    velocity = [0, 0];
    lastPinch = pointers.size === 2 ? pinch() : undefined;
  };

  const move = (e: PointerEvent) => {
    const [x, y] = local(e);
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (!dragging) cb.hover(x, y);
      return;
    }
    const dx = x - p.x, dy = y - p.y;
    p.x = x;
    p.y = y;
    moved += Math.abs(dx) + Math.abs(dy);
    if (pointers.size >= 2) {
      const now = pinch();
      if (lastPinch) {
        camera.zoomAround(camera.zoom + Math.log2(now.d / Math.max(1, lastPinch.d)), now.cx, now.cy);
        camera.rotateAround(camera.bearing - ((now.angle - lastPinch.angle) * 180) / Math.PI, now.cx, now.cy);
        camera.panBy(now.cx - lastPinch.cx, now.cy - lastPinch.cy);
      }
      lastPinch = now;
    } else if (rotating) {
      // Sideways turns the map, up and down tilts it.
      camera.rotateAround(camera.bearing + dx * 0.4, camera.width / 2, camera.height / 2);
      camera.pitch = Math.max(0, Math.min(60, camera.pitch - dy * 0.3));
    } else {
      camera.panBy(dx, dy);
      const now = performance.now();
      const dt = Math.max(1, now - lastMove);
      lastMove = now;
      velocity = [(dx / dt) * 16, (dy / dt) * 16];
    }
    cb.changed();
  };

  const up = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    lastPinch = pointers.size === 2 ? pinch() : undefined;
    if (pointers.size) return;
    dragging = false;
    const [x, y] = local(e);
    if (moved < 4 && performance.now() - downAt < 500 && e.button === 0) cb.click(x, y);
    else if (!rotating && performance.now() - lastMove < 60 && Math.hypot(...velocity) > 1) {
      // Momentum: the drag's last speed, decaying.
      const step = () => {
        velocity = [velocity[0] * 0.9, velocity[1] * 0.9];
        if (Math.hypot(...velocity) < 0.3) {
          momentum = 0;
          return;
        }
        camera.panBy(velocity[0], velocity[1]);
        cb.changed();
        momentum = requestAnimationFrame(step);
      };
      momentum = requestAnimationFrame(step);
    }
    rotating = false;
  };

  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    stopMomentum();
    const [x, y] = local(e);
    // Trackpads send many small deltas, mice a few large ones: both become a smooth glide to a target zoom.
    const lines = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
    const delta = -e.deltaY * lines * (e.ctrlKey ? 0.01 : 0.0025);
    wheelTarget = Math.max(camera.minZoom, Math.min(camera.maxZoom, (wheelTarget ?? camera.zoom) + delta));
    wheelAnchor = [x, y];
    if (!wheelFrame) {
      const step = () => {
        if (wheelTarget === undefined) return;
        const diff = wheelTarget - camera.zoom;
        const z = Math.abs(diff) < 0.01 ? wheelTarget : camera.zoom + diff * 0.35;
        camera.zoomAround(z, wheelAnchor[0], wheelAnchor[1]);
        cb.changed();
        if (z === wheelTarget) {
          wheelTarget = undefined;
          wheelFrame = 0;
        } else wheelFrame = requestAnimationFrame(step);
      };
      wheelFrame = requestAnimationFrame(step);
    }
  };

  const dbl = (e: MouseEvent) => {
    const [x, y] = local(e);
    wheelTarget = Math.min(camera.maxZoom, Math.round(camera.zoom) + (e.shiftKey ? -1 : 1));
    wheelAnchor = [x, y];
    wheel(new WheelEvent('wheel', { deltaY: 0, clientX: e.clientX, clientY: e.clientY }));
  };

  const key = (e: KeyboardEvent) => {
    const step = 80;
    const k = e.key;
    if (e.shiftKey && (k === 'ArrowUp' || k === 'ArrowDown')) camera.pitch = Math.max(0, Math.min(60, camera.pitch + (k === 'ArrowUp' ? 10 : -10)));
    else if (k === 'ArrowLeft') camera.panBy(step, 0);
    else if (k === 'ArrowRight') camera.panBy(-step, 0);
    else if (k === 'ArrowUp') camera.panBy(0, step);
    else if (k === 'ArrowDown') camera.panBy(0, -step);
    else if (k === '+' || k === '=') camera.zoomAround(camera.zoom + 1, camera.width / 2, camera.height / 2);
    else if (k === '-' || k === '_') camera.zoomAround(camera.zoom - 1, camera.width / 2, camera.height / 2);
    else return;
    e.preventDefault();
    cb.changed();
  };

  const leave = () => {
    if (!dragging) cb.leave();
  };
  const menu = (e: Event) => e.preventDefault();

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', leave);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('dblclick', dbl);
  el.addEventListener('keydown', key);
  el.addEventListener('contextmenu', menu);
  return () => {
    stopMomentum();
    if (wheelFrame) cancelAnimationFrame(wheelFrame);
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('pointerleave', leave);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('dblclick', dbl);
    el.removeEventListener('keydown', key);
    el.removeEventListener('contextmenu', menu);
  };
}
