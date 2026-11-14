# smaltkit/maps

Maps drawn as SVG: GeoJSON and TopoJSON shapes, Mercator and equirectangular projections fitted to a box, and `mapChart`, a filled-region (choropleth) and point map.

Shapes come from the app; none are bundled. `mapChart` takes a `ChartContext`, as the [charts](./charts) do.

## Examples

```ts
import { toFeatures, fitProjection, geoPath } from 'smaltkit/maps';

const square = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } };
const features = toFeatures({ type: 'FeatureCollection', features: [square] });
const project = fitProjection('equirectangular', features, 100, 100, 0);
console.log(geoPath(features[0].geometry, project));
```

```text
M0,100L100,100L100,0L0,0L0,100Z
```

## API

Generated from the module's declarations and their doc comments.

<!-- api:start -->

### Functions

#### fitProjection {#fitProjection}

```ts
function fitProjection(kind: ProjectionKind, features: Feature[], width: number, height: number, pad?: number, extra?: Position[]): Projection;
```

A projection fitted to show every position (of the features and any extra points) inside width × height.

#### geoPath {#geoPath}

```ts
function geoPath(g: Geometry | null, project: Projection): string;
```

SVG path data for a geometry (polygons closed; points as nothing: draw those as circles).

#### mapChart {#mapChart}

```ts
function mapChart(ctx: ChartContext): void;
```

Map. Shapes come in options.shapes (parsed GeoJSON or TopoJSON; options.object picks a TopoJSON object).

- Filled regions: role `location` (a dimension whose values name regions: matched against options.key, default
  `name`, then the feature's id and common name / ISO code properties) and `values` (one measure, coloured low to
  high on the sequential ramp).
- Points: roles `latitude` and `longitude` (numbers), optional `size` (a measure, area-scaled) and `values`
  (colour). Drawn over the shapes when there are any.

Options: shapes, object, key, projection (mercator, equirectangular), legend (true by default for filled regions).

#### toFeatures {#toFeatures}

```ts
function toFeatures(input: unknown, object?: string): Feature[];
```

Features from GeoJSON (a FeatureCollection, a Feature or a bare geometry) or TopoJSON (`object` names which of its
objects; else the first). Anything else gives no features.

### Constants

#### MAP_ROLES {#MAP_ROLES}

```ts
const MAP_ROLES: readonly [
    "location",
    "latitude",
    "longitude",
    "values",
    "size"
];
```

The columns a map reads by role (for apps that list a map's fields).

### Interfaces

#### Feature {#Feature}

```ts
interface Feature {
    type: 'Feature';
    id?: string | number;
    properties: Record<string, unknown> | null;
    geometry: Geometry | null;
}
```

#### Projection {#Projection}

```ts
interface Projection {
    (p: Position): Position;
    kind: ProjectionKind;
}
```

A projection: lon/lat in degrees to x/y in px (y down).

### Types

#### Geometry {#Geometry}

```ts
type Geometry = {
    type: 'Point';
    coordinates: Position;
} | {
    type: 'MultiPoint';
    coordinates: Position[];
} | {
    type: 'LineString';
    coordinates: Position[];
} | {
    type: 'MultiLineString';
    coordinates: Position[][];
} | {
    type: 'Polygon';
    coordinates: Position[][];
} | {
    type: 'MultiPolygon';
    coordinates: Position[][][];
} | {
    type: 'GeometryCollection';
    geometries: Geometry[];
};
```

#### MapRole {#MapRole}

```ts
type MapRole = (typeof MAP_ROLES)[number];
```

#### Position {#Position}

```ts
type Position = [
    number,
    number
];
```

#### ProjectionKind {#ProjectionKind}

```ts
type ProjectionKind = 'mercator' | 'equirectangular';
```

<!-- api:end -->
