# geoPath

<!-- api:start -->

```ts noplay
import { geoPath } from 'smaltkit/maps';
function geoPath(g: Geometry | null, project: Projection): string;
```

SVG path data for a geometry (polygons closed; points as nothing: draw those as circles).

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `g` | `Geometry \| null` | A geometry, or null. |
| `project` | `Projection` | A projection, from fitProjection. |

## Returns

`string`: The path's `d`; `''` for null or a point.

<!-- api:end -->

## Examples

```ts
import { toFeatures, fitProjection, geoPath } from 'smaltkit/maps';

const geo = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'West' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } },
    { type: 'Feature', properties: { name: 'East' }, geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] } },
  ],
};
const features = toFeatures(geo);
const project = fitProjection('mercator', features, 400, 200);
for (const f of features) console.log(f.properties?.name, geoPath(f.geometry, project));
```

```text
West M16.94,192L200,192L200,8L16.94,8L16.94,192Z
East M200,192L383.06,192L383.06,8L200,8L200,192Z
```

## Demo

A map drawn by hand, a path per feature:

```ts
import { toFeatures, fitProjection, geoPath } from 'smaltkit/maps';

const geo = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'West' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } },
    { type: 'Feature', properties: { name: 'East' }, geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] } },
  ],
};
const features = toFeatures(geo);
const project = fitProjection('equirectangular', features, 200, 100);
console.log(`<svg width="200" height="100">${features.map((f) => `<path d="${geoPath(f.geometry, project)}"/>`).join('')}</svg>`);
```

```text
<svg width="200" height="100"><path d="M16,92L100,92L100,8L16,8L16,92Z"/><path d="M100,92L184,92L184,8L100,8L100,92Z"/></svg>
```

## See also

- [`mapChart`](./mapChart): a whole map, with colours and a legend.
