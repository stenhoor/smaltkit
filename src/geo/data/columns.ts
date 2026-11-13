/** Columns of query results, and turning them into numbers for the GPU. */

/** Columns by name: numbers as typed arrays, anything else as plain arrays. */
export type ColumnData = Record<string, Float64Array | Float32Array | Uint32Array | unknown[]>;

export interface QueriedColumns {
  readonly count: number;
  readonly columns: ColumnData;
  /** Milliseconds the query took, measured here. */
  readonly ms: number;
}

/** A numeric column as a Float64Array (NULLs and non-numbers become NaN, which the layers skip). */
export function numeric(col: ArrayLike<unknown> | undefined): Float64Array {
  if (!col) return new Float64Array(0);
  if (col instanceof Float64Array) return col;
  const out = new Float64Array(col.length);
  for (let i = 0; i < col.length; i++) {
    const v = col[i];
    out[i] = typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : v === null || v === undefined ? NaN : Number(v);
  }
  return out;
}
