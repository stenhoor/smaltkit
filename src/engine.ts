// Loads the smaltdb client at run time and decides where its engine worker comes from, and lists the databases
// smaltdb keeps in this origin's private storage (OPFS).
//
// An app picks the engine with a spec, usually from the page's `?engine=` parameter:
//
//   vendor (default)     the app's own copy, e.g. vendor/smaltdb/ copied from the npm package by `npm install`
//   https://…/dist/      any folder that serves smaltdb.js and smaltdb-worker.js
//
// The client is imported dynamically, not bundled, so a page can switch engines without a rebuild. Engines are never
// loaded from a CDN: the specs `npm` and `npm@<version>`, which loaded smaltdb from jsDelivr, are refused, and a
// missing vendor copy is an error that says how to build it. A worker script must be same-origin, so a cross-origin
// engine is started through a small blob module that imports it.
//
// From smaltdb 0.9, optional features (external tables, CSV/JSON import, Parquet) are plugins that the app builds into
// its own worker entry. An app that does that puts its worker in the vendor folder as smaltdb-worker.js (or names it
// with `workerFile`); an engine loaded from another folder's URL runs that folder's worker.

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
  /** The spec the engine was loaded from. */
  spec: string;
  /** A short description for the UI, such as "bundled smaltdb" or the engine folder's URL. */
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
   * @deprecated Ignored. Engines are no longer loaded from a CDN, so `npm` specs are always refused and a missing
   * vendor copy is always an error. Kept so that apps passing `npm: false` still compile.
   */
  npm?: boolean;
}

function pageUrl(): string {
  return typeof document !== 'undefined' ? document.baseURI : location.href;
}

/**
 * Where an engine spec loads from. Pure: no network, no globals beyond URL.
 * @param spec `vendor` (or `''`), or a folder's URL.
 * @param vendorUrl The app's vendor copy, for `vendor`.
 * @param baseUrl What relative URLs resolve against.
 * @returns The folder the client and worker load from (ending in `/`), and a label for the UI.
 * @throws Error for `npm` and `npm@<version>`: engines are not loaded from a CDN.
 */
export function resolveEngine(spec: string, vendorUrl: string | URL, baseUrl: string | URL): EngineLocation {
  const folder = (u: string | URL) => {
    const href = new URL(u, baseUrl).href;
    return href.endsWith('/') ? href : href + '/';
  };
  if (!spec || spec === 'vendor') return { base: folder(vendorUrl), label: 'bundled smaltdb' };
  if (spec === 'npm' || spec.startsWith('npm@')) {
    throw new Error(`the engine "${spec}" is not available: engines are not loaded from a CDN; use the app's bundled engine or an engine folder's URL`);
  }
  const base = folder(spec);
  return { base, label: base };
}

/**
 * The engine spec for this page: `?engine=` if present, else the one saved under `storageKey` (see setEngineSpec),
 * else 'vendor'.
 * @param storageKey The localStorage key a choice is kept under, or none.
 * @param search The page's query string. Default: the page's own.
 * @returns The spec. Storage that can't be read (private mode) counts as nothing saved.
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

/**
 * Remember an engine spec for later page loads ('vendor' or '' clears it). Where storage is blocked, nothing is kept.
 * @param storageKey The localStorage key, as engineSpec reads it.
 * @param spec The spec to keep.
 */
export function setEngineSpec(storageKey: string, spec: string): void {
  try {
    if (!spec || spec === 'vendor') localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, spec);
  } catch {
    // Storage is blocked (private mode, sandboxed frame): the choice lasts for this page only.
  }
}

/**
 * Import the smaltdb client for `spec` and prepare its worker.
 * @param spec The engine spec, from engineSpec.
 * @param options The app's vendor folder, what relative URLs resolve against, the worker's file name, and the app's
 *   name for console messages.
 * @returns The engine: its spec, label and version, and `open()` for databases.
 * @throws Error when the engine can't be imported; for an `npm` spec or a missing vendor copy, saying what to do.
 */
export async function loadEngine(spec: string, options: LoadEngineOptions): Promise<Engine> {
  const baseUrl = options.baseUrl ?? pageUrl();
  const workerFile = options.workerFile ?? 'smaltdb-worker.js';
  const { base, label } = resolveEngine(spec, options.vendorUrl, baseUrl);
  let mod: SmaltdbModule;
  try {
    mod = await import(/* @vite-ignore */ base + 'smaltdb.js');
  } catch (e) {
    if (spec && spec !== 'vendor') throw e;
    throw new Error(`the vendor copy of the engine is missing at ${base} (build it with \`npm install\`)`, { cause: e });
  }
  // A vendor folder or a custom URL may hold the app's own worker entry.
  let workerUrl = base + workerFile;
  if (new URL(workerUrl).origin !== new URL(pageUrl()).origin) {
    workerUrl = URL.createObjectURL(new Blob([`import ${JSON.stringify(workerUrl)};`], { type: 'text/javascript' }));
  }
  return { spec: spec || 'vendor', label, version: await engineVersion(spec, base), workerUrl, module: mod, open: (name, o = {}) => mod.open(name, { ...o, worker: workerUrl }) };
}

/** VERSION.json in a vendor folder. A custom URL is not probed. */
async function engineVersion(spec: string, base: string): Promise<EngineVersion | null> {
  try {
    if (!spec || spec === 'vendor') {
      const r = await fetch(base + 'VERSION.json', { cache: 'no-cache' });
      if (r.ok) return (await r.json()) as EngineVersion;
    }
  } catch {
    // Offline, or the file is not served: the version is unknown.
  }
  return null;
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

/**
 * Whether this page can use OPFS (it needs a secure context).
 * @returns True where databases can be stored in OPFS.
 */
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

/**
 * The databases smaltdb has stored in this origin's OPFS, sorted by name.
 * @returns Each database's name, its size (with its write-ahead log) and when it last changed; size and time are null
 *   while another tab holds the file open. Empty where OPFS isn't available.
 */
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

/**
 * Delete a database and its side files. It must not be open in any tab.
 * @param name The database's name, as listOpfsDatabases gives it.
 * @throws The browser's error when a file is open elsewhere (the promise rejects).
 */
export async function deleteOpfsDatabase(name: string): Promise<void> {
  const dir = await opfsDir();
  if (!dir) return;
  const file = name + '.db';
  const names: string[] = [];
  for await (const [n] of entries(dir)) if (n === file || n.startsWith(file + '-')) names.push(n);
  for (const n of names) await dir.removeEntry(n);
}
