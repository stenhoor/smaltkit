// Reading a local git repository's own files (ADR 0032, stenhoor/smalt-brand docs/adr): objects, loose and packed (with
// deltas), refs and packed refs, commits, trees and blobs, a file at a commit, history, and a line diff. Read only: it
// never writes to `.git`, and it never talks to a remote. Commits and syncing are the user's, in their own tools.
//
//   const repo = await openRepository(gitDirFromHandle(await folder.getDirectoryHandle('.git')));
//   const head = await repo.resolve('HEAD');
//   const text = await repo.readText(head, 'notebooks/orders.nb.ts');
//   const commits = await repo.log('HEAD', { path: 'notebooks/orders.nb.ts', limit: 20 });
//
// The `.git` folder is reached through a `GitDir`: in a page, a FileSystemDirectoryHandle (`gitDirFromHandle`); in Node,
// any object with the same three methods. No Node, no DOM framework, no outside code: SHA-1 is `crypto.subtle`, zlib is
// the browser's `DecompressionStream('deflate')`.

/** A file in `.git`, read in ranges so a large pack is never read whole. */
export interface GitFile {
  readonly size: number;
  read(start: number, end: number): Promise<Uint8Array>;
}

/** The `.git` folder, by paths relative to it (`objects/pack`, `refs/heads/main`). */
export interface GitDir {
  /** The file at the path, or null. */
  file(path: string): Promise<GitFile | null>;
  /** The names in the folder at the path, or null when there is none. */
  list(path: string): Promise<string[] | null>;
}

export type GitObjectType = 'commit' | 'tree' | 'blob' | 'tag';

export interface GitObject {
  type: GitObjectType;
  data: Uint8Array;
}

export interface GitPerson {
  name: string;
  email: string;
  /** Seconds since the epoch. */
  time: number;
  /** The time zone as git writes it: `+0100`. */
  zone: string;
}

export interface GitCommit {
  id: string;
  tree: string;
  parents: string[];
  author: GitPerson;
  committer: GitPerson;
  message: string;
}

export interface GitTreeEntry {
  /** `100644` (file), `100755` (executable), `120000` (link), `40000` (folder), `160000` (submodule). */
  mode: string;
  name: string;
  id: string;
  type: 'blob' | 'tree' | 'commit';
}

/** A problem reading the repository: what isn't there, or what this reader doesn't handle. */
export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const SHA = /^[0-9a-f]{40}$/;

/** A `GitDir` over a `.git` folder's FileSystemDirectoryHandle (the File System Access API). */
export function gitDirFromHandle(root: FileSystemDirectoryHandle): GitDir {
  const dirOf = async (parts: string[]) => {
    let d = root;
    for (const p of parts) d = await d.getDirectoryHandle(p);
    return d;
  };
  return {
    async file(path) {
      const parts = path.split('/').filter(Boolean);
      try {
        const f = await (await (await dirOf(parts.slice(0, -1))).getFileHandle(parts.at(-1)!)).getFile();
        return { size: f.size, read: async (s, e) => new Uint8Array(await f.slice(s, e).arrayBuffer()) };
      } catch {
        return null;
      }
    },
    async list(path) {
      try {
        const d = await dirOf(path.split('/').filter(Boolean));
        const names: string[] = [];
        for await (const key of (d as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(key);
        return names;
      } catch {
        return null;
      }
    },
  };
}

/** zlib-inflates `data` (the whole stream, no trailing bytes). */
export async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** SHA-1, as hex. */
export async function sha1(data: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-1', data as BufferSource)));
}

/** The id git gives a file's contents (`git hash-object`): how a working file is compared with a commit's. */
export async function blobId(data: Uint8Array): Promise<string> {
  const head = encoder.encode(`blob ${data.length}\0`);
  const all = new Uint8Array(head.length + data.length);
  all.set(head);
  all.set(data, head.length);
  return sha1(all);
}

const TYPES: Record<number, GitObjectType> = { 1: 'commit', 2: 'tree', 3: 'blob', 4: 'tag' };

/** Applies a git delta to its base. */
export function applyDelta(base: Uint8Array, delta: Uint8Array): Uint8Array {
  let p = 0;
  const varint = () => {
    let n = 0;
    let shift = 0;
    let b: number;
    do {
      b = delta[p++]!;
      n += (b & 0x7f) * 2 ** shift;
      shift += 7;
    } while (b & 0x80);
    return n;
  };
  const baseSize = varint();
  if (baseSize !== base.length) throw new GitError(`a delta expects a base of ${baseSize} bytes, not ${base.length}`);
  const out = new Uint8Array(varint());
  let o = 0;
  while (p < delta.length) {
    const op = delta[p++]!;
    if (op & 0x80) {
      let off = 0;
      let size = 0;
      for (let i = 0; i < 4; i++) if (op & (1 << i)) off += delta[p++]! * 2 ** (8 * i);
      for (let i = 0; i < 3; i++) if (op & (0x10 << i)) size += delta[p++]! * 2 ** (8 * i);
      if (size === 0) size = 0x10000;
      out.set(base.subarray(off, off + size), o);
      o += size;
    } else if (op) {
      out.set(delta.subarray(p, p + op), o);
      o += op;
      p += op;
    } else throw new GitError('a delta has an opcode of 0');
  }
  if (o !== out.length) throw new GitError('a delta gave the wrong size');
  return out;
}

interface Pack {
  name: string;
  pack: GitFile;
  /** Object ids, sorted, and each one's offset in the pack. */
  ids: string[];
  offsets: number[];
  /** Offsets sorted, to find where each object's data ends. */
  sorted: number[];
}

async function readPackIndex(dir: GitDir, name: string): Promise<Pack | null> {
  const idxFile = await dir.file(`objects/pack/${name}.idx`);
  const pack = await dir.file(`objects/pack/${name}.pack`);
  if (!idxFile || !pack) return null;
  const idx = await idxFile.read(0, idxFile.size);
  const view = new DataView(idx.buffer, idx.byteOffset, idx.byteLength);
  if (view.getUint32(0) !== 0xff744f63 || view.getUint32(4) !== 2) throw new GitError(`${name}.idx: only pack index version 2 is read`);
  const count = view.getUint32(8 + 255 * 4);
  const shaAt = 8 + 256 * 4;
  const crcAt = shaAt + count * 20;
  const offAt = crcAt + count * 4;
  const largeAt = offAt + count * 4;
  const ids: string[] = new Array(count);
  const offsets: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    ids[i] = hex(idx.subarray(shaAt + i * 20, shaAt + i * 20 + 20));
    const o = view.getUint32(offAt + i * 4);
    offsets[i] = o & 0x80000000 ? Number(view.getBigUint64(largeAt + (o & 0x7fffffff) * 8)) : o;
  }
  return { name, pack, ids, offsets, sorted: [...offsets].sort((a, b) => a - b) };
}

/** A git repository, read from its `.git` folder. */
export class Repository {
  #dir: GitDir;
  #packs: Pack[];
  #cache = new Map<string, GitObject>();
  #packed: Map<string, string> | null = null;

  constructor(dir: GitDir, packs: Pack[]) {
    this.#dir = dir;
    this.#packs = packs;
  }

  /** The object with this id, from the loose objects or a pack. */
  async readObject(id: string): Promise<GitObject> {
    const cached = this.#cache.get(id);
    if (cached) return cached;
    const loose = await this.#dir.file(`objects/${id.slice(0, 2)}/${id.slice(2)}`);
    let obj: GitObject | null = null;
    if (loose) {
      const raw = await inflate(await loose.read(0, loose.size));
      const nul = raw.indexOf(0);
      const [type] = decoder.decode(raw.subarray(0, nul)).split(' ');
      obj = { type: type as GitObjectType, data: raw.slice(nul + 1) };
    } else {
      for (const p of this.#packs) {
        const i = bisect(p.ids, id);
        if (i >= 0) {
          obj = await this.#fromPack(p, p.offsets[i]!);
          break;
        }
      }
    }
    if (!obj) throw new GitError(`no object ${id}`);
    if (this.#cache.size > 2000) this.#cache.clear();
    this.#cache.set(id, obj);
    return obj;
  }

  async #fromPack(p: Pack, offset: number): Promise<GitObject> {
    const at = bisect(p.sorted, offset);
    const end = at + 1 < p.sorted.length ? p.sorted[at + 1]! : p.pack.size - 20;
    const bytes = await p.pack.read(offset, end);
    let i = 0;
    let c = bytes[i++]!;
    const type = (c >> 4) & 7;
    while (c & 0x80) c = bytes[i++]!; // the object's size: inflate tells us
    if (type === 6) { // OFS_DELTA: the base is earlier in this pack
      c = bytes[i++]!;
      let back = c & 0x7f;
      while (c & 0x80) {
        c = bytes[i++]!;
        back = (back + 1) * 128 + (c & 0x7f);
      }
      const base = await this.#fromPack(p, offset - back);
      return { type: base.type, data: applyDelta(base.data, await inflate(bytes.subarray(i))) };
    }
    if (type === 7) { // REF_DELTA: the base is named by id
      const base = await this.readObject(hex(bytes.subarray(i, i + 20)));
      return { type: base.type, data: applyDelta(base.data, await inflate(bytes.subarray(i + 20))) };
    }
    const t = TYPES[type];
    if (!t) throw new GitError(`${p.name}.pack: object type ${type} at ${offset}`);
    return { type: t, data: await inflate(bytes.subarray(i)) };
  }

  async #object(id: string, want: GitObjectType): Promise<Uint8Array> {
    const o = await this.readObject(id);
    if (o.type !== want) throw new GitError(`${id} is a ${o.type}, not a ${want}`);
    return o.data;
  }

  async readCommit(id: string): Promise<GitCommit> {
    const text = decoder.decode(await this.#object(id, 'commit'));
    const blank = text.indexOf('\n\n');
    const head = blank < 0 ? text : text.slice(0, blank);
    const c: GitCommit = { id, tree: '', parents: [], author: noPerson, committer: noPerson, message: blank < 0 ? '' : text.slice(blank + 2) };
    for (const line of head.split('\n')) {
      if (line.startsWith(' ')) continue; // a continued header (gpgsig, mergetag)
      const sp = line.indexOf(' ');
      const key = line.slice(0, sp);
      const value = line.slice(sp + 1);
      if (key === 'tree') c.tree = value;
      else if (key === 'parent') c.parents.push(value);
      else if (key === 'author') c.author = person(value);
      else if (key === 'committer') c.committer = person(value);
    }
    return c;
  }

  async readTree(id: string): Promise<GitTreeEntry[]> {
    const data = await this.#object(id, 'tree');
    const out: GitTreeEntry[] = [];
    let i = 0;
    while (i < data.length) {
      const sp = data.indexOf(0x20, i);
      const nul = data.indexOf(0, sp);
      const mode = decoder.decode(data.subarray(i, sp));
      out.push({
        mode, name: decoder.decode(data.subarray(sp + 1, nul)), id: hex(data.subarray(nul + 1, nul + 21)),
        type: mode === '40000' ? 'tree' : mode === '160000' ? 'commit' : 'blob',
      });
      i = nul + 21;
    }
    return out;
  }

  async readBlob(id: string): Promise<Uint8Array> {
    return this.#object(id, 'blob');
  }

  /** The tree entry at a path (`a/b.nb.ts`) in a commit, or null. */
  async entryAt(commitish: string, path: string): Promise<GitTreeEntry | null> {
    const commit = await this.readCommit(await this.resolve(commitish));
    let tree = commit.tree;
    const parts = path.split('/').filter(Boolean);
    for (const [k, part] of parts.entries()) {
      const e = (await this.readTree(tree)).find((x) => x.name === part);
      if (!e) return null;
      if (k === parts.length - 1) return e;
      if (e.type !== 'tree') return null;
      tree = e.id;
    }
    return null;
  }

  /** A file's bytes at a commit, or null when the commit doesn't have it. */
  async readFile(commitish: string, path: string): Promise<Uint8Array | null> {
    const e = await this.entryAt(commitish, path);
    return e && e.type === 'blob' ? this.readBlob(e.id) : null;
  }

  /** A file's text (UTF-8) at a commit, or null. */
  async readText(commitish: string, path: string): Promise<string | null> {
    const b = await this.readFile(commitish, path);
    return b && decoder.decode(b);
  }

  /** A ref's target, following symbolic refs (`HEAD` → `refs/heads/main`), or null. */
  async ref(name: string): Promise<string | null> {
    for (let depth = 0; depth < 10; depth++) {
      const f = await this.#dir.file(name);
      if (f) {
        const text = decoder.decode(await f.read(0, f.size)).trim();
        if (text.startsWith('ref: ')) {
          name = text.slice(5);
          continue;
        }
        return SHA.test(text) ? text : null;
      }
      return (await this.#packedRefs()).get(name) ?? null;
    }
    throw new GitError(`${name}: symbolic refs nest too deep`);
  }

  /** The branch HEAD is on (`main`), or null when HEAD is detached. */
  async currentBranch(): Promise<string | null> {
    const f = await this.#dir.file('HEAD');
    if (!f) throw new GitError('no HEAD: is this a .git folder?');
    const text = decoder.decode(await f.read(0, f.size)).trim();
    return text.startsWith('ref: refs/heads/') ? text.slice('ref: refs/heads/'.length) : null;
  }

  /** Branch names, sorted: loose and packed. */
  async branches(): Promise<string[]> {
    const names = new Set<string>();
    const walk = async (prefix: string) => {
      for (const n of (await this.#dir.list(`refs/heads/${prefix}`)) ?? []) {
        if (await this.#dir.file(`refs/heads/${prefix}${n}`)) names.add(prefix + n);
        else await walk(`${prefix}${n}/`);
      }
    };
    await walk('');
    for (const k of (await this.#packedRefs()).keys()) if (k.startsWith('refs/heads/')) names.add(k.slice(11));
    return [...names].sort();
  }

  /**
   * A commit id from a name: a full id, `HEAD`, a branch (`main`), a tag (`v1`, peeled to its commit) or a full ref
   * (`refs/heads/main`).
   */
  async resolve(name: string): Promise<string> {
    // Parent steps: `~3` is three first parents back, `^2` the second parent.
    const steps = name.match(/^(.+?)((?:[~^]\d*)+)$/);
    if (steps) {
      let id = await this.resolve(steps[1]!);
      for (const [, op, num] of steps[2]!.matchAll(/([~^])(\d*)/g)) {
        const n = num === '' ? 1 : Number(num);
        if (op === '~') {
          for (let i = 0; i < n; i++) id = this.#parent(await this.readCommit(id), 0, name);
        } else if (n > 0) id = this.#parent(await this.readCommit(id), n - 1, name);
      }
      return id;
    }
    if (SHA.test(name)) return name;
    for (const ref of name.startsWith('refs/') || name === 'HEAD' ? [name] : [`refs/heads/${name}`, `refs/tags/${name}`, `refs/remotes/${name}`]) {
      let id = await this.ref(ref);
      if (!id) continue;
      for (let i = 0; i < 10; i++) {
        const o = await this.readObject(id);
        if (o.type !== 'tag') return id;
        id = decoder.decode(o.data).match(/^object ([0-9a-f]{40})/)![1]!;
      }
    }
    throw new GitError(`no commit named "${name}"`);
  }

  /**
   * Commits reachable from `commitish`, newest first by committer time. With `path`, only the commits that changed that
   * file (its blob differs from every parent's, as `git log -- path` without merges' simplification counts).
   */
  async log(commitish: string, options: { path?: string; limit?: number } = {}): Promise<GitCommit[]> {
    const limit = options.limit ?? Infinity;
    const seen = new Set<string>();
    const queue: GitCommit[] = [await this.readCommit(await this.resolve(commitish))];
    seen.add(queue[0]!.id);
    const out: GitCommit[] = [];
    while (queue.length && out.length < limit) {
      queue.sort((a, b) => b.committer.time - a.committer.time);
      const c = queue.shift()!;
      const parents: GitCommit[] = [];
      for (const p of c.parents) {
        try {
          parents.push(await this.readCommit(p));
        } catch {
          // a shallow clone: the history stops here
        }
      }
      for (const p of parents) if (!seen.has(p.id)) { seen.add(p.id); queue.push(p); }
      if (!options.path) { out.push(c); continue; }
      const mine = (await this.entryAt(c.id, options.path))?.id ?? null;
      const theirs = await Promise.all(parents.map(async (p) => (await this.entryAt(p.id, options.path!))?.id ?? null));
      if (parents.length === 0 ? mine !== null : theirs.every((t) => t !== mine)) out.push(c);
    }
    return out;
  }

  #parent(c: GitCommit, i: number, name: string): string {
    const p = c.parents[i];
    if (!p) throw new GitError(`no commit named "${name}": ${c.id.slice(0, 7)} has ${c.parents.length} parent${c.parents.length === 1 ? '' : 's'}`);
    return p;
  }

  async #packedRefs(): Promise<Map<string, string>> {
    if (this.#packed) return this.#packed;
    const map = new Map<string, string>();
    const f = await this.#dir.file('packed-refs');
    if (f) {
      for (const line of decoder.decode(await f.read(0, f.size)).split('\n')) {
        const m = line.match(/^([0-9a-f]{40}) (\S+)$/);
        if (m) map.set(m[2]!, m[1]!);
      }
    }
    return (this.#packed = map);
  }
}

const noPerson: GitPerson = { name: '', email: '', time: 0, zone: '+0000' };

function person(value: string): GitPerson {
  const m = value.match(/^(.*) <(.*)> (\d+) ([+-]\d{4})$/);
  return m ? { name: m[1]!, email: m[2]!, time: Number(m[3]), zone: m[4]! } : noPerson;
}

function bisect<T>(sorted: T[], value: T): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = sorted[mid]!;
    if (v === value) return mid;
    if (v < value) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** Opens a repository from its `.git` folder. A `.git` that is a file (a worktree's) isn't read. */
export async function openRepository(dir: GitDir): Promise<Repository> {
  if (!(await dir.file('HEAD'))) throw new GitError('no HEAD here: pick the repository folder that holds .git, not a worktree');
  const packs: Pack[] = [];
  for (const n of (await dir.list('objects/pack')) ?? []) {
    if (!n.endsWith('.idx')) continue;
    const p = await readPackIndex(dir, n.slice(0, -4));
    if (p) packs.push(p);
  }
  return new Repository(dir, packs);
}

/** One step of a line diff: a line kept, removed (from `a`) or added (from `b`). */
export interface DiffLine {
  op: 'keep' | 'remove' | 'add';
  text: string;
}

/** A line diff of two texts (Myers' algorithm): the fewest lines removed and added to turn `a` into `b`. */
export function diffLines(a: string, b: string): DiffLine[] {
  const x = a === '' ? [] : a.split('\n');
  const y = b === '' ? [] : b.split('\n');
  const n = x.length;
  const m = y.length;
  const max = n + m;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let i = k === -d || (k !== d && v[max + k - 1]! < v[max + k + 1]!) ? v[max + k + 1]! : v[max + k - 1]! + 1;
      let j = i - k;
      while (i < n && j < m && x[i] === y[j]) { i++; j++; }
      v[max + k] = i;
      if (i >= n && j >= m) break outer;
    }
  }
  const out: DiffLine[] = [];
  let i = n;
  let j = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d]!;
    const k = i - j;
    const prevK = k === -d || (k !== d && vd[max + k - 1]! < vd[max + k + 1]!) ? k + 1 : k - 1;
    const pi = vd[max + prevK]!;
    const pj = pi - prevK;
    while (i > pi && j > pj) out.push({ op: 'keep', text: x[--i]! }), j--;
    if (d > 0) {
      if (i === pi) out.push({ op: 'add', text: y[--j]! });
      else out.push({ op: 'remove', text: x[--i]! });
    }
  }
  return out.reverse();
}
