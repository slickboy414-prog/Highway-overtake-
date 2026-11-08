// Measures traffic rates in the real engine: a car that never steers, made too heavy
// to die, counting mass changes. +5 = car passed, +25 = passed with a close call,
// small loss = hit a car. Gate lines are counted separately. usage: node traffic.js [runs]
const { launch, phonePage, openFast } = require('./lib');
(async () => {
  const runs = Number(process.argv[2] || 150);
  const browser = await launch({ headless: true }); const page = await phonePage(browser); await openFast(page, 777);
  const res = await page.evaluate(runs => {
    const g = window.__gh, ff = window.__ff, DT = 1 / 60, out = [];
    for (const level of [1, 2, 3, 5, 10, 15, 20]) {
      let passed = 0, close = 0, hits = 0, lines = 0, nCars = 0, frames = 0;
      for (let r = 0; r < runs; r++) {
        g.setLevel(level); g.setMass(1000000);
        let prev = g.mass, steps = 0, l0 = g.gateLines;
        while (g.state === 'playing' && steps++ < 7200) {
          ff.step(DT);
          const m = g.mass, d = m - prev;
          if (d === 5) passed++; else if (d === 25) { passed++; close++; }
          else if (d < 0 && d >= -200) hits++;
          prev = m; nCars += g.obstacleCount; frames++;
        }
        lines += g.gateLines - l0;
        ff.step(DT);
      }
      out.push({ level, passedPerLine: +(passed / lines).toFixed(3), closePerLine: +(close / lines).toFixed(3), hitsPerLine: +(hits / lines).toFixed(3), avgCars: +(nCars / frames).toFixed(1), linesPerRun: +(lines / runs).toFixed(1) });
    }
    return out;
  }, runs);
  console.log(JSON.stringify(res, null, 0).replace(/},/g, '},\n'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
