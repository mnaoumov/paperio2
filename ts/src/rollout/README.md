# Experimental engine rollouts

`paperio2api.rollout(request, signal?)` captures between frames and runs the real
`Game.update` in a disposable, opaque iframe (`sandbox="allow-scripts"`). Nothing
calls it automatically. It does not select or enable a pilot policy.

```js
const forecast = await paperio2api.rollout({
  frames: 150,
  randomState: 12345,
  inputs: [
    { frame: 0, x: 1, y: 0 },
    { frame: 75, x: 0, y: -1 }
  ]
});
```

1. Each frame advances the game clock by `stepMs` (20 ms when left out, at most 34)
   and calls `Game.update` with the clock's own difference, as a live frame does,
   including its normal seeded delta jitter, bot FSM, movement, collision, capture
   and spawn logic. `stepMs: 1000 / 60` matches a 60 fps live game; see
   **Forecast fidelity** for why that matters. A scheduled direction is normalized and held until the next input. These
   are world directions, applied before input, with an empty sandbox controller;
   they are not keyboard events, waypoints, a pilot replay, rendering or the
   browser's variable-rate `Game.step` loop. Before the first scheduled input the
   captured direction is held.
2. `randomState` is an explicit unsigned mulberry32 continuation state. The other
   three generator states travel in the snapshot. Native `Math.random` has no
   readable state: an unseeded live game's future cannot be promised identical to
   this forecast. A seeded recorded continuation must supply its actual state,
   rather than just reusing its original seed.
3. The result contains death reason/frame/game time, territory growth in square
   world units, and ordered per-frame unit poses, targets, bot states and context,
   territory areas, base membership, kill/return counts and random state. Geometry
   uses segment counts and two fingerprints of exact ordered coordinates. These
   fingerprints are comparison aids, not serialized geometry or a collision oracle.
   The continuation ends at the first player death/win, before the death delay.
4. Bounds are 1–1200 frames (24 virtual seconds at 20 ms, 20 at 60 fps), at most one input per frame,
   64 units, 20,000 territory/trail segments and four million compressed transfer
   characters. The world budget is checked at capture and each simulated frame.
   There is a 30 s loading timeout and a time-budget check between updates. A
   single engine update is synchronous and cannot be interrupted mid-collision.
   Abort disposes the iframe at the next event-loop opportunity.

## Forecast fidelity

`npm run benchmark:fidelity` (`test/benchmark/rollout-fidelity.ts`) measures how
well a rollout forecasts the live game flying the same direction schedule. The
whitebox plays each seed to a capture time, then to the first frame with the player
at home and no game timer. From that moment it runs rollouts of two loop schedules
on the 20 ms grid: three straight legs, and an arc that changes direction every
step. It then flies each schedule in the live benchmark game (60 fps virtual frames,
seeded `Math.random`), restored to the same moment for every flight, by setting
`game.direction` before each update reads its input. `test/benchmark/fidelity.ts`
holds the schedules and the comparison, which meets both every 100 ms.

Measured on 2026-10-28, seeds 65-72, captures at 20, 45 and 70 s: 24 situations, 48
schedules. Errors are world units, for 4.5 s schedules. "States" means the share of
situations with at least one bot in another FSM state. Each row varies one factor
from the matched pair in its first row.

| Forecast vs live flight | Bot error 1 s / 2 s / 4 s (median) | States differ 0.5 s / 1 s / 4 s | First bot state split (median) | Player error 2 s |
| --- | --- | --- | --- | --- |
| 60 fps, live `Math.random` state vs rollout-aligned flight | 0 / 0 / 0 | 0% / 0% / 0% | never | 0 |
| 60 fps, foreign random state | 0 / 0 / 0 | 0% / 8% / 33-42% | never in most | 0 |
| 20 ms, live or foreign random state | 2.6 / 34-35 / 111-116 | 83% / 92% / 100% | 300 ms | 0.2-1.3 |
| 60 fps, live state vs the pilot's `floor` index | 0 / 0 / 0 | 0% / 0% / 17-32% | never in most | 0.5-2.1 |
| 60 fps, live state vs the moment's particles kept | 0 / 0 / 0 | 0% / 0% / 0% | never | 0 |
| 20 ms foreign vs 20 ms another foreign state | 0 / 0 / 0 | 4% / 4-8% / 24-32% | never in most | 0 |

1. **The frame length dominates.** At 20 ms, a bot's state differs within 0.5 s in
   83% of situations, and bot positions are about 35 units apart at 2 s and 110 at
   4 s. The player stays within 2 units, because its own path is schedule-driven,
   but the bots that cut its trail do not. The seeded `game.rng` is drawn at least
   twice per update (the update-length jitter, the spawn choice), so 50 updates a
   second against 60 shifts every later bot decision that draws it (the idle cut or
   exit choice, a capture's target segment).
2. **At 60 fps and the live random state, the forecast is exact.** All 48 schedules
   matched the live flight in every unit's position, angle, state and trail
   fingerprint, every frame, deaths included. That required the rollout to pass the
   clock's own difference as the update length. Before that change it passed the
   constant step, which differed from the live frame's clock difference by one float
   ulp in frame 1. That ulp grew into a bot state split at a median of 1.15 s
   (50% of situations by 1 s), with bot error 77 units at 4 s. Any inexact
   difference grows that fast, so a forecast of a live game with variable frame
   deltas, as in a real browser, cannot hold its bots beyond about a second.
3. **`Math.random` matters only through spawns.** It moves only bot spawn positions
   and particles, so a foreign state splits a state in about a third of situations
   by 4 s, and two foreign states at 20 ms rarely give independent trials.
4. **The pilot's `floor((now - start) / step)` reads the step up to one ahead**,
   because the engine's clock is already at the frame's end. That alone moves the
   player 2-3 units on a square loop by 2 s, and splits a bot state in 17-32% of
   situations by 4 s.
5. **Particles do not matter.** Their random draws do not reach the units in 4.5 s.

So a rollout can be trusted for a loop's length only at `stepMs: 1000 / 60`, given
the live `Math.random` state and flown with the step the rollout held at each frame
(`scheduleIndex(..., 'aligned')`), and only against a live game that also steps
exactly 60 fps: the benchmark and situation replay, not a real browser. The harness
sets the direction directly. A pilot that steers through a target and its guards
adds its own difference, which this harness does not measure.

## Isolation and supported starts

The live game is never restored, stopped, paused or steered. Capture reads its
graph, generator states, id counter and pool without allocating from that pool.
The save codec replaces shared objects with tags; no DOM, assets, functions or
live object references cross the message channel. The iframe has separate module
globals, vector pool, ids, generators, DOM, listeners, timers, skins and Path2D.
Its asset metadata is embedded at build time. Its achievement store suppresses
cookie persistence, and the opaque origin prevents access to parent storage/DOM.
A hidden host iframe is temporarily attached to the page and removed on success,
failure or cancellation; gameplay DOM, focus, hooks and timers are untouched.

The save codec deliberately omits particles, notifications and spare vectors.
Existing particles can carry random-consuming callbacks, so a start with any
particles is rejected. Pending game-clock timers/death, practice, custom enemy
modes, input recordings/replays, city managers, test mode and nonempty achievement
profiles are also rejected. Non-default states of the original bot FSM are
supported. Ordinary main-game achievement profiles are empty. Notifications are
cosmetic; spare vector identity does not determine movement. Child timers are not
fired: the rollout stops when a death timer is created. No live sounds, statistics,
pilot or UI hooks are attached to the child.

## Verification and cost

From `ts/`, run:

```powershell
npx --no-install vitest run --project integration-tests test/differential/rollout.integration.test.ts --maxWorkers 2
```

The Chrome tests compare each frame against a separate continuation of the real
live `Game.update`, with fixed input and RNG state. They cover a control, capture
with changed topology, bot trail-cut death, self-intersection and wall sliding;
bots start in and transition between `back`, `exit`, `cut`, `capture` and `attack`.
A 60 fps case compares a `stepMs: 1000 / 60` rollout frame for frame; it fails when
the update length is the constant step rather than the clock's difference.
The cut and wall fixtures deliberately position units to exercise those events;
the fixed capture route is computed once from the initial territory, not replanned
during simulation. Repeated rollouts must agree. Full saved state, RNG, pool, ids,
DOM, cookies and local storage must remain equal after successful, rejected,
cancelled and failed requests, and the request slot must recover.
An additional smoke test runs without the virtual scheduler, using the browser's
real clock. Deliberate mutations were rejected: drawing from the live RNG failed
the isolation assertion; disabling movement in the sandbox changed the trail-cut
continuation from a death at frame 49 to 600 surviving frames and failed parity.

Measured on the development machine on 2026-10-27, one browser tab and one sandbox
at a time, under a two-core bulk budget: an early-game transfer was about 812,000
compressed characters. Node-measured capture/encode browser round trips took
136–161 ms. Complete request round trips took about 456–484 ms for 30–50 frames,
1.63 s for 368 frames and 2.45 s for the 533-frame capture/death continuation.
Those round trips include IPC, transfer, iframe startup and per-frame comparison data; they
are not isolated CPU timings or live-frame performance. Browser test clocks are
virtual, so the result's `elapsedMs` is zero there. In an ordinary browser it
measures child bootstrap/restore/simulation time, excluding parent capture and IPC.
The native-clock smoke measured 191 ms inside the child for 100 frames.
Set `ROLLOUT_METRICS` to an output path to record fresh measurements from the test.

The iframe can share the renderer's main thread. The measured cost rules out
calling this every live frame. This seam establishes isolated engine experiments;
using it for live planning needs a separately measured scheduling design.
