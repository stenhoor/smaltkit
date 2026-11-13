// Browser test for the timeline (smaltkit/timeline): serves the built package (dist/) and a test page
// over http://localhost and drives it with Playwright in Chromium.
//
//   npm run build && node test/browser/timeline.mjs [--shots <dir>] [--fonts <dir>] [--headed]
//
// --fonts serves a directory holding fonts.css and the brand's woff2 files (Geist Mono, Martian Mono)
// for faithful screenshots; without it the page uses the fallback monospace fonts.
//
// Fails on any page or console error.
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const shots = resolve(opt('--shots', process.env.TIMELINE_SHOTS ?? join(tmpdir(), 'smaltkit-timeline-shots')));
const fonts = opt('--fonts', '');

let failures = 0;
function check(cond, msg) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    failures++;
    console.log(`  FAIL ${msg}`);
  }
}

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>timeline test</title>
${fonts ? '<link rel="stylesheet" href="/fonts/fonts.css">' : ''}
<style>
  html, body { margin: 0; background: #F5F6F8; font-family: system-ui, sans-serif; }
  body.dark { background: #14171F; }
  #wrap { padding: 120px 20px 40px; }
  #host { width: 900px; max-width: 100%; border: 1px solid #D6DBE4; border-radius: 8px; overflow: visible; }
  body.dark #host { border-color: #2C3240; }
</style></head>
<body><div id="wrap"><div id="host"></div></div>
<script type="module">
  // Count animation frames the timeline asks for (the test's own waits are tagged and not counted).
  window.__frames = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => {
    if (!cb.__test) window.__frames++;
    return raf(cb);
  };
  window.T = await import('./dist/timeline.js');
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
  const dir = await mkdtemp(join(tmpdir(), 'smaltkit-timeline-'));
  await mkdir(shots, { recursive: true });
  // The timeline is its own piece: it loads nothing from the rest of the kit.
  const outside = [...(await importGraph(join(root, 'dist/timeline.js')))].filter((f) => !f.includes('/dist/timeline'));
  check(outside.length === 0, `the timeline loads only dist/timeline* (${outside.join(', ') || 'nothing else'})`);
  const server = serveDist(PAGE, async (req, res) => {
    if (!(fonts && req.url.startsWith('/fonts/'))) return false;
    try {
      const body = await readFile(join(fonts, basename(req.url)));
      res.setHeader('content-type', req.url.endsWith('.css') ? 'text/css' : 'font/woff2');
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end();
    }
    return true;
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://localhost:${server.address().port}/`;

  const browser = await chromium.launch({ headless: !flag('--headed') });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 420 }, deviceScaleFactor: 2 });
    page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console error: ${m.text()}`);
    });
    await page.goto(url);
    await page.waitForFunction(() => window.__ready === true);
    await page.evaluate(() => document.fonts.ready);

    await page.evaluate(() => {
      window.waitFrames = (k) => new Promise((r) => {
        const f = () => (k-- <= 0 ? r() : requestAnimationFrame(f));
        f.__test = true;
        requestAnimationFrame(f);
      });
      // ~500 commits over a year, in bursts with quiet weeks between, sizes from 1 to a few hundred.
      window.makeCommits = (n, seed = 7, start = new Date(2026, 0, 5, 9, 0).getTime()) => {
        let s = seed >>> 0;
        const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
        const authors = ['ana', 'bo', 'chen', 'dara', 'eli'];
        const verbs = ['Add', 'Fix', 'Rename', 'Merge', 'Load', 'Drop', 'Link'];
        const things = ['orders flow', 'customer nodes', 'KNOWS edges', 'city labels', 'supplier graph', 'stale tags', 'product catalogue'];
        const out = [];
        let t = start;
        const span = 360 * 24 * 3600e3;
        const step = span / n;
        for (let i = 0; i < n; i++) {
          // Mostly regular steps, sometimes a quiet period of a few weeks.
          t += rnd() < 0.02 ? step * 25 * rnd() : step * (0.2 + rnd());
          const big = rnd() < 0.05;
          out.push({
            version: i + 1,
            time: Math.round(t),
            author: authors[Math.floor(rnd() * authors.length)],
            message: `${verbs[Math.floor(rnd() * verbs.length)]} ${things[Math.floor(rnd() * things.length)]}`,
            size: big ? 50 + Math.floor(rnd() * 400) : 1 + Math.floor(rnd() * 12),
          });
        }
        return out;
      };
      window.events = [];
      window.commits = window.makeCommits(500);
      window.tl = window.T.createTimeline(document.getElementById('host'), {
        commits: window.commits,
        theme: 'light',
        onChange: (v, info) => window.events.push({ v, final: info.final }),
      });
    });
    await page.evaluate(() => window.waitFrames(2));

    const sel = (s) => page.locator(`#host ${s}`);
    const aria = () => page.evaluate(() => {
      const h = document.querySelector('.sk-tl-handle');
      return { now: +h.getAttribute('aria-valuenow'), min: +h.getAttribute('aria-valuemin'), max: +h.getAttribute('aria-valuemax'), text: h.getAttribute('aria-valuetext'), role: h.getAttribute('role') };
    });
    const state = () => page.evaluate(() => ({ value: window.tl.value, playing: window.tl.playing, events: window.events.splice(0) }));

    console.log('Timeline, 500 commits over a year');
    let a = await aria();
    check(a.role === 'slider' && a.min === 0 && a.max === 500 && a.now === 500, `starts at the last version, as a slider 0..500 (${JSON.stringify(a)})`);
    check(/^Version 500 of 500, \d+ \w{3} \d{4} \d\d:\d\d, \w+, .+/.test(a.text), `aria-valuetext describes the version ("${a.text}")`);
    const readout = await sel('.sk-tl-readout').textContent();
    check(/^Version 500 of 500 · \d+ \w{3} \d{4} \d\d:\d\d · \w+ · .+/.test(readout), `readout "${readout}"`);
    await page.screenshot({ path: join(shots, 'timeline-light-900.png'), clip: await clipOf(page) });

    // Geometry of the ruler: version i (commit axis) sits at PAD + i / 500 × inner width.
    const ruler = await sel('.sk-tl-ruler').boundingBox();
    const PAD = 12;
    const xOfIndex = (i, n = 500) => ruler.x + PAD + (i / n) * (ruler.width - 2 * PAD);
    const trackY = ruler.y + 44;

    // Drag the handle.
    const hb = await sel('.sk-tl-handle').boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(xOfIndex(300), trackY, { steps: 12 });
    let st = await state();
    const during = st.events;
    await page.mouse.up();
    st = await state();
    check(during.length > 0 && during.every((e) => !e.final), `dragging reports versions, not final (${during.length} events)`);
    check(st.events.length === 1 && st.events[0].final && st.events[0].v === st.value && Math.abs(st.value - 300) <= 1, `release reports the final version (${JSON.stringify(st.events)}, value ${st.value})`);

    // Click jumps to the nearest commit.
    await page.mouse.click(xOfIndex(123) + 0.3, trackY - 20);
    st = await state();
    check(st.value === 123, `click jumps to the nearest commit (${st.value})`);
    check(st.events.length === 1 && st.events[0].final && st.events[0].v === 123, `a click reports one final change (${JSON.stringify(st.events)})`);

    // Keyboard on the handle.
    await sel('.sk-tl-handle').focus();
    const keys = [['ArrowRight', 124], ['Shift+ArrowRight', 134], ['ArrowLeft', 133], ['PageDown', 83], ['PageUp', 133], ['Home', 0], ['End', 500], ['ArrowUp', 500], ['Shift+ArrowLeft', 490]];
    const got = [];
    for (const [k] of keys) {
      await page.keyboard.press(k);
      got.push((await state()).value);
    }
    check(got.join() === keys.map((k) => k[1]).join(), `keys step the version (${got.join(', ')})`);
    a = await aria();
    check(a.now === 490 && a.text.startsWith('Version 490 of 500'), `aria-valuenow and valuetext follow (${a.now}, "${a.text.slice(0, 40)}…")`);

    // Play: from 490 at 40 commits a second to the end, then it stops and reports final.
    await page.evaluate(() => window.tl.play({ speed: 40 }));
    check((await state()).playing, 'play() starts playing');
    await page.waitForFunction(() => !window.tl.playing, null, { timeout: 10000 });
    st = await state();
    const nonFinal = st.events.filter((e) => !e.final);
    check(st.value === 500 && nonFinal.length >= 3 && nonFinal.every((e, k) => k === 0 || e.v > nonFinal[k - 1].v), `play advances (${nonFinal.map((e) => e.v).join(' ')}) and stops at the end`);
    check(st.events.at(-1)?.final && st.events.at(-1).v === 500, 'play reports final when it stops');
    // Play from the end starts over; Space on the handle toggles.
    await sel('.sk-tl-handle').focus();
    await page.keyboard.press('Space');
    await page.evaluate(() => window.waitFrames(4));
    let s1 = await state();
    await page.keyboard.press('Space');
    const s2 = await state();
    check(s1.playing && s1.value < 20 && !s2.playing && s2.events.at(-1)?.final, `Space plays from the start and pauses (at ${s2.value})`);
    const playLabel = await sel('.sk-tl-play').getAttribute('aria-label');
    check(playLabel === 'Play', `the play button reads "${playLabel}" when paused`);

    // Axis switch keeps the value; the handle moves to the version's time.
    await page.evaluate(() => window.tl.setValue(250));
    await page.evaluate(() => window.waitFrames(2));
    const hx0 = (await sel('.sk-tl-handle').boundingBox()).x;
    await sel('.sk-tl-by-time').click();
    await page.evaluate(() => window.waitFrames(2));
    const hx1 = (await sel('.sk-tl-handle').boundingBox()).x;
    st = await state();
    const pressed = await sel('.sk-tl-by-time').getAttribute('aria-pressed');
    check(st.value === 250 && st.events.length === 0 && pressed === 'true', `axis switch keeps the value (${st.value}) and reports no change`);
    check(Math.abs(hx1 - hx0) > 2, `by time, the handle sits at the version's time (moved ${(hx1 - hx0).toFixed(0)} px)`);
    await page.screenshot({ path: join(shots, 'timeline-light-900-time.png'), clip: await clipOf(page) });

    // Hover shows a tooltip.
    await page.mouse.move(xOfIndex(0) + 300, trackY - 15);
    await page.evaluate(() => window.waitFrames(2));
    const tip = await sel('.sk-tl-tip').textContent();
    const tipShown = await sel('.sk-tl-tip').isVisible();
    check(tipShown && /^Version \d+/.test(tip) && /changes?$/.test(tip), `hover shows a tooltip ("${tip}")`);
    await page.screenshot({ path: join(shots, 'timeline-light-900-hover.png'), clip: await clipOf(page, 110) });
    await page.mouse.move(ruler.x + 100, ruler.y + ruler.height + 120);

    // Zoom with the wheel, pan with Shift-drag, fit.
    await page.mouse.move(xOfIndex(250), trackY - 10);
    for (let k = 0; k < 6; k++) await page.mouse.wheel(0, -200);
    await page.evaluate(() => window.waitFrames(2));
    const fitVisible = await sel('.sk-tl-fit').isVisible();
    const hz = (await sel('.sk-tl-handle').boundingBox()).x;
    await page.keyboard.down('Shift');
    await page.mouse.move(ruler.x + 400, trackY - 10);
    await page.mouse.down();
    await page.mouse.move(ruler.x + 250, trackY - 10, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.evaluate(() => window.waitFrames(2));
    const hp = (await sel('.sk-tl-handle').boundingBox()).x;
    st = await state();
    check(fitVisible, 'the wheel zooms in (Fit appears)');
    check(hp < hz - 50 && st.value === 250 && st.events.length === 0, `Shift-drag pans without changing the value (handle ${(hp - hz).toFixed(0)} px)`);
    await page.screenshot({ path: join(shots, 'timeline-light-900-zoomed.png'), clip: await clipOf(page) });
    await sel('.sk-tl-fit').click();
    await page.evaluate(() => window.waitFrames(2));
    check(!(await sel('.sk-tl-fit').isVisible()), 'Fit shows the whole history again');
    await sel('.sk-tl-by-commit').click();

    // Buttons.
    await sel('.sk-tl-back').click();
    await sel('.sk-tl-forward').click();
    await sel('.sk-tl-forward').click();
    st = await state();
    check(st.value === 251 && st.events.map((e) => e.v).join() === '249,250,251' && st.events.every((e) => e.final), `step buttons (${st.events.map((e) => e.v).join(', ')})`);
    await sel('.sk-tl-now').click();
    st = await state();
    check(st.value === 500 && (await sel('.sk-tl-forward').isDisabled()), 'Now jumps to the latest version, and Next is disabled there');

    // Touch drag on the ruler.
    const touch = (type, x, y) => page.evaluate(([type, x, y]) => {
      const r = document.querySelector('.sk-tl-ruler');
      r.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true }));
    }, [type, x, y]);
    await touch('pointerdown', xOfIndex(400), trackY);
    for (let k = 1; k <= 6; k++) await touch('pointermove', xOfIndex(400 - k * 10), trackY);
    await touch('pointerup', xOfIndex(340), trackY);
    st = await state();
    check(st.value === 340 && st.events.at(-1)?.final, `touch drag scrubs (${st.value})`);
    const touchAction = await sel('.sk-tl-ruler').evaluate((el) => getComputedStyle(el).touchAction);
    check(touchAction === 'none', `the ruler takes touches itself (touch-action ${touchAction})`);

    // New commits: follow keeps the end in view; without follow the value stays.
    await page.evaluate(() => {
      window.tl.setValue(500);
      window.tl.setCommits(window.makeCommits(520), { follow: true });
    });
    let v = (await state()).value;
    await page.evaluate(() => window.tl.setCommits(window.makeCommits(530), { follow: false }));
    const v2 = (await state()).value;
    a = await aria();
    check(v === 520 && v2 === 520 && a.max === 530, `setCommits follows the end only when asked (${v}, ${v2}, max ${a.max})`);

    // Edge cases: no commits, one commit, equal times.
    const edge = await page.evaluate(async () => {
      const box = document.createElement('div');
      box.style.width = '600px';
      document.getElementById('wrap').append(box);
      const out = {};
      const ev = [];
      const t0 = window.T.createTimeline(box, { commits: [], onChange: (x) => ev.push(x) });
      await window.waitFrames(2);
      out.empty = { value: t0.value, readout: box.querySelector('.sk-tl-readout').textContent };
      t0.play();
      out.emptyPlay = t0.playing;
      t0.setCommits([{ version: 1, time: Date.now(), size: 3 }], { follow: true });
      out.one = t0.value;
      t0.setAxis('time');
      t0.setCommits([1, 2, 3].map((k) => ({ version: k, time: 1.7e12, size: k })), { follow: true });
      await window.waitFrames(2);
      out.same = t0.value;
      t0.destroy();
      out.gone = box.children.length;
      box.remove();
      out.events = ev.length;
      return out;
    });
    check(edge.empty.value === 0 && edge.empty.readout.startsWith('Version 0 of 0') && !edge.emptyPlay, `no commits: version 0, nothing to play ("${edge.empty.readout}")`);
    check(edge.one === 1 && edge.same === 3 && edge.gone === 0 && edge.events === 0, 'one commit, equal times and destroy() work without calling onChange');

    // Idle: no animation frames once nothing changes.
    const idle = await page.evaluate(async () => {
      await window.waitFrames(3);
      const f0 = window.__frames;
      await window.waitFrames(30);
      return window.__frames - f0;
    });
    check(idle === 0, `no frames when idle (${idle})`);

    // Many commits: a drag over 20,000 commits stays quick.
    const big = await page.evaluate(async () => {
      const box = document.createElement('div');
      box.style.width = '900px';
      document.getElementById('wrap').append(box);
      const baseline = [];
      for (let k = 0; k < 20; k++) {
        const t1 = performance.now();
        await window.waitFrames(1);
        baseline.push(performance.now() - t1);
      }
      baseline.sort((a, b) => a - b);
      const commits = window.makeCommits(20000, 3);
      let t = performance.now();
      const big = window.T.createTimeline(box, { commits });
      await window.waitFrames(1);
      const createMs = performance.now() - t;
      const r = box.querySelector('.sk-tl-ruler');
      const rect = r.getBoundingClientRect();
      const fire = (type, x) => r.dispatchEvent(new PointerEvent(type, { pointerId: 3, pointerType: 'mouse', clientX: rect.left + x, clientY: rect.top + 40, button: 0, buttons: 1, bubbles: true }));
      fire('pointerdown', 800);
      const frames = [];
      for (let k = 0; k < 30; k++) {
        fire('pointermove', 800 - k * 20);
        t = performance.now();
        await window.waitFrames(1);
        frames.push(performance.now() - t);
      }
      fire('pointerup', 200);
      big.destroy();
      box.remove();
      frames.sort((a, b) => a - b);
      return { createMs, median: frames[15], baseline: baseline[10] };
    });
    console.log(`  20,000 commits: created and drawn in ${big.createMs.toFixed(0)} ms; median frame while dragging ${big.median.toFixed(1)} ms (idle frame ${big.baseline.toFixed(1)} ms)`);
    check(big.median < 50, '20,000 commits drag at interactive frame times');

    // Screenshots: light and dark, 900 and 360 px wide.
    await page.evaluate(() => {
      window.tl.setValue(342);
    });
    await page.evaluate(() => window.waitFrames(2));
    await page.screenshot({ path: join(shots, 'timeline-light-900.png'), clip: await clipOf(page) });
    await page.evaluate(() => {
      document.body.classList.add('dark');
      window.tl.setTheme('dark');
    });
    await page.evaluate(() => window.waitFrames(2));
    await page.screenshot({ path: join(shots, 'timeline-dark-900.png'), clip: await clipOf(page) });
    await page.mouse.move(xOfIndex(180), trackY - 15);
    await page.evaluate(() => window.waitFrames(2));
    await page.screenshot({ path: join(shots, 'timeline-dark-900-hover.png'), clip: await clipOf(page, 110) });
    await page.mouse.move(ruler.x + 100, ruler.y + ruler.height + 150);
    await page.setViewportSize({ width: 400, height: 420 });
    await page.evaluate(() => {
      document.getElementById('host').style.width = '360px';
    });
    await page.evaluate(() => window.waitFrames(3));
    await page.screenshot({ path: join(shots, 'timeline-dark-360.png'), clip: await clipOf(page) });
    await page.evaluate(() => {
      document.body.classList.remove('dark');
      window.tl.setTheme('light');
    });
    await page.evaluate(() => window.waitFrames(2));
    await page.screenshot({ path: join(shots, 'timeline-light-360.png'), clip: await clipOf(page) });
    const narrow = await page.evaluate(() => {
      const host = document.getElementById('host');
      return { scroll: host.scrollWidth <= host.clientWidth + 1, h: host.getBoundingClientRect().height };
    });
    check(narrow.scroll, `at 360 px the controls wrap without overflowing (height ${narrow.h.toFixed(0)} px)`);
    // Keyboard focus ring.
    await sel('.sk-tl-handle').focus();
    await page.keyboard.press('ArrowLeft');
    const outline = await sel('.sk-tl-handle').evaluate((el) => {
      const cs = getComputedStyle(el);
      return `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineOffset}`;
    });
    check(outline === 'solid 2px 2px', `keyboard focus shows a 2px ring with a 2px offset (${outline})`);
    await page.screenshot({ path: join(shots, 'timeline-light-360-focus.png'), clip: await clipOf(page) });

    await page.evaluate(() => window.tl.destroy());
    check((await page.locator('#host').evaluate((el) => el.children.length)) === 0, 'destroy() removes the timeline');
  } finally {
    await browser.close();
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
  check(errors.length === 0, `no page or console errors${errors.length ? ':\n    ' + errors.slice(0, 10).join('\n    ') : ''}`);
  console.log(`screenshots: ${shots}`);
  if (failures) {
    console.log(`${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('all timeline checks passed');
}

/** The host's box on the page, with room above for the tooltip when `above` is given. */
async function clipOf(page, above = 0) {
  const b = await page.locator('#host').boundingBox();
  return { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 12 - above), width: b.width + 24, height: b.height + 24 + above };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
