/**
 * The basemap's style, for tiles in the OpenMapTiles schema (what OpenFreeMap serves). Two halves:
 *
 * - **Groups** say which features go together: a fill, line or label group per kind of thing (water, parks, motorways,
 *   country borders, city names). The tile worker sorts features into groups once, when a tile arrives.
 * - **Themes** say how each group looks: colours and widths by zoom, light and dark. A theme change redraws with new
 *   uniforms and keeps every tile.
 *
 * Everything that knows the schema's layer and class names is in this file, so another schema (Shortbread, or tiles
 * built for this renderer) changes only `classify`.
 */
import type { MvtValue } from './mvt.js';

export const FILL_GROUPS = ['ice', 'sand', 'grass', 'wood', 'wetland', 'residential', 'industrial', 'park', 'aeroway', 'water', 'building'] as const;
export const LINE_GROUPS = ['stream', 'river', 'path', 'minor', 'secondary', 'primary', 'motorway', 'rail', 'state', 'country'] as const;
export type FillGroup = (typeof FILL_GROUPS)[number];
export type LineGroup = (typeof LINE_GROUPS)[number];

/** Label kinds, most important first: when labels collide, the earlier kind wins. */
export const LABEL_KINDS = ['continent', 'country', 'ocean', 'state', 'capital', 'city', 'sea', 'town', 'lake', 'village', 'suburb', 'road', 'river'] as const;
export type LabelKind = (typeof LABEL_KINDS)[number];

/** The vector tile layers the style reads; the decoder skips the rest. */
export const SOURCE_LAYERS = new Set(['water', 'landcover', 'landuse', 'park', 'aeroway', 'building', 'waterway', 'transportation', 'boundary', 'place', 'water_name', 'transportation_name']);

type Props = Record<string, MvtValue>;

/** The fill group of a polygon feature, if it is drawn. */
export function fillGroup(layer: string, p: Props, z: number): FillGroup | undefined {
  const cls = String(p.class ?? p.subclass ?? '');
  switch (layer) {
    case 'water':
      return p.brunnel === 'tunnel' ? undefined : 'water';
    case 'landcover':
      if (cls === 'wood' || cls === 'forest') return 'wood';
      if (cls === 'grass' || cls === 'farmland' || cls === 'meadow' || cls === 'scrub') return 'grass';
      if (cls === 'ice' || cls === 'glacier') return 'ice';
      if (cls === 'sand' || cls === 'beach') return 'sand';
      if (cls === 'wetland') return 'wetland';
      return undefined;
    case 'landuse':
      if (cls === 'residential' || cls === 'neighbourhood' || cls === 'suburb') return z >= 10 ? 'residential' : undefined;
      if (cls === 'industrial' || cls === 'commercial' || cls === 'retail' || cls === 'railway') return 'industrial';
      if (cls === 'cemetery' || cls === 'pitch' || cls === 'playground' || cls === 'stadium') return 'park';
      return undefined;
    case 'park':
      return 'park';
    case 'aeroway':
      return cls === 'aerodrome' ? undefined : 'aeroway';
    case 'building':
      return z >= 13 ? 'building' : undefined;
    default:
      return undefined;
  }
}

/** The line group of a line feature, if it is drawn. */
export function lineGroup(layer: string, p: Props): LineGroup | undefined {
  const cls = String(p.class ?? '');
  switch (layer) {
    case 'waterway':
      if (p.brunnel === 'tunnel') return undefined;
      return cls === 'river' || cls === 'canal' ? 'river' : 'stream';
    case 'transportation':
      if (cls === 'motorway') return 'motorway';
      if (cls === 'trunk' || cls === 'primary') return 'primary';
      if (cls === 'secondary' || cls === 'tertiary') return 'secondary';
      if (cls === 'minor' || cls === 'service' || cls === 'raceway' || cls === 'busway') return 'minor';
      if (cls === 'path' || cls === 'track' || cls === 'bridleway') return 'path';
      if (cls === 'rail' || cls === 'transit') return 'rail';
      return undefined;
    case 'boundary': {
      if (p.maritime === 1 || p.maritime === true) return undefined;
      const level = Number(p.admin_level);
      if (level === 2) return 'country';
      if (level === 3 || level === 4) return 'state';
      return undefined;
    }
    default:
      return undefined;
  }
}

/** A point label: its kind, its text and its rank within the kind (lower is more important). */
export function labelOf(layer: string, p: Props): { kind: LabelKind; text: string; rank: number } | undefined {
  const text = String(p['name:en'] ?? p.name_en ?? p['name:latin'] ?? p.name ?? '');
  if (!text) return undefined;
  const rank = Number(p.rank ?? 10);
  if (layer === 'place') {
    const cls = String(p.class);
    if (cls === 'continent') return { kind: 'continent', text, rank };
    if (cls === 'country') return { kind: 'country', text, rank };
    if (cls === 'state' || cls === 'province') return { kind: 'state', text, rank };
    if (cls === 'city') return { kind: p.capital === 2 ? 'capital' : 'city', text, rank };
    if (cls === 'town') return { kind: 'town', text, rank };
    if (cls === 'village') return { kind: 'village', text, rank };
    if (cls === 'suburb' || cls === 'quarter' || cls === 'neighbourhood') return { kind: 'suburb', text, rank };
    return undefined;
  }
  if (layer === 'water_name') {
    const cls = String(p.class);
    if (cls === 'ocean') return { kind: 'ocean', text, rank };
    if (cls === 'sea' || cls === 'bay' || cls === 'strait') return { kind: 'sea', text, rank };
    if (cls === 'lake') return { kind: 'lake', text, rank };
  }
  return undefined;
}

const ROAD_RANK: Record<string, number> = { motorway: 1, trunk: 2, primary: 3, secondary: 4, tertiary: 5, minor: 6, service: 8 };

/** A label along a line: road and river names. */
export function lineLabelOf(layer: string, p: Props): { kind: LabelKind; text: string; rank: number } | undefined {
  const text = String(p['name:en'] ?? p.name_en ?? p['name:latin'] ?? p.name ?? '');
  if (!text) return undefined;
  const cls = String(p.class ?? '');
  if (layer === 'transportation_name' && cls in ROAD_RANK) return { kind: 'road', text, rank: ROAD_RANK[cls] };
  if (layer === 'waterway' && (cls === 'river' || cls === 'canal')) return { kind: 'river', text, rank: cls === 'river' ? 1 : 2 };
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------------
// Themes

/** A value by zoom: [[zoom, value], …], interpolated exponentially between stops (base 1.6), held past the ends. */
export type ByZoom = readonly (readonly [number, number])[];

export function atZoom(stops: ByZoom, z: number, base = 1.6): number {
  if (z <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z1, v1] = stops[i];
    if (z <= z1) {
      const [z0, v0] = stops[i - 1];
      const t = (base ** (z - z0) - 1) / (base ** (z1 - z0) - 1);
      return v0 + (v1 - v0) * t;
    }
  }
  return stops[stops.length - 1][1];
}

export interface LineStyle {
  readonly color: string;
  readonly width: ByZoom;
  /** Drawn first, wider, under every line's fill: road edges. */
  readonly casing?: { readonly color: string; readonly width: ByZoom };
  readonly minZoom?: number;
}

export interface LabelStyle {
  readonly color: string;
  readonly size: number;
  readonly weight?: number;
  readonly italic?: boolean;
  readonly upper?: boolean;
  readonly minZoom: number;
  readonly maxZoom?: number;
}

export interface Theme {
  readonly name: string;
  readonly dark: boolean;
  /** Land: the background. */
  readonly background: string;
  readonly fills: Readonly<Record<FillGroup, string>>;
  readonly lines: Readonly<Record<LineGroup, LineStyle>>;
  readonly labels: Readonly<Record<LabelKind, LabelStyle>>;
  /** The outline drawn around label text. */
  readonly halo: string;
}

const roadWidths = {
  motorway: [[5, 0.6], [9, 1.6], [13, 4], [16, 10], [19, 28]] as ByZoom,
  primary: [[6, 0.4], [9, 1.2], [13, 3.2], [16, 8], [19, 24]] as ByZoom,
  secondary: [[9, 0.5], [12, 1.4], [14, 3], [16, 6], [19, 18]] as ByZoom,
  minor: [[12, 0.4], [14, 1.6], [16, 4], [19, 14]] as ByZoom,
  path: [[14, 0.6], [17, 1.6], [19, 3]] as ByZoom,
};
const casingOf = (w: ByZoom): ByZoom => w.map(([z, v]) => [z, v + (z < 12 ? 0.8 : 2)] as const);

const labelSizes: Record<LabelKind, Omit<LabelStyle, 'color'>> = {
  // Continents name huge, vague areas (and some tiles add "Afro-Eurasia"): left out.
  continent: { size: 13, weight: 600, upper: true, minZoom: 99 },
  country: { size: 13, weight: 600, minZoom: 1.5, maxZoom: 8 },
  ocean: { size: 13, italic: true, minZoom: 0, maxZoom: 6 },
  state: { size: 11, weight: 500, upper: true, minZoom: 4, maxZoom: 9 },
  capital: { size: 13, weight: 600, minZoom: 3, maxZoom: 15 },
  city: { size: 12.5, weight: 500, minZoom: 4, maxZoom: 15 },
  sea: { size: 12, italic: true, minZoom: 3, maxZoom: 10 },
  town: { size: 11.5, minZoom: 8, maxZoom: 17 },
  lake: { size: 11, italic: true, minZoom: 7 },
  village: { size: 11, minZoom: 11 },
  suburb: { size: 11, upper: true, minZoom: 11.5 },
  road: { size: 10.5, weight: 500, minZoom: 14 },
  river: { size: 11, italic: true, minZoom: 11 },
};

function labels(text: string, soft: string, water: string): Record<LabelKind, LabelStyle> {
  const out = {} as Record<LabelKind, LabelStyle>;
  for (const k of LABEL_KINDS) {
    const s = labelSizes[k];
    const color = k === 'ocean' || k === 'sea' || k === 'lake' || k === 'river' ? water : k === 'suburb' || k === 'village' || k === 'state' || k === 'road' ? soft : text;
    out[k] = { ...s, color };
  }
  return out;
}

/** Light: Kiln's pale ground, water a pale smalt, roads white with soft edges. */
export const LIGHT: Theme = {
  name: 'light',
  dark: false,
  background: '#F2F3F0',
  fills: {
    ice: '#FFFFFF',
    sand: '#F0EBDA',
    grass: '#E3EBD9',
    wood: '#D5E3CB',
    wetland: '#DCE8E0',
    residential: '#ECEDEB',
    industrial: '#EAE8EE',
    park: '#D4E6C9',
    aeroway: '#E4E5EA',
    water: '#BFD2EC',
    building: '#DEDFE3',
  },
  lines: {
    stream: { color: '#BFD2EC', width: [[12, 0.5], [16, 2]], minZoom: 12 },
    river: { color: '#BFD2EC', width: [[8, 0.6], [12, 1.6], [16, 5], [19, 12]], minZoom: 7 },
    path: { color: '#FFFFFF', width: roadWidths.path, casing: { color: '#D6DAE2', width: casingOf(roadWidths.path) }, minZoom: 14 },
    minor: { color: '#FFFFFF', width: roadWidths.minor, casing: { color: '#D6DAE2', width: casingOf(roadWidths.minor) }, minZoom: 12 },
    secondary: { color: '#FFFFFF', width: roadWidths.secondary, casing: { color: '#CDD2DC', width: casingOf(roadWidths.secondary) }, minZoom: 9 },
    primary: { color: '#FFFFFF', width: roadWidths.primary, casing: { color: '#C3C9D5', width: casingOf(roadWidths.primary) }, minZoom: 6 },
    motorway: { color: '#FBEBD3', width: roadWidths.motorway, casing: { color: '#D9C2A3', width: casingOf(roadWidths.motorway) }, minZoom: 5 },
    rail: { color: '#C3C7D0', width: [[11, 0.6], [16, 1.6], [19, 3]], minZoom: 11 },
    state: { color: '#B6BBC6', width: [[3, 0.5], [8, 1], [14, 1.6]], minZoom: 3 },
    country: { color: '#9096A3', width: [[0, 0.6], [5, 1], [10, 1.8], [16, 3]] },
  },
  labels: labels('#2B303B', '#5C6375', '#4F6B9A'),
  halo: '#F5F6F8',
};

/** Dark: Kiln's graphite; water darker than land, so data on top carries the colour. */
export const DARK: Theme = {
  name: 'dark',
  dark: true,
  background: '#1B1F29',
  fills: {
    ice: '#222733',
    sand: '#1F222A',
    grass: '#1C2423',
    wood: '#1A2321',
    wetland: '#1B2226',
    residential: '#1E222C',
    industrial: '#1F212C',
    park: '#1A2622',
    aeroway: '#222634',
    water: '#0F131B',
    building: '#252A37',
  },
  lines: {
    stream: { color: '#0F131B', width: [[12, 0.5], [16, 2]], minZoom: 12 },
    river: { color: '#0F131B', width: [[8, 0.6], [12, 1.6], [16, 5], [19, 12]], minZoom: 7 },
    path: { color: '#2A303D', width: roadWidths.path, minZoom: 14 },
    minor: { color: '#2C3240', width: roadWidths.minor, minZoom: 12 },
    secondary: { color: '#323949', width: roadWidths.secondary, minZoom: 9 },
    primary: { color: '#3A4253', width: roadWidths.primary, minZoom: 6 },
    motorway: { color: '#454E62', width: roadWidths.motorway, minZoom: 5 },
    rail: { color: '#303643', width: [[11, 0.6], [16, 1.6]], minZoom: 11 },
    state: { color: '#3A4150', width: [[3, 0.5], [8, 1], [14, 1.6]], minZoom: 3 },
    country: { color: '#5C6375', width: [[0, 0.6], [5, 1], [10, 1.8], [16, 3]] },
  },
  labels: labels('#C9CDD6', '#9096A3', '#6F86B3'),
  halo: '#14171F',
};

export const THEMES = { light: LIGHT, dark: DARK } as const;
