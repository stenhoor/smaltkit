// Map visuals for hosts (BI tools, notebooks, dashboards): a catalogue of visuals with their roles and options, the
// pure step from role-tagged columns to layers, the host's theme from CSS, and the MapVisual controller.
export * from './catalogue.js';
export * from './theme.js';
export { buildVisual, numbers, codes, type VisualColumn, type VisualData, type BuiltVisual } from './build.js';
export { MapVisual, optionsFor, type MountOptions, type VisualInput } from './visual.js';
