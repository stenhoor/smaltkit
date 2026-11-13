/**
 * Map labels: which place, road and river names to show this frame, and drawing them. `labelCandidates` finds the
 * labels in view (pure: tiles, camera and theme in, screen positions out); `LabelRenderer` places them most important
 * first without overlaps, renders their text into the atlas (labels.ts) and draws them as quads.
 */
import type { Camera } from '../core/camera.js';
import type { Frame, LayerGpu } from '../core/contract.js';
import { BLEND_OVER, NO_STENCIL, VIEW_WGSL } from '../core/gpu.js';
import { CollisionGrid, LabelAtlas } from './labels.js';
import { LABEL_KINDS, type Theme } from './style.js';
import type { DrawItem } from './tile-source.js';

const LABEL_WGSL = /* wgsl */ `
${VIEW_WGSL}
@group(1) @binding(0) var atlas: texture_2d<f32>;
@group(1) @binding(1) var samp: sampler;
struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) alpha: f32 };
const C = array<vec2f, 6>(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));
// rect: centre and size in CSS pixels; rot: cos and sin of the label's angle on screen.
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) rect: vec4f, @location(1) uv: vec4f, @location(2) alpha: f32, @location(3) rot: vec2f) -> V {
  let c = C[vi];
  let q = (c - 0.5) * rect.zw;
  let px = rect.xy + vec2f(q.x * rot.x - q.y * rot.y, q.x * rot.y + q.y * rot.x);
  return V(vec4f(px.x / view.half.x - 1.0, 1.0 - px.y / view.half.y, 0.0, 1.0), mix(uv.xy, uv.zw, c), alpha);
}
@fragment fn fs(v: V) -> @location(0) vec4f {
  return textureSampleLevel(atlas, samp, v.uv, 0.0) * v.alpha;
}
`;

/** A label that could show: its kind (index into LABEL_KINDS), text, rank, screen position and angle. */
export interface LabelCandidate {
  readonly kind: number;
  readonly rank: number;
  readonly text: string;
  readonly sx: number;
  readonly sy: number;
  /** Radians on screen; 0 for level labels, the line's direction for road and river names (kept upright). */
  readonly angle: number;
  /** Kind and text: the same name in two tiles is one label. */
  readonly key: string;
}

/** The labels of the planned tiles that the theme shows at this zoom and that fall near the screen, once each. */
export function labelCandidates(plan: readonly DrawItem[], camera: Camera, theme: Theme): LabelCandidate[] {
  const z = camera.zoom;
  const out: LabelCandidate[] = [];
  const seen = new Set<string>();
  for (const { tile, clip } of plan) {
    const g = tile.geometry!;
    const n = 2 ** tile.id.z;
    const s = 2 ** (clip.z - tile.id.z);
    const cx0 = (clip.x / s - tile.id.x) * g.extent, cy0 = (clip.y / s - tile.id.y) * g.extent, cs = g.extent / s;
    for (const l of g.labels) {
      if (l.x < cx0 || l.y < cy0 || l.x >= cx0 + cs || l.y >= cy0 + cs) continue;
      const st = theme.labels[LABEL_KINDS[l.kind]];
      if (z < st.minZoom || (st.maxZoom !== undefined && z > st.maxZoom)) continue;
      const key = `${l.kind}|${l.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const wx = tile.id.x / n + l.x / g.extent / n, wy = tile.id.y / n + l.y / g.extent / n;
      const [sx, sy] = camera.worldToScreen(wx, wy);
      if (sx < -100 || sy < -40 || sx > camera.width + 100 || sy > camera.height + 40) continue;
      let angle = 0;
      if (l.dx !== undefined && l.dy !== undefined) {
        const step = 64 / g.extent / n;
        const [ex, ey] = camera.worldToScreen(wx + l.dx * step, wy + l.dy * step);
        angle = Math.atan2(ey - sy, ex - sx);
        if (angle > Math.PI / 2) angle -= Math.PI;
        else if (angle < -Math.PI / 2) angle += Math.PI;
      }
      out.push({ kind: l.kind, rank: l.rank, text: l.text, sx, sy, key, angle });
    }
  }
  return out;
}

export class LabelRenderer {
  private gpu?: LayerGpu;
  private pipe?: GPURenderPipeline;
  private group?: GPUBindGroup;
  private atlas?: LabelAtlas;
  private buffer?: GPUBuffer;
  private capacity = 0;
  private shown = new Set<string>();
  /** Most labels drawn at once. */
  maxLabels = 400;

  attach(gpu: LayerGpu): void {
    this.gpu = gpu;
    const { device } = gpu;
    const F = GPUShaderStage.FRAGMENT;
    const module = device.createShaderModule({ label: 'labels', code: LABEL_WGSL });
    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: F, texture: { sampleType: 'float' } },
        { binding: 1, visibility: F, sampler: { type: 'filtering' } },
      ],
    });
    this.pipe = device.createRenderPipeline({
      label: 'labels',
      layout: device.createPipelineLayout({ bindGroupLayouts: [gpu.viewLayout, layout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: 44,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 1, offset: 16, format: 'float32x4' },
              { shaderLocation: 2, offset: 32, format: 'float32' },
              { shaderLocation: 3, offset: 36, format: 'float32x2' },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: 'fs', targets: [{ format: gpu.format, blend: BLEND_OVER }] },
      depthStencil: NO_STENCIL,
      multisample: { count: gpu.samples },
    });
    this.atlas = new LabelAtlas(device, Math.min(2, globalThis.devicePixelRatio || 1));
    this.group = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: this.atlas.texture.createView() },
        { binding: 1, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
      ],
    });
  }

  /** Forgets rendered text (after a theme change: colours differ). */
  clear(): void {
    this.atlas?.clear();
  }

  /** Places and draws the candidates: most important kind first, then last frame's, then by rank; no overlaps. */
  draw(pass: GPURenderPassEncoder, frame: Frame, candidates: readonly LabelCandidate[], theme: Theme): void {
    if (!this.atlas || !candidates.length) return;
    const prev = this.shown;
    const order = [...candidates].sort((a, b) => a.kind - b.kind || (prev.has(b.key) ? 1 : 0) - (prev.has(a.key) ? 1 : 0) || a.rank - b.rank);
    const grid = new CollisionGrid();
    const r = frame.pixelRatio;
    const size = this.atlas.size;
    const inst: number[] = [];
    const shown = new Set<string>();
    const gen = this.atlas.generation;
    for (const c of order) {
      if (shown.size >= this.maxLabels) break;
      const e = this.atlas.get(c.text, theme.labels[LABEL_KINDS[c.kind]], theme.halo);
      if (!e || this.atlas.generation !== gen) break;
      const w = e.w / r, h = e.h / r;
      const cos = Math.cos(c.angle), sin = Math.sin(c.angle);
      // Level labels snap to device pixels so text stays crisp; turned ones can't.
      const cx = c.angle ? c.sx : (Math.round((c.sx - w / 2) * r) + e.w / 2) / r;
      const cy = c.angle ? c.sy : (Math.round((c.sy - h / 2) * r) + e.h / 2) / r;
      // The turned box's bounds, a little inside the halo.
      const bw = (Math.abs(cos) * (w - 4) + Math.abs(sin) * (h - 6)) / 2, bh = (Math.abs(sin) * (w - 4) + Math.abs(cos) * (h - 6)) / 2;
      if (!grid.tryPlace([cx - bw, cy - bh, cx + bw, cy + bh])) continue;
      shown.add(c.key);
      inst.push(cx, cy, w, h, e.x / size, e.y / size, (e.x + e.w) / size, (e.y + e.h) / size, 1, cos, sin);
    }
    this.shown = shown;
    if (!inst.length) return;
    const count = inst.length / 11;
    const device = this.gpu!.device;
    if (count > this.capacity) {
      this.buffer?.destroy();
      this.capacity = Math.max(64, count * 2);
      this.buffer = device.createBuffer({ label: 'labels', size: this.capacity * 44, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    device.queue.writeBuffer(this.buffer!, 0, new Float32Array(inst));
    pass.setPipeline(this.pipe!);
    pass.setBindGroup(0, frame.viewGroup);
    pass.setBindGroup(1, this.group!);
    pass.setVertexBuffer(0, this.buffer!);
    pass.draw(6, count);
  }

  destroy(): void {
    this.atlas?.destroy();
    this.buffer?.destroy();
  }
}
