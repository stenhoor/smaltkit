/** Colours from the smalt brand (Kiln), or from the page's `--sk-*` custom properties. */
import type { Theme } from './types.js';

/** The family product colours, in order: smalt, ui, bi, df, nb, ql, smalt-500, kiln. */
export const FAMILY_PALETTE_LIGHT: string[] = [
  '#003399', '#0E7FAE', '#6E4BC2', '#8C6D00', '#B0249F', '#527A10', '#2F5BB7', '#E5622F',
];
export const FAMILY_PALETTE_DARK: string[] = [
  '#9DB4F5', '#5CBDE8', '#B8A1F2', '#E6C24A', '#F57FE6', '#9ACD4A', '#7B97D4', '#FF8A5C',
];

export type Rgba = [number, number, number, number];

export interface ThemeColors {
  bg: Rgba;
  surface: Rgba;
  /** Edges at rest. */
  edge: Rgba;
  /** Edges incident to highlighted or hovered nodes. */
  edgeStrong: Rgba;
  /** Highlight ring, focus, hovered edge (kiln). */
  accent: Rgba;
  text: Rgba;
  /** Alpha multiplier for dimmed elements while a highlight is active. */
  dim: number;
}

/** Parse #rgb, #rrggbb or #rrggbbaa into 0..1 floats; anything else is opaque mid grey. */
export function parseColor(hex: string): Rgba {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h)) return [0.5, 0.5, 0.5, 1];
  const v = (k: number) => parseInt(h.slice(k, k + 2), 16) / 255;
  return [v(0), v(2), v(4), h.length === 8 ? v(6) : 1];
}

/** Pack for WGSL's unpack4x8unorm: red in the low byte. */
export function packRgba8(c: Rgba): number {
  const b = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));
  return (b(c[0]) | (b(c[1]) << 8) | (b(c[2]) << 16) | (b(c[3]) << 24)) >>> 0;
}

export const THEMES: Record<Exclude<Theme, 'css'>, ThemeColors> = {
  light: {
    bg: parseColor('#F5F6F8'),
    surface: parseColor('#FFFFFF'),
    edge: parseColor('#B3BAC7'),
    edgeStrong: parseColor('#5C6375'),
    accent: parseColor('#E5622F'),
    text: parseColor('#151922'),
    dim: 0.18,
  },
  dark: {
    bg: parseColor('#14171F'),
    surface: parseColor('#1B1F29'),
    edge: parseColor('#454C5D'),
    edgeStrong: parseColor('#9096A3'),
    accent: parseColor('#FF8A5C'),
    text: parseColor('#E9EBF0'),
    dim: 0.2,
  },
};

/**
 * The colours a page gives the kit, read from the `--sk-*` custom properties that apply to `el`: any CSS colour (a
 * name, `rgb()`, `color-mix()`, …), resolved by the browser. Those not set keep the light theme's.
 */
export function cssTheme(el: Element): { colors: ThemeColors; palette: string[] } {
  const style = getComputedStyle(el);
  const doc = el.ownerDocument;
  const probe = doc.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const span = doc.createElement('span');
  span.style.display = 'none';
  (el.parentElement ?? doc.body).appendChild(span);
  const read = (...names: string[]): Rgba | null => {
    const name = names.find((n) => style.getPropertyValue(n).trim() !== '');
    if (!name || !probe) return null;
    span.style.color = '';
    span.style.color = `var(${name})`;
    const css = getComputedStyle(span).color;
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = '#000000';
    probe.fillStyle = css;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
    return [r! / 255, g! / 255, b! / 255, a! / 255];
  };
  try {
    const light = THEMES.light;
    const bg = read('--sk-graph-bg', '--sk-surface') ?? light.bg;
    const colors: ThemeColors = {
      bg,
      surface: read('--sk-surface') ?? light.surface,
      edge: read('--sk-graph-edge', '--sk-border') ?? light.edge,
      edgeStrong: read('--sk-muted') ?? light.edgeStrong,
      accent: read('--sk-graph-accent', '--sk-sel', '--sk-accent') ?? light.accent,
      text: read('--sk-text') ?? light.text,
      // Dimmed elements need a little more alpha to show on a dark background.
      dim: 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2] < 0.4 ? 0.2 : 0.18,
    };
    const palette: string[] = [];
    for (let i = 0; i < 12; i++) {
      const c = read(`--sk-c${i}`);
      if (!c) break;
      palette.push(toHex(c));
    }
    return { colors, palette: palette.length ? palette : FAMILY_PALETTE_LIGHT };
  } finally {
    span.remove();
  }
}

/** #rrggbbaa for 0..1 floats. */
export function toHex(c: Rgba): string {
  return '#' + c.map((x) => Math.max(0, Math.min(255, Math.round(x * 255))).toString(16).padStart(2, '0')).join('');
}

/**
 * Stable group → palette slot assignment: groups get slots in order of first appearance and keep
 * them across `setGraph` calls, so colours do not shuffle when a query result grows. Nodes without a
 * group use slot 0.
 */
export class GroupColors {
  private readonly slots = new Map<string, number>();

  slot(group: string | undefined): number {
    if (group === undefined || group === '') return 0;
    let s = this.slots.get(group);
    if (s === undefined) {
      s = this.slots.size;
      this.slots.set(group, s);
    }
    return s;
  }

  color(group: string | undefined, palette: readonly string[]): string {
    if (palette.length === 0) return '#808080';
    return palette[this.slot(group) % palette.length]!;
  }
}
