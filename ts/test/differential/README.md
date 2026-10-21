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
| Capture loop, then the wall | 2 | 2400 | 2 territory captures by the player, 1 bot killed by a bot |
| Killed by a bot, bots play on | 1 | 2400 | the player killed by a bot, 1 bot killed by a bot |
| Back over its own path, then along the wall | 7 | 1200 | 1 bot death |
| Random walk (8 directions plus the pointer fallback) | 11 | 3000 | the player's death, 1 bot killed by a bot |

Together they run 9000 frames of play, plus about 6000 updates of the pre-game warm-up the engine simulates before
it starts. That is about 4.5 million compared canvas calls, in about two minutes. The coverage minimums are there
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
- **Network-dependent paths.** The results POST to `/newpaperio/ajax/results.php` gets a 404 from the test server,
  and its reply is not awaited deterministically. Nothing the scenarios compare depends on it.
- **Rarely-reached branches.** Whatever the four routes do not reach is not compared: an extra life, the
  capital-surrounded kill, the debug views. That is what the audit below is for.

## Audit of the risky rewrite classes

The strict conversion and the lint pass rewrote code in ways that are not equivalent in general. The test covers
what the scenarios reach, and this section argues the rest occurrence by occurrence.

<!-- audit results are appended below -->
