/**
 * The map's page furniture, each usable on its own over any map: a tooltip that shows a picked object's values, and
 * the attribution line a basemap needs. Plain DOM, styled once per document (override with your own CSS).
 */
import type { Picked } from '../core/contract.js';

const STYLES = `
.smaltgl-tooltip { position: absolute; left: 0; top: 0; z-index: 2; pointer-events: none; max-width: 320px; padding: 6px 8px;
  border-radius: 6px; background: rgba(255,255,255,.96); color: #151922; border: 1px solid #D6DBE4; font: 12px/1.45 Geist, system-ui, sans-serif;
  box-shadow: 0 4px 16px rgba(20,23,31,.12); }
.smaltgl-dark .smaltgl-tooltip { background: rgba(27,31,41,.96); color: #E9EBF0; border-color: #2C3240; }
.smaltgl-tooltip table { border-collapse: collapse; margin: 0; display: table; }
.smaltgl-tooltip th { text-align: left; font-weight: 500; color: #5C6375; padding: 1px 10px 1px 0; border: 0; background: none; }
.smaltgl-dark .smaltgl-tooltip th { color: #9096A3; }
.smaltgl-tooltip td { font-family: 'Geist Mono', ui-monospace, monospace; padding: 1px 0; border: 0; text-align: right; }
.smaltgl-tooltip tr { border: 0; background: none !important; }
.smaltgl-attribution { position: absolute; right: 0; bottom: 0; z-index: 1; padding: 1px 6px; font: 11px/1.6 Geist, system-ui, sans-serif;
  background: rgba(255,255,255,.75); color: #3F4656; border-top-left-radius: 4px; }
.smaltgl-dark .smaltgl-attribution { background: rgba(20,23,31,.75); color: #B9BEC9; }
.smaltgl-attribution a { color: inherit; text-decoration: none; }
.smaltgl-attribution a:hover { text-decoration: underline; }
`;

/** Adds the overlays' default styles to a document, once. */
export function injectStyles(doc: Document = document): void {
  if (doc.getElementById('smaltgl-styles')) return;
  const el = doc.createElement('style');
  el.id = 'smaltgl-styles';
  el.textContent = STYLES;
  doc.head.prepend(el);
}

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function formatValue(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return escapeHtml(String(v));
}

/** A picked object's values as a small HTML table (null when it has none). */
export function defaultTooltip(p: Picked): string | null {
  const rows = Object.entries(p.properties);
  if (!rows.length) return null;
  return `<table>${rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${formatValue(v)}</td></tr>`).join('')}</table>`;
}

/** A tooltip in `container` (positioned), kept inside its bounds. */
export class Tooltip {
  readonly el: HTMLDivElement;

  constructor(
    private readonly container: HTMLElement,
    /** HTML for a picked object, or null for no tooltip. */
    public format: (p: Picked) => string | null = defaultTooltip,
  ) {
    injectStyles(container.ownerDocument);
    this.el = container.ownerDocument.createElement('div');
    this.el.className = 'smaltgl-tooltip';
    this.el.hidden = true;
    container.append(this.el);
  }

  /** Shows `p` near (x, y), in CSS pixels from the container's corner. */
  show(p: Picked, x: number, y: number): void {
    const html = this.format(p);
    if (!html) return this.hide();
    this.el.innerHTML = html;
    this.el.hidden = false;
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    const cw = this.container.clientWidth, ch = this.container.clientHeight;
    const left = x + 14 + w > cw ? x - 14 - w : x + 14;
    const top = y + 14 + h > ch ? y - 14 - h : y + 14;
    this.el.style.transform = `translate(${Math.max(0, left)}px, ${Math.max(0, top)}px)`;
  }

  hide(): void {
    this.el.hidden = true;
  }

  destroy(): void {
    this.el.remove();
  }
}

/** The attribution line in the corner of `container`. */
export class Attribution {
  readonly el: HTMLDivElement;

  constructor(container: HTMLElement) {
    injectStyles(container.ownerDocument);
    this.el = container.ownerDocument.createElement('div');
    this.el.className = 'smaltgl-attribution';
    this.el.hidden = true;
    container.append(this.el);
  }

  /** Sets the line's HTML; empty hides it. */
  set(html: string): void {
    this.el.innerHTML = html;
    this.el.hidden = !html;
  }

  destroy(): void {
    this.el.remove();
  }
}
