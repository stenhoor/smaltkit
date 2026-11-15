// Browser test for the docs' playgrounds: serves the built docs site (docs/.vitepress/dist, at /smaltkit/) and, in
// Chromium, presses Run on every playground and checks that what it prints is its tested result, the text CI checked in
// Node. A playground that prints something else, fails, or never finishes is a failure, as is any page error.
//
//   npm run docs:build && node test/browser/playgrounds.mjs [--headed]
import { createRequire } from 'node:module';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const site = join(root, 'docs', '.vitepress', 'dist');
const base = '/smaltkit/';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.md': 'text/markdown', '.txt': 'text/plain' };

// The site as GitHub Pages serves it: clean URLs find their .html.
const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.startsWith(base)) return res.writeHead(404).end();
  let file = join(site, path.slice(base.length));
  for (const f of [file, `${file}.html`, join(file, 'index.html')]) {
    if (await stat(f).then((s) => s.isFile(), () => false)) {
      file = f;
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
      return res.end(await readFile(f));
    }
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

async function pages(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'kit' && e.name !== 'assets') out.push(...(await pages(p)));
    } else if (e.name.endsWith('.html') && e.name !== '404.html') out.push(relative(site, p).replace(/\.html$/, ''));
  }
  return out;
}

const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let total = 0;
const failures = [];
for (const path of (await pages(site)).sort()) {
  await page.goto(`${origin}${base}${path}`, { waitUntil: 'networkidle' });
  const n = await page.locator('.sw-play').count();
  for (let i = 0; i < n; i++) {
    total++;
    const play = page.locator('.sw-play').nth(i);
    // The tested result's code block shows its language ("text") as a label: not part of the result.
    const tested = (await play.locator('.sw-play-result').innerText()).replace(/^\s*text\n/, '').trim();
    await play.locator('[data-play="run"]').click();
    try {
      await page.waitForFunction(
        (k) => {
          const p = document.querySelectorAll('.sw-play')[k];
          return p.getAttribute('aria-busy') !== 'true' && !p.querySelector('.sw-play-result[data-tested]');
        },
        i,
        { timeout: 30000 },
      );
      const got = (await play.locator('.sw-play-result').innerText()).trim();
      if (got !== tested) failures.push(`${path} #${i + 1}: printed\n${got}\nnot\n${tested}`);
    } catch (e) {
      failures.push(`${path} #${i + 1}: no result (${String(e.message).split('\n')[0]})`);
    }
  }
}
await browser.close();
server.close();
for (const f of failures) console.error(`${f}\n`);
for (const e of errors) console.error(`page error: ${e}`);
console.log(`${total - failures.length} of ${total} playgrounds printed their tested result`);
if (failures.length || errors.length || total === 0) process.exit(1);
