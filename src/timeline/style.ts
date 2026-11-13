/**
 * The timeline's styles, injected once per document. Every colour and font is a custom property
 * with the smalt (Kiln) value as its fallback, so a page can restyle it: set `--sk-tl-bg`,
 * `--sk-tl-track`, `--sk-tl-text`, `--sk-tl-text-2`, `--sk-tl-primary`, `--sk-tl-on-primary`,
 * `--sk-tl-accent`, `--sk-tl-focus`, `--sk-tl-font-mono` or `--sk-tl-font-brand` on the host or above.
 * In the light theme, the kit's own properties come next (`--sk-surface`, `--sk-border`, `--sk-text`,
 * `--sk-muted`, `--sk-accent`, `--sk-on-accent`, `--sk-focus`, `--sk-font-mono`), so a page styled
 * for the charts styles the timeline too.
 */

const LIGHT = `
  --_bg: var(--sk-tl-bg, var(--sk-surface, #FFFFFF));
  --_track: var(--sk-tl-track, var(--sk-border, #D6DBE4));
  --_text: var(--sk-tl-text, var(--sk-text, #151922));
  --_text2: var(--sk-tl-text-2, var(--sk-muted, #3F4656));
  --_primary: var(--sk-tl-primary, var(--sk-accent, #003399));
  --_on-primary: var(--sk-tl-on-primary, var(--sk-on-accent, #FFFFFF));
  --_accent: var(--sk-tl-accent, #E5622F);
  --_focus: var(--sk-tl-focus, var(--sk-focus, #003399));
  --_hover: rgba(21, 25, 34, 0.06);`;

const DARK = `
  --_bg: var(--sk-tl-bg, #1B1F29);
  --_track: var(--sk-tl-track, #2C3240);
  --_text: var(--sk-tl-text, #E9EBF0);
  --_text2: var(--sk-tl-text-2, #B9BEC9);
  --_primary: var(--sk-tl-primary, #9DB4F5);
  --_on-primary: var(--sk-tl-on-primary, #14171F);
  --_accent: var(--sk-tl-accent, #FF8A5C);
  --_focus: var(--sk-tl-focus, #FF8A5C);
  --_hover: rgba(233, 235, 240, 0.08);`;

export const TIMELINE_CSS = `
.sk-tl {${LIGHT}
  --_mono: var(--sk-tl-font-mono, var(--sk-font-mono, 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace));
  --_brand: var(--sk-tl-font-brand, 'Martian Mono', 'Geist Mono', ui-monospace, monospace);
  box-sizing: border-box;
  min-width: 0;
  padding: 10px 16px 12px;
  background: var(--_bg);
  color: var(--_text);
  font: 13px/1.4 var(--_mono);
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.sk-tl[data-theme="dark"] {${DARK}
}
@media (prefers-color-scheme: dark) {
  .sk-tl:not([data-theme]) {${DARK}
  }
}
.sk-tl *, .sk-tl *::before, .sk-tl *::after { box-sizing: border-box; }
.sk-tl-ruler {
  position: relative;
  height: 72px;
  touch-action: none;
  cursor: pointer;
}
.sk-tl-ruler.sk-tl-panning { cursor: grabbing; }
.sk-tl-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.sk-tl-handle {
  position: absolute;
  top: 44px;
  left: 0;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border-radius: 50%;
  background: var(--_primary);
  border: 3px solid var(--_bg);
  box-shadow: 0 0 0 1px var(--_primary);
  cursor: grab;
  outline: none;
  will-change: transform;
}
.sk-tl-handle:focus-visible {
  outline: 2px solid var(--_focus);
  outline-offset: 2px;
}
.sk-tl-dragging .sk-tl-handle { cursor: grabbing; }
.sk-tl-tip {
  position: absolute;
  z-index: 2;
  left: 0;
  max-width: min(320px, 100%);
  padding: 8px 10px;
  border: 1px solid var(--_track);
  border-radius: 6px;
  background: var(--_bg);
  color: var(--_text);
  box-shadow: 0 4px 16px rgba(10, 14, 24, 0.14);
  font: 12px/1.45 var(--_mono);
  pointer-events: none;
  white-space: nowrap;
}
.sk-tl-tip[hidden] { display: none; }
.sk-tl-tip-msg {
  overflow: hidden;
  text-overflow: ellipsis;
}
.sk-tl-tip-meta { color: var(--_text2); }
.sk-tl-eyebrow {
  font: 600 10px/1 var(--_brand);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--_text2);
}
.sk-tl-tip .sk-tl-eyebrow { display: block; margin-bottom: 4px; }
.sk-tl-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 6px;
}
.sk-tl-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}
.sk-tl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  min-width: 32px;
  padding: 0 8px;
  border: 1px solid var(--_track);
  border-radius: 6px;
  background: transparent;
  color: var(--_text);
  font: 500 12px/1 var(--_mono);
  cursor: pointer;
}
.sk-tl-btn:hover { background: var(--_hover); }
.sk-tl-btn:focus-visible {
  outline: 2px solid var(--_focus);
  outline-offset: 2px;
}
.sk-tl-btn:disabled { opacity: 0.45; cursor: default; background: transparent; }
.sk-tl-btn svg { width: 16px; height: 16px; fill: currentColor; flex: none; }
.sk-tl-play {
  background: var(--_primary);
  border-color: var(--_primary);
  color: var(--_on-primary);
  min-width: 40px;
}
.sk-tl-play:hover { background: var(--_primary); filter: brightness(1.12); }
.sk-tl-seg {
  display: inline-flex;
  border: 1px solid var(--_track);
  border-radius: 6px;
  overflow: hidden;
  flex: none;
}
.sk-tl-seg .sk-tl-btn {
  border: 0;
  border-radius: 0;
  height: 30px;
}
.sk-tl-seg .sk-tl-btn + .sk-tl-btn { border-left: 1px solid var(--_track); }
.sk-tl-seg .sk-tl-btn[aria-pressed="true"] {
  background: var(--_track);
  font-weight: 700;
}
.sk-tl-seg .sk-tl-btn:focus-visible { outline-offset: -2px; }
.sk-tl-readout {
  flex: 1 1 220px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--_text2);
}
.sk-tl-readout b { color: var(--_text); font-weight: 600; }
.sk-tl-sep { opacity: 0.6; }
.sk-tl-fit[hidden] { display: none; }
@media (pointer: coarse) {
  .sk-tl-btn { height: 40px; min-width: 40px; }
  .sk-tl-seg .sk-tl-btn { height: 38px; }
  .sk-tl-handle { width: 24px; height: 24px; margin: -12px 0 0 -12px; }
}
@media (prefers-reduced-motion: reduce) {
  .sk-tl-handle { will-change: auto; }
}
`;

const STYLE_ID = 'sk-tl-style';

/** Add the styles to the document once. */
export function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = TIMELINE_CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}
