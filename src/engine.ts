// Loads the smaltdb client at run time and decides where its engine worker comes from, and lists the databases
// smaltdb keeps in this origin's private storage (OPFS).
//
// An app picks the engine with a spec, usually from the page's `?engine=` parameter:
//
//   vendor (default)     the app's own copy, e.g. vendor/smaltdb/ copied from the npm package by `npm install`
//   npm                  the latest smaltdb on npm, from jsDelivr
//   npm@0.8.3            a specific npm version, from jsDelivr
//   https://…/dist/      any folder that serves smaltdb.js and smaltdb-worker.js
//
// The client is imported dynamically, not bundled, so a page can switch engines without a rebuild. If the vendor copy
// is missing (the folder is served without `npm install`), the latest npm release is loaded instead. A worker script
// must be same-origin, so a cross-origin engine is started through a small blob module that imports it.
//
// From smaltdb 0.9, optional features (external tables, CSV/JSON import, Parquet) are plugins that the app builds into
// its own worker entry. An app that does that puts its worker in the vendor folder as smaltdb-worker.js (or names it
// with `workerFile`); engines loaded from npm or a URL run the stock worker, without the app's plugins.

import type * as Smaltdb from 'smaltdb';

/** The smaltdb client module, as loaded at run time. */
export type SmaltdbModule = typeof Smaltdb;
export type Database = Smaltdb.Database;
export type OpenOptions = Smaltdb.OpenOptions;

/** What the loaded engine says about its version: VERSION.json in the vendor folder, or the npm package. */
export interface EngineVersion {
  /** 'npm' for a published package, 'checkout' for a build of a local smaltdb checkout. */
  source: string;
  version?: string;
  commit?: string | null;
  path?: string;
}

export interface Engine {
  /** The spec the engine was loaded from; 'npm' when a missing vendor copy fell back to npm. */
  spec: string;
  /** A short description for the UI, such as "bundled smaltdb" or "smaltdb@0.8.3 (npm)". */
  label: string;
  version: EngineVersion | null;
  /** The worker script open() starts: the engine's own URL, or a blob: URL for a cross-origin engine. */
  workerUrl: string;
  module: SmaltdbModule;
  /** Open a database with this engine's worker. */
  open(name: string, options?: Omit<OpenOptions, 'worker'>): Promise<Database>;
}

export interface EngineLocation {
  /** The folder the client (smaltdb.js) and worker are loaded from, ending in '/'. */
  base: string;
  label: string;
}

export interface LoadEngineOptions {
  /** The app's vendor copy of smaltdb, used for the 'vendor' spec. Relative URLs resolve against `baseUrl`. */
  vendorUrl: string | URL;
  /** What relative URLs (vendorUrl, a custom engine folder) resolve against. Default: the page (document.baseURI). */
  baseUrl?: string | URL;
  /** The worker's file name in the engine folder. Default: smaltdb-worker.js. */
  workerFile?: string;
  /** The app's name, used in console messages. */
  appName?: string;
  /**
   * Whether npm engines are offered: `?engine=npm`, and loading from jsDelivr when the vendor copy is missing.
   * Default true. Set false when the app's engine is built from packages npm does not have (smaltdb 0.9 with smaltql
   * and plugins): an npm spec is then refused, and a missing vendor copy is an error naming the fix.
   */
  npm?: boolean;
}

const CDN = 'https://cdn.jsdelivr.net/npm/smaltdb@';

function pageUrl(): string {
  return typeof document !== 'undefined' ? document.baseURI : location.href;
}

/** Where an engine spec loads from. Pure: no network, no globals beyond URL. */
export function resolveEngine(spec: string, vendorUrl: string | URL, baseUrl: string | URL): EngineLocation {
  const folder = (u: string | URL) => {
    const href = new URL(u, baseUrl).href;
    return href.endsWith('/') ? href : href + '/';
  };
  if (!spec || spec === 'vendor') return { base: folder(vendorUrl), label: 'bundled smaltdb' };
  if (spec === 'npm' || spec.startsWith('npm@')) {
    const version = spec === 'npm' ? 'latest' : spec.slice(4);
    return { base: `${CDN}${version}/dist/`, label: `smaltdb@${version} (npm)` };
  }
  const base = folder(spec);
  return { base, label: base };
}

/**
 * The engine spec for this page: `?engine=` if present, else the one saved under `storageKey` (see setEngineSpec),
 * else 'vendor'.
 */
export function engineSpec(storageKey?: string, search: string = typeof location !== 'undefined' ? location.search : ''): string {
  const fromUrl = new URLSearchParams(search).get('engine');
  if (fromUrl) return fromUrl;
  if (!storageKey) return 'vendor';
  try {
    return localStorage.getItem(storageKey) || 'vendor';
  } catch {
    return 'vendor';
  }
}

/** Remember an engine spec for later page loads ('vendor' or '' clears it). */
export function setEngineSpec(storageKey: string, spec: string): void {
  try {
    if (!spec || spec === 'vendor') localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, spec);
  } catch {
    // Storage is blocked (private mode, sandboxed frame): the choice lasts for this page only.
  }
}

/** Import the smaltdb client for `spec` and prepare its worker. */
export async function loadEngine(spec: string, options: LoadEngineOptions): Promise<Engine> {
  const baseUrl = options.baseUrl ?? pageUrl();
  const workerFile = options.workerFile ?? 'smaltdb-worker.js';
  const npmAllowed = options.npm ?? true;
  if (!npmAllowed && spec.startsWith('npm')) throw new Error(`the engine "${spec}" is not available: npm does not have this app's engine (smaltdb with its language and plugins)`);
  let { base, label } = resolveEngine(spec, options.vendorUrl, baseUrl);
  let mod: SmaltdbModule;
  try {
    mod = await import(/* @vite-ignore */ base + 'smaltdb.js');
  } catch (e) {
    if (spec && spec !== 'vendor') throw e;
    if (!npmAllowed) throw new Error(`the vendor copy of the engine is missing at ${base} (build it with \`npm install\`)`, { cause: e });
    console.warn(`${options.appName ?? 'smaltdb'}: the vendor copy of smaltdb is missing (run \`npm install\`); loading smaltdb@latest from jsDelivr.`, e);
    spec = 'npm';
    ({ base, label } = resolveEngine(spec, options.vendorUrl, baseUrl));
    label += ' (vendor copy missing)';
    mod = await import(/* @vite-ignore */ base + 'smaltdb.js');
  }
  // The npm worker is always the stock one; a vendor folder or a custom URL may hold the app's own worker entry.
  let workerUrl = base + (spec.startsWith('npm') ? 'smaltdb-worker.js' : workerFile);
  if (new URL(workerUrl).origin !== new URL(pageUrl()).origin) {
    workerUrl = URL.createObjectURL(new Blob([`import ${JSON.stringify(workerUrl)};`], { type: 'text/javascript' }));
  }
  return { spec: spec || 'vendor', label, version: await engineVersion(spec, base), workerUrl, module: mod, open: (name, o = {}) => mod.open(name, { ...o, worker: workerUrl }) };
}

/** VERSION.json in a vendor folder, or package.json beside an npm dist/ folder. A custom URL is not probed. */
async function engineVersion(spec: string, base: string): Promise<EngineVersion | null> {
  const npm = spec.startsWith('npm');
  try {
    if (!spec || spec === 'vendor') {
      const r = await fetch(base + 'VERSION.json', { cache: 'no-cache' });
      if (r.ok) return (await r.json()) as EngineVersion;
    } else if (npm) {
      const r = await fetch(base + '../package.json');
      if (r.ok) return { source: 'npm', version: ((await r.json()) as { version: string }).version };
    }
  } catch {
    // Offline, or the file is not served: the version is unknown.
  }
  return npm ? { source: 'npm', version: spec.slice(4) || 'latest' } : null;
}

// ---------------------------------------------------------------- OPFS catalog

/** smaltdb keeps OPFS databases in this directory, as <name>.db plus -wal and other side files. */
const OPFS_DIR = 'smaltdb';

export interface OpfsDatabase {
  name: string;
  /** Bytes, including the write-ahead log; null while another tab holds the file open. */
  size: number | null;
  /** Last modified, ms since the epoch; null while another tab holds the file open. */
  modified: number | null;
}

/** Whether this page can use OPFS (it needs a secure context). */
export function opfsAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory && typeof isSecureContext !== 'undefined' && isSecureContext;
}

async function opfsDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!opfsAvailable()) return null;
  try {
    return await (await navigator.storage.getDirectory()).getDirectoryHandle(OPFS_DIR);
  } catch {
    return null; // No database has been created in this origin yet.
  }
}

async function* entries(dir: FileSystemDirectoryHandle): AsyncGenerator<[string, FileSystemHandle]> {
  // entries() is in every browser with OPFS but missing from some TypeScript DOM library versions.
  yield* (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries();
}

/** The databases smaltdb has stored in this origin's OPFS, sorted by name. */
export async function listOpfsDatabases(): Promise<OpfsDatabase[]> {
  const dir = await opfsDir();
  if (!dir) return [];
  const files = new Map<string, FileSystemFileHandle>();
  for await (const [name, handle] of entries(dir)) if (handle.kind === 'file') files.set(name, handle as FileSystemFileHandle);
  const out: OpfsDatabase[] = [];
  for (const [name, handle] of files) {
    if (!name.endsWith('.db')) continue;
    let size: number | null = null;
    let modified: number | null = null;
    try {
      const f = await handle.getFile();
      size = f.size;
      modified = f.lastModified;
      const wal = files.get(name + '-wal');
      if (wal) size += (await wal.getFile()).size;
    } catch {
      // Locked by an open sync access handle in another tab or worker.
    }
    out.push({ name: name.slice(0, -3), size, modified });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Delete a database and its side files. It must not be open in any tab. */
export async function deleteOpfsDatabase(name: string): Promise<void> {
  const dir = await opfsDir();
  if (!dir) return;
  const file = name + '.db';
  const names: string[] = [];
  for await (const [n] of entries(dir)) if (n === file || n.startsWith(file + '-')) names.push(n);
  for (const n of names) await dir.removeEntry(n);
}
