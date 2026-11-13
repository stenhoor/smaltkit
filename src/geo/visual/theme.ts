/**
 * A host's colours for a visual: a categorical palette, a sequential ramp, and whether the page is dark. Hosts style
 * with CSS variables, in any colour syntax (hex, rgb(), oklch(), color-mix()); `themeFromCss` resolves them through
 * the browser and a canvas into hex colours the GPU can use.
 */

export interface VisualTheme {
  /** Colours for categories, in order. */
  readonly palette: readonly string[];
  /** A sequential ramp, low to high (two or more stops). */
  readonly sequential: readonly string[];
  /** The page behind the visual is dark (picks the dark basemap when the visual follows the theme). */
  readonly dark: boolean;
}

/** the kit's own colours, for hosts that don't say. */
export const DEFAULT_THEME: VisualTheme = {
  palette: ['#2F5BB7', '#E5622F', '#0E9E8E', '#B0249F', '#8C6D00', '#6E4BC2', '#0E7FAE', '#C2185B', '#527A10', '#5C6375'],
  sequential: ['#D6E0F3', '#7B97D4', '#2F5BB7', '#003399', '#001F66'],
  dark: false,
};

/** The names of the CSS variables (or literal colours) a host's theme is made of. */
export interface CssThemeNames {
  /** Palette entries: variable names such as '--sk-c0', or colours. */
  readonly palette: readonly string[];
  /** Ramp stops, low to high. */
  readonly sequential: readonly string[];
  /** The background, to tell light from dark. */
  readonly background?: string;
}

let canvas: OffscreenCanvas | HTMLCanvasElement | undefined;

/** Any CSS colour as #rrggbb (via a 1 × 1 canvas), or undefined if the browser can't read it. */
export function cssColorToHex(css: string): string | undefined {
  const c = css.trim();
  if (!c || c === 'transparent') return undefined;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
  canvas ??= typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return undefined;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000000';
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  if (a === 0) return undefined;
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Resolves a variable name ('--x') or a colour, as `el` sees it, to #rrggbb. */
function resolve(el: Element, nameOrColor: string): string | undefined {
  if (!nameOrColor.startsWith('--')) return cssColorToHex(nameOrColor);
  if (!getComputedStyle(el).getPropertyValue(nameOrColor).trim()) return undefined;
  // The browser resolves var() and color-mix() on a real property.
  const probe = el.ownerDocument.createElement('span');
  probe.style.display = 'none';
  probe.style.color = `var(${nameOrColor})`;
  el.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  return cssColorToHex(computed);
}

const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

/** The theme `el` is in, read from CSS variables; what can't be read falls back to the kit's own colours. */
export function themeFromCss(el: Element, names: CssThemeNames): VisualTheme {
  const palette = names.palette.map((n) => resolve(el, n)).filter((c): c is string => !!c);
  const sequential = names.sequential.map((n) => resolve(el, n)).filter((c): c is string => !!c);
  let dark = DEFAULT_THEME.dark;
  const bg = names.background ? resolve(el, names.background) : cssColorToHex(getComputedStyle(el).backgroundColor);
  if (bg) dark = luminance(bg) < 0.4;
  return {
    palette: palette.length ? palette : DEFAULT_THEME.palette,
    sequential: sequential.length >= 2 ? sequential : DEFAULT_THEME.sequential,
    dark,
  };
}
