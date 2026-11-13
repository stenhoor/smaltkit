/**
 * Labels: a glyph atlas texture (glyphs rasterized once with an OffscreenCanvas 2D context, drawing
 * is all GPU) and the per-glyph instance list the label shader draws. The atlas has text coverage in
 * the red channel and a dilated halo in green, so labels stay readable over edges.
 */
import type { RenderNode } from './types.js';

export const LABEL_FONT = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const LABEL_CSS_PX = 11;
export const MAX_LABEL_CHARS = 24;
/** Show every label when the graph has at most this many nodes. */
export const ALL_LABELS_BELOW = 300;
/** Never draw more than this many labels at once. */
export const LABEL_CAP = 600;

export function labelText(node: RenderNode): string {
  const s = node.label ?? String(node.id);
  const chars = [...s];
  return chars.length > MAX_LABEL_CHARS ? chars.slice(0, MAX_LABEL_CHARS - 1).join('') + '…' : s;
}

export interface LabelChoice {
  nodeCount: number;
  /** Node indices sorted by descending degree. */
  order: Uint32Array;
  /** Always labelled (highlighted, hovered, focused), in priority order. */
  always: readonly number[];
  /** Label every node (subject to visibility and the cap). */
  showAll: boolean;
  visible?: (i: number) => boolean;
  cap?: number;
}

/** Which nodes get a label: the always-set first, then (when showAll) visible nodes by degree. */
export function chooseLabels(c: LabelChoice): number[] {
  const cap = c.cap ?? LABEL_CAP;
  const out: number[] = [];
  const seen = new Set<number>();
  for (const i of c.always) {
    if (out.length >= cap) return out;
    if (i >= 0 && i < c.nodeCount && !seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
  }
  if (!c.showAll) return out;
  for (let k = 0; k < c.order.length && out.length < cap; k++) {
    const i = c.order[k]!;
    if (seen.has(i) || (c.visible && !c.visible(i))) continue;
    out.push(i);
  }
  return out;
}

/** Whether to label every node: few nodes, or nodes spread far enough apart on screen. */
export function shouldShowAll(nodeCount: number, avgSpacingPx: number, dpr: number): boolean {
  return nodeCount <= ALL_LABELS_BELOW || avgSpacingPx >= 70 * dpr;
}

export class GlyphAtlas {
  readonly fontPx: number;
  readonly advance: number;
  readonly cellW: number;
  readonly cellH: number;
  readonly cols: number;
  readonly width = 1024;
  readonly height: number;
  readonly texture: GPUTexture;
  private readonly slots = new Map<string, number>();
  private readonly ctx: OffscreenCanvasRenderingContext2D;
  private readonly canvas: OffscreenCanvas;
  private dirty = true;

  constructor(private readonly device: GPUDevice, dpr: number) {
    this.fontPx = Math.max(8, Math.round(LABEL_CSS_PX * dpr));
    this.canvas = new OffscreenCanvas(8, 8);
    const probe = this.canvas.getContext('2d', { willReadFrequently: true })!;
    probe.font = `${this.fontPx}px ${LABEL_FONT}`;
    this.advance = Math.ceil(probe.measureText('M').width);
    const pad = Math.ceil(this.fontPx * 0.25) + 1;
    this.cellW = this.advance + 2 * pad;
    this.cellH = Math.ceil(this.fontPx * 1.3) + 2 * pad;
    this.cols = Math.floor(this.width / this.cellW);
    const rows = Math.ceil(512 / this.cols);
    this.height = rows * this.cellH;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.texture = device.createTexture({
      label: 'labels.atlas',
      size: [this.width, this.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    for (let c = 32; c < 127; c++) this.slot(String.fromCharCode(c));
    this.slot('…');
  }

  get capacity(): number {
    return this.cols * Math.floor(this.height / this.cellH);
  }

  /** Atlas slot of a character, rasterizing it on first use ('?' when the atlas is full). */
  slot(ch: string): number {
    const s = this.slots.get(ch);
    if (s !== undefined) return s;
    if (this.slots.size >= this.capacity) return this.slots.get('?') ?? 0;
    const slot = this.slots.size;
    this.slots.set(ch, slot);
    this.draw(ch, slot);
    this.dirty = true;
    return slot;
  }

  private draw(ch: string, slot: number): void {
    const ctx = this.ctx;
    const x = (slot % this.cols) * this.cellW;
    const y = Math.floor(slot / this.cols) * this.cellH;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, this.cellW, this.cellH);
    ctx.clip();
    ctx.font = `${this.fontPx}px ${LABEL_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = x + this.cellW / 2, cy = y + this.cellH / 2;
    // Halo in green, text in red (additive channels).
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, this.fontPx * 0.3);
    ctx.strokeStyle = '#00ff00';
    ctx.fillStyle = '#00ff00';
    ctx.strokeText(ch, cx, cy);
    ctx.fillText(ch, cx, cy);
    ctx.fillStyle = '#ff0000';
    ctx.fillText(ch, cx, cy);
    ctx.restore();
  }

  /** Upload pending glyphs. */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const img = this.ctx.getImageData(0, 0, this.width, this.height);
    this.device.queue.writeTexture({ texture: this.texture }, img.data, { bytesPerRow: this.width * 4 }, [this.width, this.height]);
  }

  destroy(): void {
    this.texture.destroy();
  }
}

/**
 * Fill `out` with glyph instances (node, slot, char index, length) for the given nodes and return
 * the instance count; `out` must hold `maxGlyphs * 4` entries.
 */
export function buildGlyphInstances(
  nodes: readonly RenderNode[],
  chosen: readonly number[],
  slotOf: (ch: string) => number,
  out: Uint32Array,
): number {
  let k = 0;
  const max = out.length >> 2;
  for (const i of chosen) {
    const chars = [...labelText(nodes[i]!)];
    if (k + chars.length > max) break;
    for (let c = 0; c < chars.length; c++) {
      out[k * 4] = i;
      out[k * 4 + 1] = slotOf(chars[c]!);
      out[k * 4 + 2] = c;
      out[k * 4 + 3] = chars.length;
      k++;
    }
  }
  return k;
}
