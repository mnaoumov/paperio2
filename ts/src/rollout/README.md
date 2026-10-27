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

1. Each frame advances the game clock by 20 ms and calls `Game.update(20)`, including
   its normal seeded delta jitter, bot FSM, movement, collision, capture and spawn
   logic. A scheduled direction is normalized and held until the next input. These
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
4. Bounds are 1–600 frames (12 virtual seconds), at most one input per frame,
   64 units, 20,000 territory/trail segments and four million compressed transfer
   characters. The world budget is checked at capture and each simulated frame.
   There is a 30 s loading timeout and a time-budget check between updates. A
   single engine update is synchronous and cannot be interrupted mid-collision.
   Abort disposes the iframe at the next event-loop opportunity.

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
