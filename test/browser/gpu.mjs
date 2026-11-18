// Browser test for WebGPU compute (smaltkit/gpu): serves the built package (dist/) and a test page over
// http://localhost, and runs the matrix product in Chromium on SwiftShader's WebGPU adapter, against the same product
// in 64-bit floats on the CPU.
//
//   npm run build && node test/browser/gpu.mjs [--headed]
//
// Fails on any page or console error. (--quick is taken and ignored, as the other browser tests take it.)
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const headed = process.argv.includes('--headed');

let failures = 0;
function check(cond, msg) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    failures++;
    console.log(`  FAIL ${msg}`);
  }
}

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>gpu test</title></head><body><script type="module">
  window.G = await import('./dist/gpu.js');
  window.__ready = true;
</script></body></html>`;

/** Serves the built package (dist/) at /dist/, and the test page at /. */
function serve() {
  return http.createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.startsWith('/dist/') && !path.includes('..')) {
      try {
        res.setHeader('content-type', path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        res.end(await readFile(join(root, path)));
      } catch {
        res.statusCode = 404;
        res.end();
      }
    } else {
      res.setHeader('content-type', 'text/html');
      res.end(PAGE);
    }
  });
}

async function main() {
  const server = serve();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch({
    headless: !headed,
    args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console error: ${m.text()}`);
    });
    await page.goto(url);
    await page.waitForFunction(() => window.__ready === true);

    const result = await page.evaluate(async () => {
      const { gpuDevice, gpuAvailable, gpuMatMul, gpuMatMulFits, computePipeline } = window.G;
      const d = await gpuDevice();
      if (!d) return { device: false };
      // A seeded stream, so every run multiplies the same numbers.
      let s = 7;
      const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
      const sizes = [[1, 1, 1], [37, 19, 5], [16, 16, 16], [1000, 64, 3], [5, 0, 4], [0, 3, 2], [300, 7, 33]];
      const cases = [];
      for (const [n, p, k] of sizes) {
        const a = Float64Array.from({ length: n * p }, r);
        const b = Float64Array.from({ length: p * k }, r);
        const got = await gpuMatMul(d, n, p, k, a, b);
        // The worst difference from the 64-bit product, relative to the sum of the terms' sizes.
        let worst = 0;
        for (let j = 0; j < k; j++) {
          for (let i = 0; i < n; i++) {
            let sum = 0;
            let size = 0;
            for (let l = 0; l < p; l++) {
              sum += a[l * n + i] * b[j * p + l];
              size += Math.abs(a[l * n + i] * b[j * p + l]);
            }
            worst = Math.max(worst, Math.abs(got[j * n + i] - sum) / (size || 1));
          }
        }
        cases.push({ size: `${n} × ${p} · ${p} × ${k}`, length: got.length, want: n * k, worst });
      }
      let lengthError = '';
      try {
        await gpuMatMul(d, 2, 2, 2, [1, 2, 3], [1, 2, 3, 4]);
      } catch (e) {
        lengthError = e instanceof RangeError ? 'RangeError' : String(e);
      }
      const code = '@compute @workgroup_size(1) fn main() {}';
      return {
        device: true,
        available: await gpuAvailable(),
        sameDevice: (await gpuDevice()) === d,
        cached: computePipeline(d, code) === computePipeline(d, code),
        fits: gpuMatMulFits(d, 64, 3),
        tooBig: gpuMatMulFits(d, 2 ** 20, 2 ** 20),
        cases,
        lengthError,
      };
    });

    check(result.device, 'a WebGPU device (SwiftShader)');
    if (result.device) {
      check(result.available, 'gpuAvailable() is true');
      check(result.sameDevice, 'gpuDevice() asks once and gives the same device');
      check(result.cached, 'computePipeline() keeps a pipeline per device and source');
      check(result.fits && !result.tooBig, 'gpuMatMulFits() says what fits in one buffer');
      for (const c of result.cases) {
        check(c.length === c.want && c.worst < 1e-5, `${c.size}: worst difference ${c.worst.toExponential(2)} of the terms' size, in 32-bit floats`);
      }
      check(result.lengthError === 'RangeError', 'arrays of the wrong length fail with a RangeError');
    }
    check(errors.length === 0, `no page or console errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
  } finally {
    await browser.close();
    server.close();
  }
  if (failures) {
    console.log(`${failures} failed`);
    process.exit(1);
  }
  console.log('gpu: all passed');
}

await main();
