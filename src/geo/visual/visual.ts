/**
 * A map visual inside a host (a BI report, a notebook cell, a dashboard tile): mounted once into an element, then
 * updated with the host's data, options, theme and selection as often as the host re-renders. The GPU device, the
 * basemap and the loaded tiles survive updates; layers are rebuilt only when the data or what it means changes, and
 * looks (size, opacity, colours) and selection change in place.
 *
 *   const v = await MapVisual.mount(el, { onSelect: (row, additive) => host.select(row, additive) });
 *   v.update({ kind: 'points', data, options, theme, selection });   // every time the host renders
 *   v.destroy();                                                      // when the host removes the visual
 *
 * Hosts adapt to this, not the other way round: a host's adapter maps its visual API onto MountOptions and VisualInput.
 */
import { Basemap } from '../basemap/basemap.js';
import type { Layer, Picked } from '../core/contract.js';
import { readGeoJSON, type GeoJsonData } from '../data/geojson.js';
import { createMap, type SmaltMap } from '../map/map.js';
import { buildVisual, type BuiltVisual, type VisualData } from './build.js';
import { VISUALS, type VisualKind } from './catalogue.js';
import { DEFAULT_THEME, type VisualTheme } from './theme.js';

export interface MountOptions {
  /** A click on a selectable visual: the data row (or null for empty map), and whether to add to the selection. */
  onSelect?(row: number | null, additive: boolean): void;
  /** Draw with a device the host already has. */
  readonly device?: GPUDevice;
  /** Basemap tiles (a TileJSON URL or a template); default OpenFreeMap. */
  readonly tiles?: string;
  /** Creates the basemap's tile workers (hosts that load the map as one file pass an inline worker). */
  readonly createWorker?: () => Worker;
  readonly pixelRatio?: number;
}

export interface VisualInput {
  readonly kind: VisualKind;
  readonly data: VisualData;
  /** Option values by key (the catalogue's defaults fill the rest). */
  readonly options?: Readonly<Record<string, unknown>>;
  readonly theme?: VisualTheme;
  /** Selected data rows (a byte each), a test per row (null for none selected), or null for no selection. */
  readonly selection?: Uint8Array | ((row: number) => boolean | null) | null;
  /** Where relative URLs (the shapes file) are resolved from. */
  readonly base?: string;
}

const LOOKS = ['radius', 'radiusMax', 'opacity', 'width', 'intensity', 'cellSize'];

/** Every option's value: the input's, else the catalogue's default. */
export function optionsFor(kind: VisualKind, given: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const o of VISUALS[kind].options) out[o.key] = given[o.key] ?? o.default;
  return out;
}

const shapeCache = new Map<string, Promise<GeoJsonData>>();

export class MapVisual {
  readonly map: SmaltMap;
  private input?: VisualInput;
  private built?: BuiltVisual;
  private builtFor?: { kind: VisualKind; data: VisualData; structure: string; theme: VisualTheme; shapes?: GeoJsonData };
  private basemap?: Basemap;
  private basemapMode = '';
  private fitted = false;
  private additive = false;
  private note: HTMLDivElement;
  private shapes?: { url: string; data?: GeoJsonData; error?: string };
  private pitch = 0;
  private destroyed = false;

  private constructor(
    readonly el: HTMLElement,
    map: SmaltMap,
    private readonly opts: MountOptions,
  ) {
    this.map = map;
    this.note = el.ownerDocument.createElement('div');
    this.note.className = 'smaltgl-note';
    Object.assign(this.note.style, { position: 'absolute', left: '8px', top: '8px', zIndex: '2', font: '12px system-ui, sans-serif', padding: '2px 8px', borderRadius: '6px', background: 'rgba(127,127,127,.15)' });
    this.note.hidden = true;
    el.append(this.note);
    // Modifier keys at the moment of a click: add to the selection.
    map.canvas.addEventListener('pointerdown', (e) => (this.additive = e.ctrlKey || e.metaKey || e.shiftKey));
    map.on('click', (p) => this.click(p));
  }

  /** Mounts a map visual in `el` (which should have a size). Throws `GpuUnavailableError` without WebGPU. */
  static async mount(el: HTMLElement, options: MountOptions = {}): Promise<MapVisual> {
    let v: MapVisual | undefined;
    const map = await createMap(el, {
      device: options.device,
      pixelRatio: options.pixelRatio,
      tooltip: (p) => v?.tooltip(p) ?? null,
    });
    v = new MapVisual(el, map, options);
    return v;
  }

  /** Draws `input`: rebuilds layers if the data or its meaning changed, else changes looks and selection in place. */
  update(input: VisualInput): void {
    if (this.destroyed) return;
    this.input = input;
    const kind = input.kind;
    const options = optionsFor(kind, input.options);
    const theme = input.theme ?? DEFAULT_THEME;
    this.setBasemap(String(options.basemap), theme);
    const tilt = Math.max(0, Math.min(60, Number(options.tilt) || 0));
    if (tilt !== this.pitch) {
      this.pitch = tilt;
      this.map.setView({ pitch: tilt });
    }
    const shapes = kind === 'regions' ? this.loadShapes(String(options.shapes ?? ''), input.base) : undefined;
    // What needs new layers: anything but the looks.
    const structure = JSON.stringify(Object.entries(options).filter(([k]) => !LOOKS.includes(k)));
    const b = this.builtFor;
    if (!b || b.kind !== kind || b.data !== input.data || b.structure !== structure || b.theme !== theme || b.shapes !== shapes) {
      this.built = buildVisual(kind, input.data, options, theme, shapes);
      this.builtFor = { kind, data: input.data, structure, theme, shapes };
      this.map.setLayers(this.built.layers);
      if (!this.fitted && this.built.layers.length) {
        this.map.fitBounds();
        this.fitted = true;
      }
    } else {
      // Looks only.
      const main = this.main() as (Layer & { update?(c: Record<string, unknown>): void }) | undefined;
      main?.update?.(Object.fromEntries(LOOKS.filter((k) => k in options).map((k) => [k, options[k]])));
    }
    this.note.textContent = this.built?.note ?? '';
    this.note.hidden = !this.built?.note;
    this.applySelection(input);
    this.map.redraw();
  }

  /** Resolves when everything in view is drawn: tiles loaded and the GPU done (for exports and tests). */
  async ready(timeoutMs = 20000): Promise<void> {
    await this.map.idle(timeoutMs);
  }

  private main(): Layer | undefined {
    return this.built?.layers.find((l) => l.id === 'visual');
  }

  private setBasemap(mode: string, theme: VisualTheme): void {
    const want = mode === 'auto' ? (theme.dark ? 'dark' : 'light') : mode;
    if (want === this.basemapMode) return;
    this.basemapMode = want;
    if (want === 'none') {
      this.map.setBasemap(null);
      this.basemap = undefined;
      return;
    }
    const theme2 = want === 'dark' ? 'dark' : 'light';
    if (this.basemap) this.basemap.setTheme(theme2);
    else this.basemap = new Basemap({ theme: theme2, tiles: this.opts.tiles, createWorker: this.opts.createWorker });
    this.map.setBasemap(this.basemap);
  }

  private loadShapes(file: string, base?: string): GeoJsonData | undefined {
    if (!file) return undefined;
    let url: string;
    try {
      url = new URL(file, base ?? globalThis.location?.href).href;
    } catch {
      return undefined;
    }
    if (this.shapes?.url === url) return this.shapes.data;
    const entry: { url: string; data?: GeoJsonData; error?: string } = { url };
    this.shapes = entry;
    let p = shapeCache.get(url);
    if (!p) {
      p = fetch(url).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return readGeoJSON(await r.text());
      });
      shapeCache.set(url, p);
      p.catch(() => shapeCache.delete(url));
    }
    p.then(
      (d) => {
        entry.data = d;
        if (this.shapes === entry && this.input) this.update(this.input);
      },
      (e: Error) => {
        entry.error = e.message;
        this.note.textContent = `Cannot load ${file}: ${e.message}`;
        this.note.hidden = false;
      },
    );
    return undefined;
  }

  private applySelection(input: VisualInput): void {
    const main = this.main() as (Layer & { setSelection?(m: Uint8Array | null): void }) | undefined;
    if (!main?.setSelection || !VISUALS[input.kind].selectable) return;
    const sel = input.selection;
    const rows = input.data.rows;
    let byRow: Uint8Array | null = null;
    if (sel instanceof Uint8Array) byRow = sel;
    else if (typeof sel === 'function') {
      const m = new Uint8Array(rows);
      let any = false;
      for (let i = 0; i < rows; i++) {
        const s = sel(i);
        if (s === null) {
          any = false;
          break;
        }
        any = true;
        m[i] = s ? 1 : 0;
      }
      byRow = any ? m : null;
    }
    const rowOf = this.built?.rowOf;
    if (byRow && rowOf) byRow = Uint8Array.from(rowOf, (r) => byRow![r]);
    main.setSelection(byRow);
  }

  private rowOfPicked(p: Picked): number {
    return this.built?.rowOf ? this.built.rowOf[p.index] : p.index;
  }

  private click(p: Picked | null): void {
    if (!this.input || !VISUALS[this.input.kind].selectable) return;
    if (!p || p.layer !== 'visual') return this.opts.onSelect?.(null, this.additive);
    this.opts.onSelect?.(this.rowOfPicked(p), this.additive);
  }

  /** The tooltip for a picked object: each role's label and formatted value for its data row. */
  tooltip(p: Picked): string | null {
    const input = this.input;
    if (!input || p.layer !== 'visual') return null;
    if (input.kind === 'hexbin' || input.kind === 'heatmap') {
      const rows = Object.entries(p.properties);
      return rows.length ? table(rows.map(([k, v]) => [k, typeof v === 'number' ? v.toLocaleString() : String(v)])) : null;
    }
    const row = this.rowOfPicked(p);
    const out: [string, string][] = [];
    for (const role of VISUALS[input.kind].roles) {
      const col = input.data.column(role.name);
      if (!col) continue;
      const v = col.values[row];
      out.push([col.label ?? role.label, col.format ? col.format(v) : v === null || v === undefined ? '' : String(v)]);
    }
    return out.length ? table(out) : null;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.note.remove();
    this.map.destroy();
  }
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const table = (rows: readonly (readonly [string, string])[]): string => `<table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
