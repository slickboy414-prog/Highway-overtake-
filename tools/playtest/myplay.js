// Claude Code playing by looking. The clock only moves when stepped, so the game
// waits while I decide. Stateless: replays my moves from a fixed seed, stops at the
// next decision, draws that frame and saves it.
// usage: node myplay.js <level> <seed> <moves, e.g. C,CL,R> <out.png>  L/C/R = lane to hold; two letters = move at 22 units from the door
const { launch, phonePage, openFast } = require('./lib');
(async () => {
  const [level, seed, moves, out] = process.argv.slice(2);
  const browser = await launch(); const page = await phonePage(browser, 390, 844, 1);
  await openFast(page, Number(seed));
  page.setDefaultTimeout(120000);
  const res = await page.evaluate(({ level, moves }) => {
    const g = window.__gh, ff = window.__ff, DT = 1 / 60, LANES = { L: -3.4, C: 0, R: 3.4 };
    const canvas = document.querySelector('#canvasHost canvas');
    let down = false, lastX = 195;
    const ev = (t, x) => canvas.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: 500, pointerId: 1, pointerType: 'touch', isPrimary: true }));
    document.getElementById('overlay').style.display = 'none';
    g.setLevel(level);
    let i = 0, target = 0, late = null, steps = 0, stopZ = null;
    const nextLine = () => { const zs = g.gateInfo.filter(d => d.z < g.playerZ).map(d => d.z); return zs.length ? Math.max(...zs) : null; };
    let lastDecided = null;
    while (g.state === 'playing' && steps++ < 7200) {
      const z = nextLine();
      if (z !== null && g.playerZ - z <= 42 && z !== lastDecided) {
        if (i >= moves.length) { stopZ = z; break; }
        const m = moves[i++]; target = LANES[m[0]]; late = m[1] ? LANES[m[1]] : null; lastDecided = z;
      }
      if (late !== null && z !== null && g.playerZ - z <= 22) { target = late; late = null; }
      ff.step(DT);
      const err = target - g.playerX;
      if (Math.abs(err) > 0.15) { if (!down) { down = true; ev('pointerdown', lastX); } lastX += Math.max(-0.4, Math.min(0.4, err)) / (11.5 / Math.max(240, innerWidth * 0.55)); ev('pointermove', lastX); }
    }
    ff.draw = true; ff.step(DT); ff.draw = false;
    const row = g.gateInfo.filter(d => d.z === stopZ).sort((a, b) => a.x - b.x).map(d => d.l).join(' | ');
    return { decision: i, state: g.state, mass: g.mass, need: g.need, doors: row, x: +g.playerX.toFixed(1), tier: g.tierName };
  }, { level: Number(level), moves: moves === '-' ? [] : moves.split(',') });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: out });
  console.log(JSON.stringify(res), 'pageErrors:', JSON.stringify(page.errors.slice(0, 2)));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
