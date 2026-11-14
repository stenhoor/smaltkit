# toFeatures

<!-- api:start -->

```ts
import { toFeatures } from 'smaltkit/maps';
function toFeatures(input: unknown, object?: string): Feature[];
```

Features from GeoJSON (a FeatureCollection, a Feature or a bare geometry) or TopoJSON (`object` names which of its
objects; else the first). Anything else gives no features.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `input` | `unknown` | Parsed GeoJSON or TopoJSON. |
| `object?` | `string` | The TopoJSON object to read. Default: its first. |

## Returns

`Feature[]`: The features, with TopoJSON's arcs turned into coordinates.

<!-- api:end -->

## Examples

GeoJSON:

```ts
import { toFeatures } from 'smaltkit/maps';

const geo = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'West' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } },
    { type: 'Feature', properties: { name: 'East' }, geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] } },
  ],
};
console.log(toFeatures(geo).map((f) => f.properties?.name));
console.log(toFeatures({ type: 'Point', coordinates: [4.9, 52.4] }).length, toFeatures('not a map').length);
```

```text
[ 'West', 'East' ]
1 0
```

TopoJSON, with its arcs turned into coordinates:

```ts
import { toFeatures } from 'smaltkit/maps';

const topo = {
  type: 'Topology',
  arcs: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
  objects: { regions: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', arcs: [[0]], properties: { name: 'A' } }] } },
};
const [f] = toFeatures(topo, 'regions');
console.log(f!.properties, JSON.stringify(f!.geometry));
```

```text
{ name: 'A' } {"type":"Polygon","coordinates":[[[0,0],[10,0],[10,10],[0,10],[0,0]]]}
```

## See also

- [`fitProjection`](./fitProjection) and [`geoPath`](./geoPath).
- [`mapChart`](./mapChart).
