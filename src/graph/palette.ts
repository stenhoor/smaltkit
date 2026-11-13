/** Colours from the smalt brand (Kiln). */
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

export const THEMES: Record<Theme, ThemeColors> = {
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
