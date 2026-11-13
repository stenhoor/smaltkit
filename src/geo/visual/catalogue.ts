/**
 * The map visuals offered to hosts (a BI tool, a notebook, a report): each with the data roles it takes and
 * the options it has, as plain data. The shapes match what BI tools use to build a field well and an options panel
 * (smaltbi's `RoleDef` and `OptionDef`), so a host can register them as they are.
 *
 * - A `dimension` role is grouped by (a location, a category); a `measure` role is aggregated (a total, a mean).
 * - Columns arrive by role: the host runs the query and hands each role's column over (visual.ts, `VisualData`).
 */

export type VisualKind = 'points' | 'heatmap' | 'hexbin' | 'arcs' | 'regions';

export interface VisualRole {
  readonly name: string;
  readonly label: string;
  readonly kind: 'dimension' | 'measure';
  /** Most fields in the role (all of these take one). */
  readonly max?: number;
  /** The visual draws nothing without it. */
  readonly required?: boolean;
}

export interface VisualOption {
  readonly key: string;
  readonly label: string;
  readonly type: 'bool' | 'select' | 'number' | 'text';
  readonly choices?: readonly (readonly [string, string])[];
  readonly default: unknown;
  /** Shown only when another option has a value. */
  readonly when?: { readonly key: string; readonly equals: unknown };
}

export interface VisualDescription {
  readonly kind: VisualKind;
  readonly label: string;
  /** One line for a gallery tooltip. */
  readonly description: string;
  readonly roles: readonly VisualRole[];
  readonly options: readonly VisualOption[];
  /** Rows the visual is meant for: hosts may cap queries here. */
  readonly rowLimit: number;
  /** The visual can cross-filter: a click selects a row. */
  readonly selectable: boolean;
}

const lat = (name = 'latitude', label = 'Latitude'): VisualRole => ({ name, label, kind: 'dimension', max: 1, required: true });
const lng = (name = 'longitude', label = 'Longitude'): VisualRole => ({ name, label, kind: 'dimension', max: 1, required: true });

const basemapOption: VisualOption = {
  key: 'basemap',
  label: 'Basemap',
  type: 'select',
  choices: [['auto', 'Follow the theme'], ['light', 'Light'], ['dark', 'Dark'], ['none', 'None']],
  default: 'auto',
};
const opacityOption = (d = 0.85): VisualOption => ({ key: 'opacity', label: 'Opacity', type: 'number', default: d });
const tiltOption: VisualOption = { key: 'tilt', label: 'Tilt (degrees)', type: 'number', default: 0 };

export const VISUALS: Readonly<Record<VisualKind, VisualDescription>> = {
  points: {
    kind: 'points',
    label: 'Point map',
    description: 'A point at each location, coloured by a value or a category, sized by another value.',
    roles: [
      lat(),
      lng(),
      { name: 'values', label: 'Colour by', kind: 'measure', max: 1 },
      { name: 'category', label: 'Category', kind: 'dimension', max: 1 },
      { name: 'size', label: 'Size by', kind: 'measure', max: 1 },
    ],
    options: [
      { key: 'radius', label: 'Point size', type: 'number', default: 3 },
      { key: 'radiusMax', label: 'Largest point', type: 'number', default: 14 },
      opacityOption(),
      { key: 'glow', label: 'Glow where points overlap', type: 'bool', default: false },
      basemapOption,
      tiltOption,
    ],
    rowLimit: 1_000_000,
    selectable: true,
  },
  heatmap: {
    kind: 'heatmap',
    label: 'Heatmap',
    description: 'Where locations are densest, weighted by a value.',
    roles: [lat(), lng(), { name: 'weight', label: 'Weight', kind: 'measure', max: 1 }],
    options: [
      { key: 'radius', label: 'Kernel (pixels)', type: 'number', default: 20 },
      { key: 'intensity', label: 'Intensity', type: 'number', default: 1 },
      opacityOption(0.9),
      basemapOption,
      tiltOption,
    ],
    rowLimit: 2_000_000,
    selectable: false,
  },
  hexbin: {
    kind: 'hexbin',
    label: 'Hexagon map',
    description: 'Locations binned into hexagons, by count or by the sum or mean of a value; optionally in 3D.',
    roles: [lat(), lng(), { name: 'values', label: 'Value', kind: 'measure', max: 1 }],
    options: [
      { key: 'cellSize', label: 'Cell size (metres)', type: 'number', default: 500 },
      { key: 'measure', label: 'Cells show', type: 'select', choices: [['count', 'Count of locations'], ['sum', 'Sum of the value'], ['mean', 'Mean of the value']], default: 'sum' },
      { key: 'extrude', label: '3D columns', type: 'bool', default: false },
      { key: 'height', label: 'Column height (metres at the top)', type: 'number', default: 3000, when: { key: 'extrude', equals: true } },
      opacityOption(),
      basemapOption,
      tiltOption,
    ],
    rowLimit: 2_000_000,
    selectable: false,
  },
  arcs: {
    kind: 'arcs',
    label: 'Flow map',
    description: 'Arcs from an origin to a destination, coloured by a value: routes, trips, shipments.',
    roles: [
      lat('originLatitude', 'Origin latitude'),
      lng('originLongitude', 'Origin longitude'),
      lat('destinationLatitude', 'Destination latitude'),
      lng('destinationLongitude', 'Destination longitude'),
      { name: 'values', label: 'Colour by', kind: 'measure', max: 1 },
    ],
    options: [
      { key: 'width', label: 'Line width', type: 'number', default: 1.5 },
      { key: 'greatCircle', label: 'Follow great circles', type: 'bool', default: true },
      { key: 'animate', label: 'Flow animation', type: 'bool', default: false },
      opacityOption(0.7),
      basemapOption,
      tiltOption,
    ],
    rowLimit: 200_000,
    selectable: true,
  },
  regions: {
    kind: 'regions',
    label: 'Region map',
    description: 'Areas from a GeoJSON file, matched to a location field and coloured by a value; optionally in 3D.',
    roles: [
      { name: 'location', label: 'Location', kind: 'dimension', max: 1, required: true },
      { name: 'values', label: 'Colour by', kind: 'measure', max: 1 },
    ],
    options: [
      { key: 'shapes', label: 'Shapes file (GeoJSON)', type: 'text', default: '' },
      { key: 'key', label: 'Match locations on property', type: 'text', default: 'name' },
      { key: 'extrude', label: '3D blocks', type: 'bool', default: false },
      opacityOption(0.8),
      basemapOption,
      tiltOption,
    ],
    rowLimit: 50_000,
    selectable: true,
  },
};
