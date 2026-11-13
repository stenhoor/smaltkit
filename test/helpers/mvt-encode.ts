// A small Mapbox Vector Tile encoder, for tests: builds tiles with known features so the decoder and the basemap can
// be checked without the network.
type Value = string | number | boolean;
export interface Feature {
  type: 1 | 2 | 3;
  properties: Record<string, Value>;
  /** Parts: rings, lines or points, as [x, y] pairs in tile units. */
  geometry: [number, number][][];
}
export interface Layer {
  name: string;
  extent?: number;
  features: Feature[];
}

class Writer {
  bytes: number[] = [];
  varint(v: number): void {
    v = Math.floor(v);
    while (v > 127) {
      this.bytes.push((v & 127) | 128);
      v = Math.floor(v / 128);
    }
    this.bytes.push(v);
  }
  tag(field: number, wire: number): void {
    this.varint((field << 3) | wire);
  }
  message(field: number, w: Writer): void {
    this.tag(field, 2);
    this.varint(w.bytes.length);
    this.bytes.push(...w.bytes);
  }
  string(field: number, s: string): void {
    const b = new TextEncoder().encode(s);
    this.tag(field, 2);
    this.varint(b.length);
    this.bytes.push(...b);
  }
  packed(field: number, vs: number[]): void {
    const w = new Writer();
    for (const v of vs) w.varint(v);
    this.message(field, w);
  }
}

const zz = (n: number) => (n << 1) ^ (n >> 31);

function geometry(f: Feature): number[] {
  const out: number[] = [];
  let x = 0, y = 0;
  for (const part of f.geometry) {
    if (f.type === 1) {
      out.push((1 & 7) | (1 << 3));
      out.push(zz(part[0][0] - x), zz(part[0][1] - y));
      [x, y] = part[0];
      continue;
    }
    out.push(1 | (1 << 3), zz(part[0][0] - x), zz(part[0][1] - y));
    [x, y] = part[0];
    const rest = part.slice(1);
    out.push(2 | (rest.length << 3));
    for (const [px, py] of rest) {
      out.push(zz(px - x), zz(py - y));
      x = px;
      y = py;
    }
    if (f.type === 3) out.push(7 | (1 << 3));
  }
  return out;
}

export function encodeTile(layers: Layer[]): Uint8Array {
  const tile = new Writer();
  for (const l of layers) {
    const w = new Writer();
    w.tag(15, 0);
    w.varint(2);
    w.string(1, l.name);
    const keys: string[] = [], values: Value[] = [];
    for (const f of l.features) {
      const fw = new Writer();
      const tags: number[] = [];
      for (const [k, v] of Object.entries(f.properties)) {
        let ki = keys.indexOf(k);
        if (ki < 0) ki = keys.push(k) - 1;
        let vi = values.indexOf(v);
        if (vi < 0) vi = values.push(v) - 1;
        tags.push(ki, vi);
      }
      if (tags.length) fw.packed(2, tags);
      fw.tag(3, 0);
      fw.varint(f.type);
      fw.packed(4, geometry(f));
      w.message(2, fw);
    }
    for (const k of keys) w.string(3, k);
    for (const v of values) {
      const vw = new Writer();
      if (typeof v === 'string') vw.string(1, v);
      else if (typeof v === 'boolean') {
        vw.tag(7, 0);
        vw.varint(v ? 1 : 0);
      } else if (Number.isInteger(v) && v >= 0) {
        vw.tag(5, 0);
        vw.varint(v);
      } else {
        vw.tag(3, 1);
        const b = new Uint8Array(8);
        new DataView(b.buffer).setFloat64(0, v, true);
        vw.bytes.push(...b);
      }
      w.message(4, vw);
    }
    w.tag(5, 0);
    w.varint(l.extent ?? 4096);
    tile.message(3, w);
  }
  return Uint8Array.from(tile.bytes);
}
