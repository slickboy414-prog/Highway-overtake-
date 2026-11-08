# Brief for Claude Code — Gate Highway (v2)

You are taking over the build of a browser driving game. A Claude.ai chat
session designed and prototyped it; you build it from here. The chat session
stays on design, research, simulation and review, and reviews what you ship.

Read sections 1 and 2 before you touch anything. They are the parts that can
cost real damage if skipped.

---

## 1. Hard constraints — breaking any of these is the worst outcome

**The repo is not ours.** It belongs to `slickboy414-prog`. Mumathai is an
invited collaborator. **Never push to `main`.** Work on a branch, open a pull
request, and let the owner decide. If you are unsure whether a push is allowed,
it is not.

**Never grep or read `gate-highway-prototype.html` without a line filter.**
Line 335 of that file is a single 603,352-character line holding all of minified
Three.js r128. One unfiltered `grep` on a matching token dumps 603 KB into
context and ends your useful session. The game code is lines 338 to 2763.
Always filter:

```powershell
# PowerShell
Select-String -Path gate-highway-prototype.html -Pattern 'LEVEL_NEEDS' | Where-Object { $_.LineNumber -gt 337 }
```
```bash
# bash / git-bash
awk 'NR>337' gate-highway-prototype.html | grep -n 'LEVEL_NEEDS'
```

**Never change an economy number without a simulator.** See section 4.

**Never proceed on two instructions that contradict each other.** Stop and ask
Mumathai. This is his first standing rule and he has said it must never be
broken at whatever cost. It applies to contradictions inside this document too —
if you find one, that is a finding, not a puzzle for you to resolve quietly.

**The game must fit any device frame, always.** His second standing rule. Not
"must not overflow" — must look right. A frame that technically fits and shows
an empty world is a failure. That exact mistake has already been made here.

**Decide nothing irreversible alone.** Pushing to a remote, rewriting the
economy, changing genre or engine, deleting a subsystem: these go to Mumathai
first, or to the ledger with a case made.

## 2. The three shared documents

Read all three before writing code. Both agents work from these; neither
invents a fourth source.

1. **The review ledger** — https://claude.ai/artifact/VTVthmD15cyqMvrwmuR21k
   How the two of us correspond, the evidence tiers, the verdict words, the
   open challenges, and Letter 001 which is addressed to you. Also in the
   project as `claude/04-review-ledger-protocol.md`.
2. **The design doc** — https://claude.ai/artifact/Tykke3Ezk1Jg5bzJZn4w3U
   Five tabs: Research, Build spec, Audio brief, Decision log, Journey log.
   Every decision on this project and why it was made.
3. **The research report** — Supersonic and other top publishers on gate-runner
   design, testing and scaling. Public:
   https://claude.ai/chat/eb403fff-9223-4c02-ad51-d87a18d3c05c?artifactId=compass_artifact_wf-9e83e940-fe1e-8126-bb17-38e30f7263ee_text%2Fmarkdown&versionUuid=01a1b557-be15-76f2-8b8d-6434d8da276a

Project docs, in the claude.ai project "Mr beast":
`claude/00-master-brief.md`, `01-rules.md`, `02-standards.md`,
`03-ideas-notebook.md`, `04-review-ledger-protocol.md`.

## 3. The file map — which file is the truth

| File | What it is | Touch it? |
|---|---|---|
| `gate-highway-prototype.html` | **The build.** 2,765 lines, 725 KB, Three.js inlined at line 335. Single file, no build step, no dependencies | Yes. This is the game |
| `index.html` | The repo's original game, 1,410 lines. Untouched since the fork | No. Reference only |
| `playables/` | YouTube's own `ytgame` SDK integration | Wrong route. Must be replaced with the Playgama Bridge SDK |
| `README.md` | The original repo's readme | Leave it |

The economy simulator (`sim/final.js`) exists only in the chat workspace and is
**not in this repo and not on your machine.** That is deliberate — see task 1.

## 4. What the game is, and where it goes

A car drives itself down a three-lane motorway. Every few seconds a line of
three gates spans the road, each showing a value. Solid posts between the gates
make it one choice, not three. The gate changes the car's MASS and the car
visibly changes with it. Each level ends at a barricade with a mass requirement:
clear it and you smash through, fall short and you crash. Levels run about 30
seconds. Twenty levels. Everything resets each level.

Published through **Playgama** to **YouTube Playables** and about 24 other web
portals. Playgama is an official Playables partner; their stated requirement is
their Bridge SDK.

**The goal is not a top-ten chart position.** The Playables top ten are proven
mobile hits from industrial publishers with paid user acquisition behind them.
Playgama's own racing titles sit at 5 to 11 million plays; that is the realistic
band. The winnable goal is **retention good enough that Playgama spends its own
money promoting the game.** The route is Playgama Sandbox, where real retention
data decides instead of opinion.

**Platform limits.** Initial bundle must be under 30 MiB and should be under
15 MiB. Playable within 5 seconds. No external network calls. 512 MB JS heap.
Interstitial and rewarded ads only — no banners, no in-app purchases. The game
must pause and mute instantly on platform command.

### The economy, and why it is the most dangerous part of this codebase

An earlier version shipped multiplying gates (`×2`, `×3`) across twelve lines.
That is a ceiling of 3^12, or 531,441 times the starting value. Simulated
afterwards: **478,296,900 mass against a requirement of 6,300 at level 20** —
nine digits on screen, and the barricade had stopped being a test. Mumathai
found it by playing for ten minutes.

Two causes, both worth remembering. Multiplying gates compound. And the source
was misread: Supersonic wrote that a gate "can communicate +100, +300, and
more" — their examples are **additive**. The word "multiplier" came from
elsewhere in their writing and the two were fused.

It was replaced with additive gates whose values scale per level, plus exactly
one guaranteed doubling line per level — guaranteed rather than random, because
a random multiplier made clearing the wall depend on luck instead of choice.
The current arrays are `LEVEL_NEEDS`, `LEVEL_ADD` and `LEVEL_ADDBIG`, and the
chat's simulator produced these win rates over 5,000 runs a level at three
skill levels (careless 0.45, average 0.72, skilled 0.95):

| Level | Need | Careless | Average | Skilled |
|---|---|---|---|---|
| 1 | 440 | 100% | 100% | 100% |
| 10 | 6,010 | 48% | 74% | 96% |
| 20 | 46,330 | 34% | 59% | 92% |

Those three skill rates were invented. That is the weakest number in the whole
design and it is load-bearing.

## 5. What is built and measured

- Three-lane road, drag-anywhere steering (not lane-locked), large GAS and BRAKE
  pedals, pause wired as `window.GH.pause()` ready for the Bridge SDK
- Gate lines of three doors with solid posts between them. Verified over 18
  seconds of deliberate weaving: exactly one gate taken per line, zero lines
  skippable
- Gate lines slide to the clearest nearby slot and keep clear of traffic out of
  sight, so a lorry can never block a door. Verified across 737 checks
- Barricade with slow-motion smash, 21 flying pieces, and a fail screen showing
  how close you came
- Six car stages driven by `mass ÷ level need`, not raw mass: BANGER, FIXED,
  TUNED, SPORT, MUSCLE, BEAST
- Non-uniform growth, 0.60x to 1.95x wide (lane-capped) and up to 3.5x tall,
  with the camera lifting and pulling back as the car grows
- Traffic around 22 to 29 cars, clustered near the player
- Roadside world: lamp posts every 13 units, bridges every 150, tall buildings,
  clouds, dense props
- In-level acceleration from 82% to 100% of the level cap as the wall approaches
- Frames checked at 390x844, 844x390, 320x568, 820x1180, 1440x900, 600x600,
  1920x600. Zero JavaScript errors across every run

**Test hooks.** `window.__gh` exposes `setLevel`, `setMass`, `jumpToBarricade`,
`dropCarAhead`, `tierName`, `obstacleCount` and more. **They must be deleted
before release.** Nothing currently enforces that.

All of the above was measured headless at about 10 frames a second, which means
**the game ran at half speed every time it was checked.** No human has watched
this game at full speed on a phone except Mumathai, in videos. You can.

## 6. The settled direction, and what is still open

**Settled: the car is tuned, not inflated.** Mumathai's position, which the chat
session resisted for three exchanges and then lost: start with a shabby car, add
an engine, a bull bar, paint, lights. A garage, not a balloon. Gates show
**images** of what is being added, with the number as fine print.

Why he won, on the evidence: Supersonic's own brief says transformation in
"size, shape, speed, **or value**" — four channels, not one. Of their four games
in the Playables top ten only Tall Man Run grows in size, and Build a Queen at
106 million plays is about what the character wears. The chat session had
defended size growth on a sample of one game. His stronger argument: a method
that only works by making things bigger does not generalise to the next game.
"Transform the thing the player owns" does.

**Settled: the genre.** This is a gate runner and this build stays one. Race
Master 3D at 87 million plays is a racing game with upgrades and may well be the
better neighbour to copy, but that is a decision for the next game or for
evidence, not for mid-build. It sits in the ledger's Open challenges as row 3
and reopens only on data.

**Still open, and listed in the ledger with what would settle each:** whether
size growth earns its place at all now that spec is dramatic; whether thirty
seconds is the right level length; whether Playgama requires portrait or only
9:16 scaling; what Playgama's revenue split actually is; whether the invented
skill rates match real play.

**One unsolved design problem, which is yours to solve:** icon gates must stay
unambiguous. `+95` against `×2` has an obvious right answer at a given mass. An
engine icon against a paint can does not, unless the value is still legible. How
do you keep the image as the hero without the number quietly doing all the work?

## 7. Your tasks, in order, each with a done condition

### Task 1 — Land, look, and attack

1. Run `claude mcp list` (or `/mcp`). Confirm whether Claude Docs is connected.
   If it is not, say so — it is a setting in claude.ai Connectors, not a limit
   of Claude Code.
2. Open `gate-highway-prototype.html` in a real browser at a real phone frame
   and **play it.** Full speed, your own eyes. Four of this build's faults were
   found by Mumathai playing, not by any test.
3. Read the three documents in section 2, Letter 001 included.
4. **Write your own economy simulator before reading the chat's numbers closely.
   Pick your own skill model.** Then compare against the table in section 4. If
   you land somewhere else, one of us is wrong and the question is settleable.
5. Open the sources yourself. Do not take the evidence tiers on trust — rule 5
   of the ledger protocol exists because the chat session already fused two
   unrelated lines from one publisher into a mechanic that broke the game.
   Supersonic was sold by Unity to Tripledot in August 2026; check whether the
   published guidance still reflects how they work.

**Done when:** Letter 002 is in the ledger, carrying the connector result, your
independent win-rate curve beside the chat's, a verdict word on each of Letter
001's six claims, and at least one thing you would have built differently.

### Task 2 — The garage system

Coins have accumulated since the first version and buy nothing. Mumathai has
raised this three times. It is the oldest unpaid debt in the project.

**It is one system with three surfaces, not three tasks.** The shop sells the
parts, the gates bolt them on, the car wears them. Building the shop before the
spec ladder means building it twice — Mumathai said it himself: what the car
becomes depends on what was bought in the garage.

- **Spec ladder:** the part pool the car is built from. Currently a flat six
  stages driven by a mass ratio, with parts named in `TIER_NAMES` and flags like
  `bull`, `snorkel`, `plough`, `cage`, `winch`. Spec becomes the hero; size
  becomes a quiet supporting cue.
- **Icon gates:** engine, paint can, bull bar as images, number as fine print.
  Solve the ambiguity problem in section 6 before you build it.
- **Colour:** Mumathai wants the aggression pushed harder than the current
  six-stage shift.
- **Shop:** reached from the level-complete screen, never a front menu. Chassis
  and part pools first; dash and shield power-ups later as rewarded-ad hooks.

**Done when:** a coin earned in a level can be spent on something that visibly
changes the car in the next level, and a video of that happening is in the
ledger. Not a screenshot of a menu.

### Task 3 — Sound

The game is completely silent. Web Audio generated in code, no files — the
bundle budget is tight and the engine note must track actual speed. The full
audio brief is the third tab of the design doc; read it rather than inventing
one.

**Done when:** engine note tracks speed, a gate taken and a gate missed sound
different, the wall smash lands, and everything mutes instantly on
`window.GH.pause()`.

### Task 4 — Ship preparation

- Replace the `ytgame` SDK in `playables/` with the Playgama Bridge SDK
- Delete `window.__gh` and every test hook
- Measure the initial bundle against 30 MiB hard and 15 MiB soft
- Confirm interactive within 5 seconds, no external network calls
- Walk every device frame again and look at the world inside the frame, not
  just the edges

**Done when:** a Playgama Sandbox submission could be made the same day.

## 8. His standing rules

1. **Never proceed on contradicting instructions.** Stop and confirm. A rule
   that must never be broken at whatever cost.
2. **The game must fit any device frame, always.**
3. **Every decision written down with its reasoning and evidence.** No recorded
   why means the decision is not finished.
4. **Plain, simple English when talking to him.** No filler, no flattery.
5. **Push back when a premise is wrong.**
6. **Treat AI research as unverified until checked against primary sources.**
7. **Interview before building.** He says he is not good at prompting and would
   rather be asked than have assumptions made.
8. **Never call him "Mwalimu."** He goes by Mumathai.
9. **Capture things as they are said.** File them immediately, do not wait.
10. **Never repeat a step, instruction or prompt already given.** Point back to
    it. Only restate something that has changed or improved. Repetition costs
    him credits for nothing.

Rule 10 applies to this document. Nothing already written in the design doc
belongs in a letter — point at it.

## 9. How we correspond

Full protocol in the ledger and in `claude/04-review-ledger-protocol.md`. The
short version:

- No work counts as done until it has been written up in the ledger and
  attacked by the other side.
- **Silent agreement is a failure.** Every critique must either name a challenge
  or list exactly what it checked and what it found. "Looks good" is not a
  reply.
- **If one side calls bullshit, the other takes it.** You hold your position
  only by producing tier A or B evidence on the spot. Defending with nothing
  behind it is the one thing that cannot happen.
- Your job is to hold the chat session to its best. Its job is to hold you to
  yours. Mumathai has said plainly that he cannot make either of us work at our
  best, so that part is on us.
- Ask him directly for anything you need — access, a file, a video, a decision,
  a number. Working around a gap instead of asking is a failure, not
  resourcefulness.

The chat session has made real errors here: an unsimulated economy that ran to
nine digits, a misread source, a deleted subsystem that passed a syntax check, a
test that checked the wrong thing, a claim about your own capabilities that was
never checked, and three versions of a currency with nothing to spend it on.
Assume there are more and say so plainly.
