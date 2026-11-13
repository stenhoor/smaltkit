/**
 * Draws tile geometry with WebGPU: polygon fills through the stencil buffer and lines as capsules, in a theme's
 * colours and widths. It takes the tiles to draw (a tile source's plan) and knows nothing of where they came from.
 *
 * - Fills: each ring's triangle fan counts its winding into the stencil (nonzero rule), then the same fan is drawn
 *   where the count isn't zero, clearing it. Concave shapes, holes and overlapping polygons come out right with no
 *   triangulation.
 * - Lines: segments as rounded capsules, sized in pixels, anti-aliased in the fragment shader.
 * - Every draw is clipped to its square in the fragment shader, so a parent tile can stand in for a missing child.
 */
import type { Camera } from '../core/camera.js';
import { parseColor, type RGBA } from '../core/color.js';
import type { Frame, LayerGpu } from '../core/contract.js';
import { BLEND_OVER, bufferFrom, NO_STENCIL, STENCIL_FORMAT, VIEW_WGSL } from '../core/gpu.js';
import { atZoom, FILL_GROUPS, LINE_GROUPS, type Theme } from './style.js';
import type { DrawItem, TileEntry } from './tile-source.js';
import type { TileId } from './tiles.js';

const TILE_UNIFORMS = /* wgsl */ `
struct T { origin: vec2f, k: f32, width: f32, clip: vec4f, color: vec4f };
@group(1) @binding(0) var<uniform> t: T;
`;

const FILL_WGSL = /* wgsl */ `
${VIEW_WGSL}
${TILE_UNIFORMS}
struct V { @builtin(position) p: vec4f, @location(0) tile: vec2f };
@vertex fn vs(@location(0) p: vec2f) -> V {
  return V(pixelsToClip(toPixels(t.origin + p * t.k)), p);
}
@fragment fn fs(v: V) -> @location(0) vec4f {
  if (v.tile.x < t.clip.x || v.tile.y < t.clip.y || v.tile.x > t.clip.z || v.tile.y > t.clip.w) { discard; }
  return t.color;
}
`;

const LINE_WGSL = /* wgsl */ `
${VIEW_WGSL}
${TILE_UNIFORMS}
struct V {
  @builtin(position) p: vec4f,
  @location(0) local: vec2f,
  @location(1) tile: vec2f,
  @location(2) @interpolate(flat) len: f32,
};
const C = array<vec2f, 6>(vec2f(0, -1), vec2f(1, -1), vec2f(0, 1), vec2f(0, 1), vec2f(1, -1), vec2f(1, 1));
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) seg: vec4f) -> V {
  let a = toPixels(t.origin + seg.xy * t.k);
  let b = toPixels(t.origin + seg.zw * t.k);
  let d = b - a;
  let len = length(d);
  var dir = vec2f(1.0, 0.0);
  if (len > 1e-6) { dir = d / len; }
  let n = vec2f(-dir.y, dir.x);
  let hw = max(t.width, 1.0) * 0.5 + 1.0;
  let c = C[vi];
  let along = select(-hw, len + hw, c.x > 0.5);
  let side = c.y * hw;
  let px = a + dir * along + n * side;
  // Back to tile units, for clipping: the inverse of toPixels.
  let q = px - a;
  let inv = vec2f(q.x * view.cosr + q.y * view.sinr, -q.x * view.sinr + q.y * view.cosr) / (view.scale * t.k);
  var o: V;
  o.p = pixelsToClip(px);
  o.local = vec2f(along, side);
  o.tile = seg.xy + inv;
  o.len = len;
  return o;
}
@fragment fn fs(v: V) -> @location(0) vec4f {
  if (v.tile.x < t.clip.x || v.tile.y < t.clip.y || v.tile.x > t.clip.z || v.tile.y > t.clip.w) { discard; }
  var d = abs(v.local.y);
  if (v.local.x < 0.0) { d = length(v.local); }
  else if (v.local.x > v.len) { d = length(vec2f(v.local.x - v.len, v.local.y)); }
  let w = max(t.width, 1.0);
  let a = clamp(w * 0.5 - d + 0.5, 0.0, 1.0) * min(t.width, 1.0);
  if (a <= 0.0) { discard; }
  return t.color * a;
}
`;

/** A tile's GPU buffers, kept on its entry. */
interface TileBuffers {
  fillVB?: GPUBuffer;
  fillIB?: GPUBuffer;
  segVB?: GPUBuffer;
}

const premul = ([r, g, b, a]: RGBA): RGBA => [r * a, g * a, b * a, a];

/** Uniforms for drawing `tile` clipped to `clip`: origin offset, tile units to world, line width, clip, colour. */
export function tileUniforms(camera: Camera, tile: TileId, clip: TileId, extent: number, width: number, color: RGBA): number[] {
  const n = 2 ** tile.z;
  const s = 2 ** (clip.z - tile.z);
  const cx0 = (clip.x / s - tile.x) * extent, cy0 = (clip.y / s - tile.y) * extent;
  const cs = extent / s;
  return [tile.x / n - camera.x, tile.y / n - camera.y, 1 / n / extent, width, cx0, cy0, cx0 + cs, cy0 + cs, ...color];
}

export class TileRenderer {
  private gpu?: LayerGpu;
  private stencilPipe?: GPURenderPipeline;
  private coverPipe?: GPURenderPipeline;
  private linePipe?: GPURenderPipeline;
  private layout?: GPUBindGroupLayout;
  private group?: GPUBindGroup;
  private groupVersion = -1;

  attach(gpu: LayerGpu): void {
    this.gpu = gpu;
    const { device } = gpu;
    const V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT;
    this.layout = device.createBindGroupLayout({
      label: 'basemap tile',
      entries: [{ binding: 0, visibility: V | F, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 48 } }],
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [gpu.viewLayout, this.layout] });
    const fill = device.createShaderModule({ label: 'basemap fill', code: FILL_WGSL });
    const fillVertex: GPUVertexState = { module: fill, entryPoint: 'vs', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] };
    const ms = { count: gpu.samples };
    const stencil = (front: GPUStencilFaceState, back: GPUStencilFaceState): GPUDepthStencilState => ({
      format: STENCIL_FORMAT,
      depthCompare: 'always',
      depthWriteEnabled: false,
      stencilFront: front,
      stencilBack: back,
      stencilReadMask: 0xff,
      stencilWriteMask: 0xff,
    });
    this.stencilPipe = device.createRenderPipeline({
      label: 'basemap stencil',
      layout,
      vertex: fillVertex,
      fragment: { module: fill, entryPoint: 'fs', targets: [{ format: gpu.format, writeMask: 0 }] },
      // Nonzero winding: rings wound one way count up, the other way down. Overlapping polygons of a group fill as
      // their union, and holes (wound against their outer ring) cancel.
      depthStencil: stencil({ compare: 'always', passOp: 'increment-wrap' }, { compare: 'always', passOp: 'decrement-wrap' }),
      multisample: ms,
    });
    this.coverPipe = device.createRenderPipeline({
      label: 'basemap cover',
      layout,
      vertex: fillVertex,
      fragment: { module: fill, entryPoint: 'fs', targets: [{ format: gpu.format, blend: BLEND_OVER }] },
      depthStencil: stencil({ compare: 'not-equal', passOp: 'zero' }, { compare: 'not-equal', passOp: 'zero' }),
      multisample: ms,
    });
    const line = device.createShaderModule({ label: 'basemap line', code: LINE_WGSL });
    this.linePipe = device.createRenderPipeline({
      label: 'basemap line',
      layout,
      vertex: { module: line, entryPoint: 'vs', buffers: [{ arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] }] },
      fragment: { module: line, entryPoint: 'fs', targets: [{ format: gpu.format, blend: BLEND_OVER }] },
      depthStencil: NO_STENCIL,
      multisample: ms,
    });
  }

  /** Uploads a tile's geometry; keeps the buffers on the entry. */
  upload(entry: TileEntry): void {
    const g = entry.geometry;
    if (!g || !this.gpu) return;
    const device = this.gpu.device;
    const b: TileBuffers = {};
    if (g.fillIndex.length) {
      b.fillVB = bufferFrom(device, g.fillVerts, GPUBufferUsage.VERTEX, 'tile fill vertices');
      b.fillIB = bufferFrom(device, g.fillIndex, GPUBufferUsage.INDEX, 'tile fill indices');
    }
    if (g.segments.length) b.segVB = bufferFrom(device, g.segments, GPUBufferUsage.VERTEX, 'tile segments');
    entry.data = b;
  }

  /** Frees a tile's buffers. */
  release(entry: TileEntry): void {
    const b = entry.data as TileBuffers | undefined;
    b?.fillVB?.destroy();
    b?.fillIB?.destroy();
    b?.segVB?.destroy();
    entry.data = undefined;
  }

  private bind(): GPUBindGroup {
    const gpu = this.gpu!;
    if (!this.group || this.groupVersion !== gpu.arena.version) {
      this.group = gpu.device.createBindGroup({ layout: this.layout!, entries: [{ binding: 0, resource: { buffer: gpu.arena.buffer, size: 48 } }] });
      this.groupVersion = gpu.arena.version;
    }
    return this.group;
  }

  /** Draws the planned tiles' fills, then their lines (casings first), in the theme's order. */
  draw(pass: GPURenderPassEncoder, frame: Frame, plan: readonly DrawItem[], theme: Theme): void {
    if (!this.gpu || !plan.length) return;
    const { camera } = frame;
    const arena = this.gpu.arena;
    const z = camera.zoom;
    pass.setBindGroup(0, frame.viewGroup);

    for (let g = 0; g < FILL_GROUPS.length; g++) {
      const color = premul(parseColor(theme.fills[FILL_GROUPS[g]]));
      for (const { tile, clip } of plan) {
        const geom = tile.geometry!;
        const b = tile.data as TileBuffers | undefined;
        const r = geom.fills.find((f) => f.group === g);
        if (!r || !b?.fillVB) continue;
        pass.setBindGroup(1, this.bind(), [arena.push(tileUniforms(camera, tile.id, clip, geom.extent, 0, color))]);
        pass.setVertexBuffer(0, b.fillVB);
        pass.setIndexBuffer(b.fillIB!, 'uint32');
        pass.setPipeline(this.stencilPipe!);
        pass.setStencilReference(0);
        pass.drawIndexed(r.count, 1, r.start);
        pass.setPipeline(this.coverPipe!);
        pass.drawIndexed(r.count, 1, r.start);
      }
    }

    pass.setPipeline(this.linePipe!);
    for (const casing of [true, false]) {
      for (let g = 0; g < LINE_GROUPS.length; g++) {
        const st = theme.lines[LINE_GROUPS[g]];
        if (z < (st.minZoom ?? 0) - 0.5 || (casing && !st.casing)) continue;
        const spec = casing ? st.casing! : st;
        const width = atZoom(spec.width, z);
        const color = premul(parseColor(spec.color));
        if (color[3] === 0) continue;
        for (const { tile, clip } of plan) {
          const geom = tile.geometry!;
          const b = tile.data as TileBuffers | undefined;
          const r = geom.lines.find((l) => l.group === g);
          if (!r || !b?.segVB) continue;
          pass.setBindGroup(1, this.bind(), [arena.push(tileUniforms(camera, tile.id, clip, geom.extent, width, color))]);
          pass.setVertexBuffer(0, b.segVB);
          pass.draw(6, r.count, 0, r.start);
        }
      }
    }
  }
}
