// Browser test for the WebGPU graph view (smaltkit/graph): serves the built package (dist/) and a test
// page over http://localhost (WebGPU needs a secure context) and drives it with Playwright in
// Chromium with WebGPU enabled (SwiftShader when headless without a GPU).
//
//   npm run build && node test/browser/graph.mjs [--shots <dir>] [--headed] [--skip-10k] [--quick]
//
// --quick lays out 300 nodes instead of 2,000 and skips the 10k run: the same checks in a fraction of the time.
//
// Fails on any GPU validation error, device loss, page error or console error.
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { inflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const QUICK = flag('--quick');
const N = QUICK ? 300 : 2000;
const E = QUICK ? 600 : 4000;
// The layout's cooling: quick mode settles in 100 ticks instead of the default 300.
const TICKS = QUICK ? 100 : undefined;
// A search that matches City nodes at either size (makeGraph labels them `City <index>`).
const SEARCH = QUICK ? 'city 9' : 'city 6';
const shots = resolve(opt('--shots', process.env.RENDER_SHOTS ?? join(tmpdir(), 'smaltkit-graph-shots')));

let failures = 0;
function check(cond, msg) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    failures++;
    console.log(`  FAIL ${msg}`);
  }
}

// Decode an 8-bit RGB(A) PNG (what Playwright's screenshots are) into { width, height, rgba }.
function decodePng(buf) {
  let o = 8, width = 0, height = 0, type = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), kind = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      type = data[9];
    } else if (kind === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let p;
      if (f === 0) p = 0;
      else if (f === 1) p = a;
      else if (f === 2) p = b;
      else if (f === 3) p = (a + b) >> 1;
      else {
        const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = (v + p) & 255;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = px[i * bpp];
    rgba[i * 4 + 1] = px[i * bpp + 1];
    rgba[i * 4 + 2] = px[i * bpp + 2];
    rgba[i * 4 + 3] = bpp === 4 ? px[i * bpp + 3] : 255;
  }
  return { width, height, rgba };
}

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>render test</title>
<style>
  html, body { margin: 0; background: #F5F6F8; }
  body.dark { background: #14171F; }
  canvas { display: block; width: 900px; height: 600px; margin: 20px; }
</style></head>
<body><canvas id="c"></canvas>
<script type="module">
  window.__errors = [];
  const origRequestDevice = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (...args) {
    const device = await origRequestDevice.apply(this, args);
    device.addEventListener('uncapturederror', (e) => window.__errors.push('GPU error: ' + e.error.message));
    device.lost.then((info) => { if (info.reason !== 'destroyed') window.__errors.push('device lost: ' + info.message); });
    window.__device = device;
    return device;
  };
  window.R = await import('./dist/graph.js');
  window.__ready = true;
</script></body></html>`;


/** Serves the built package (dist/) at /dist/, and the test page at /. */
function serveDist(page, extra) {
  return http.createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.startsWith('/dist/') && !path.includes('..')) {
      try {
        const body = await readFile(join(root, path));
        res.setHeader('content-type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'application/octet-stream');
        res.end(body);
      } catch {
        res.statusCode = 404;
        res.end();
      }
    } else if (extra && (await extra(req, res))) {
      // served
    } else {
      res.setHeader('content-type', 'text/html');
      res.end(page);
    }
  });
}

/** The files a built module loads, following its relative imports. */
async function importGraph(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const text = await readFile(file, 'utf8');
  for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]/g)) await importGraph(join(dirname(file), m[1]), seen);
  return seen;
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'smaltkit-graph-'));
  await mkdir(shots, { recursive: true });
  // The graph view is its own piece: it loads nothing from the rest of the kit.
  const outside = [...(await importGraph(join(root, 'dist/graph.js')))].filter((f) => !f.includes('/dist/graph'));
  check(outside.length === 0, `the graph view loads only dist/graph* (${outside.join(', ') || 'nothing else'})`);
  const server = serveDist(PAGE);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://localhost:${server.address().port}/`;

  // --enable-unsafe-webgpu alone runs compute, but presenting a WebGPU canvas then loses the device
  // in headless Chromium without a GPU (the compositor cannot share SwiftShader GL images with
  // Dawn). Running both on Vulkan SwiftShader makes canvas presentation work.
  const browser = await chromium.launch({
    headless: !flag('--headed'),
    args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 940, height: 640 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console error: ${m.text()}`);
    });
    await page.goto(url);
    await page.waitForFunction(() => window.__ready === true);

    const info = await page.evaluate(async () => {
      const a = await navigator.gpu.requestAdapter();
      return { available: await window.R.isWebGpuAvailable(), arch: a?.info?.architecture ?? '', vendor: a?.info?.vendor ?? '' };
    });
    console.log(`WebGPU adapter: ${info.vendor} ${info.arch}`);
    check(info.available, 'isWebGpuAvailable() is true');

    // Helpers inside the page.
    await page.evaluate(() => {
      // Deterministic graph with communities: groups of nodes with dense in-group edges and a few
      // cross-group edges.
      window.makeGraph = (n, m, groups = 8, seed = 1) => {
        let s = seed >>> 0;
        const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
        const names = ['Person', 'Company', 'City', 'Product', 'Tag', 'Event', 'Repo', 'Topic'];
        const block = Math.ceil(n / groups);
        const nodes = [];
        for (let i = 0; i < n; i++) {
          const g = Math.floor(i / block) % names.length;
          nodes.push({ id: `n${i}`, label: `${names[g]} ${i}`, group: names[g], size: i % 97 === 0 ? 3 : 1 });
        }
        const edges = [];
        for (let k = 0; k < m; k++) {
          const a = Math.floor(rnd() * n);
          let b;
          if (rnd() < 0.95) {
            // Mostly within the community (a contiguous block of indices).
            const g = Math.floor(a / block);
            b = Math.min(n - 1, g * block + Math.floor(rnd() * block));
          } else b = Math.floor(rnd() * n);
          if (a !== b) edges.push({ source: a, target: b });
        }
        return { nodes, edges };
      };
      // Every node's projected position lies inside the canvas.
      window.framed = async (view, n) => {
        await view.sync();
        const c = document.getElementById('c').getBoundingClientRect();
        let inside = 0;
        for (let i = 0; i < n; i++) {
          const p = view.screenPosition(i);
          if (p && p.x >= 0 && p.y >= 0 && p.x <= c.width && p.y <= c.height) inside++;
        }
        return inside / n;
      };
      window.waitFrames = (k) => new Promise((r) => { const f = () => (k-- <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      window.settle = async (view, maxMs) => {
        const t0 = performance.now();
        let maxFps = 0;
        while (view.layout.running && performance.now() - t0 < maxMs) {
          await window.waitFrames(10);
          maxFps = Math.max(maxFps, view.stats().fps);
        }
        return { ms: performance.now() - t0, settled: !view.layout.running, stats: view.stats(), maxFps };
      };
    });

    // ---- 2k nodes, 2D -------------------------------------------------------------------------
    console.log(`2D, ${N.toLocaleString()} nodes / ${E.toLocaleString()} edges`);
    await page.evaluate(([n, e, t, q]) => Object.assign(window, { __N: n, __E: e, __TICKS: t, __SEARCH: q }), [N, E, TICKS, SEARCH]);
    const r2 = await page.evaluate(async () => {
      const canvas = document.getElementById('c');
      const view = await window.R.createGraphView(canvas, { mode: '2d', theme: 'light', layoutTicks: window.__TICKS });
      window.view = view;
      const g = window.makeGraph(window.__N, window.__E);
      window.graph = g;
      view.setGraph(g);
      const before = await view.positions();
      const run = await window.settle(view, 90000);
      const pos = await view.positions();
      const n = g.nodes.length;
      let finite = true, maxAbs = 0, moved = 0;
      for (let i = 0; i < pos.length; i++) {
        if (!Number.isFinite(pos[i])) finite = false;
        maxAbs = Math.max(maxAbs, Math.abs(pos[i]));
        moved += Math.abs(pos[i] - before[i]);
      }
      const d = (a, b) => Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
      let linked = 0;
      for (const e of g.edges) linked += d(e.source, e.target);
      linked /= g.edges.length;
      let random = 0;
      let s = 7;
      const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
      for (let k = 0; k < 4000; k++) random += d(Math.floor(rnd() * n), Math.floor(rnd() * n));
      random /= 4000;
      let zMax = 0;
      for (let i = 0; i < n; i++) zMax = Math.max(zMax, Math.abs(pos[i * 3 + 2]));
      return { run, finite, maxAbs, moved: moved / pos.length, linked, random, zMax, n: pos.length / 3 };
    });
    console.log(`  layout: ${r2.run.settled ? 'settled' : 'not settled'} after ${(r2.run.ms / 1000).toFixed(1)} s; ${r2.run.stats.layoutMsPerTick.toFixed(2)} ms/tick; max fps ${r2.run.maxFps}`);
    console.log(`  mean edge length ${r2.linked.toFixed(1)} vs random pair ${r2.random.toFixed(1)}; extent ${r2.maxAbs.toFixed(0)}`);
    check(r2.n === N, 'positions() returns xyz for every node');
    check(r2.finite, 'positions are finite');
    check(r2.maxAbs > 100 && r2.moved > 1, 'positions spread out and moved from the seed');
    check(r2.linked < r2.random * 0.5, 'connected nodes end closer than random pairs');
    check(r2.zMax === 0, 'z stays 0 in 2D');
    check(r2.run.settled, 'layout cools to rest and stops');

    const framed2d = await page.evaluate(async () => {
      window.view.fit();
      await window.waitFrames(30);
      return window.framed(window.view, window.__N);
    });
    check(framed2d === 1, `fit() frames every node in 2D (${(framed2d * 100).toFixed(1)}%)`);
    await page.locator('canvas').screenshot({ path: join(shots, 'render-2d-light.png') });

    // Picking: GPU pick at a node's projected position, and hover through real mouse events.
    const pick = await page.evaluate(async () => {
      const view = window.view;
      await view.sync();
      const results = [];
      for (const i of [0, 0.05, 0.25, 0.62, 1].map((f) => Math.round(f * (window.__N - 1)))) {
        const p = view.screenPosition(i);
        const hit = await view.pick(p.x, p.y);
        let near = false;
        if (hit && hit.kind === 'node') {
          const q = view.screenPosition(hit.index);
          near = Math.hypot(q.x - p.x, q.y - p.y) < 12;
        }
        results.push({ i, p, hit, near });
      }
      const empty = await view.pick(2, 2);
      return { results, empty };
    });
    for (const r of pick.results) {
      check(r.hit?.kind === 'node' && (r.hit.index === r.i || r.near), `pick at node ${r.i} → ${JSON.stringify(r.hit)}`);
    }
    check(pick.empty === null || pick.empty.kind !== 'node', 'pick in an empty corner finds no node');

    const box = await page.locator('canvas').boundingBox();
    const target = pick.results[1];
    await page.evaluate(() => {
      window.__hover = [];
      window.view.onHover((h) => window.__hover.push(h));
      window.__clicks = [];
      window.view.onClick((h) => window.__clicks.push(h));
    });
    await page.mouse.move(box.x + target.p.x + 30, box.y + target.p.y + 30);
    await page.mouse.move(box.x + target.p.x, box.y + target.p.y, { steps: 3 });
    await page.waitForFunction(() => window.__hover.some((h) => h && h.kind === 'node'), null, { timeout: 10000 });
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(() => window.__clicks.length > 0, null, { timeout: 10000 });
    const hov = await page.evaluate(() => ({ hover: window.__hover.filter(Boolean).pop(), click: window.__clicks[0] }));
    check(hov.hover?.kind === 'node', `hover reports a node (${JSON.stringify(hov.hover)})`);
    check(hov.click?.kind === 'node', `click reports a node (${JSON.stringify(hov.click)})`);
    await page.locator('canvas').screenshot({ path: join(shots, 'render-2d-hover.png') });

    // Search + highlight, zoomed in.
    const found = await page.evaluate(async () => {
      const idx = window.view.search(window.__SEARCH);
      window.view.focus(idx[0]);
      await window.waitFrames(40);
      return idx.length;
    });
    check(found > 0, `search("${SEARCH}") matches ${found} nodes`);
    await page.locator('canvas').screenshot({ path: join(shots, 'render-2d-search.png') });

    // Dark theme.
    await page.evaluate(async () => {
      window.view.search('');
      document.body.classList.add('dark');
      window.view.setTheme('dark');
      window.view.fit();
      await window.waitFrames(40);
    });
    await page.locator('canvas').screenshot({ path: join(shots, 'render-2d-dark.png') });

    // ---- 3D -----------------------------------------------------------------------------------
    console.log('3D, same graph');
    const r3 = await page.evaluate(async () => {
      const view = window.view;
      view.setMode('3d');
      await window.waitFrames(5);
      const run = await window.settle(view, 90000);
      view.fit();
      await window.waitFrames(40);
      const pos = await view.positions();
      let zMax = 0, finite = true;
      for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) finite = false;
      for (let i = 0; i < pos.length / 3; i++) zMax = Math.max(zMax, Math.abs(pos[i * 3 + 2]));
      await view.sync();
      const p = view.screenPosition(42);
      const hit = p ? await view.pick(p.x, p.y) : null;
      const framed = await window.framed(view, window.__N);
      return { run, zMax, finite, hit, framed };
    });
    check(r3.framed === 1, `fit() frames every node in 3D (${(r3.framed * 100).toFixed(1)}%)`);
    console.log(`  layout: ${r3.run.settled ? 'settled' : 'not settled'} after ${(r3.run.ms / 1000).toFixed(1)} s; ${r3.run.stats.layoutMsPerTick.toFixed(2)} ms/tick`);
    check(r3.finite && r3.zMax > 10, `3D layout uses z (max |z| ${r3.zMax.toFixed(0)})`);
    check(r3.hit?.kind === 'node', `3D pick finds a node (${JSON.stringify(r3.hit)})`);
    await page.locator('canvas').screenshot({ path: join(shots, 'render-3d-dark.png') });
    await page.evaluate(async () => {
      document.body.classList.remove('dark');
      window.view.setTheme('light');
      await window.waitFrames(5);
    });
    await page.locator('canvas').screenshot({ path: join(shots, 'render-3d-light.png') });

    // Orbit with the mouse, then back to 2D.
    await page.mouse.move(box.x + 8, box.y + 8);
    await page.evaluate(() => window.waitFrames(5));
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 60, { steps: 8 });
    await page.mouse.up();
    await page.evaluate(() => window.waitFrames(5));
    await page.locator('canvas').screenshot({ path: join(shots, 'render-3d-orbit.png') });

    // Panning: two fingers, Shift-drag, Space-drag and the arrow keys move the camera; a pinch zooms.
    const screenOf = (i) => page.evaluate(async (i) => {
      await window.waitFrames(3);
      return window.view.screenPosition(i);
    }, i);
    const touch = (type, id, x, y) =>
      page.evaluate(([type, id, x, y]) => {
        const c = document.querySelector('canvas');
        const r = c.getBoundingClientRect();
        c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: r.left + x, clientY: r.top + y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
      }, [type, id, x, y]);
    const twoFingers = async (from, to) => {
      await touch('pointerdown', 1, from[0], from[1]);
      await touch('pointerdown', 2, from[2], from[3]);
      for (let k = 1; k <= 6; k++) {
        const t = k / 6;
        const at = from.map((v, j) => v + (to[j] - v) * t);
        await touch('pointermove', 1, at[0], at[1]);
        await touch('pointermove', 2, at[2], at[3]);
      }
      await touch('pointerup', 1, to[0], to[1]);
      await touch('pointerup', 2, to[2], to[3]);
    };
    const moved = async (label, act, expect) => {
      const a0 = await screenOf(0), b0 = await screenOf(1);
      await act();
      const a1 = await screenOf(0), b1 = await screenOf(1);
      const dx = a1.x - a0.x, dy = a1.y - a0.y;
      const spread = Math.hypot(b1.x - a1.x, b1.y - a1.y) / Math.max(1e-6, Math.hypot(b0.x - a0.x, b0.y - a0.y));
      check(expect({ dx, dy, spread }), `${label} (moved ${dx.toFixed(0)}, ${dy.toFixed(0)} px; scale ×${spread.toFixed(2)})`);
    };
    const panned = (ex, ey) => ({ dx, dy, spread }) => Math.abs(spread - 1) < 0.05 && Math.sign(dx) === Math.sign(ex) && Math.sign(dy) === Math.sign(ey) && Math.abs(dx) > Math.abs(ex) * 0.4 && Math.abs(dy) > Math.abs(ey) * 0.4;
    for (const mode of ['3d', '2d']) {
      await page.evaluate(async (m) => {
        window.view.setMode(m);
        window.view.layout.stop();
        window.view.fit();
        await window.waitFrames(40);
      }, mode);
      await moved(`${mode}: two fingers pan`, () => twoFingers([300, 300, 400, 300], [360, 340, 460, 340]), panned(60, 40));
      await moved(`${mode}: two fingers pinch to zoom`, () => twoFingers([330, 300, 370, 300], [280, 300, 420, 300]), ({ spread }) => spread > 1.5);
      await moved(`${mode}: Shift-drag pans`, async () => {
        await page.keyboard.down('Shift');
        await page.mouse.move(box.x + 12, box.y + 12);
        await page.mouse.down();
        await page.mouse.move(box.x + 72, box.y + 52, { steps: 6 });
        await page.mouse.up();
        await page.keyboard.up('Shift');
      }, panned(60, 40));
      await moved(`${mode}: Space-drag pans`, async () => {
        await page.mouse.move(box.x + 12, box.y + 12);
        await page.keyboard.down('Space');
        await page.mouse.down();
        await page.mouse.move(box.x - 48 + 12, box.y + 12 + 30, { steps: 6 });
        await page.mouse.up();
        await page.keyboard.up('Space');
      }, panned(-60, 30));
      await moved(`${mode}: arrow keys pan`, async () => {
        await page.locator('canvas').focus();
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowUp');
      }, panned(40, 40));
      await moved(`${mode}: + zooms in`, async () => {
        await page.locator('canvas').focus();
        await page.keyboard.press('+');
      }, ({ spread }) => spread > 1.1);
    }
    await page.evaluate(async () => {
      window.view.setMode('3d');
      await window.waitFrames(5);
    });
    const back = await page.evaluate(async () => {
      window.view.setMode('2d');
      await window.waitFrames(5);
      await window.settle(window.view, 60000);
      const pos = await window.view.positions();
      let zMax = 0;
      for (let i = 0; i < pos.length / 3; i++) zMax = Math.max(zMax, Math.abs(pos[i * 3 + 2]));
      return zMax;
    });
    check(back === 0, 'back in 2D, z is flattened');

    // ---- small graph: labels and arrows -------------------------------------------------------
    await page.evaluate(async () => {
      const groups = ['Person', 'Company', 'City'];
      const nodes = [];
      for (let i = 0; i < 36; i++) nodes.push({ id: i, label: ['Ada', 'Grace', 'Alan', 'Edsger', 'Barbara', 'Ken', 'Dennis', 'Margaret', 'Linus', 'Guido', 'Brendan', 'Anders'][i % 12] + (i >= 12 ? ` ${Math.floor(i / 12)}` : ''), group: groups[i % 3], size: i === 0 ? 2.5 : 1 });
      const edges = [];
      for (let i = 1; i < 36; i++) edges.push({ source: i, target: Math.floor((i - 1) / 3) });
      edges.push({ source: 5, target: 9 }, { source: 20, target: 2 });
      window.view.setGraph({ nodes, edges });
      await window.settle(window.view, 60000);
      window.view.fit();
      await window.waitFrames(40);
    });
    await page.locator('canvas').screenshot({ path: join(shots, 'render-small-2d.png') });
    await page.evaluate(async () => {
      window.view.highlight([0, 1, 2]);
      await window.waitFrames(5);
    });
    await page.locator('canvas').screenshot({ path: join(shots, 'render-small-highlight.png') });
    // Incremental result: grow the graph keeping positions.
    const keep = await page.evaluate(async () => {
      const view = window.view;
      view.highlight(null);
      const p0 = await view.positions();
      const nodes = [];
      for (let i = 0; i < 36; i++) nodes.push({ id: i, label: `n${i}` });
      for (let i = 36; i < 48; i++) nodes.push({ id: i, label: `new ${i}` });
      const edges = [];
      for (let i = 1; i < 48; i++) edges.push({ source: i, target: Math.floor((i - 1) / 3) });
      view.setGraph({ nodes, edges }, { keepPositions: true });
      // What setGraph kept, before the layout's first tick moves anything.
      view.layout.stop();
      const p1 = await view.positions();
      view.layout.start();
      let maxShift = 0;
      for (let i = 0; i < 36 * 3; i++) maxShift = Math.max(maxShift, Math.abs(p1[i] - p0[i]));
      await window.settle(view, 60000);
      return { maxShift, n: p1.length / 3 };
    });
    check(keep.n === 48 && keep.maxShift < 1e-3, `keepPositions keeps existing nodes in place (max shift ${keep.maxShift})`);

    // ---- animated transitions -----------------------------------------------------------------
    console.log('Transitions (setGraph with animate)');
    // How many pixels of the 6×6 px patch at a canvas point (a node's core) are drawn on, not page background.
    const patchInk = async (p) => {
      const png = await page.screenshot({ clip: { x: box.x + p.x - 3, y: box.y + p.y - 3, width: 6, height: 6 } });
      const { rgba } = decodePng(png);
      let ink = 0;
      for (let i = 0; i < rgba.length; i += 4) if (Math.abs(rgba[i] - 0xf5) + Math.abs(rgba[i + 1] - 0xf6) + Math.abs(rgba[i + 2] - 0xf8) > 60) ink++;
      return ink;
    };
    await page.evaluate(async () => {
      const view = window.view;
      // A tree of 48 people, as above, settled and framed; then steps of a small history.
      window.base = () => {
        const nodes = [];
        for (let i = 0; i < 48; i++) nodes.push({ id: i, label: `n${i}`, group: ['Person', 'Company', 'City'][i % 3] });
        const edges = [];
        for (let i = 1; i < 48; i++) edges.push({ source: i, target: Math.floor((i - 1) / 3) });
        return { nodes, edges };
      };
      // Mid-transition and when it is over: a fixed time after the call, waiting on frames.
      window.after = async (t0, ms) => {
        while (performance.now() - t0 < ms) await window.waitFrames(1);
      };
      view.setGraph(window.base(), { keepPositions: true });
      await window.settle(view, 60000);
      view.fit();
      await window.waitFrames(30);
      await window.settle(view, 60000);
      await view.sync();
    });
    const add = await page.evaluate(async () => {
      const view = window.view;
      const p0 = await view.positions();
      const g = window.base();
      g.nodes.push({ id: 'a1', label: 'added 1', group: 'Tag' }, { id: 'a2', label: 'added 2', group: 'Tag' });
      g.edges.push({ source: 48, target: 47 }, { source: 49, target: 30 });
      view.setGraph(g, { keepPositions: true, animate: true });
      window.__t0 = performance.now();
      await window.waitFrames(2);
      return { p0: Array.from(p0), nodes: view.stats().nodes };
    });
    check(add.nodes === 50, `added nodes count at once (${add.nodes})`);
    await page.locator('canvas').screenshot({ path: join(shots, 'render-transition-in.png') });
    const added = await page.evaluate(async (p0) => {
      const view = window.view;
      await window.after(window.__t0, 450);
      await view.sync();
      const hits = [];
      for (const i of [48, 49]) {
        const p = view.screenPosition(i);
        const hit = await view.pick(p.x, p.y);
        hits.push(hit?.kind === 'node' && hit.index === i);
      }
      const near = view.screenPosition(48), anchor = view.screenPosition(47);
      const settled = await window.settle(view, 60000);
      await view.sync();
      const p1 = await view.positions();
      // Pixels per world unit, from two nodes far apart.
      const a = view.screenPosition(0), b = view.screenPosition(40);
      const k = Math.hypot(a.x - b.x, a.y - b.y) / Math.hypot(p1[0] - p1[120], p1[1] - p1[121]);
      // Without the drift of the whole drawing (the camera follows it), how far each node moved.
      let tx = 0, ty = 0;
      for (let i = 0; i < 48; i++) {
        tx += (p1[i * 3] - p0[i * 3]) / 48;
        ty += (p1[i * 3 + 1] - p0[i * 3 + 1]) / 48;
      }
      const shifts = [];
      let anchors = 0;
      for (let i = 0; i < 48; i++) {
        const d = Math.hypot(p1[i * 3] - p0[i * 3] - tx, p1[i * 3 + 1] - p0[i * 3 + 1] - ty) * k;
        // The two nodes the new ones hang from take their springs; the rest should hold still.
        if (i === 47 || i === 30) anchors = Math.max(anchors, d);
        else shifts.push(d);
      }
      shifts.sort((x, y) => x - y);
      return { hits, settled: settled.settled, median: shifts[23], max: shifts[45], anchors, drift: Math.hypot(tx, ty) * k, startGap: Math.hypot(near.x - anchor.x, near.y - anchor.y) };
    }, add.p0);
    check(added.hits.every(Boolean), `new nodes are drawn and picked after the transition (${added.hits})`);
    check(added.startGap < 120, `a new node starts next to its neighbour (${added.startGap.toFixed(0)} px away)`);
    check(added.settled && added.median < 2 && added.max < 6, `adding 2 nodes barely moves the rest (median ${added.median.toFixed(2)} px, max ${added.max.toFixed(1)} px; their 2 neighbours ${added.anchors.toFixed(1)} px; drift ${added.drift.toFixed(1)} px)`);

    // Removal: a leaf goes; it is no longer picked at once, and gone from the drawing after the transition.
    // A key press first, so that the camera stops following the drawing's bounds (it would move the patch).
    await page.locator('canvas').focus();
    await page.keyboard.press('ArrowLeft');
    const leaf = await page.evaluate(async () => {
      await window.waitFrames(20);
      const view = window.view;
      await view.sync();
      return view.screenPosition(46);
    });
    const inkBefore = await patchInk(leaf);
    const removed = await page.evaluate(async (leaf) => {
      const view = window.view;
      const g = window.base();
      g.nodes.push({ id: 'a1', label: 'added 1', group: 'Tag' }, { id: 'a2', label: 'added 2', group: 'Tag' });
      g.edges.push({ source: 48, target: 47 }, { source: 49, target: 30 });
      // Drop node 46 (a leaf: its only edge is 46 → 15).
      g.nodes.splice(46, 1);
      g.edges = g.edges.filter((e) => e.source !== 46 && e.target !== 46).map((e) => ({ source: e.source > 46 ? e.source - 1 : e.source, target: e.target > 46 ? e.target - 1 : e.target }));
      view.setGraph(g, { keepPositions: true, animate: true });
      window.__t0 = performance.now();
      const hit = await view.pick(leaf.x, leaf.y);
      let gone = true;
      if (hit?.kind === 'node') {
        const q = view.screenPosition(hit.index);
        gone = !q || Math.hypot(q.x - leaf.x, q.y - leaf.y) > 6;
      }
      await window.waitFrames(2);
      return { gone, hit, nodes: view.stats().nodes };
    }, leaf);
    await page.locator('canvas').screenshot({ path: join(shots, 'render-transition-out.png') });
    check(removed.nodes === 49 && removed.gone, `a removed node is not picked, even while it fades (${JSON.stringify(removed.hit)})`);
    await page.evaluate(async () => {
      window.view.layout.stop();
      await window.after(window.__t0, 450);
      await window.waitFrames(3);
    });
    const inkAfter = await patchInk(leaf);
    await page.locator('canvas').screenshot({ path: join(shots, 'render-transition-out-after.png') });
    check(inkBefore >= 30 && inkAfter <= 6, `a removed node is gone from the drawing after the transition (${inkBefore} → ${inkAfter} of 36 pixels drawn)`);

    // A property change flashes a ring.
    await page.evaluate(async () => {
      const view = window.view;
      view.layout.start();
      const g = window.base();
      view.setGraph(g, { keepPositions: true, animate: true, changed: [0, 1, 2] });
      await window.waitFrames(2);
    });
    await page.locator('canvas').screenshot({ path: join(shots, 'render-transition-flash.png') });

    // Scrubbing: 30 versions in a row synchronously, then one per frame back and forth; it settles without errors.
    const scrub = await page.evaluate(async () => {
      const view = window.view;
      const version = (v) => {
        const g = window.base();
        // Version v: the base tree minus its last (v % 7) leaves, plus a chain of v new nodes.
        const drop = v % 7;
        g.nodes.length -= drop;
        g.edges = g.edges.filter((e) => e.source < g.nodes.length && e.target < g.nodes.length);
        const base = g.nodes.length;
        for (let k = 0; k < v; k++) {
          g.nodes.push({ id: `v${k}`, label: `v${k}`, group: 'Event' });
          g.edges.push({ source: base + k, target: k === 0 ? 0 : base + k - 1, label: 'NEXT' });
        }
        return g;
      };
      const t0 = performance.now();
      for (let v = 0; v < 30; v++) view.setGraph(version(v), { keepPositions: true, animate: true, changed: [v % 10] });
      const syncMs = performance.now() - t0;
      for (let v = 29; v >= 0; v--) {
        view.setGraph(version(v), { keepPositions: true, animate: true });
        await window.waitFrames(1);
      }
      for (let v = 0; v <= 12; v++) {
        view.setGraph(version(v), { keepPositions: true, animate: true });
        await window.waitFrames(1);
      }
      const run = await window.settle(view, 60000);
      window.__t0 = performance.now();
      await window.after(window.__t0, 400);
      const pos = await view.positions();
      let finite = true;
      for (const x of pos) if (!Number.isFinite(x)) finite = false;
      // Idle afterwards: no frames are drawn once the transitions and the layout are done.
      const frames0 = view.stats().fps;
      await window.after(performance.now(), 3500);
      const idleFps = view.stats().fps;
      return { syncMs, settled: run.settled, finite, nodes: view.stats().nodes, expected: version(12).nodes.length, frames0, idleFps };
    });
    check(scrub.settled && scrub.finite && scrub.nodes === scrub.expected, `scrubbing through 73 versions settles (${scrub.nodes} nodes; 30 synchronous calls in ${scrub.syncMs.toFixed(0)} ms)`);
    check(scrub.idleFps === 0, `the view goes idle after the transitions (${scrub.idleFps} fps)`);
    await page.locator('canvas').screenshot({ path: join(shots, 'render-transition-scrubbed.png') });

    // 3D and dark: the same transitions.
    const t3 = await page.evaluate(async () => {
      const view = window.view;
      document.body.classList.add('dark');
      view.setTheme('dark');
      view.setMode('3d');
      view.setGraph(window.base(), { keepPositions: true, animate: true });
      await window.settle(view, 60000);
      view.fit();
      await window.waitFrames(30);
      const g = window.base();
      for (let k = 0; k < 6; k++) {
        g.nodes.push({ id: `d${k}`, label: `new ${k}`, group: 'Tag' });
        g.edges.push({ source: 48 + k, target: k * 7 });
      }
      g.nodes.splice(40, 1);
      g.edges = g.edges.filter((e) => e.source !== 40 && e.target !== 40).map((e) => ({ source: e.source > 40 ? e.source - 1 : e.source, target: e.target > 40 ? e.target - 1 : e.target }));
      view.setGraph(g, { keepPositions: true, animate: true, changed: [0] });
      window.__t0 = performance.now();
      await window.waitFrames(2);
      return view.stats().nodes;
    });
    await page.locator('canvas').screenshot({ path: join(shots, 'render-transition-3d-dark.png') });
    const t3after = await page.evaluate(async () => {
      const view = window.view;
      await window.after(window.__t0, 450);
      await view.sync();
      const p = view.screenPosition(view.stats().nodes - 1);
      const hit = p ? await view.pick(p.x, p.y) : null;
      await window.settle(view, 60000);
      document.body.classList.remove('dark');
      view.setTheme('light');
      view.setMode('2d');
      view.setGraph(window.base());
      await window.settle(view, 60000);
      return hit;
    });
    check(t3 === 53 && t3after?.kind === 'node', `3D: new nodes appear and are picked after the transition (${JSON.stringify(t3after)})`);
    const framedSmall = await page.evaluate(async () => {
      window.view.setMode('3d');
      await window.settle(window.view, 60000);
      window.view.fit();
      await window.waitFrames(40);
      return window.framed(window.view, 48);
    });
    check(framedSmall === 1, `small graph framed in 3D after a mode switch (${(framedSmall * 100).toFixed(1)}%)`);
    await page.locator('canvas').screenshot({ path: join(shots, 'render-small-3d.png') });

    // ---- layout modes: fixed, and the spread (explode) -------------------------------------------
    console.log('Fixed layout and spread');
    await page.evaluate(() => {
      // Extent: the largest distance from the centroid. Min distance: over all pairs.
      window.shape = (pos) => {
        const n = pos.length / 3;
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < n; i++) {
          cx += pos[i * 3] / n;
          cy += pos[i * 3 + 1] / n;
          cz += pos[i * 3 + 2] / n;
        }
        let extent = 0, minDist = Infinity, zMax = 0, finite = true;
        for (let i = 0; i < n; i++) {
          const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
          if (!Number.isFinite(x + y + z)) finite = false;
          extent = Math.max(extent, Math.hypot(x - cx, y - cy, z - cz));
          zMax = Math.max(zMax, Math.abs(z));
          for (let j = i + 1; j < n; j++) minDist = Math.min(minDist, Math.hypot(x - pos[j * 3], y - pos[j * 3 + 1], z - pos[j * 3 + 2]));
        }
        return { extent, minDist, zMax, finite };
      };
      window.settleShot = async (view) => {
        await window.settle(view, 60000);
        view.fit();
        await window.waitFrames(30);
      };
      window.people = () => window.makeGraph(150, 260, 5, 11);
    });
    const fx = await page.evaluate(async () => {
      const view = window.view;
      view.setMode('2d');
      view.setGraph(window.people());
      await window.settle(view, 60000);
      view.setLayoutMode('fixed');
      const easing = view.layout.running;
      await window.settleShot(view);
      const p0 = await view.positions();
      await window.waitFrames(30);
      const p1 = await view.positions();
      let still = 0;
      for (let i = 0; i < p0.length; i++) still = Math.max(still, Math.abs(p1[i] - p0[i]));
      return { easing, running: view.layout.running, mode: view.layoutMode, still, ...window.shape(p1) };
    });
    check(fx.mode === 'fixed' && fx.easing && !fx.running, `fixed: nodes ease to their slots, then nothing runs (running ${fx.easing} → ${fx.running})`);
    check(fx.still === 0, `fixed: positions hold still over 30 frames (max change ${fx.still})`);
    check(fx.finite && fx.zMax === 0 && fx.minDist >= 27.9, `fixed 2D: every two nodes at least a spacing apart (${fx.minDist.toFixed(1)})`);
    await page.locator('canvas').screenshot({ path: join(shots, 'layout-fixed-2d-s1.png') });
    // A key press counts as interaction: from now on the camera stays put when the spread changes.
    const interact = async () => {
      await page.locator('canvas').focus();
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowRight');
    };
    await interact();
    const fx2 = await page.evaluate(async (e1) => {
      const view = window.view;
      view.setSpread(2);
      await window.settle(view, 60000);
      await window.waitFrames(20);
      const s = window.shape(await view.positions());
      return { ratio: s.extent / e1, spread: view.spread };
    }, fx.extent);
    check(fx2.spread === 2 && Math.abs(fx2.ratio - 2) < 0.02, `fixed: spread 2 doubles the extent (×${fx2.ratio.toFixed(3)})`);
    await page.locator('canvas').screenshot({ path: join(shots, 'layout-fixed-2d-s2.png') });

    // Dragging a node in fixed mode moves that node only, and it stays.
    const dragFrom = await page.evaluate(async () => {
      await window.view.sync();
      window.__p0 = await window.view.positions();
      return window.view.screenPosition(7);
    });
    await page.mouse.move(box.x + dragFrom.x, box.y + dragFrom.y);
    await page.evaluate(() => window.waitFrames(5));
    await page.mouse.down();
    await page.mouse.move(box.x + dragFrom.x + 50, box.y + dragFrom.y + 30, { steps: 6 });
    await page.mouse.up();
    const dragged = await page.evaluate(async () => {
      await window.waitFrames(30);
      const p0 = window.__p0, p1 = await window.view.positions();
      let others = 0;
      for (let i = 0; i < p0.length / 3; i++) {
        if (i === 7) continue;
        for (let c = 0; c < 3; c++) others = Math.max(others, Math.abs(p1[i * 3 + c] - p0[i * 3 + c]));
      }
      return { moved: Math.hypot(p1[21] - p0[21], p1[22] - p0[22]), others, running: window.view.layout.running };
    });
    check(dragged.moved > 10 && dragged.others === 0 && !dragged.running, `fixed: a dragged node moves alone and stays (${dragged.moved.toFixed(0)} units; others ${dragged.others})`);

    // Kept nodes keep their slots when nodes are added.
    const stable = await page.evaluate(async () => {
      const view = window.view;
      const g = window.people();
      view.setGraph(g, { keepPositions: true });
      // A fresh fixed layout (the dragged node back in its slot).
      view.layout.reheat();
      await window.settle(view, 60000);
      const p0 = await view.positions();
      g.nodes.push({ id: 'extra1', label: 'extra 1', group: 'Person' }, { id: 'extra2', label: 'extra 2', group: 'Brand new' });
      g.edges.push({ source: 150, target: 3 }, { source: 151, target: 150 });
      view.setGraph(g, { keepPositions: true, animate: true });
      await window.settle(view, 60000);
      const p1 = await view.positions();
      let shift = 0;
      for (let i = 0; i < 150 * 3; i++) shift = Math.max(shift, Math.abs(p1[i] - p0[i]));
      return { shift, ...window.shape(p1) };
    });
    check(stable.shift === 0 && stable.minDist >= 27.9 * 2, `fixed: adding nodes keeps the others in their slots (max shift ${stable.shift}; min distance ${stable.minDist.toFixed(1)})`);

    // 3D.
    const fx3 = await page.evaluate(async () => {
      const view = window.view;
      view.setGraph(window.people());
      view.setMode('3d');
      await window.settleShot(view);
      view.setSpread(1);
      await window.settleShot(view);
      const s = window.shape(await view.positions());
      const p = view.screenPosition(3);
      const hit = p ? await view.pick(p.x, p.y) : null;
      return { ...s, hit, spread: view.spread };
    });
    check(fx3.finite && fx3.zMax > 20 && fx3.minDist >= 27.9 && fx3.hit?.kind === 'node', `fixed 3D: uses z, nodes a spacing apart, picked (min ${fx3.minDist.toFixed(1)} at spread ${fx3.spread}; ${JSON.stringify(fx3.hit)})`);
    await page.locator('canvas').screenshot({ path: join(shots, 'layout-fixed-3d-s1.png') });
    await interact();
    await page.evaluate(async () => {
      window.view.setSpread(2);
      await window.settle(window.view, 60000);
      await window.waitFrames(20);
    });
    await page.locator('canvas').screenshot({ path: join(shots, 'layout-fixed-3d-s2.png') });

    // Force: the spread scales the layout at rest.
    const fs = await page.evaluate(async () => {
      const view = window.view;
      view.setMode('2d');
      view.setLayoutMode('force');
      const resumed = view.layout.running;
      view.setSpread(1);
      await window.settleShot(view);
      return { resumed, e1: window.shape(await view.positions()).extent };
    });
    await page.locator('canvas').screenshot({ path: join(shots, 'layout-force-s1.png') });
    await interact();
    Object.assign(fs, await page.evaluate(async () => {
      const view = window.view;
      view.setSpread(2);
      const reheated = view.layout.running;
      await window.settle(view, 60000);
      await window.waitFrames(20);
      const s2 = window.shape(await view.positions());
      return { reheated, e2: s2.extent, finite: s2.finite };
    }));
    check(fs.resumed && fs.reheated, 'force: switching back resumes the physics; a spread change reheats it');
    check(fs.finite && fs.e2 > fs.e1 * 1.7 && fs.e2 < fs.e1 * 2.4, `force: spread 2 settles about twice as large (extent ${fs.e1.toFixed(0)} → ${fs.e2.toFixed(0)})`);
    await page.locator('canvas').screenshot({ path: join(shots, 'layout-force-s2.png') });
    const fsHalf = await page.evaluate(async () => {
      const view = window.view;
      view.setSpread(0.5);
      await window.settle(view, 60000);
      await window.waitFrames(20);
      return window.shape(await view.positions());
    });
    check(fsHalf.finite && fsHalf.extent > fs.e1 * 0.35 && fsHalf.extent < fs.e1 * 0.7, `force: spread 0.5 settles about half as large (extent ${fsHalf.extent.toFixed(0)})`);
    await page.locator('canvas').screenshot({ path: join(shots, 'layout-force-s0.5.png') });

    // Spreading and switching modes while an animated scrub runs: no errors, and it comes to rest.
    const mixed = await page.evaluate(async () => {
      const view = window.view;
      for (let v = 0; v < 24; v++) {
        const g = window.base();
        for (let k = 0; k < v; k++) {
          g.nodes.push({ id: `m${k}`, label: `m${k}`, group: k % 2 ? 'Event' : 'Tag' });
          g.edges.push({ source: 48 + k, target: k });
        }
        view.setGraph(g, { keepPositions: true, animate: true });
        view.setSpread(0.6 + v * 0.15);
        if (v === 4 || v === 16) view.setLayoutMode('fixed');
        if (v === 10) view.setLayoutMode('force');
        if (v === 12) view.setMode('3d');
        if (v === 20) view.setMode('2d');
        await window.waitFrames(1);
      }
      const run = await window.settle(view, 60000);
      const s = window.shape(await view.positions());
      view.setSpread(5);
      await window.settle(view, 60000);
      const big = window.shape(await view.positions());
      view.setLayoutMode('force');
      view.setSpread(0.2);
      await window.settle(view, 60000);
      const small = window.shape(await view.positions());
      view.setSpread(5);
      await window.settle(view, 60000);
      const forceBig = window.shape(await view.positions());
      view.setSpread(1);
      return { settled: run.settled, finite: s.finite && big.finite && small.finite && forceBig.finite, n: view.stats().nodes, mode: view.layoutMode, minBig: big.minDist, small: small.extent, forceBig: forceBig.extent };
    });
    check(mixed.settled && mixed.finite && mixed.n === 71, `spreading and switching modes during an animated scrub comes to rest (${mixed.n} nodes)`);
    check(mixed.minBig >= 27.9 * 5 && mixed.forceBig > mixed.small * 15 && mixed.forceBig < mixed.small * 40, `spread 0.2..5 neither collapses nor blows up (fixed ×5 min distance ${mixed.minBig.toFixed(0)}; force extent ${mixed.small.toFixed(0)} at 0.2, ${mixed.forceBig.toFixed(0)} at 5)`);
    // A small graph to read: the 48-node tree, fixed, framed.
    await page.evaluate(async () => {
      const view = window.view;
      view.setLayoutMode('fixed');
      view.setGraph(window.base());
      await window.settleShot(view);
    });
    await page.locator('canvas').screenshot({ path: join(shots, 'layout-fixed-2d-small.png') });
    await page.evaluate(() => window.view.setLayoutMode('force'));

    // ---- the page's colours (theme 'css') --------------------------------------------------------------------------
    // A view with theme 'css' takes its background and group colours from the --sk-* custom properties above it,
    // and reads them again on setTheme('css').
    await page.evaluate(async () => {
      const host = document.createElement('div');
      host.id = 'css-host';
      host.style.cssText = '--sk-graph-bg: #102030; --sk-c0: rgb(230, 20, 20); --sk-c1: color-mix(in srgb, #00ff00 50%, #0000ff); position: fixed; left: 0; top: 0;';
      const c = document.createElement('canvas');
      c.style.cssText = 'display: block; width: 200px; height: 200px; margin: 0;';
      host.appendChild(c);
      document.body.appendChild(host);
      const v = await window.R.createGraphView(c, { theme: 'css', background: 'theme', layoutMode: 'fixed', labels: false });
      v.setGraph({ nodes: [{ id: 'a', group: 'g', size: 6 }], edges: [] });
      window.cssView = v;
      await window.settleShot(v);
    });
    const cssShot = async () => decodePng(await page.locator('#css-host canvas').screenshot());
    const at = (img, x, y) => [...img.rgba.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];
    const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 24);
    let img = await cssShot();
    const corner = at(img, 2, 2);
    const centre = at(img, img.width >> 1, img.height >> 1);
    check(near(corner, [0x10, 0x20, 0x30]) && near(centre, [230, 20, 20]), `theme 'css' draws with --sk-graph-bg and --sk-c0 (corner ${corner}, node ${centre})`);
    await page.evaluate(async () => {
      document.getElementById('css-host').style.setProperty('--sk-c0', 'rgb(20, 20, 230)');
      window.cssView.setTheme('css');
      await window.settleShot(window.cssView);
    });
    img = await cssShot();
    const recoloured = at(img, img.width >> 1, img.height >> 1);
    check(near(recoloured, [20, 20, 230]), `setTheme('css') reads the properties again (node ${recoloured})`);
    await page.evaluate(() => {
      window.cssView.destroy();
      document.getElementById('css-host').remove();
    });

    // ---- 10k nodes / 30k edges ----------------------------------------------------------------
    if (!flag('--skip-10k') && !QUICK) {
      console.log('2D, 10,000 nodes / 30,000 edges (timed run, not to rest)');
      const big = await page.evaluate(async () => {
        const view = window.view;
        view.setMode('2d');
        view.setGraph(window.makeGraph(10000, 30000, 8, 3));
        const t0 = performance.now();
        await window.waitFrames(5);
        let maxFps = 0;
        // Layout cost and frame rate while the layout runs (SwiftShader is a CPU rasterizer, so
        // these are far below a hardware GPU).
        let msPerTick = 0;
        while (performance.now() - t0 < 20000) {
          await window.waitFrames(2);
          const st = view.stats();
          maxFps = Math.max(maxFps, st.fps);
          if (st.layoutMsPerTick > 0) msPerTick = st.layoutMsPerTick;
        }
        const running = view.layout.running;
        view.layout.stop();
        const pos = await view.positions();
        let finite = true;
        for (const v of pos) if (!Number.isFinite(v)) finite = false;
        view.fit();
        await window.waitFrames(30);
        return { stats: view.stats(), maxFps, finite, msPerTick, running };
      });
      console.log(`  ${big.msPerTick.toFixed(1)} ms/tick; ${big.maxFps} fps while laying out`);
      check(big.running && big.msPerTick > 0, '10k layout runs on the GPU');
      check(big.finite, '10k positions are finite');
      await page.locator('canvas').screenshot({ path: join(shots, 'render-10k-2d.png') });
    }

    // GpuUnavailableError when there is no WebGPU.
    const unavailable = await page.evaluate(async () => {
      const gpu = Object.getOwnPropertyDescriptor(Navigator.prototype, 'gpu');
      Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => undefined });
      try {
        await window.R.createGraphView(document.createElement('canvas'));
        return 'resolved';
      } catch (e) {
        return e instanceof window.R.GpuUnavailableError ? 'GpuUnavailableError' : String(e);
      } finally {
        Object.defineProperty(Navigator.prototype, 'gpu', gpu);
      }
    });
    check(unavailable === 'GpuUnavailableError', 'createGraphView rejects with GpuUnavailableError without WebGPU');

    await page.evaluate(() => window.view.destroy());
    errors.push(...(await page.evaluate(() => window.__errors)));
  } finally {
    await browser.close();
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
  check(errors.length === 0, `no GPU, page or console errors${errors.length ? ':\n    ' + errors.slice(0, 10).join('\n    ') : ''}`);
  console.log(`screenshots: ${shots}`);
  if (failures) {
    console.log(`${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('all render checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
