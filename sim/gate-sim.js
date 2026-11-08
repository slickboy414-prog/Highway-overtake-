#!/usr/bin/env node
// Gate Highway economy simulator, Claude Code's independent version.
// Node, no dependencies, fixed seed. Run: node sim/gate-sim.js
//
// Rules are parsed out of gate-highway-prototype.html (past line 337, never line
// 335), so this cannot drift from the build. What it adds on top is a model of a
// person, written down before any run. See sim/README.md.
const fs = require('fs'), path = require('path');
const lines = fs.readFileSync(path.join(__dirname, '..', 'gate-highway-prototype.html'), 'utf8').split('\n');
const game = lines.slice(337).join('\n');

function arr(name) {
  const m = game.match(new RegExp('const ' + name + '\\s*=\\s*\\[([\\s\\S]*?)\\]'));
  if (!m) throw new Error('missing ' + name + ' in prototype');
  return m[1].split(',').map(Number);
}
function num(name) {
  const m = game.match(new RegExp(name + '\\s*=\\s*([\\d.]+)'));
  if (!m) throw new Error('missing ' + name + ' in prototype');
  return Number(m[1]);
}
const NEED = arr('LEVEL_NEEDS'), ADD = arr('LEVEL_ADD'), BIG = arr('LEVEL_ADDBIG');
const MAX_SPEED = num('MAX_SPEED_ABS');
// The LEVELS formulas (prototype lines 1357-1376). Checked below against the text.
for (const f of ['18 + lv * 0.7', 'speedCap * 25.8', '10 + Math.min(4, (lv - 1) * 0.22)', 'Math.round(gateCount * 0.66)', '0.14 + lv * 0.02', 'lv <= 2 ? -1', 'lv <= 2 ? 0']) {
  if (!game.includes(f)) throw new Error('prototype formula changed, update the sim: ' + f);
}
function cfg(lv) {
  const speedCap = Math.min(MAX_SPEED, 18 + lv * 0.7);
  const lengthZ = Math.round(speedCap * 25.8);
  const gateCount = Math.round(10 + Math.min(4, (lv - 1) * 0.22));
  const spacing = lengthZ / (gateCount + 1);
  let n = 0;                                    // lines really placed: none in the last 60 units
  for (let z = -Math.min(26, spacing); z > -lengthZ + 60; z -= spacing) n++;
  return { speedCap, lengthZ, gateCount, spacing, lines: n,
    mulLine: lv <= 2 ? -1 : Math.round(gateCount * 0.66),
    redChance: lv <= 2 ? 0 : Math.min(0.45, 0.14 + lv * 0.02) };
}

// seeded RNG (mulberry32), so every run of this file prints the same numbers
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// PRE-REGISTERED PLAYERS. Same values as tools/playtest/bot.js. All tier D GUESS.
const PLAYERS = {
  casual:  { rt: 0.75, read: 40, misread: 0.20, x2: 0.50, notice: 0.75, hand: 14 },
  average: { rt: 0.50, read: 50, misread: 0.08, x2: 0.85, notice: 0.90, hand: 20 },
  sharp:   { rt: 0.30, read: 70, misread: 0.01, x2: 1.00, notice: 0.99, hand: 30 },
};
// Traffic, from the prototype's own tables: mass and spawn weight by kind.
const KINDS = [['sedan', 300, 2.8, 1], ['hatchback', 250, 1.8, 1], ['suv', 400, 1.6, 1], ['pickup', 450, 1.1, 1], ['van', 550, 0.9, 2], ['bus', 800, 0.5, 2], ['cone', 80, 1.1, 1], ['barrier', 150, 0.7, 3]];
if (!game.includes("bus:800") || !game.includes("cone:80")) throw new Error('OBSTACLE_MASS changed, update the sim');
const LANE_W = 3.4;
// Cars the player meets per gate line. Traffic rate is a game property, so these
// two are fitted once from a passive car in the real engine (tools/playtest), not
// from anyone's win rates: passed cars and cars in one's own lane per line.
// Measured by tools/playtest/traffic.js (real engine, car held at maximum width, per line):
const TRAFFIC = [[1, 0.453, 0.021, 0.184], [2, 0.496, 0.025, 0.221], [3, 1.626, 0.076, 0.495], [5, 1.684, 0.084, 0.55], [10, 2.076, 0.119, 0.613], [15, 2.581, 0.157, 0.764], [20, 2.663, 0.169, 0.838]];
function traffic(lv) {
  let a = TRAFFIC[0], b = TRAFFIC[TRAFFIC.length - 1];
  for (let i = 0; i < TRAFFIC.length - 1; i++) if (lv >= TRAFFIC[i][0] && lv <= TRAFFIC[i + 1][0]) { a = TRAFFIC[i]; b = TRAFFIC[i + 1]; break; }
  const t = b[0] === a[0] ? 0 : (lv - a[0]) / (b[0] - a[0]), mix = k => a[k] + (b[k] - a[k]) * t;
  return { passed: mix(1), close: mix(2), hit: mix(3) };
}
// A smaller car meets fewer cars. Width follows sizeForRatio in the prototype; 1.25 is a
// car's half width, and the car's own half width is about 1 unit at scale 1.
function widthFactor(mass, need) { const w = 0.6 + 1.35 * Math.pow(Math.min(1, mass / need / 2.5), 0.55); return (1.25 + w) / (1.25 + 1.95); }

function pickKind(lv, r) {
  const opts = KINDS.filter(k => lv >= k[3]);
  let x = r() * opts.reduce((s, k) => s + k[2], 0);
  for (const k of opts) { x -= k[2]; if (x <= 0) return k; }
  return opts[0];
}

// one level, one person
function run(lv, p, r) {
  const c = cfg(lv), G = { add: ADD[lv - 1], big: BIG[lv - 1] };
  let mass = 100, lane = 1;
  for (let i = 0; i < c.lines; i++) {
    // cars between the last line and this one
    const T = traffic(lv);
    const inLane = r() < T.hit * widthFactor(mass, NEED[lv - 1]);
    if (inLane && r() > p.notice) {
      const k = pickKind(lv, r);
      if (mass < k[1]) return { win: false, crash: true, mass };
      mass = Math.max(10, Math.round(mass - k[1] * 0.25));
    }
    mass += Math.round(T.passed * 5 + T.close * 20);

    // the doors, same rule as spawnGatePair
    let doors;
    if (i === c.mulLine) doors = ['add', 'big', 'mul'];
    else if (c.redChance > 0 && r() < c.redChance) doors = ['div', 'add', 'big'];
    else doors = ['add', 'big', r() < 0.5 ? 'add' : 'big'];
    for (let a = 2; a > 0; a--) { const b = Math.floor(r() * (a + 1)); [doors[a], doors[b]] = [doors[b], doors[a]]; }

    // what the person wants
    const insight = r() < p.x2;
    const val = d => d === 'add' ? mass + G.add : d === 'big' ? mass + G.big : d === 'div' ? mass / 2 : (insight ? mass * 2 : -1);
    let want = 0; for (let d = 1; d < 3; d++) if (val(doors[d]) > val(doors[want])) want = d;
    // can they get there? time from label readable to the door, less reaction
    const speed = Math.max(9, c.speedCap * 0.86 * (0.82 + 0.18 * (i + 1) / c.lines));
    const window_ = Math.min(p.read, c.spacing) / speed - p.rt;
    const lanesReach = Math.floor(Math.max(0, window_) * p.hand / LANE_W + 1e-9);
    let target = want;
    if (Math.abs(want - lane) > lanesReach) target = lane + Math.sign(want - lane) * lanesReach;
    if (r() < p.misread) target = Math.floor(r() * 3);
    lane = target;
    const d = doors[lane];
    if (d === 'add') mass += G.add; else if (d === 'big') mass += G.big;
    else if (d === 'mul') mass *= 2; else mass = Math.max(10, mass / 2);
    mass = Math.round(mass);
  }
  return { win: mass >= NEED[lv - 1], crash: false, mass };
}

function ci(w, n) { const z = 1.96, p = w / n, d = 1 + z * z / n, m = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [m - h, m + h]; }

// Control: the plainest possible reading of "skill = chance of the best door".
// No traffic, no reach. Separates "different model" from "different code".
function pickRate(lv, s, r) {
  const c = cfg(lv), G = { add: ADD[lv - 1], big: BIG[lv - 1] };
  let mass = 100;
  for (let i = 0; i < c.lines; i++) {
    let doors;
    if (i === c.mulLine) doors = ['add', 'big', 'mul'];
    else if (c.redChance > 0 && r() < c.redChance) doors = ['div', 'add', 'big'];
    else doors = ['add', 'big', r() < 0.5 ? 'add' : 'big'];
    const val = d => d === 'add' ? mass + G.add : d === 'big' ? mass + G.big : d === 'div' ? mass / 2 : mass * 2;
    const best = doors.slice().sort((a, b) => val(b) - val(a))[0];
    const d = r() < s ? best : doors[Math.floor(r() * 3)];
    mass = Math.round(d === 'div' ? Math.max(10, mass / 2) : val(d));
  }
  return mass >= NEED[lv - 1];
}

const RUNS = Number(process.argv[2] || 5000), out = { runs: RUNS, seed: 20261108, players: {}, control: {}, sweep: {}, structure: [] };
for (let lv = 1; lv <= 20; lv++) {
  const c = cfg(lv), bigAll = (() => { let m = 100; for (let i = 0; i < c.lines; i++) m = i === c.mulLine ? m * 2 : m + BIG[lv - 1]; return m; })();
  const addAll = 100 + c.lines * ADD[lv - 1];
  out.structure.push({ level: lv, need: NEED[lv - 1], lines: c.lines, mulLine: c.mulLine, maxMass: bigAll, needPctOfMax: +(100 * NEED[lv - 1] / bigAll).toFixed(1), allSmallMass: addAll, firstGateClearsBus: 100 + BIG[lv - 1] >= 800, linesToBusSafe: Math.ceil(700 / BIG[lv - 1]), secsAtCruise: +(c.lengthZ / (c.speedCap * 0.86 * 0.91)).toFixed(1) });
}
for (const name of Object.keys(PLAYERS)) {
  out.players[name] = [];
  for (let lv = 1; lv <= 20; lv++) {
    const r = rng(out.seed + lv * 101 + name.length); let w = 0, cr = 0, m = 0;
    for (let i = 0; i < RUNS; i++) { const x = run(lv, PLAYERS[name], r); if (x.win) w++; if (x.crash) cr++; m += x.mass; }
    const [a, b] = ci(w, RUNS);
    out.players[name].push({ level: lv, win: +(w / RUNS).toFixed(3), lo: +a.toFixed(3), hi: +b.toFixed(3), crash: +(cr / RUNS).toFixed(3), avgMass: Math.round(m / RUNS) });
  }
}
for (const s of [0.45, 0.72, 0.95]) {
  out.control[s] = [];
  for (let lv = 1; lv <= 20; lv++) { const r = rng(out.seed + lv * 7 + Math.round(s * 100)); let w = 0; for (let i = 0; i < RUNS; i++) if (pickRate(lv, s, r)) w++; out.control[s].push(+(w / RUNS).toFixed(3)); }
}
// How much does the answer depend on each guessed number? Move one at a time from
// "average" to the casual and sharp values; report win rate at levels 5, 10, 20.
for (const key of ['rt', 'read', 'misread', 'x2', 'notice', 'hand']) {
  out.sweep[key] = {};
  for (const side of ['casual', 'sharp']) {
    const p = { ...PLAYERS.average, [key]: PLAYERS[side][key] };
    out.sweep[key][side + '=' + PLAYERS[side][key]] = [5, 10, 20].map(lv => { const r = rng(out.seed + lv); let w = 0; for (let i = 0; i < RUNS; i++) if (run(lv, p, r).win) w++; return +(w / RUNS).toFixed(3); });
  }
}
fs.writeFileSync(path.join(__dirname, 'results', 'gate-sim.json'), JSON.stringify(out, null, 1));
const pad = (x, n) => String(x).padStart(n);
console.log('lvl   need  lines  max     need%max | casual average sharp | control .45 .72 .95');
for (let i = 0; i < 20; i++) { const s = out.structure[i]; console.log(pad(s.level, 3), pad(s.need, 6), pad(s.lines, 4), pad(s.maxMass, 7), pad(s.needPctOfMax, 6), ' |', pad(out.players.casual[i].win, 6), pad(out.players.average[i].win, 6), pad(out.players.sharp[i].win, 6), ' |', pad(out.control['0.45'][i], 6), pad(out.control['0.72'][i], 6), pad(out.control['0.95'][i], 6)); }
console.log('sweep (win at L5, L10, L20):'); for (const k in out.sweep) console.log(' ', k, JSON.stringify(out.sweep[k]));
