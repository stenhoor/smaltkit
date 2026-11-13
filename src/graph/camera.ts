/**
 * Camera math for both modes. Matrices are column-major Float32Arrays (WGSL mat4x4f layout) and clip
 * space is WebGPU's (z in 0..1). Screen coordinates are device pixels with y down, and world y also
 * points down the screen, so a 2D layout looks the same when the view switches to 3D.
 *
 * 2D: an orthographic view, `zoom` device pixels per world unit, centred on (x, y).
 * 3D: an orbit camera around the target (x, y, z) at `distance`, turned by `yaw` and `pitch`.
 */
import type { ViewMode } from './types.js';

export interface CameraState {
  x: number;
  y: number;
  z: number;
  zoom: number;
  distance: number;
  yaw: number;
  pitch: number;
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
  /** Bounding sphere around the box centre. */
  radius: number;
  count: number;
}

export const FOV_Y = Math.PI / 4;
export const MAX_PITCH = 1.45;
export const MIN_ZOOM = 1e-4;
export const MAX_ZOOM = 1e3;

export function defaultCamera(): CameraState {
  return { x: 0, y: 0, z: 0, zoom: 1, distance: 500, yaw: 0, pitch: 0 };
}

// ---- mat4 -------------------------------------------------------------------------------------

export function mat4Multiply(a: Float32Array, b: Float32Array, out: Float32Array): Float32Array {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4]!, b1 = b[c * 4 + 1]!, b2 = b[c * 4 + 2]!, b3 = b[c * 4 + 3]!;
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r]! * b0 + a[4 + r]! * b1 + a[8 + r]! * b2 + a[12 + r]! * b3;
    }
  }
  return out;
}

export function mat4Invert(m: Float32Array, out: Float32Array): boolean {
  const a00 = m[0]!, a01 = m[1]!, a02 = m[2]!, a03 = m[3]!;
  const a10 = m[4]!, a11 = m[5]!, a12 = m[6]!, a13 = m[7]!;
  const a20 = m[8]!, a21 = m[9]!, a22 = m[10]!, a23 = m[11]!;
  const a30 = m[12]!, a31 = m[13]!, a32 = m[14]!, a33 = m[15]!;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return false;
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return true;
}

/** Right-handed perspective with WebGPU depth 0..1. */
export function mat4Perspective(fovY: number, aspect: number, near: number, far: number, out: Float32Array): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = far / (near - far);
  out[11] = -1;
  out[14] = (near * far) / (near - far);
  return out;
}

export function mat4LookAt(eye: ArrayLike<number>, target: ArrayLike<number>, up: ArrayLike<number>, out: Float32Array): Float32Array {
  let fx = target[0]! - eye[0]!, fy = target[1]! - eye[1]!, fz = target[2]! - eye[2]!;
  let l = Math.hypot(fx, fy, fz) || 1;
  fx /= l; fy /= l; fz /= l;
  // s = f × up
  let sx = fy * up[2]! - fz * up[1]!, sy = fz * up[0]! - fx * up[2]!, sz = fx * up[1]! - fy * up[0]!;
  l = Math.hypot(sx, sy, sz) || 1;
  sx /= l; sy /= l; sz /= l;
  // u = s × f
  const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
  out[0] = sx; out[1] = ux; out[2] = -fx; out[3] = 0;
  out[4] = sy; out[5] = uy; out[6] = -fy; out[7] = 0;
  out[8] = sz; out[9] = uz; out[10] = -fz; out[11] = 0;
  out[12] = -(sx * eye[0]! + sy * eye[1]! + sz * eye[2]!);
  out[13] = -(ux * eye[0]! + uy * eye[1]! + uz * eye[2]!);
  out[14] = fx * eye[0]! + fy * eye[1]! + fz * eye[2]!;
  out[15] = 1;
  return out;
}

// ---- camera -----------------------------------------------------------------------------------

/** Eye position of the 3D orbit camera. */
export function eyeOf(s: CameraState, out: Float64Array | number[] = [0, 0, 0]): Float64Array | number[] {
  const cp = Math.cos(s.pitch);
  out[0] = s.x + s.distance * cp * Math.sin(s.yaw);
  out[1] = s.y + s.distance * Math.sin(s.pitch);
  out[2] = s.z - s.distance * cp * Math.cos(s.yaw);
  return out;
}

const UP = [0, -1, 0];
const scratchView = new Float32Array(16);
const scratchProj = new Float32Array(16);
const scratchEye = [0, 0, 0];

/** Pixels per world unit at view depth 1 (3D) or everywhere (2D). */
export function scalePx(s: CameraState, mode: ViewMode, height: number): number {
  return mode === '2d' ? s.zoom : height / 2 / Math.tan(FOV_Y / 2);
}

export function clipPlanes(s: CameraState, sceneRadius: number): [number, number] {
  const near = Math.max(0.05, s.distance * 0.005);
  const far = s.distance + 4 * Math.max(sceneRadius, 1) + 100;
  return [near, far];
}

/** Write the view-projection matrix into `out`. */
export function viewProjection(
  s: CameraState,
  mode: ViewMode,
  width: number,
  height: number,
  sceneRadius: number,
  out: Float32Array,
): Float32Array {
  if (mode === '2d') {
    out.fill(0);
    out[0] = (2 * s.zoom) / width;
    out[5] = (-2 * s.zoom) / height;
    out[12] = -s.x * out[0];
    out[13] = -s.y * out[5];
    out[10] = 1e-4; // keeps the matrix invertible; depth stays ~0.5
    out[14] = 0.5;
    out[15] = 1;
    return out;
  }
  const [near, far] = clipPlanes(s, sceneRadius);
  eyeOf(s, scratchEye);
  mat4LookAt(scratchEye, [s.x, s.y, s.z], UP, scratchView);
  mat4Perspective(FOV_Y, width / Math.max(height, 1), near, far, scratchProj);
  return mat4Multiply(scratchProj, scratchView, out);
}

export interface Projected {
  x: number;
  y: number;
  /** NDC depth (0..1 when between the clip planes). */
  depth: number;
  w: number;
}

export function project(m: Float32Array, width: number, height: number, p: ArrayLike<number>, out?: Projected): Projected {
  const x = p[0]!, y = p[1]!, z = p[2] ?? 0;
  const cx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
  const cy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
  const cz = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
  const cw = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  const r = out ?? { x: 0, y: 0, depth: 0, w: 0 };
  const iw = 1 / (cw || 1e-9);
  r.x = (cx * iw * 0.5 + 0.5) * width;
  r.y = (0.5 - cy * iw * 0.5) * height;
  r.depth = cz * iw;
  r.w = cw;
  return r;
}

const scratchInv = new Float32Array(16);

/** Screen pixel and NDC depth back to world space. */
export function unproject(m: Float32Array, width: number, height: number, sx: number, sy: number, depth: number): [number, number, number] {
  if (!mat4Invert(m, scratchInv)) return [0, 0, 0];
  const nx = (sx / width) * 2 - 1;
  const ny = 1 - (sy / height) * 2;
  const i = scratchInv;
  const x = i[0]! * nx + i[4]! * ny + i[8]! * depth + i[12]!;
  const y = i[1]! * nx + i[5]! * ny + i[9]! * depth + i[13]!;
  const z = i[2]! * nx + i[6]! * ny + i[10]! * depth + i[14]!;
  const w = i[3]! * nx + i[7]! * ny + i[11]! * depth + i[15]!;
  return [x / w, y / w, z / w];
}

/** Bounds of the first `count` points of a stride-4 (xyzw) position array. */
export function boundsOf(pos: Float32Array, count: number): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let n = 0;
  for (let i = 0; i < count; i++) {
    const x = pos[i * 4]!, y = pos[i * 4 + 1]!, z = pos[i * 4 + 2]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    n++;
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }
  if (n === 0) return { min: [0, 0, 0], max: [0, 0, 0], radius: 0, count: 0 };
  const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, cz = (min[2] + max[2]) / 2;
  let r2 = 0;
  for (let i = 0; i < count; i++) {
    const dx = pos[i * 4]! - cx, dy = pos[i * 4 + 1]! - cy, dz = pos[i * 4 + 2]! - cz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > r2) r2 = d;
  }
  return { min, max, radius: Math.sqrt(r2), count: n };
}

/**
 * The camera state that frames `b` in a viewport, with `padPx` device pixels of margin and room for
 * nodes of world radius `nodeRadius`. Orientation (yaw/pitch) is kept.
 */
/**
 * How close fit() comes: a few nodes keep their natural size instead of filling the view. 2D: the largest zoom;
 * 3D: the smallest radius framed, in world units (relationships are about 30 long).
 */
export const FIT_MAX_ZOOM = 2.5;
export const FIT_MIN_RADIUS = 90;

export function fitCamera(
  b: Bounds,
  mode: ViewMode,
  width: number,
  height: number,
  padPx: number,
  nodeRadius: number,
  current: CameraState,
): CameraState {
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const next = { ...current, x: cx, y: cy, z: mode === '2d' ? 0 : cz };
  const w = Math.max(width - 2 * padPx, width * 0.2);
  const h = Math.max(height - 2 * padPx, height * 0.2);
  if (mode === '2d') {
    const bw = b.max[0] - b.min[0] + 2 * nodeRadius;
    const bh = b.max[1] - b.min[1] + 2 * nodeRadius;
    next.zoom = clamp(Math.min(w / Math.max(bw, 1e-6), h / Math.max(bh, 1e-6), FIT_MAX_ZOOM), MIN_ZOOM, MAX_ZOOM);
    if (b.count <= 1) next.zoom = clamp(current.zoom, MIN_ZOOM, MAX_ZOOM);
  } else {
    const r = Math.max(b.radius + nodeRadius, FIT_MIN_RADIUS);
    const halfY = Math.atan(Math.tan(FOV_Y / 2) * (h / height));
    const halfX = Math.atan(Math.tan(FOV_Y / 2) * (w / height));
    next.distance = r / Math.sin(Math.min(halfX, halfY));
  }
  return next;
}

/** Zoom the 2D camera by `factor` keeping the world point under (sx, sy) fixed. */
export function zoomAt2d(s: CameraState, width: number, height: number, sx: number, sy: number, factor: number): void {
  const wx = s.x + (sx - width / 2) / s.zoom;
  const wy = s.y + (sy - height / 2) / s.zoom;
  s.zoom = clamp(s.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  s.x = wx - (sx - width / 2) / s.zoom;
  s.y = wy - (sy - height / 2) / s.zoom;
}

/** Move the content by (dx, dy) screen pixels. */
export function pan(s: CameraState, mode: ViewMode, height: number, dx: number, dy: number): void {
  if (mode === '2d') {
    s.x -= dx / s.zoom;
    s.y -= dy / s.zoom;
    return;
  }
  // Camera basis: right = f × up, screenUp = right × f.
  eyeOf(s, scratchEye);
  let fx = s.x - scratchEye[0]!, fy = s.y - scratchEye[1]!, fz = s.z - scratchEye[2]!;
  let l = Math.hypot(fx, fy, fz) || 1;
  fx /= l; fy /= l; fz /= l;
  let rx = fy * UP[2]! - fz * UP[1]!, ry = fz * UP[0]! - fx * UP[2]!, rz = fx * UP[1]! - fy * UP[0]!;
  l = Math.hypot(rx, ry, rz) || 1;
  rx /= l; ry /= l; rz /= l;
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  const k = (s.distance * 2 * Math.tan(FOV_Y / 2)) / height;
  s.x += (-rx * dx + ux * dy) * k;
  s.y += (-ry * dx + uy * dy) * k;
  s.z += (-rz * dx + uz * dy) * k;
}

export function orbit(s: CameraState, dx: number, dy: number, radPerPx = 0.006): void {
  s.yaw += dx * radPerPx;
  s.pitch = clamp(s.pitch + dy * radPerPx, -MAX_PITCH, MAX_PITCH);
}

export function dolly(s: CameraState, factor: number): void {
  s.distance = clamp(s.distance * factor, 0.5, 1e7);
}

/** Interpolate camera states (zoom and distance in log space). */
export function lerpCamera(a: CameraState, b: CameraState, t: number, out: CameraState): CameraState {
  const l = (p: number, q: number) => p + (q - p) * t;
  out.x = l(a.x, b.x);
  out.y = l(a.y, b.y);
  out.z = l(a.z, b.z);
  out.zoom = Math.exp(l(Math.log(a.zoom), Math.log(b.zoom)));
  out.distance = Math.exp(l(Math.log(a.distance), Math.log(b.distance)));
  out.yaw = l(a.yaw, b.yaw);
  out.pitch = l(a.pitch, b.pitch);
  return out;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Same on-screen scale when switching modes: 2D zoom ↔ 3D distance. */
export function convertCamera(s: CameraState, to: ViewMode, height: number): CameraState {
  const f = scalePx(s, '3d', height);
  if (to === '3d') return { ...s, z: 0, distance: f / s.zoom, yaw: 0, pitch: 0 };
  return { ...s, z: 0, zoom: clamp(f / s.distance, MIN_ZOOM, MAX_ZOOM) };
}
