// The shipped update() loop, clock stepped by hand at 60 steps per second, no
// drawing, seeded. Real traffic, real collisions, real gates.
// usage: node fast.js <out.json> <runsPerLevel> <levels|all> <profiles> [pages]
const fs = require('fs');
const { launch, phonePage, openFast } = require('./lib');

function runBatch({ level, profile, runs }) {
  // runs inside the page, so it cannot see this file's constants
  const DT = 1 / 60, MAX_STEPS = 60 * 120;
  const g = window.__gh, ff = window.__ff, rows = [];
  const bot = window.__botMake(profile);
  ff.reseed(level * 1000 + profile.length * 7 + profile.charCodeAt(0));
  for (let r = 0; r < runs; r++) {
    bot.reset(); g.setLevel(level);
    let steps = 0, t800 = null, carsMin = 1e9, carsMax = 0, lastMass = g.mass, prevOver = false, smashes = 0, zEnd = 0, bz = g.barricadeZ;
    while (g.state === 'playing' && steps < MAX_STEPS) {
      ff.step(DT); bot.tick(DT); steps++;
      const m = g.mass, n = g.obstacleCount;
      if (n < carsMin) carsMin = n; if (n > carsMax) carsMax = n;
      if (t800 === null && m >= 800) t800 = steps * DT;
      lastMass = m; zEnd = g.playerZ;
    }
    const need = g.need, nearWall = bz !== null && Math.abs(zEnd - bz) < 12;
    const win = nearWall && lastMass >= need;
    rows.push({ win, crash: !nearWall, mass: lastMass, need, secs: +(steps * DT).toFixed(1), z: Math.round(-zEnd), t800: t800 === null ? null : +t800.toFixed(1), carsMin, carsMax, skipped: window.__skipped || 0 });
    // let a win's smash finish its bookkeeping so the next setLevel is clean
    for (let i = 0; i < 3; i++) ff.step(DT);
  }
  return { rows, lines: bot.stats };
}

(async () => {
  const [out, runsS, levelsS, profilesS, pagesS] = process.argv.slice(2);
  const runs = Number(runsS), pages = Number(pagesS || 1);
  const levels = levelsS === 'all' ? Array.from({ length: 20 }, (_, i) => i + 1) : levelsS.split(',').map(Number);
  const profiles = profilesS.split(',');
  const jobs = [];
  // Resume: anything already in the output file is kept and not run again.
  const results = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [];
  const have = new Set(results.map(r => r.profile + ':' + r.level));
  for (const profile of profiles) for (const level of levels) if (!have.has(profile + ':' + level)) jobs.push({ level, profile, runs });
  const browser = await launch({ headless: true });
  let seed = 1000; const t0 = Date.now(); let done = 0;
  await Promise.all(Array.from({ length: pages }, async () => {
    const page = await phonePage(browser); await openFast(page, seed++);
    while (jobs.length) {
      const job = jobs.shift();
      // a fresh page per batch keeps memory flat on a small machine
      await page.reload(); await page.addScriptTag({ content: fs.readFileSync(require('path').join(__dirname, 'bot.js'), 'utf8') });
      await page.waitForFunction(() => !!window.__gh && !!window.__ff);
      const r = await page.evaluate(runBatch, job);
      const heapMB = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
      const rows = r.rows, n = rows.length, avg = f => rows.reduce((s, x) => s + f(x), 0) / n;
      const t8 = rows.filter(x => x.t800 !== null).map(x => x.t800).sort((a, b) => a - b);
      const summary = { profile: job.profile, level: job.level, runs: n, win: +avg(x => +x.win).toFixed(3), crash: +avg(x => +x.crash).toFixed(3),
        wallFail: +avg(x => +(!x.win && !x.crash)).toFixed(3), avgMass: Math.round(avg(x => x.mass)), need: rows[0].need, avgSecs: +avg(x => x.secs).toFixed(1),
        t800med: t8.length ? t8[t8.length >> 1] : null, carsMin: Math.min(...rows.map(x => x.carsMin)), carsMax: Math.max(...rows.map(x => x.carsMax)), errors: page.errors.length, heapMB };
      if (page.errors.length) summary.errorText = page.errors[0].slice(0, 300);
      results.push(summary); done++;
      console.log(JSON.stringify(summary) + `  [${done} jobs, ${((Date.now() - t0) / 1000).toFixed(0)}s]`);
      fs.writeFileSync(out, JSON.stringify(results, null, 0));
    }
  }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
