/**
 * Labels: text is laid out and drawn by the browser (Canvas 2D, so every script and font the page has works), packed
 * into an atlas texture once per label, and drawn as textured quads. Which labels show is decided every frame on the
 * CPU: most important first, skipping any that would overlap one already placed. A few hundred labels at most, so
 * this costs well under a millisecond.
 */
import type { LabelStyle } from './style.js';

export interface AtlasEntry {
  /** Atlas rectangle, in device pixels. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const ATLAS = 2048;
const PAD = 2;

/** A shelf-packed texture of rendered label strings. When it fills up, it starts again empty. */
export class LabelAtlas {
  readonly texture: GPUTexture;
  private entries = new Map<string, AtlasEntry>();
  private shelfX = 0;
  private shelfY = 0;
  private shelfH = 0;
  private canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  /** Bumped when the atlas is cleared: labels placed before must be looked up again. */
  generation = 0;

  constructor(private readonly device: GPUDevice, private ratio: number) {
    this.texture = device.createTexture({
      label: 'smaltgl labels',
      size: [ATLAS, ATLAS],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.canvas = new OffscreenCanvas(512, 64);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
  }

  clear(): void {
    this.entries.clear();
    this.shelfX = this.shelfY = this.shelfH = 0;
    this.generation++;
  }

  /** The atlas entry for a string in a style, rendering it if needed. Undefined if it doesn't fit even when empty. */
  get(text: string, style: LabelStyle, halo: string): AtlasEntry | undefined {
    const key = `${style.size}|${style.weight ?? 400}|${style.italic ? 1 : 0}|${style.color}|${halo}|${text}`;
    const have = this.entries.get(key);
    if (have) return have;
    const r = this.ratio;
    const shown = style.upper ? text.toUpperCase() : text;
    const font = `${style.italic ? 'italic ' : ''}${style.weight ?? 400} ${style.size * r}px Geist, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    const ctx = this.ctx;
    ctx.font = font;
    const spacing = style.upper ? 0.08 * style.size * r : 0;
    const width = Math.ceil(ctx.measureText(shown).width + spacing * shown.length);
    const haloPx = 2.5 * r;
    const w = Math.min(ATLAS, Math.ceil(width + haloPx * 2 + 2));
    const h = Math.ceil(style.size * r * 1.35 + haloPx * 2);
    if (this.shelfX + w + PAD > ATLAS) {
      this.shelfX = 0;
      this.shelfY += this.shelfH + PAD;
      this.shelfH = 0;
    }
    if (this.shelfY + h > ATLAS) {
      this.clear();
      if (h > ATLAS) return undefined;
    }
    if (this.canvas.width < w || this.canvas.height < h) {
      this.canvas.width = Math.max(this.canvas.width, w);
      this.canvas.height = Math.max(this.canvas.height, h);
    }
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = font;
    if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = haloPx * 2;
    ctx.strokeStyle = halo;
    ctx.strokeText(shown, w / 2, h / 2);
    ctx.fillStyle = style.color;
    ctx.fillText(shown, w / 2, h / 2);
    const entry = { x: this.shelfX, y: this.shelfY, w, h };
    this.device.queue.copyExternalImageToTexture(
      { source: this.canvas, origin: [0, 0] },
      { texture: this.texture, origin: [entry.x, entry.y], premultipliedAlpha: true },
      [w, h],
    );
    this.shelfX += w + PAD;
    this.shelfH = Math.max(this.shelfH, h);
    this.entries.set(key, entry);
    return entry;
  }

  get size(): number {
    return ATLAS;
  }

  destroy(): void {
    this.texture.destroy();
  }
}

/** Boxes placed this frame, in a coarse grid so each test looks at a few neighbours only. */
export class CollisionGrid {
  private cells = new Map<number, number[][]>();
  constructor(private readonly cell = 64) {}

  private *keys(b: readonly number[]): Generator<number> {
    const c = this.cell;
    for (let gx = Math.floor(b[0] / c); gx <= Math.floor(b[2] / c); gx++)
      for (let gy = Math.floor(b[1] / c); gy <= Math.floor(b[3] / c); gy++) yield gx * 100003 + gy;
  }

  /** Places box [x0, y0, x1, y1] unless it overlaps one already placed. */
  tryPlace(b: readonly number[]): boolean {
    for (const k of this.keys(b))
      for (const o of this.cells.get(k) ?? []) if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return false;
    for (const k of this.keys(b)) {
      let list = this.cells.get(k);
      if (!list) this.cells.set(k, (list = []));
      list.push(b as number[]);
    }
    return true;
  }
}
