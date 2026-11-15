# resultsToGraph

<!-- api:start -->

```ts noplay
import { resultsToGraph } from 'smaltkit/graph';
function resultsToGraph(values: unknown, options?: ResultsGraphOptions): ResultsGraph;
```

Every node, relationship and path in the values (rows, lists, maps, nested at any depth), as a graph to draw.
Relationships whose ends aren't in the values bring their ends as bare nodes. Returns an empty graph when there are
none.

## Parameters

| Parameter | Type | |
| --- | --- | --- |
| `values` | `unknown` | A query's rows, or any value holding graph values. |
| `options?` | `ResultsGraphOptions` | How to caption and group the nodes. |

## Returns

`ResultsGraph`: The graph for `setGraph`, and the nodes and relationships in drawing order. ```ts const { graph, nodes } = resultsToGraph(db.run('MATCH p = (:Person)-[:KNOWS*1..2]->() RETURN p').rows); view.setGraph(graph); view.onClick((hit) => hit?.kind === 'node' && console.log(nodes[hit.index])); ```

<!-- api:end -->

## Examples

Nodes and a relationship, as a query returns them:

```ts
import { resultsToGraph } from 'smaltkit/graph';

const ann = { kind: 'node', id: 1, labels: ['Person'], properties: { name: 'Ann' } };
const bob = { kind: 'node', id: 2, labels: ['Person'], properties: { name: 'Bob' } };
const knows = { kind: 'relationship', id: 10, type: 'KNOWS', start: 1, end: 2, properties: {} };
const { graph, nodes, relationships } = resultsToGraph([[ann, knows, bob]]);
console.log(graph.nodes.length, graph.edges.length);
console.log(nodes.map((n) => n.properties.name), relationships.map((r) => r.type));
```

```text
2 1
[ 'Ann', 'Bob' ] [ 'KNOWS' ]
```

## Demo

Drawing a result:

```ts
import { createGraphView, resultsToGraph } from 'smaltkit/graph';

const view = await createGraphView(document.querySelector('canvas')!);
const { graph, nodes } = resultsToGraph(rows);
view.setGraph(graph);
```


## See also

- [`createGraphView`](./createGraphView).
- [`defaultCaption`](./defaultCaption).
