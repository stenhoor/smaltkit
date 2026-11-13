/**
 * Capacity policy for GPU and CPU buffers that grow with the graph: reallocate only when the
 * capacity is exceeded, then leave headroom so that small increments do not reallocate again.
 */
export const MIN_CAPACITY = 64;

export function nextCapacity(needed: number, current: number, min = MIN_CAPACITY): number {
  if (needed <= current && current >= min) return current;
  let cap = Math.max(min, current);
  while (cap < needed) cap = cap < 1 << 20 ? cap * 2 : Math.ceil(cap * 1.5);
  return Math.ceil(cap / 64) * 64;
}
