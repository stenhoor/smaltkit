# fitProjection

<!-- api:start -->

```ts
import { fitProjection } from 'smaltkit/maps';
function fitProjection(kind: ProjectionKind, features: Feature[], width: number, height: number, pad?: number, extra?: Position[]): Projection;
```

A projection fitted to show every position (of the features and any extra points) inside width × height.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `kind` | `ProjectionKind` | `'mercator'` or `'equirectangular'`. |
| `features` | `Feature[]` | The features to show. |
| `width` | `number` | The box's width. |
| `height` | `number` | The box's height. |
| `pad?` | `number` | The margin inside the box. Default 8. |
| `extra?` | `Position[]` | More positions to keep in view, as `[longitude, latitude]`, such as points drawn over the shapes. |

## Returns

`Projection`: A function from `[longitude, latitude]` to `[x, y]` in the box.

<!-- api:end -->

## Examples

```ts
import { toFeatures, fitProjection } from 'smaltkit/maps';

const geo = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'West' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } },
    { type: 'Feature', properties: { name: 'East' }, geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] } },
  ],
};
const project = fitProjection('equirectangular', toFeatures(geo), 400, 200, 0);
console.log(project([0, 0]), project([20, 10]), project([10, 5]));
```

```text
[ 0, 200 ] [ 400, 0 ] [ 200, 100 ]
```

## See also

- [`geoPath`](./geoPath).
- [`toFeatures`](./toFeatures).
