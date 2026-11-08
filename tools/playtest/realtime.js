// Real Chrome, visible window, phone frame, real clock, the file as on disk.
// usage: node realtime.js <outDir> [profile] [cpuThrottle] [level]
const fs = require('fs'), path = require('path');
const { launch, phonePage, openReal } = require('./lib');

(async () => {
  const out = process.argv[2] || 'frames'; const profile = process.argv[3] || 'average';
  const throttle = Number(process.argv[4] || 1); const level = Number(process.argv[5] || 1);
  fs.mkdirSync(out, { recursive: true });
  const browser = await launch(); const page = await phonePage(browser);
  if (throttle > 1) { const c = await page.context().newCDPSession(page); await c.send('Emulation.setCPUThrottlingRate', { rate: throttle }); }
  const t0 = Date.now();
  await openReal(page);
  const loadMs = Date.now() - t0;
  await page.screenshot({ path: path.join(out, '00-start.png') });
  const gl = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl'); const e = c && c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; });

  await page.click('#startBtn');
  if (level > 1) await page.evaluate(n => window.__gh.setLevel(n), level);
  await page.evaluate(profile => {
    const bot = window.__botMake(profile); window.__rt = { dts: [], cars: [], masses: [], start: performance.now(), lanes: [] };
    let last = performance.now();
    (function loop() {
      requestAnimationFrame(loop);
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      if (window.__gh.state !== 'playing') return;
      window.__rt.dts.push(dt); window.__rt.cars.push(window.__gh.obstacleCount);
      bot.tick(Math.min(dt, 0.05));
    })();
  }, profile);

  let n = 1;
  const done = async () => (await page.evaluate(() => window.__gh.state)) !== 'playing';
  const deadline = Date.now() + 120000;
  while (!(await done()) && Date.now() < deadline) {
    await page.screenshot({ path: path.join(out, String(n++).padStart(2, '0') + '.png') });
    await new Promise(r => setTimeout(r, 900));
  }
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(out, 'zz-end.png') });
  const res = await page.evaluate(() => {
    const d = window.__rt.dts.slice(5).sort((a, b) => a - b), sum = d.reduce((a, b) => a + b, 0);
    const g = window.__gh, cars = window.__rt.cars;
    return { frames: d.length, wallSeconds: +sum.toFixed(1), meanFps: +(d.length / sum).toFixed(1), p50ms: +(d[d.length >> 1] * 1000).toFixed(1), p95ms: +(d[Math.floor(d.length * .95)] * 1000).toFixed(1),
      over50ms: d.filter(x => x > 0.05).length, carsMin: Math.min(...cars), carsMax: Math.max(...cars), state: g.state, mass: g.mass, need: g.need, level: g.level, playerZ: +g.playerZ.toFixed(0), barricadeZ: g.barricadeZ,
      overlay: document.getElementById('overlay').innerText.replace(/\s+/g, ' ').slice(0, 120), canvas: [document.querySelector('canvas').width, document.querySelector('canvas').height] };
  });
  console.log(JSON.stringify({ profile, throttle, level, loadMs, gl, ...res, errors: page.errors, net: page.net }, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
