/**
 * A Mapbox Vector Tile decoder (spec 2.1): a small protobuf reader and the tile's layers, features, tags and geometry
 * commands. Geometry stays in tile coordinates (0 to `extent`, usually 4096).
 */

export class Pbf {
  pos = 0;
  constructor(readonly buf: Uint8Array) {}

  get end(): boolean {
    return this.pos >= this.buf.length;
  }

  varint(): number {
    const b = this.buf;
    let v = 0, shift = 0, byte: number;
    do {
      byte = b[this.pos++];
      if (shift < 28) v |= (byte & 0x7f) << shift;
      else v += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return v;
  }

  /** A varint as a signed 64-bit integer (two's complement), as a JavaScript number. */
  int64(): number {
    const b = this.buf;
    let lo = 0, hi = 0, shift = 0, byte: number;
    do {
      byte = b[this.pos++];
      if (shift < 28) lo |= (byte & 0x7f) << shift;
      else if (shift === 28) {
        lo |= (byte & 0x0f) << 28;
        hi |= (byte & 0x7f) >> 4;
      } else hi |= (byte & 0x7f) << (shift - 32);
      shift += 7;
    } while (byte & 0x80);
    return (hi | 0) * 4294967296 + (lo >>> 0);
  }

  svarint(): number {
    const v = this.varint();
    return v % 2 === 1 ? (v + 1) / -2 : v / 2;
  }

  float(): number {
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4).getFloat32(0, true);
    this.pos += 4;
    return v;
  }

  double(): number {
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8).getFloat64(0, true);
    this.pos += 8;
    return v;
  }

  bytes(): Uint8Array {
    const len = this.varint();
    const out = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }

  string(): string {
    return decoder.decode(this.bytes());
  }

  skip(wire: number): void {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.pos += this.varint();
    else if (wire === 5) this.pos += 4;
    else throw new Error(`Unsupported protobuf wire type ${wire}`);
  }

  /** Reads fields until `end`, calling `fn(field, wire)`; `fn` must consume the field or return false to skip it. */
  fields(end: number, fn: (field: number, wire: number) => boolean | void): void {
    while (this.pos < end) {
      const tag = this.varint();
      const field = tag >> 3, wire = tag & 7;
      const before = this.pos;
      if (fn(field, wire) === false || this.pos === before) this.skip(wire);
    }
  }

  /** Packed repeated varints. */
  packed(out: number[] = []): number[] {
    const end = this.varint() + this.pos;
    while (this.pos < end) out.push(this.varint());
    return out;
  }
}

const decoder = new TextDecoder();

export type MvtValue = string | number | boolean;

export const enum GeomType {
  Unknown = 0,
  Point = 1,
  LineString = 2,
  Polygon = 3,
}

export interface MvtFeature {
  readonly id?: number;
  readonly type: GeomType;
  readonly properties: Record<string, MvtValue>;
  /** Rings (polygons), lines (line strings) or groups of points: flat [x0, y0, x1, y1, …] arrays in tile units. */
  readonly geometry: number[][];
}

export interface MvtLayer {
  readonly name: string;
  readonly extent: number;
  readonly features: MvtFeature[];
}

/** Decodes a tile. `want` limits decoding to some layers (the others are skipped without reading their features). */
export function decodeTile(data: Uint8Array, want?: ReadonlySet<string>): Map<string, MvtLayer> {
  const pbf = new Pbf(data);
  const layers = new Map<string, MvtLayer>();
  pbf.fields(data.length, (field, wire) => {
    if (field !== 3 || wire !== 2) return false;
    const len = pbf.varint();
    const end = pbf.pos + len;
    const layer = decodeLayer(pbf, end, want);
    pbf.pos = end;
    if (layer) layers.set(layer.name, layer);
  });
  return layers;
}

function decodeLayer(pbf: Pbf, end: number, want?: ReadonlySet<string>): MvtLayer | null {
  let name = '';
  let extent = 4096;
  const keys: string[] = [];
  const values: MvtValue[] = [];
  const raw: { start: number; end: number }[] = [];
  pbf.fields(end, (field, wire) => {
    if (field === 1 && wire === 2) name = pbf.string();
    else if (field === 5 && wire === 0) extent = pbf.varint();
    else if (field === 3 && wire === 2) keys.push(pbf.string());
    else if (field === 4 && wire === 2) values.push(decodeValue(pbf));
    else if (field === 2 && wire === 2) {
      const len = pbf.varint();
      raw.push({ start: pbf.pos, end: pbf.pos + len });
      pbf.pos += len;
    } else return false;
  });
  if (want && !want.has(name)) return null;
  const features: MvtFeature[] = [];
  for (const r of raw) {
    pbf.pos = r.start;
    let id: number | undefined;
    let type = GeomType.Unknown;
    let tags: number[] = [];
    let geom: number[] = [];
    pbf.fields(r.end, (field, wire) => {
      if (field === 1 && wire === 0) id = pbf.varint();
      else if (field === 2 && wire === 2) tags = pbf.packed();
      else if (field === 3 && wire === 0) type = pbf.varint() as GeomType;
      else if (field === 4 && wire === 2) geom = pbf.packed();
      else return false;
    });
    const properties: Record<string, MvtValue> = {};
    for (let i = 0; i + 1 < tags.length; i += 2) {
      const k = keys[tags[i]], v = values[tags[i + 1]];
      if (k !== undefined && v !== undefined) properties[k] = v;
    }
    features.push({ id, type, properties, geometry: decodeGeometry(geom) });
  }
  return { name, extent, features };
}

function decodeValue(pbf: Pbf): MvtValue {
  const len = pbf.varint();
  const end = pbf.pos + len;
  let v: MvtValue = '';
  pbf.fields(end, (field) => {
    if (field === 1) v = pbf.string();
    else if (field === 2) v = pbf.float();
    else if (field === 3) v = pbf.double();
    else if (field === 4) v = pbf.int64();
    else if (field === 5) v = pbf.varint();
    else if (field === 6) v = pbf.svarint();
    else if (field === 7) v = pbf.varint() !== 0;
    else return false;
  });
  pbf.pos = end;
  return v;
}

const zigzag = (n: number) => (n >>> 1) ^ -(n & 1);

/** Geometry commands into parts: MoveTo starts a part, LineTo extends it, ClosePath closes a ring (not repeated). */
export function decodeGeometry(cmds: readonly number[]): number[][] {
  const parts: number[][] = [];
  let x = 0, y = 0;
  let part: number[] | null = null;
  let i = 0;
  while (i < cmds.length) {
    const c = cmds[i++];
    const id = c & 7, count = c >> 3;
    if (id === 1 || id === 2) {
      for (let k = 0; k < count && i + 1 < cmds.length; k++) {
        x += zigzag(cmds[i++]);
        y += zigzag(cmds[i++]);
        if (id === 1) {
          part = [];
          parts.push(part);
        }
        part!.push(x, y);
      }
    } else if (id === 7) {
      // Closed: fills treat every ring as closed already.
    } else break;
  }
  return parts;
}
