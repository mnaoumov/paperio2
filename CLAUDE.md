# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The `ts/` project — strict TypeScript + template tooling

**Strict conversion: DONE.** `ts/src/tsconfig.json` (the browser config) extends `@tsconfig/strictest`, adapted for this browser esbuild bundle: `module: ESNext` / `moduleResolution: bundler`, `lib: [DOM, ES2024]`, `types: [@total-typescript/ts-reset, js-cookie]` (no `node`), plus a `paths` mapping `preact`/`preact/hooks` to their shipped `.d.ts` (preact 10.5.4's `exports` has no `types` condition, so under `bundler` resolution TS otherwise types preact as `any`). The full strict conversion of `src/app2.ts` is complete — **555 → 0 `tsc` errors**, with **no `!` / `any` / `as` / `@ts-ignore`**: null-safety uses a local `src/type-guards.ts` (`ensureNonNullable` / `assertNonNullable`, mirroring `obsidian-dev-utils`), uninitialized fields get real defaults, and `Unit.skin` became a getter over a private `_skin` backing field. Verified: `tsc` clean + esbuild bundle boots (16 units, 0 console errors).

**Template tooling: applied.** The full tooling suite from the `F:\dev\projects\typescript-template` reference is ported into `ts/`: ESLint flat config (strict, type-checked), dprint, commitlint, cspell, markdownlint, husky files, a **vitest** harness + eslint-rule unit tests (`scripts/helpers/eslint-rules/*.test.ts`, run via `@typescript-eslint/rule-tester`), and all TS scripts via `jiti`. Project-specific adaptations and gotchas:

- **tsconfig split** (Node scripts vs browser src can't share one config — `@types/node` + DOM lib clash on `setTimeout`'s return type): root `tsconfig.json` = **Node** config (owns `scripts/**`, `eslint.config.mts`, `commitlint.config.ts`, `vitest.config.ts`; NodeNext + `node` types); `src/tsconfig.json` = **browser** config (bundler resolution, DOM lib, preact `paths` → `../node_modules/...`, `js-cookie` types). ESLint `projectService` resolves each file to its nearest owning config; `npm run typecheck` runs both.
- The esbuild `build` (browser IIFE) + `typecheck` are the build gate; the template's `build:compile` (tsc `--build` declaration-lib mode) is **not** adopted.
- **husky is present but intentionally NOT wired.** `ts/` is a subfolder of the paperio2 git repo (root `F:\dev\@\paperio2`), so activating husky (setting `core.hooksPath`) would hijack the whole preservation repo's commit hooks. The `.husky/` files are kept as faithful copies but there is **no `prepare` script** — run the gate manually before committing. The pre-commit tasks (`.nano-staged.mjs`) operate on staged files only.
- **CI lives at the repo root** `.github/workflows/ci.yml` (GitHub only runs workflows from the repo root), scoped to `ts/**` with `defaults.run.working-directory: ts`.
- Building the tooling required the TypeScript 5.9 → **6.0.3** bump (part of the template), which surfaced a handful of new `noImplicitReturns` / unused-local / spread-of-`unknown` errors in `app2.ts` (TS 6.0 tightened control-flow and `Object.entries`-value typing); these are fixed behavior-neutrally.

**`src/app2.ts` is held to the template's full strict ESLint** — no relaxed override (user decision). The reconstructed engine was brought to **full lint + spellcheck compliance (0 / 0)**: magic numbers → named constants, `~~` → `Math.trunc`, arrow-consts → function declarations, explicit accessibility/return types, `==` → `===`, `||` → `??` (only where the falsy value can't be meaningful), class/interface declaration-merges resolved (two via `abstract` bases, verified never instantiated), and the fictional **bot-name blob extracted to `src/bot-names.ts`** (imported by `app2.ts`; added to `cspell.json` `ignorePaths`), with the residual game/CSS identifiers + Russian UI strings added to `cspell.json` `words`. `eslint-disable` was kept to the genuinely-unavoidable minimum (encoded domain-lock data, js-cookie's `any` `getJSON` via a typed `readCookieJson` wrapper, intentional bitwise/`||`-falsy/π-const-def cases, stale-narrowing guards). **Behavior verified**: the esbuild bundle boots identically to the original `app2.js` in headless Chrome (16 units, `stopped:false`, 0 real console errors). The whole gate (typecheck both configs + esbuild build + lint + spellcheck + dprint format + markdownlint + 140 rule tests) is green. Commit history of the grind is on branch `T37`.

## What this is

A local, self-contained offline copy of the browser game Paper.io 2 (originally from https://paperio.site/). It runs entirely client-side (JavaScript + Canvas) with AI bots — there is **no server-side game logic**, so it works fully offline. This repo is a preservation/offline-play copy, not an active development project; most files are the original site's unmodified content.

## Running it

The game `fetch`es JSON files (`assets/skins/skins.json`, `assets/languages.json`), so opening `index.html` via `file://` is blocked by browser CORS. Serve the folder over HTTP:

```powershell
npx serve .
# or
npx http-server -p 8777
```

Then open the printed URL. The shipped game itself has no build step, no test suite, and no linter — it is static files served as-is. (A separate `ts/` project builds a readable, typed reconstruction of the engine from real npm dependencies — see **Editing guidance**.)

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
- A readable, typed **reconstruction** of the engine lives in the **`ts/` project**
  (`ts/src/app2.ts`). It is the single maintained deobfuscated source (the older root-level
  `app2.deobfuscated.js`/`.ts` copies have been removed). The engine was originally shipped
  with **preact** (10.4.2–10.5.4; treated as **10.5.4**) and **js-cookie** (2.2.x) inlined
  into the same bundle; those two libraries have been **extracted to real npm dependencies**
  (`ts/package.json` pins `preact@10.5.4` + `js-cookie@2.2.1`) and are now `import`ed instead
  of inlined. `ts/src/app2.ts` therefore contains only the game engine.
  - Build: `cd ts && npm install && npm run build` → esbuild bundles `src/app2.ts` + the two
    deps into `ts/dist/app2.js` (a self-contained browser IIFE, **behaviorally equivalent to
    `app2.js`** — verified: game boots, 16 units, 0 console errors). Typecheck: `npm run
    typecheck` (`tsc --noEmit`, 0 errors under `@tsconfig/strictest`).
  - Identifier state: **fully de-obfuscated — zero `_0x…` / `callbackN` identifiers remain.**
    The extracted preact/js-cookie internals carried their real upstream names; the game
    engine's own classes, functions, methods, parameters, and locals were recovered to
    meaningful names (a multi-agent pass inferred each from its usage, applied via scope-safe
    ts-morph renaming and verified by a headless boot). Enum-like constants are labelled
    from the engine's own strings (e.g. the kill-reason codes from the `deathReasons` array:
    `KILL_REASON_WIN`/`SELF_INTERSECTION`/`WALL`/`TRAIL`/`EXIT_POINT`/`SURROUNDED`/`SYSTEM`/
    `CAPITAL_SURROUNDED`).
  - **Rename-pass caveat (fixed):** collapsing two distinct obfuscated identifiers to the same
    recovered name introduced three variable-shadowing bugs where an inner callback parameter
    shadowed an outer one, silently diverging from `app2.js`: `Polygon.intersections`
    (`segment.intersect(segment)` — self-intersection), `DisplayList.remove` (`display !== display`
    — always false; dead code, no callers) and `SkinManager.release` (`skin != skin` — emptied the
    whole `usedBy` list on every death). All three are repaired and verified via CDP (`release`
    removes exactly one skin, `intersections` yields 0 crossings for a foreign segment). Watch for
    this collision class in any future renaming.
  - Types come from the dependencies too: the hand-written preact/js-cookie type declarations
    were removed in favour of the real `preact` / `@types/js-cookie` types (only the
    self-contained `Dispatch`/`Ref` aliases are kept). The engine's own structural types
    (`Vector`/`Unit`/`Bot`/`Config`/… shapes) remain declared inline.
  - The one-time deobfuscation toolchain (custom Babel string-inliner → `webcrack` under
    Node 22/24 → strip → scope-aware renames) lives in the git-ignored `research/deob/` —
    see `research/deob/NOTES.md`. Off-the-shelf deobfuscators alone can't inline this file's
    rotated string array. The `ts/` build is a study aid; the shipped game still runs off the
    original `app2.js`.
- Changes already made from the original (documented in README.md): removed ad/analytics scripts, dropped cache-busting version query strings (`app2.js?v7`, `style3.css?v50`), and localized the font instead of loading from Google Fonts.
- `app2.js`, `style3.css`, `manifest.json`, and assets are the site's original copyrighted content, kept for local/offline personal use.
