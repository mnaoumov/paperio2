# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local, self-contained offline copy of the browser game Paper.io 2 (originally from https://paperio.site/). It runs entirely client-side (JavaScript + Canvas) with AI bots — there is **no server-side game logic**, so it works fully offline. This repo is a preservation/offline-play copy, not an active development project; most files are the original site's unmodified content.

## Running it

The game `fetch`es JSON files (`assets/skins/skins.json`, `assets/languages.json`), so opening `index.html` via `file://` is blocked by browser CORS. Serve the folder over HTTP:

```powershell
npx serve .
# or
npx http-server -p 8777
```

Then open the printed URL. There is no build step, no test suite, no linter, and no package manifest — it is static files served as-is.

## Architecture

- `app2.js` — the **entire game engine**: rendering, physics, territory/trail logic, and AI bots. It is the unmodified original, **minified and obfuscated** via a string-array indirection scheme (identifiers like `a0_0x2b1e('0x11d')` decode to real strings at runtime). Treat it as opaque: do not try to read it as normal source or edit it by hand. `grep` for readable literals will mostly fail because strings are indexed, not inline.
- `index.html` — the only hand-written/maintained file. It contains an **offline shim** (inline `<script>`): the original relied on an ad network (adinplay/gameads) and analytics (gtag / Yandex.Metrika), all stripped here. The engine only requires `window.ShowPreroll()` to exist (called when the player presses Play) and calls `window.paperio2api.startGame()` to begin. The shim defines `ShowPreroll` to start the game immediately (no pre-roll ad). This is the integration seam between the page and `app2.js`.
- `joystick.js` + `joystick.css` — hand-written on-screen joystick for touch devices (added by this repo, not part of the original). See the input contract below.
- `style3.css`, `manifest.json` — unmodified original UI styles and PWA manifest.
- `assets/skins/` — 56 skin `.svg` layers + `skins.json` (metadata: colors, particle palettes, avatar layer composition) + `select/` thumbnails. `app2.js` fetches `skins.json` and composes skins from the referenced SVGs.
- `assets/languages.json` — UI translations (EN/RU/TR/SP/FR/NL/PT/DE/IT), fetched at runtime.
- `assets/fonts/` — locally-hosted PT Sans Caption (originally Google Fonts), referenced via `ptsans.css`.

## Input / steering contract (how the joystick drives the engine)

Determined by decoding `app2.js` (`readInput()` and the input listeners). Useful if the joystick or any other synthetic-input feature needs changing — you do **not** need to re-decode:

- The engine keeps four boolean flags on its controller: `up` / `down` / `left` / `right`. Its key handler (`onKeyChange`) toggles them on **keydown/keyup**, keyed by `event.keyCode`: ↑=38 / W=87, ↓=40 / S=83, ←=37 / A=65, →=39 / D=68.
- **Guard:** `onKeyChange` only reacts when `event.target === document.body`. So synthetic key events must be dispatched on `document.body`. Also note `KeyboardEvent`'s constructor ignores `keyCode`/`which`; force them via `Object.defineProperty`.
- **Steering (`readInput`, per frame):** if any key is held, the engine *sums* the active flag unit-vectors into a target vector and rotates the heading toward it, clamped by the turn rate — so holding **two adjacent** arrows (e.g. up+right) produces a **diagonal**. `joystick.js` uses this for 8-way control.
- If no key is held, the engine falls back to pointer aiming: `direction = normalize(touch/mouse position − screen center)` (absolute, analog). The keyboard branch takes priority, so the joystick cleanly overrides the native touch aiming whenever a key is held.
- Decoding tip: the string array `a0_0xf543` is **rotated at load** by a self-defending IIFE called with `(a0_0xf543, 0x133)`. To resolve an index correctly, eval the array declaration + the `a0_0x2b1e` decoder + that rotation IIFE together, then call `a0_0x2b1e('0x…')` — static array indexing gives wrong strings.

## Pausing & game-loop control

The engine has **no user-facing pause** (no button/key, and no `visibilitychange`/`blur`
handler — it doesn't even auto-pause when the tab is hidden). But the game object carries
a `stopped` boolean that its main loop checks first and early-returns on, *before*
rescheduling `requestAnimationFrame(() => this.loop())`. So there is an internal pause
lever reachable from the console or the shim:

- **Pause:** `paperio2api.game.stopped = true` (next frame returns early, rAF chain dies).
- **Resume:** `paperio2api.game.stopped = false; paperio2api.game.loop();` (must re-kick the
  loop, since it stopped rescheduling). The loop clamps its time delta to 10s, so resuming
  after a long pause won't blow up the physics.

`paperio2api.game` is the live game object (subsystems: `rng`, `controller`, `nameManager`,
`bots`, `units`, `player`, …). `stopped` is the same flag the engine flips internally on
death and during the pre-game "prepare" phase.

## Editing guidance

- Real changes belong in `index.html` (the shim) or the CSS/assets — **not** in `app2.js`.
- A readable, runnable **deobfuscated copy** of `app2.js` is committed at the repo root as
  `app2.deobfuscated.js` — obfuscation removed and identifiers renamed to meaningful names
  where inferable (classes/functions/globals + a heuristic + targeted local-variable pass;
  deep locals stay `_0x…`). The regeneration toolchain and notes live in the git-ignored
  `research/deob/` — see `research/deob/NOTES.md` for the pipeline (custom Babel
  string-inliner → `webcrack` under Node 22/24 → strip → scope-aware renames) and a
  subsystem map. Off-the-shelf deobfuscators alone can't inline this file's rotated
  string array. It's a study aid; the game still runs off the original `app2.js`.
- A **typed TypeScript copy** `app2.deobfuscated.ts` is also committed: the same code, now
  **fully typed** — class fields, method params, returns, and locals all carry real inferred
  types (interfaces for the shared structural shapes: `Vector`/`Segment`/`Polygon` geometry,
  `Unit`/`Bot` and their `Config`/`Label`/`Intersection`/etc. bags, the preact `VNode`/
  `Component`/`PreactOptions` internals, js-cookie/storage shapes, …). It has **zero
  `any`/`unknown`/`never`** (explicit *and* implicit — verified with `--noImplicitAny`) and
  compiles with 0 errors under the repo-root `tsconfig.json` (lenient: `strict:false`;
  typecheck with `npx tsc -p tsconfig.json`). A handful of concrete `as <Type>` assertions
  remain in the preact reconciler/hooks internals, where preact's minified polymorphic
  mangled fields (`__k`/`__c`/`__`/…) are genuinely un-inferable without them — none are
  `as any`/`as unknown`. Types were inferred from the call-tree, so they're only as sound as
  the lenient config allows (`strictNullChecks` is off). Only `app2.deobfuscated.js` is
  loaded/run; the `.ts` isn't wired in — it's a shape/readability aid.
- Changes already made from the original (documented in README.md): removed ad/analytics scripts, dropped cache-busting version query strings (`app2.js?v7`, `style3.css?v50`), and localized the font instead of loading from Google Fonts.
- `app2.js`, `style3.css`, `manifest.json`, and assets are the site's original copyrighted content, kept for local/offline personal use.
