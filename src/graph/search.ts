import type { RenderNode } from './types.js';

/** Case-insensitive substring match on label, id and group. An empty query matches nothing. */
export function matchNodes(nodes: readonly RenderNode[], text: string): number[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const out: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (
      (n.label !== undefined && n.label.toLowerCase().includes(q)) ||
      String(n.id).toLowerCase().includes(q) ||
      (n.group !== undefined && n.group.toLowerCase().includes(q))
    ) {
      out.push(i);
    }
  }
  return out;
}
