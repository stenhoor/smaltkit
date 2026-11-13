/**
 * Colours for the GPU: CSS hex parsing, and colour ramps baked into 256-entry tables. The brand has no chart palette
 * yet (smalt-brand BRAND.md, "smaltkit"), so these ramps are provisional: built from the Kiln tokens where they can be,
 * interpolated in OKLab so that equal steps in value look like equal steps in colour.
 */

export type RGBA = [number, number, number, number];

/** Parses `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` into 0–1 floats. */
export function parseColor(css: string): RGBA {
  let h = css.trim().replace(/^#/, '');
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) throw new Error(`Not a hex colour: ${css}`);
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
}

export const toHex = ([r, g, b]: RGBA): string =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toOklab([r, g, b]: RGBA): [number, number, number] {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: [number, number, number]): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const c = (v: number) => Math.max(0, Math.min(1, toSrgb(v)));
  return [
    c(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    c(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    c(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Sequential ramps: low to high. Diverging ramps: low, middle, high. */
export const RAMPS = {
  /** Pale to deep smalt: the brand's tonal scale. */
  smalt: ['#E8EEFB', '#D6E0F3', '#9DB4F5', '#7B97D4', '#2F5BB7', '#003399', '#001F66'],
  /** Graphite through smalt and cerulean to pale gold: for densities on a dark map. */
  glow: ['#1B1F29', '#1E2F6B', '#2F5BB7', '#0E7FAE', '#5CBDE8', '#E6C24A', '#FFF4C2'],
  /** Smalt to kiln orange through pale: for values above and below a middle. */
  diverging: ['#001F66', '#2F5BB7', '#9DB4F5', '#F1F1EE', '#FFB08F', '#E5622F', '#9C3410'],
  /** Deep violet through magenta to orange and pale yellow: high contrast on light and dark. */
  ember: ['#2A1050', '#6E4BC2', '#B0249F', '#E5622F', '#F2A541', '#FBE9A6'],
  /** Teal greens. */
  verdant: ['#E9F5EC', '#9ACD4A', '#527A10', '#0E6B5C', '#06363A'],
} as const satisfies Record<string, readonly string[]>;

export type RampName = keyof typeof RAMPS;

/** Ten categorical colours, distinguishable on light and dark maps. */
export const CATEGORICAL = ['#2F5BB7', '#E5622F', '#0E9E8E', '#B0249F', '#8C6D00', '#6E4BC2', '#0E7FAE', '#C2185B', '#527A10', '#5C6375'] as const;

/** A ramp as 256 RGBA8 entries, for a 256 × 1 texture. `stops` are CSS colours spaced evenly. */
export function bakeRamp(stops: readonly string[], reverse = false): Uint8Array {
  const labs = stops.map((s) => toOklab(parseColor(s)));
  if (reverse) labs.reverse();
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (labs.length - 1);
    const k = Math.min(labs.length - 2, Math.floor(t));
    const f = t - k;
    const a = labs[k], b = labs[k + 1];
    const rgb = fromOklab([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
    out[i * 4] = Math.round(rgb[0] * 255);
    out[i * 4 + 1] = Math.round(rgb[1] * 255);
    out[i * 4 + 2] = Math.round(rgb[2] * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** A categorical palette as a ramp table: entry i of 256 is colour i mod the palette's length. */
export function bakeCategorical(colors: readonly string[] = CATEGORICAL): Uint8Array {
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = parseColor(colors[i % colors.length]);
    out.set([Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255], i * 4);
  }
  return out;
}

/** The colour of a ramp at t in 0–1, as CSS hex (for legends). */
export function rampAt(stops: readonly string[], t: number): string {
  const table = bakeRamp(stops);
  const i = Math.max(0, Math.min(255, Math.round(t * 255))) * 4;
  return toHex([table[i] / 255, table[i + 1] / 255, table[i + 2] / 255, 1]);
}
