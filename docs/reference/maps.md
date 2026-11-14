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

Each has a page of its own.

| Function | |
| --- | --- |
| [`fitProjection`](./maps/fitProjection) | A projection fitted to show every position (of the features and any extra points) inside width × height. |
| [`geoPath`](./maps/geoPath) | SVG path data for a geometry (polygons closed; points as nothing: draw those as circles). |
| [`mapChart`](./maps/mapChart) | Map. |
| [`toFeatures`](./maps/toFeatures) | Features from GeoJSON (a FeatureCollection, a Feature or a bare geometry) or TopoJSON (`object` names which of its objects; else the first). |

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
