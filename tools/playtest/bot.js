// In-page player. Reads only what a player can see (gate labels, car positions,
// own mass) through window.__gh, and steers by firing real pointer events at
// the canvas, so the game's own input code runs.
//
// PROFILES ARE FIXED HERE BEFORE ANY RUN (pre-registered, see sim/README.md).
// Every value is tier D (GUESS) unless a source is named. The sweep in
// sim/gate-sim.js shows how much each one matters.
//
//   rt       seconds from a gate line becoming readable to committing to a door
//            anchor: simple reaction ~0.25s, three-way choice is slower (Hick's
//            law). Exact values GUESS.
//   read     how far ahead (world units) a gate label can be read at phone size.
//            GUESS. To be checked against real frames.
//   misread  chance per line of taking a random door instead of the intended one
//   x2       chance of understanding that x2 beats +big when mass > big
//   notice   chance of noticing any one car in time to steer round it
//   hand     top lateral steering speed, world units per second. GUESS.
(function () {
  const PROFILES = {
    casual:  { rt: 0.75, read: 40, misread: 0.20, x2: 0.50, notice: 0.75, hand: 14 },
    average: { rt: 0.50, read: 50, misread: 0.08, x2: 0.85, notice: 0.90, hand: 20 },
    sharp:   { rt: 0.30, read: 70, misread: 0.01, x2: 1.00, notice: 0.99, hand: 30 },
    // reference lines, not people
    passive: { passive: true },
    perfect: { rt: 0, read: 130, misread: 0, x2: 1, notice: 1, hand: 60 },
  };
  const LANE_W = 3.4, LANES = [-LANE_W, 0, LANE_W];
  const LOOK_S = 1.6;          // seconds of road ahead checked for cars
  const HEAVIEST = 800;        // bus; at or above this no car can kill you

  function parse(label) {
    if (label === 'x2') return { kind: 'mul' };
    if (label === '/2') return { kind: 'div' };
    let s = label.replace('+', ''), m = 1;
    if (s.endsWith('k')) { s = s.slice(0, -1); m = 1000; }
    return { kind: 'add', v: parseFloat(s) * m };
  }

  function make(profileName) {
    const p = PROFILES[profileName];
    if (!p) throw new Error('unknown profile ' + profileName);
    const canvas = document.querySelector('#canvasHost canvas');
    const decided = new Map();     // line z -> {readAt, lane}
    const seen = new Map();        // car key -> noticed?
    let down = false, lastX = 195, t = 0;
    const stats = { lines: 0, wrong: 0, x2Missed: 0 };

    function ev(type, x) {
      canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: 500, pointerId: 1, pointerType: 'touch', isPrimary: true }));
    }
    function steer(dxWorld) {
      // screen pixels per world unit is what steerScale() in the game inverts
      const roadApprox = 3 * LANE_W + 2;
      const scale = (roadApprox - 0.7) / Math.max(240, window.innerWidth * 0.55);
      if (!down) { down = true; lastX = 195; ev('pointerdown', lastX); }
      lastX += dxWorld / scale;
      ev('pointermove', lastX);
    }

    function door(gates, massNow) {
      let best = 0, bestV = -Infinity, insight = Math.random() < p.x2;
      gates.forEach((g, i) => {
        const d = parse(g.l);
        let v;
        if (d.kind === 'add') v = massNow + d.v;
        else if (d.kind === 'div') v = massNow / 2;
        else v = insight ? massNow * 2 : -1;   // without insight x2 reads as "no number"
        if (v > bestV) { bestV = v; best = i; }
      });
      return best;
    }

    function tick(dt) {
      t += dt;
      const g = window.__gh;
      if (g.state !== 'playing' || p.passive) return;
      const pz = g.playerZ, px = g.playerX, mass = g.mass, spd = Math.max(8, g.speed);

      // gate line ahead, nearest first
      const byZ = new Map();
      for (const d of g.gateInfo) {
        if (d.used || d.z >= pz) continue;
        if (!byZ.has(d.z)) byZ.set(d.z, []);
        byZ.get(d.z).push(d);
      }
      const zs = [...byZ.keys()].sort((a, b) => b - a);
      let targetX = LANES.reduce((a, b) => Math.abs(b - px) < Math.abs(a - px) ? b : a);
      if (zs.length) {
        const z = zs[0], dist = pz - z;
        if (dist <= p.read) {
          let d = decided.get(z);
          if (!d) { d = { readAt: t, lane: null }; decided.set(z, d); }
          if (d.lane === null && t - d.readAt >= p.rt) {
            const row = byZ.get(z).sort((a, b) => a.x - b.x);
            const want = door(row, mass);
            d.want = want;
            d.lane = Math.random() < p.misread ? Math.floor(Math.random() * 3) : want;
            stats.lines++;
            if (d.lane !== want) stats.wrong++;
          }
          if (d.lane !== null) targetX = LANES[d.lane];
        }
      }

      // cars: only cars the player noticed are steered round, and only while a
      // hit would kill. Past the heaviest car, drivers plough straight on.
      if (mass < HEAVIEST) {
        const look = spd * LOOK_S;
        const box = g.boxes, hw = box.hw, hl = box.hl;
        const cars = [];
        for (const c of g.carFull) {
          const ahead = pz - c.z;
          if (ahead < -(hl + 3) || ahead > look) continue;
          // identity by position would re-roll as a car moves, so roll once per
          // car using its order in the road; good enough for a notice chance
          const key = Math.round(c.x / 3.4) + ':' + Math.round(c.z / 25);
          if (!seen.has(key)) seen.set(key, Math.random() < p.notice);
          if (seen.get(key)) cars.push({ x: c.x, ahead });
        }
        const CAR_HW = 1.25, MARGIN = 0.25;
        const hits = (x, near) => cars.some(c => c.ahead <= near && Math.abs(c.x - x) < CAR_HW + hw + MARGIN);
        // can I get from here to x without touching anything alongside me?
        const sweepClear = x => {
          const time = Math.abs(x - px) / Math.max(1, p.hand) + 0.15, reach = spd * time + hl + 2;
          const lo = Math.min(px, x) - (CAR_HW + hw), hi = Math.max(px, x) + (CAR_HW + hw);
          return !cars.some(c => c.ahead <= reach && c.x > lo && c.x < hi && Math.abs(c.x - px) > 0.01 && Math.abs(x - px) > 0.5);
        };
        const ok = x => !hits(x, look) && sweepClear(x);
        const nearest = LANES.reduce((a, b) => Math.abs(b - px) < Math.abs(a - px) ? b : a);
        if (!ok(targetX)) {
          // door blocked or unreachable: keep to a clear lane, nearest first.
          const order = [nearest, ...LANES.slice().sort((a, b) => Math.abs(a - px) - Math.abs(b - px))];
          const pick = order.find(ok);
          if (pick !== undefined) targetX = pick;
          else {
            // boxed in: go wherever the first contact is furthest away
            let best = nearest, far = -1;
            for (const x of LANES) {
              const d = Math.min(...cars.filter(c => Math.abs(c.x - x) < CAR_HW + hw).map(c => c.ahead), 1e9);
              if (d > far) { far = d; best = x; }
            }
            targetX = best;
          }
        }
      }

      const err = targetX - px;
      if (Math.abs(err) > 0.15) {
        const maxStep = p.hand * dt;
        steer(Math.max(-maxStep, Math.min(maxStep, err)));
      }
    }
    function reset() { decided.clear(); seen.clear(); if (down) { ev('pointerup', lastX); down = false; } }
    return { tick, reset, stats };
  }
  window.__botMake = make;
  window.__botProfiles = PROFILES;
})();
