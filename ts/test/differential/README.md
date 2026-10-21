# Differential test: the reconstruction against the original `app2.js`

`npm run test:integration` proves that `ts/` behaves like the shipped game, rather than only that it boots. It
plays every recorded scenario on two pages at once: one loads the repository's untouched root `app2.js`, the other
loads `ts/dist/app2.js` (built from the current source by the test itself). Both pages are compared after every
frame, and the test fails on the first difference. It reports the frame, what differed and both values.

CI runs it on every change to `ts/`, `app2.js`, `index.html` or `assets/`, in the runner's preinstalled Chrome.
Locally it needs Chrome's stable channel, or `CHROME_PATH` pointing at a Chrome or Chromium binary.

## How the two runs are made identical

`page-instrumentation.ts` runs in each page before any of its scripts, and removes every source of
nondeterminism the engine reads:

- `Math.random` is a seeded mulberry32, the same seed in both pages.
- `performance.now`, `Date.now` and a zero-argument `new Date()` read a virtual clock. The clock only moves when
  the test steps a frame, by exactly 1000/60 ms.
- `requestAnimationFrame`, `setTimeout` and `setInterval` go into one virtual scheduler. A frame runs the timers
  that fall due in it, in due order, then the animation-frame callbacks queued before it. Promise chains settle
  between callbacks, but the page never yields to the event loop mid-frame, so no network or load event can land
  at a different point in one run than in the other.
- An image's `src` write is held until the end of the frame. The held images then load one at a time, in the order
  the page asked for them, so asset timing cannot decide whether a skin is drawn on a given frame.
- The viewport is 1280x720 at a device pixel ratio of 1, and each page gets a fresh browser context with no
  cookies, so no saved profile or best score leaks in.
- No request touches the network. The page is opened at `http://paperio2.test/` (or `http://paperio.site/`), and
  puppeteer's request interception answers every request from the repository files inside the browser, aborting
  any request to another host. An earlier version served the files from a real local HTTP server. On a machine
  running a desktop ad blocker, the blocker injected a userscript into that page, and its single `Math.random`
  call shifted the seeded stream. Both builds still matched each other, but every scenario played differently
  from CI, and the scenario minimums were tuned to that polluted stream.

The original matches itself under this regime, frame for frame. That is the precondition for any comparison, and
it was checked before the first one was trusted.

## What is compared

- **Every canvas call, every frame.** Every `CanvasRenderingContext2D`, `Path2D` and `CanvasGradient` method
  call and property write, with its arguments, is recorded and hashed per frame. That covers what the engine
  renders onto every canvas, offscreen skin tiles included. Objects are named by type and first-use order
  (`Path2D#3`), never by identifier. So the obfuscated original and the renamed reconstruction compare directly. On a
  mismatch the harness diffs the two frames' call lists and reports the first differing call. Set
  `DIFFERENTIAL_DUMP=<directory>` to have both lists written there.
- **Game state, every 30 frames.** For each unit: name, position, direction, territory area, share of the map,
  trail length, killer. Then the game's cycle counter, the player, and every unit removed so far, with the frame
  it died on and its killer. Removals are recorded every frame, because a dead unit leaves `game.units` on the
  frame it dies. The obfuscator kept property names, so both builds expose the same fields. `null` and
  `undefined` are folded together here. See the audit below for why that is safe.
- **The final pixels**, as a hash of the main canvas's `toDataURL()`.

## Scenarios

`scenarios.ts` records them: a seed, a scripted route of held arrow keys, a frame count and the minimum count of
each event the run must reach. Holding two adjacent arrows steers diagonally, which is how `joystick.js` drives
the engine too. The game starts at frame 120 through `paperio2api.startGame()`, the call the shim's Play button
makes, and the first key goes down at frame 150.

| Scenario | Seed | Frames | Must reach |
| --- | --- | --- | --- |
| Capture loop | 9 | 2400 | 2 territory captures by the player, 1 bot killed by a bot |
| Killed by a bot, bots play on | 1 | 2400 | the player killed by a bot, 1 bot killed by a bot |
| Back across its own trail | 7 | 1200 | the player's death (no killer), 1 bot killed by a bot |
| Random walk (8 directions plus the pointer fallback) | 18 | 2400 | 1 capture, the player's death, 1 bot killed by a bot |
| Random walk on `paperio.site` | 18 | 1800 | the player's death, 1 bot killed by a bot |

Together they run 10200 frames of play, plus about 6000 updates per scenario of the pre-game warm-up the engine
simulates before it starts, in under two minutes. Random walks cross their own trails within a few hundred frames
whatever the seed; seed 18 was chosen because it survives longest and captures on the way.

The last scenario runs on `http://paperio.site/`, where the engine's domain lock takes its real-host branch and sets
`Player.prototype.moveTo`. That turns off the anti-piracy glitch, and with it one `Math.random` call per frame, and
turns on tail recovery. No other host takes that branch. When a coverage miss fails a scenario, the message carries
the player's path every 150 frames, its deaths, and the page's environment and `Math.random` count at the start. The
coverage minimums are there
so a scenario fails when it stops reaching what it was written for, for example when a changed spawn means the
route no longer steers into a bot. Without them it would keep passing on frames in which nothing happens.

The test was falsified before it was committed. Changing one constant in `src/game-api.ts` (the arena border
factor, `0.95` to `0.951`) fails it at frame 1 with
`Path2D#3.moveTo(1950,1000)` against `Path2D#3.moveTo(1951,1000)`.

## What it does not cover, and why

- **The menus and the results screen.** The test reaches the game through `startGame()`, so it never clicks
  through the preact UI or reads the DOM it renders, and the menu, settings and results screens are compared only
  as far as they draw on the canvas. The UI module is preact components over the same API, kept close to the
  original by the extraction of preact as a real dependency.
- **Touch and mouse input.** Only the keyboard path is scripted. The pointer fallback runs, because a route leg with
  no key held hands steering to it, but the pointer never moves. It stays at the centre of the screen.
- **Real timing.** Frames are exactly 1000/60 ms apart. Code that depends on real frame jitter or on a slow
  machine is exercised only at that one rate. That includes the quality governor that watches FPS, the
  `maxPreparingTime` cut-off, and the warm-up's batching.
- **Timers measured in minutes.** The ad-pixel request and the two other minutes-long `setTimeout`s in `engine.ts`
  fall due after any recorded scenario ends.
- **Network-dependent paths.** The results POST to `/newpaperio/ajax/results.php` gets a 404 from the interception,
  and its reply is not awaited deterministically. Nothing the scenarios compare depends on it.
- **Rarely-reached branches.** Whatever the five routes do not reach is not compared: an extra life, the
  capital-surrounded kill, the debug views. That is what the audit below is for.

## Audit of the risky rewrite classes

The strict conversion and the lint pass rewrote code in ways that are not equivalent in general. The test covers
what the scenarios reach, and this section argues the rest occurrence by occurrence.

The audit was done on 2026-10-21 against `research/deob/app2.deobfuscated.mechanical.js`. That file is the original
with its strings inlined and its operators and structure untouched. It is git-ignored, and its pipeline is in
`research/deob/NOTES.md`.

### Divergences found, and fixed

| Where | What the reconstruction did | Fix | Pinned by |
| --- | --- | --- | --- |
| `Polygon.path`, `Territory.path` | A `new Path2D()` field default the original never had | Start `null`, set in `calcPath`, readers assert | Every scenario, frame 1 |
| `Player.moveTo` | A declared field is an own `undefined` under define semantics, which hid the domain lock's `Player.prototype.moveTo = true` on the real host: no tail recovery, and the glitch stayed on | `declare` (type-only) | `random walk on paperio.site`, which diverges at frame 182 without the fix |
| `Game.best` / `newBest` | `best ?? null` compared as `result > (best ?? 0)`, so a `start()` with no best score reported a new best. The original compared `result > undefined`, which is false | `best !== null && result > best` | Audit only. The UI always passes a number |
| `AchievementStore.save` (twice) | `readCookieJson(...) ?? {}`: a cookie that parses to `0`, `false` or `''` was kept, and `profile.achievements = ...` then threw inside `gameOver()` | Back to the original `\|\| {}` | Audit only. Needs a corrupted cookie |
| Bootstrap | The original's `console.log('Version: A6 2020-10-14T10:51:36.392Z')` was dropped | Restored at the same point of the bootstrap | Console only |

### `~~` to `Math.trunc` (24 sites, all equivalent)

The two differ for NaN and the infinities (`~~` gives 0), above 2^31 (`~~` wraps), and for `-0`.

- **Random index into a small array**: `particles.ts:98, 167`, `units.ts:349`, `bot-ai.ts:317, 341`. The operand is in
  `[0, length)`.
- **Image and canvas dimensions**: `layers.ts:98, 99, 138, 139`, `engine.ts:761, 762, 794, 796, 798, 799, 801, 802`,
  `game-render.ts:582, 583`. The only non-finite input is a zero-size image or view. There the reconstruction gets
  NaN or Infinity where the original got 0. Every consumer is a canvas size, which maps both to 0, or a draw on a
  0x0 canvas, so the output is the same.
- **Small non-negative integers and ratios**: `engine.ts:1492, 1513, 1616, 1773`. A `-0` from float drift goes
  into `easeOutCubic`, which returns the same for `-0` and `0`.
- `game-render.ts:137`: a `-0` when the zoom is 0 is only used as a `fillText` y.

### `||` to `??` (47 sites)

The two differ when the left side is `0`, `''`, `false` or NaN. Two sites were real divergences and are fixed
above. All the others are equivalent:

- **The left side is an object, an array, an element or nullish**, so no falsy primitive can reach it:
  `manager.ts:79`, `layers.ts:163, 207`, `i18n.ts:67`, `spatial-grid.ts:46`, `shapes.ts:193, 207`,
  `engine.ts:655`, `game-render.ts:252, 346, 372`, `bot-ai.ts:44, 49`, `units.ts:181, 189, 194, 238`.
- **Cookie values that are only read**: `ui.ts:678` and `scoring.ts:313, 326`. Reading a property of a primitive
  gives `undefined`, the same as reading it from `{}`.
- **Values typed by their cookie**: `ui.ts:679-681`. A string, a number and a string, where `''` and `0` give the
  same result under both operators.
- **`null` instead of `undefined` where every reader tests truthiness**: `particles.ts:80`, `engine.ts:1235`,
  `bot-ai.ts:161, 355`, `game-render.ts:711`.
- `vector.ts:168, 169` differs only for NaN and `-0` constructor arguments. No caller passes NaN, because
  `Segment.intersect` returns before it builds a Vector from one. A `-0` changes an `atan2` result by 2π, which is
  a no-op in `rotate` and in the angle quantization.
- **Fallbacks the original did not have**, where the fallback cannot fire or its result is discarded:
  `i18n.ts:59`, `spatial-grid.ts:98`, `engine.ts:529`, `bot-ai.ts:138`.
- `engine.ts:1582` is a `??=` for an original `x == null`, which is the same test.
- `engine.ts:1292-1305` is in `post()`, which nothing calls in either build.

### `==` / `!=` to `===` / `!==`

The original engine has 18 loose comparisons. Its other 99 are in the inlined preact, which is now an npm
dependency. None of the 18 changed behavior, because every one compares two numbers, two booleans, two strings or
two objects. There is one exception, `random.ts:15`: `max == null` became `max === undefined`, and nothing ever passes
`null` as `max`. The remaining strict comparisons were already strict in the original, or are new guards that cannot
fire on reachable values: `particles.ts:137, 140, 171`, the asset-shape assertion in `main.ts`, and `skin.ts:78`.

### Field defaults the original left unset

`best`, `isTest`, `playerDeathCallback`, `citiesManager`, `renderer`, `origin`, `startTime`, `angle`, `recording`
and `replaying` on `Game`. `killer`, `achievements`, `death`, `jitter`, `smoothness`, `type` and `fsm` on units.
`isTrack` and `square` on territories. The segment coefficients. `accumulator` on `ScoreLabel`. `pattern` on
`PatternAsset`. `Vector.space`.

Every read of these fields was traced. Each is a truthiness test, a read that the constructor overwrites first, or
a read that throws in both builds when the field is unset. Nothing enumerates an engine object: no `in`,
`Object.keys`, spread or `JSON.stringify`. So neither the extra own properties nor their order is observable. The
two defaults that did matter are `best` and `path`, both fixed above. `AchievementTracker` is now built even when
there is no achievements profile, but the parameter is typed non-nullable and `main.ts` always passes a store, so
the original's falsy-profile branch cannot be reached.

### `Unit.skin` as a getter over `_skin`

`setSkin` always runs straight after a unit is constructed, before `addUnit`. No constructor on the way reads
`.skin`. Every read site in the original dereferences the skin. So an unset skin threw there too, and only the error
differs.

### Declaration and evaluation order

No field initializer has a side effect: the only non-literal one is `[]`. The module split kept the order of
everything that runs at load time. That is the vector pool, the particle `Path2D`, the domain lock with its
`Math.random`, the crown and face `Path2D`s, the resize listener, the two `fetch`es, and the `Math.random` calls of
the bootstrap. The differential test checks the same thing: its first frame's call trace and its `Math.random`
stream would diverge otherwise.

### The TypeScript 6 commit (`880cbc1`)

That commit also carried a lint autofix pass. Every change in it is equivalent:

- `Object.assign` became spread, over fresh objects.
- A bare `return` became `return undefined`. One became `return false`, whose callers test truthiness.
- `=== true` and `=== false` became truthiness tests, on fields that are always boolean.
- `function` callbacks became arrows. None of them uses `this`.
- Expression arrows gained block bodies. No caller uses their return value.
- `var` became `let` or `const`.
- `&&` guards became `?.`.
- Object-literal keys were re-sorted. They are only ever read by key.
