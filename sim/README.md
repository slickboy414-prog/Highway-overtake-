# Economy simulator (Claude Code's independent version)

Run from the repo root: `node sim/gate-sim.js` (Node only, no install). Fixed seed, so
the same file gives the same numbers. Rules are read out of
`gate-highway-prototype.html`; the script stops with an error if a formula it depends
on has changed.

Second check: `tools/playtest/fast.js` runs the game's real `update()` loop, with its
clock stepped by hand and drawing off, using the same three players. Results are in
`results/real-engine.json`.

## What I had already seen before writing this

I could not write this blind, and that is on the record. The brief I was told to read
first, and the code comments at lines 1326-1329, print the win rates at levels 1, 10
and 20 and the three skill rates. I also read the game's own arrays, which any simulator
needs. I had not read the other 17 levels of the chat session's curve, its script, or the
Build spec, Decision log and Journey log.

## The player model, fixed before any full run

Skill is not one number. These six values are all **tier D, GUESS**, and they are here so
they can be attacked. The sweep in the output shows which ones matter.

| Value | Casual | Average | Sharp | Meaning |
|---|---|---|---|---|
| `rt` | 0.75 s | 0.50 s | 0.30 s | Label readable to committed to a door |
| `read` | 40 | 50 | 70 | World units ahead a label can be read at phone size |
| `misread` | 20% | 8% | 1% | Chance per line of a random door |
| `x2` | 50% | 85% | 100% | Chance of knowing x2 beats +big when mass is above big |
| `notice` | 75% | 90% | 99% | Chance of seeing a given car in time |
| `hand` | 14 | 20 | 30 | Top steering speed, units per second |

Reference lines in the real-engine run: `passive` never steers, `perfect` has no human limits.

## Changes made before the full run, so nobody has to guess

The first version of the bot's dodging was bad: its "perfect" player crashed 52% on level 1,
more than a car that never steers (28%). I fixed the driving logic (real car width, checking
the lane it sweeps through). The profile numbers above did not change.

The `TRAFFIC` table in `gate-sim.js` holds traffic rates measured by `tools/playtest/traffic.js`
in the real engine, not fitted to anyone's win rates. My first version had two typed-in placeholders
here; they were replaced before the freeze.

## Known limits

- This models the game with bots. No real player has been measured. Open challenge 6 stays open.
- `gate-sim.js` is deliberately simple about traffic. Where it and the real engine differ,
  trust the real engine.

## After the freeze (commit 323a9b6): what the real engine showed

`results/real-engine.json` holds the real-game runs: casual levels 1-18 at 400 runs a level, everything else
at 200. The first run was stopped by the system for low memory, then resumed with one browser and fewer runs.
At 200 runs the margin is at most about 7 points either way. A batch in the resumed run logged one page error
that I could not reproduce and did not capture the text of. Two later batches, and every run of the file as on
disk, logged none.

**Where gate-sim.js is wrong.** My own Node model is too kind early because its traffic is too simple.
Average player, Node vs real: level 3 93% vs 69%, level 5 93% vs 67%, level 10 84% vs 70%, level 20 70% vs 71%.
Use the real-engine numbers. Reaction time, read distance and hand speed changed nothing in the Node model.
That says the model does not test them, not that they do not matter.

**Bot limits.** These are bots with guessed profiles, not people. Even the `perfect` bot wall-fails up to 10%
on levels 3-8, and I have not separated the game's cause from the bot's.

Other scripts: `tools/playtest/checks.js` (frames, crash, smash), `traffic.js` (rates), `realtime.js`
(frame rate, real clock), `myplay.js` (me deciding from drawn frames).
