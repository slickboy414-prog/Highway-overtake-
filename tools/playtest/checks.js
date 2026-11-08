// Targeted checks in real Chrome with the file as on disk. usage: node checks.js <outDir>
const fs = require('fs'), path = require('path');
const { launch, phonePage, openReal } = require('./lib');
const FRAMES = [[390, 844], [844, 390], [320, 568], [820, 1180], [1440, 900], [600, 600], [1920, 600]];
const pollState = (page, want, ms) => page.waitForFunction(w => window.__gh.state === w, want, { timeout: ms, polling: 100 });

(async () => {
  const out = process.argv[2] || 'checks'; fs.mkdirSync(out, { recursive: true });
  const report = {};
  const browser = await launch();

  // 1. "Levels 1 and 2 cannot be failed": put the lightest moving car in front of a new player.
  {
    const page = await phonePage(browser, 390, 844, 1); await openReal(page); await page.click('#startBtn');
    report.level1Car = await page.evaluate(() => window.__gh.dropCarAhead('hatchback'));
    await pollState(page, 'over', 20000); await page.waitForFunction(() => document.getElementById('overlay').style.display !== 'none', null, { timeout: 5000 });
    report.level1CarResult = await page.evaluate(() => document.getElementById('overlay').innerText.replace(/\s+/g, ' '));
    await page.screenshot({ path: path.join(out, 'level1-crash.png') });
    await page.close();
  }

  // 2. Below the wall on level 1 with the smallest doors only (arithmetic from the game's arrays).
  // 3. What does traffic do to you once heavy? Level 20, after one +big door.
  {
    const page = await phonePage(browser, 390, 844, 1); await openReal(page); await page.click('#startBtn');
    await page.evaluate(() => window.__gh.setLevel(20));
    const before = await page.evaluate(() => { window.__gh.setMass(3165); return window.__gh.dropCarAhead('bus'); });
    await page.waitForFunction(() => window.__gh.mass !== 3165 || window.__gh.state !== 'playing', null, { timeout: 15000, polling: 50 });
    report.level20Bus = { before, massAfter: await page.evaluate(() => window.__gh.mass), state: await page.evaluate(() => window.__gh.state) };
    await page.close();
  }

  // 4. Every frame from rule 2: left lane, large car, mid level. Pictures are for looking at.
  report.frames = [];
  for (const [w, h] of FRAMES) {
    const page = await phonePage(browser, w, h, 1); await openReal(page); await page.click('#startBtn');
    await page.evaluate(() => window.__gh.setLevel(10));
    await page.waitForFunction(() => window.__gh.gateInfo.length > 0 && window.__gh.playerZ < -20, null, { timeout: 15000 });
    await page.screenshot({ path: path.join(out, `f${w}x${h}-a-start.png`) });
    await page.evaluate(() => window.__gh.setMass(14000));
    await page.keyboard.down('ArrowLeft');
    await page.waitForFunction(() => window.__gh.playerX < -2.5, null, { timeout: 5000 }).catch(() => {});
    await page.keyboard.up('ArrowLeft');
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(out, `f${w}x${h}-b-left-big.png`) });
    const off = await page.evaluate(() => { const bad = []; for (const id of ['btnGas', 'btnBrake', 'btnPause', 'massVal', 'goalVal', 'levelVal', 'coinVal']) { const e = document.getElementById(id); if (!e) { bad.push(id + ':missing'); continue; } const r = e.getBoundingClientRect(); if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) bad.push(id); } return bad; });
    report.frames.push({ w, h, offscreen: off, x: await page.evaluate(() => +window.__gh.playerX.toFixed(2)), limit: await page.evaluate(() => +window.__gh.steerLimit.toFixed(2)), errors: page.errors });
    await page.close();
  }
  fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
