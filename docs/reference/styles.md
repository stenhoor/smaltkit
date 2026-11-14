# smaltkit/ui.css

The styles for the charts, tables, grid, editor, controls, menus, dialogs and toasts. Everything reads `--sk-*` custom
properties, whose defaults come from the smalt brand tokens (`--text`, `--surface`, `--primary`, `--syn-*`, …), with
fallbacks where a page doesn't have them.

## Use it

Load `dist/ui.css` with the page, after the brand's `tokens.css` if the page has it:

```html
<link rel="stylesheet" href="node_modules/smaltkit/dist/ui.css">
```

To restyle, set `--sk-*` properties on any ancestor of what smaltkit draws. A report theme is a set of these values:

```css
.report.dark {
  --sk-text: #e9ebf0;
  --sk-surface: #151922;
  --sk-accent: #7aa2ff;
}
```

The groups:

- **Colours:** `--sk-text`, `--sk-muted`, `--sk-surface`, `--sk-border`, `--sk-grid`, `--sk-accent`, `--sk-pos`,
  `--sk-neg`, `--sk-on-mark`; the series colours `--sk-c0` … `--sk-c11`; the ramps `--sk-seq-lo`/`-hi` and
  `--sk-div-lo`/`-mid`/`-hi`.
- **Type:** the fonts `--sk-font`, `--sk-font-num`, `--sk-font-mono`, and the sizes `--sk-fs-label`, `--sk-fs-sub`,
  `--sk-fs-small`, `--sk-fs-kpi`.
- **Code:** the editor's token colours, `--sk-tk-*`, from the brand's `--syn-*`.
- **Timeline:** `--sk-tl-*`, then the properties above.

## Properties

Every property `ui.css` sets, with its default. Generated from `src/ui.css`.

<!-- css:start -->

| Property | Default |
| --- | --- |
| `--sk-font` | `var(--font-sans, Geist, system-ui, sans-serif)` |
| `--sk-font-num` | `var(--sk-font)` |
| `--sk-fs-label` | `11px` |
| `--sk-fs-sub` | `12px` |
| `--sk-fs-small` | `11px` |
| `--sk-fs-kpi` | `34px` |
| `--sk-text` | `var(--text, #151922)` |
| `--sk-muted` | `var(--text-3, #5c6375)` |
| `--sk-surface` | `var(--surface, #ffffff)` |
| `--sk-border` | `var(--border, #d6dbe4)` |
| `--sk-grid` | `color-mix(in oklab, var(--sk-border) 70%, transparent)` |
| `--sk-gridlines` | `1` |
| `--sk-accent` | `var(--primary, #003399)` |
| `--sk-on-accent` | `var(--on-primary, #ffffff)` |
| `--sk-sel` | `var(--sk-accent)` |
| `--sk-pos` | `var(--success, #1d6b3a)` |
| `--sk-neg` | `var(--danger, #a3195b)` |
| `--sk-on-mark` | `#ffffff` |
| `--sk-bar-radius` | `2` |
| `--sk-line-width` | `2px` |
| `--sk-toast-bg` | `#151922` |
| `--sk-toast-text` | `#e9ebf0` |
| `--sk-font-mono` | `var(--font-mono, 'Geist Mono', ui-monospace, monospace)` |
| `--sk-focus` | `var(--focus, var(--sk-accent))` |
| `--sk-panel` | `var(--code-bg, #eef1f6)` |
| `--sk-row-alt` | `color-mix(in oklab, var(--sk-panel) 45%, var(--sk-surface))` |
| `--sk-cell-sel` | `color-mix(in oklab, var(--sk-accent) 16%, var(--sk-surface))` |
| `--sk-num` | `var(--syn-number, #5b3fa8)` |
| `--sk-blob` | `var(--syn-function, #1f5f8b)` |
| `--sk-key` | `var(--warning, #8a5a12)` |
| `--sk-tk-keyword` | `var(--syn-keyword, #003399)` |
| `--sk-tk-function` | `var(--syn-function, #1f5f8b)` |
| `--sk-tk-string` | `var(--syn-string, #a33a12)` |
| `--sk-tk-number` | `var(--syn-number, #5b3fa8)` |
| `--sk-tk-comment` | `var(--syn-comment, #5c6375)` |
| `--sk-tk-punct` | `var(--syn-punct, #3f4656)` |
| `--sk-tk-param` | `var(--accent, #a33a12)` |
| `--sk-tk-ident` | `var(--text-2, #3f4656)` |
| `--sk-tk-object` | `var(--product-ui-text, #0b6a91)` |
| `--sk-danger` | `var(--danger, #a3195b)` |
| `--sk-warning` | `var(--warning, #8a5a12)` |
| `--sk-shadow` | `0 8px 24px rgba(21, 25, 34, 0.14)` |
| `--sk-c0` | `var(--smalt-500, #2F5BB7)` |
| `--sk-c1` | `#E5622F` |
| `--sk-c2` | `#6E4BC2` |
| `--sk-c3` | `#0E7FAE` |
| `--sk-c4` | `#B07D1A` |
| `--sk-c5` | `#2E8B6E` |
| `--sk-c6` | `#C2417A` |
| `--sk-c7` | `#5C6375` |
| `--sk-c8` | `#1F5F8B` |
| `--sk-c9` | `#A33A12` |
| `--sk-c10` | `#8E6BD8` |
| `--sk-c11` | `#3F4656` |
| `--sk-seq-lo` | `color-mix(in oklab, var(--sk-accent) 8%, var(--sk-surface))` |
| `--sk-seq-hi` | `var(--sk-accent)` |
| `--sk-div-lo` | `var(--sk-neg)` |
| `--sk-div-mid` | `var(--sk-surface)` |
| `--sk-div-hi` | `var(--sk-accent)` |
<!-- css:end -->
