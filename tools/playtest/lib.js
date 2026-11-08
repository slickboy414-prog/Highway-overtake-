// Shared set-up for the playtest scripts. Needs playwright-core and an installed
// Chrome. Nothing here edits gate-highway-prototype.html on disk.
//   npm i playwright-core   (outside the repo), then point NODE_PATH at it
//   CHROME_PATH overrides the browser location
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..', '..');
const PROTO = path.join(ROOT, 'gate-highway-prototype.html');
const CHROME = process.env.CHROME_PATH ||
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const BOT = fs.readFileSync(path.join(__dirname, 'bot.js'), 'utf8');

// Runs between Three.js and the game script, only in fast mode: the game's clock
// and frame callback are stepped by hand, drawing is switched off, Math.random
// is seeded. update() itself is the shipped code.
const FAST_SHIM = `
<script>
(function(){
  let seed = (window.__seed || 12345) >>> 0;
  Math.random = function(){ seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ff = window.__ff = { now: 0, cbs: [] };
  performance.now = function(){ return ff.now; };
  window.requestAnimationFrame = function(cb){ ff.cbs.push(cb); return 1; };
  const Real = THREE.WebGLRenderer;
  THREE.WebGLRenderer = function(p){ const r = new Real(Object.assign({ preserveDrawingBuffer: true }, p)); const draw = r.render.bind(r); r.render = function(s, c){ if (ff.draw) draw(s, c); }; return r; };
  ff.reseed = function(n){ seed = n >>> 0; };
  ff.step = function(dt){ ff.now += dt * 1000; const c = ff.cbs; ff.cbs = []; for (let i = 0; i < c.length; i++) c[i](ff.now); };
})();
</script>
`;

async function launch(opts = {}) {
  return chromium.launch({
    executablePath: CHROME,
    headless: !!opts.headless,
    args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling',
           '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
}

async function phonePage(browser, w = 390, h = 844, dpr = 3) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: true, isMobile: w < h,
  });
  const page = await ctx.newPage();
  page.errors = []; page.net = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:')) page.net.push(u); });
  return page;
}

// Normal mode: the file exactly as it is on disk.
async function openReal(page) {
  await page.goto('file:///' + PROTO.replace(/\\/g, '/'));
  await page.addScriptTag({ content: BOT });
  await page.waitForFunction(() => !!window.__gh);
}

// Fast mode: same file, shim added in memory only.
async function openFast(page, seed) {
  const lines = fs.readFileSync(PROTO, 'utf8').split('\n');
  const idx = lines.findIndex((l, i) => i > 335 && l.trim() === '<script>');
  if (idx < 0) throw new Error('game script tag not found');
  lines.splice(idx, 0, `<script>window.__seed=${seed};</script>` + FAST_SHIM);
  const dir = process.env.PLAYTEST_TMP || path.join(require('os').tmpdir(), 'gh-playtest');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `fast-${seed}.html`);
  fs.writeFileSync(f, lines.join('\n'));
  await page.goto('file:///' + f.replace(/\\/g, '/'));
  await page.addScriptTag({ content: BOT });
  await page.waitForFunction(() => !!window.__gh && !!window.__ff);
}

module.exports = { launch, phonePage, openReal, openFast, ROOT, PROTO };
