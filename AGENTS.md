# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## The `ts/` project — strict TypeScript + template tooling

**Strict conversion: DONE.** `ts/src/tsconfig.json` (the browser config) extends `@tsconfig/strictest`, adapted for this browser esbuild bundle: `module: ESNext` / `moduleResolution: bundler`, `lib: [DOM, ES2024]`, `types: [@total-typescript/ts-reset, js-cookie]` (no `node`), plus a `paths` mapping `preact`/`preact/hooks` to their shipped `.d.ts` (preact 10.5.4's `exports` has no `types` condition, so under `bundler` resolution TS otherwise types preact as `any`). The full strict conversion of `src/app2.ts` is complete — **555 → 0 `tsc` errors**, with **no `!` / `any` / `as` / `@ts-ignore`**: null-safety uses `ensureNonNullable` / `assertNonNullable` from `@mnaoumov/typescript-lib/type-guards` (a runtime `dependency`, since esbuild bundles it; see the toolkit bullet below), uninitialized fields get real defaults, and `Unit.skin` became a getter over a private `_skin` backing field. Verified: `tsc` clean + esbuild bundle boots (16 units, 0 console errors).

**Template tooling: applied.** The full tooling suite from the `F:\dev\projects\typescript-template` reference is ported into `ts/`: ESLint flat config (strict, type-checked), dprint, commitlint, cspell, markdownlint, husky files, a **vitest** harness, and all TS scripts via `jiti`. The in-house ESLint rules and the script helpers (`exec`, `root`, the dprint `format`, the markdownlint `lint`, `env-toggle`, `check-project-types`, the markdownlint-cli2 config schema type) are imported from the published **`@mnaoumov/typescript-dev-toolkit`** devDependency, not kept as copies. Project-specific adaptations and gotchas:

- **tsconfig split** (Node scripts vs browser src can't share one config — `@types/node` + DOM lib clash on `setTimeout`'s return type): root `tsconfig.json` = **Node** config (owns `scripts/**`, `eslint.config.mts`, `commitlint.config.ts`, `vitest.config.ts`; NodeNext + `node` types); `src/tsconfig.json` = **browser** config (bundler resolution, DOM lib, preact `paths` → `../node_modules/...`, `js-cookie` types). ESLint `projectService` resolves each file to its nearest owning config; `npm run typecheck` runs both.
- The esbuild `build` (browser IIFE) + `typecheck` are the build gate; the template's `build:compile` (tsc `--build` declaration-lib mode) is **not** adopted.
- **husky is present but intentionally NOT wired.** `ts/` is a subfolder of the paperio2 git repo (root `F:\dev\projects\paperio2`), so activating husky (setting `core.hooksPath`) would hijack the whole preservation repo's commit hooks. The `.husky/` files are kept as faithful copies but there is **no `prepare` script** — run the gate manually before committing. The pre-commit tasks (`.nano-staged.mjs`) operate on staged files only.
- **The Node pin: `ts/.nvmrc` = 26, `engines.node` = `>=22.0.0` — deliberately different numbers.** `.nvmrc` is the version to DEVELOP on, matching the `typescript-template` reference this tooling was ported from, and this machine’s default Node; `engines` is the floor the code actually needs. They are kept apart on purpose, and `@types/node` (`^26.1.1`) follows `.nvmrc` rather than `engines` — the Node scripts are type-checked against 26’s API surface, so running them on an older major is the drift, not the safety margin. nvm-windows auto-switches on `.nvmrc`, so **every** command issued from `ts/` — `node`, `npm`, and therefore `typecheck`, `lint`, `format:check`, `spellcheck`, `lint:md`, `test`, `build` — runs under that major; if it is not installed on this machine all of them die with `Node.js vXX.x.x is not installed or cannot be found`, and the fix is `nvm install 26`, never an edit here. CI reads the same file (`node-version-file: ts/.nvmrc`), so the pin is changed in exactly one place. Verified green under 26.5.0 on 2026-09-20, and re-verified on 2026-09-23 after the advisory float below: all eight gates plus the vendored-rule check that has since been retired, with 155 passing tests among them.
- **The one Node 26 incompatibility in this repo does NOT reach `ts/`, and must not be read as an argument for lowering the pin.** `research/deob/` needs webcrack, whose `isolated-vm` dependency fails its native build on 26, which is why `research/deob/NOTES.md` opens its pipeline with `nvm use 24.18.0`. That directory is git-ignored, is a one-time toolchain rather than part of the build, and sits outside `ts/` — so `ts/.nvmrc` neither governs it nor is constrained by it, and the two version numbers are independent by design.
- **npm advisories: `npm audit` reports 10 (7 high, 3 low) as of 2026-10-21, and none of them has a fix that is not forced.** Every exact pin and advisory override carries its release condition in `ts/pinned-versions.json`. A clean install once reported 12 advisories (8 high, 4 moderate). Eleven of those were devDependency transitives of the template tooling and went away on a plain `npm audit fix` plus a floor raise of `vitest`/`@vitest/coverage-v8` to `^4.1.11`, the version that clears GHSA-82fw-gwwq-j7x9. Both are on `^5` since 2026-10-15, because `@mnaoumov/typescript-dev-toolkit` declares an optional `vitest@^5` peer and npm refuses the install against 4.x. Later tooling releases brought new advisories in. Audit counts every package on a vulnerable path, so the 10 rows come from three advisories:
  - **`braces` (GHSA-vfj7-8cjw-p6xm, high, 6 rows):** `braces` → `micromatch` → `fast-glob` → `globby` → `markdownlint-cli2` → `@mnaoumov/typescript-dev-toolkit`. It covers every `braces` release (latest 3.0.3), so there is nothing to move to. Add an override once a patched `braces` ships. Audit's suggested "fix" is a downgrade of `markdownlint-cli2` to 0.21.0, which would not clear it either.
  - **`katex` (GHSA-238p-pmpm-9mq7, low, 3 rows):** `katex` → `micromark-extension-math` → `markdownlint`. The fix is `katex` 0.19, but `micromark-extension-math` 3.1.0 (its latest) asks for `katex@^0.16.0`, and every 0.16.x is affected. It waits for that package to widen its range. An override across a major it does not declare was not taken. The advisory needs prototype pollution to already be present, and only lint-time markdown parsing reaches it.
  - **`js-cookie` (high, 1 row):** accepted. See below.
  - **`smol-toml` (GHSA-r4xh-jqrq-34v2) and `markdown-it` (GHSA-r7fv-28h4-cvq7, GHSA-vfgh-jcmw-g37q, GHSA-gfr2-rv44-r23c) are cleared by floors, not overrides.** `markdownlint-cli2` 0.24.0 (the floor `@mnaoumov/typescript-dev-toolkit` 3.7.3 also declares) pins `smol-toml` at 1.9.1, so the `smol-toml` override it once needed is gone. `markdownlint-rule-relative-links` 5.1.4 pins the patched `markdown-it` 15.0.3. Keep `markdownlint`/`markdownlint-cli2` on the toolkit's ranges: a second `markdownlint` copy makes `npm run typecheck` fail in `scripts/markdownlint-cli2-config.ts` with `Type 'Rule' is not assignable to type 'string | Rule'`.
  - **Never run `npm audit fix --force` here.** It offers the js-cookie major below, plus downgrades of `markdownlint-cli2` (0.21.0) and `markdownlint` (0.36.1) that move the markdown lint off the versions `@mnaoumov/typescript-dev-toolkit` resolves.
  — **`js-cookie` is held at 2.2.1 with GHSA-qjx8-664m-686j open, on purpose.** The reconstruction exists to match the shipped `app2.js`, which inlined js-cookie 2.2.x — the original file literally contains `getJSON`, an API 3.x removed — so the float would make `ts/` stop reconstructing the thing it reconstructs. It is also not a bump but a rewrite, and only part of it is loud: `Cookies.getJSON` (`readCookieJson`) fails to compile under 3.x, but 2.2.1's `set` JSON-stringifies a non-string value while 3.x's default write converter is a bare `encodeURIComponent`, so the two object-valued `Cookies.set` calls in `src/scoring.ts` would **silently** persist `[object Object]` and lose the saved profile and challenges. The advisory is accepted rather than deferred: it needs attacker-controlled *attributes* to reach 2.2.1's `extend`, and both call sites pass the same local `{ expires: DAYS_IN_YEAR }` literal; and the served game runs the original root `app2.js` with its own inlined copy, which this pin does not govern. `preact@10.5.4` is pinned on the identical faithfulness argument. The full reasoning, the re-check commands and what lifting the pin would cost are in `ts/pinned-versions.json`; read that before re-deriving this from an audit report.
- **Behavioral equivalence is proven, not assumed: `npm run test:integration`** (`ts/test/differential/`, its `README.md` has the detail). It plays five recorded scenarios (one served as `paperio.site`, so the domain lock takes its real-host branch) on the root `app2.js` and on `ts/dist/app2.js`, through `index.html`'s own engine switch (`?original` vs plain), in lockstep in headless Chrome, under a seeded `Math.random`, a virtual clock and a virtual rAF/timer scheduler, and fails on the first frame whose canvas calls, 30-frame game-state snapshot or final pixels differ, naming the call and both values. "Boots with 16 units and 0 console errors" is no longer the bar for a `ts/` change: run this. It needs Chrome (stable channel, or `CHROME_PATH`), serves every request through puppeteer's request interception rather than a real HTTP server (on this machine a desktop ad blocker injected a userscript into a localhost page, and its one `Math.random` call shifted the seeded stream, so local runs stopped matching CI), builds `dist/` itself, takes about two minutes, and is deliberately outside `npm test`; CI runs both. It and the audit beside it (that README's last section) caught divergences the boot check never could: the strict conversion's `new Path2D()` defaults on `Polygon.path`/`Territory.path`, and a declared `Player.moveTo` field that, under define semantics, hid the domain lock's `Player.prototype.moveTo = true` (now `declare`). **That class of change is the one to watch for**: a field default or declared field the original never set on the instance. When a scenario stops reaching an event its `expectedCoverage` asks for, fix the route or the seed rather than lowering the minimum. To bisect a divergence, set `DIFFERENTIAL_DUMP=<dir>` to get both frames' call lists.
- **CI lives at the repo root** `.github/workflows/ci.yml` (GitHub only runs workflows from the repo root), scoped to `ts/**` plus the original files the differential test plays (`app2.js`, `index.html`, `assets/**`), with `defaults.run.working-directory: ts`.
- **No vendored copies: the ESLint rules and script helpers come from `@mnaoumov/typescript-dev-toolkit`.** `scripts/eslint-config.ts` registers the toolkit's `inHouseEslintPlugin` under its `IN_HOUSE_ESLINT_PLUGIN_NAME` (`typescript-dev-toolkit` since the toolkit's 2.0.0), so every in-house rule key in the config and every disable comment is spelled `typescript-dev-toolkit/<rule>`. The rules' tests live with the package. Do not copy a helper back in: if one the scripts need is missing from the packages, ask for it to be exported there. That includes the crash-vs-findings classifier below: `scripts/lint.ts` and `scripts/lint-fix.ts` call the toolkit's `linters/eslint` `lint()` (1.1.0 and later), and the local `scripts/helpers/eslint.ts` copy it was ported from is gone. The same holds for `src/`: the null-safety helpers come from **`@mnaoumov/typescript-lib/type-guards`** (1.0.1 and later), and the local `src/type-guards.ts` copy is gone. Earlier releases of that subpath referenced `@types/node` and the DOM lib through `library.d.mts`, which made `setTimeout` type as `NodeJS.Timeout` in the browser `src/tsconfig.json`, and their bundled preamble installed a `globalThis.process` shim in the game bundle. 1.0.1 does neither. If a future release brings either back, `npm run typecheck` fails with `TS2322: Type 'Timeout' is not assignable to type 'number'` in `src/engine.ts` / `src/game-api.ts`. Raise it against the package rather than restoring a local copy.
- **`npm run lint` tells a crashed linter apart from a red codebase, and that distinction is load-bearing here.** The ESLint child on this machine dies with exit `3221225477` (`0xC0000005`, an access violation) and no output of its own — **measured at 1 run in 30** on an unchanged, lint-clean tree — and npm reports that to *its* caller as a plain exit `1`, which is indistinguishable from "the code is red". So the toolkit's `lint()` (`@mnaoumov/typescript-dev-toolkit/linters/eslint`, which this repo's own helper was upstreamed into) does not let `execFromRoot` throw on the exit code: it captures the result and classifies it (`classifyEslintExit`) as `clean` / `lint-problems` (exit `1`, the only code that is evidence about the SOURCE) / `did-not-lint` (everything else). A `did-not-lint` throws `describeFailureToLint`'s message, which names which of the four happened — killed by a signal, died at the OS level, a rule threw (`Rule: "…"` in stderr), or ESLint aborted on a broken config or command line — quotes back what ESLint said minus the banner, npm's chatter and the stack frames, and says outright that the source has not been judged. **The `Oops! Something went wrong!` banner is NOT a crash marker** — ESLint prints it for a mistyped path too, which is why the rule crash is separated out by the `Rule:` line instead. Its tests, against verbatim stderr from both including the OS-level death that cannot be triggered on demand, live with the package. One difference from the old local copy: the toolkit runs ESLint with warnings counted as findings. **If CI or a local gate ever reports a lint failure, read the message before reading the source** — and note that `lint:fix` goes through the same helper.
  - Two things had to move for it. `executeBatches` in the then-vendored `exec.ts` (now the toolkit's, which carries the same fix) returned a hard-coded `exitCode: 0` when asked for details, so a batched command (which is how `lint:fix` runs under nano-staged) reported success however its batches ended; it now carries the first failing batch's code and signal. And `ts/scripts/vitest-config.ts` gained the `unit-tests:scripts` project, because `unit-tests` excludes `scripts/**`, so a test anywhere under `scripts/` **ran nowhere** while `npm test` stayed green. That project is empty now that the classifier's test moved to the toolkit, and stays so a future script test is not skipped. (The serial `eslint-rules` project beside it went away with the vendored rules.)
- Building the tooling required the TypeScript 5.9 → **6.0.3** bump (part of the template), which surfaced a handful of new `noImplicitReturns` / unused-local / spread-of-`unknown` errors in `app2.ts` (TS 6.0 tightened control-flow and `Object.entries`-value typing); these are fixed behavior-neutrally.

**`src/app2.ts` is held to the template's full strict ESLint** — no relaxed override (user decision). The reconstructed engine was brought to **full lint + spellcheck compliance (0 / 0)**: magic numbers → named constants, `~~` → `Math.trunc`, arrow-consts → function declarations, explicit accessibility/return types, `==` → `===`, `||` → `??` (only where the falsy value can't be meaningful), class/interface declaration-merges resolved (two via `abstract` bases, verified never instantiated), and the fictional **bot-name blob extracted to `src/bot-names.ts`** (imported by `app2.ts`; added to `cspell.json` `ignorePaths`), with the residual game/CSS identifiers + Russian UI strings added to `cspell.json` `words`. `eslint-disable` was kept to the genuinely-unavoidable minimum (encoded domain-lock data, js-cookie's `any` `getJSON` via a typed `readCookieJson` wrapper, intentional bitwise/`||`-falsy/π-const-def cases, stale-narrowing guards). **Behavior verified**: the esbuild bundle boots identically to the original `app2.js` in headless Chrome (16 units, `stopped:false`, 0 real console errors). The whole gate (typecheck both configs + esbuild build + lint + spellcheck + dprint format + markdownlint + 140 rule tests) is green. Commit history of the grind is on branch `T37`.

**Module split: complete.** The single `main()` IIFE that once held the whole engine in `app2.ts` (7462 lines) has been fully extracted into layered ES modules (12 top-level modules, three of which — `geometry`, `entities`, `skins` — are further split into per-concept **folders** whose sub-files use `import type` for the intra-folder back-edges so the value DAG stays acyclic); the entry is now **`src/main.ts`** (~90 lines): the bootstrap, run via `main().catch(console.error)` because esbuild's `iife` output format rejects top-level `await`; the ambient `window`/DOM augmentations moved to **`src/global.d.ts`** (a module `.d.ts`, `export {}` so `declare global` augments). The esbuild entry points at `src/main.ts` but the output is still **`dist/app2.js`** (unchanged `outfile`). Modules: `src/shared/` (`constants`, `ids`, `math-utils`, `color-utils`, `random`, `types`, `noop` — leaf utilities); `src/geometry/` (a folder: `vector.ts` [Vector + geometry helpers + `angleToVector`/`createCirclePoints`], `shapes.ts` [Segment/Polyline/Polygon + `Bounds`/`Intersection`], `contour-points.ts` [ContourPoints], `spatial-grid.ts` [SpatialGrid], `border.ts` [Border]); `src/i18n.ts` (Language types, `russianLanguage`, `list3`, `buildLanguageList`/`findDefaultLanguage` — a true leaf, imports nothing); `src/ui.ts` (all preact components + `LanguageContext` + storage-seam types); `src/skins/` (a folder: `layers.ts` [`loadImage`/SkinLayer/PatternAsset/Avatar/DisplayList], `skin.ts` [Skin + colour/source types], `asset.ts` [Asset/SvgAsset/ImageAsset + AssetSet/ImageAssetSet/SvgAssetSet + `createColorTile`/`COLOR_PALETTE`], `manager.ts` [SkinManager/GameSkinManager]); `src/scoring.ts` (SchemeCycler/ScoreLabel/Achievement… + `readCookieJson`); `src/particles.ts` (Particle/TextParticle + `spawnScoreParticles`); `src/entities/` (a folder: `territory-trail.ts` [Territory/Trail], `bot-ai.ts` [StateMachine/`botStates` + bot-AI danger helpers + AI constants], `units.ts` [City/Unit/Player/Bot/NamePool + entity types]); `src/controller.ts` (KeyboardModeSwitch/Controller + input state types + keycode constants); `src/game-render.ts` (the canvas render layer — `renderGame` + all `draw*`/`render*` helpers + render constants + RenderContext + the crown/face path caches); `src/game-api.ts` (`createGameApi`/`GameApi` + the debug-combo wiring); `src/snapshot.ts`, `src/practice.ts` and `src/save-format.ts` (snapshots, practice checkpoints, saved games: they value-import the entities and geometry, reach `Game` by type only, and are value-imported by `game-api` and `ui`; see **Snapshots, checkpoints & saved games**), with `src/shared/graph-codec.ts` the save format's generic encoder. `src/engine.ts` (~1940 lines) is the remaining **Game core**: the `Game` class, `Config`/`defaultConfig`, `GameResults`, the domain-lock check, and the shared game types/constants. Render + api peeled together because `createGameApi` wires `game.renderer = renderGame` (splitting only render would form an `engine ↔ game-render` value cycle); the value DAG is `engine → game-render → game-api` since `Game` never value-calls the render layer or the API.

- **No circular dependencies — enforced by `import-x/no-cycle` (already enabled).** The engine is one *type-level* strongly-connected component, so lower modules reference higher-layer types (e.g. `geometry/shapes.ts` `import type`s `Trail`/`ShapeOwner` from `entities/territory-trail.ts`). Those back-edges are **type-only**, erased at build, and `import-x/no-cycle` ignores them (verified: it flags value cycles, not `import type` cycles). The **value**-import graph is a strict DAG: `shared`/`i18n` (leaves) → `geometry` → `controller`/`particles`/`scoring`/`skins`/`entities` → `engine` (Game core) → `ui` (via `i18n`) → `main`. Every module value-imports only downward and reaches higher-layer classes via `import type`; e.g. `engine` value-imports `Bot`/`Player`/`City` from `entities` while `entities` references `Game` only as a type. Rule when peeling a module: value-import only downward; use `import type` for any reference to a higher layer; if two classes genuinely value-cycle, co-locate them; and move any constant/helper used by both the peeled module and a *lower* layer into `shared`/`geometry` (e.g. `KILL_REASON_*`, `MILLISECONDS_IN_SECOND`, the angle constants, `angleToVector`, `noop`) so the import stays downward.
- **Lint accommodations for the split (user decisions).** `jsdoc/require-jsdoc` and `jsdoc/require-file-overview` are **off** for source files (`scripts/eslint-config.ts`) — the split turns ~150 engine symbols into exports and documenting them all was scoped out of the mechanical move. `perfectionist/sort-modules` stays **on**, but it would alphabetize top-level declarations and reorder `extends` subclasses before their base classes (breaking class-init at runtime), so each engine module that has such a declaration carries a **file-wide `/* eslint-disable perfectionist/sort-modules -- … */` block**: the first line opens it and the last line closes it with `/* eslint-enable … */`, because `disable-enable-pair` requires the pair. The other `src/` files stay fully checked. These files used to carry per-line `eslint-disable-next-line` comments, but per-line disables stopped working in perfectionist 5.12.0. That release's fix "Honor eslint-disable directives with a description" makes every disabled node a fixed point, and the rule then sorts every other declaration around those points. All of our disables carry a `-- reason`, so each one pinned a node and moved where the rest should go, and adding a disable for one finding produced new findings at other lines. Do not go back to per-line disables in these files. Declaration-merged interfaces need care: TypeScript requires all-or-none `export` on merged declarations, while `import-x/export` flags two exports of the same name — so `Config` (load-bearing merge: named fields + index signature) is exported on both copies with an `import-x/export` disable, while the accidental duplicate `Bounds`/`RenderContext`/`Metric` interfaces are kept local (unexported).
- **Peel workflow** (each peel is independently verifiable because `engine.ts` remains to satisfy type back-edges): move the declarations verbatim into the new module (no dedent — engine code is already column-0), wire the imports (let `tsc` enumerate missing/unused), **put the file-wide `sort-modules` disable/enable pair on any new module with order-carrying declarations BEFORE running `lint:fix`** (otherwise its `sort-modules` autofix reorders the file and breaks `extends` order and block-level `no-magic-numbers` disables), then verify: `npm run typecheck` + `npm run build` + a headless-Chrome boot (16 units, player, 0 console errors) + `npm test`.

## What this is

A local, self-contained offline copy of the browser game Paper.io 2 (originally from https://paperio.site/). It runs entirely client-side (JavaScript + Canvas) with AI bots — there is **no server-side game logic**, so it works fully offline. This repo is a preservation/offline-play copy, not an active development project; most files are the original site's unmodified content.

## Running it

The game `fetch`es JSON files (`assets/skins/skins.json`, `assets/languages.json`), so opening `index.html` via `file://` is blocked by browser CORS. Serve the folder over HTTP:

```powershell
npx serve .
# or
npx http-server -p 8777
```

Then open the printed URL. The page serves the `ts/` reconstruction from `ts/dist/app2.js`, so run `npm run build` in `ts/` first, or it falls back to the original `app2.js`; `?original` selects the original on purpose. The original game itself has no build step, no test suite, and no linter — it is static files served as-is. (A separate `ts/` project builds a readable, typed reconstruction of the engine from real npm dependencies — see **Editing guidance**.)

## Architecture

- `app2.js` — the **entire game engine**: rendering, physics, territory/trail logic, and AI bots. It is the unmodified original, **minified and obfuscated** via a string-array indirection scheme (identifiers like `a0_0x2b1e('0x11d')` decode to real strings at runtime). Treat it as opaque: do not try to read it as normal source or edit it by hand. `grep` for readable literals will mostly fail because strings are indexed, not inline.
- `index.html` — the only hand-written/maintained file. It contains an **offline shim** (inline `<script>`): the original relied on an ad network (adinplay/gameads) and analytics (gtag / Yandex.Metrika), all stripped here. The engine only requires `window.ShowPreroll()` to exist (called when the player presses Play) and calls `window.paperio2api.startGame()` to begin. The shim defines `ShowPreroll` to start the game immediately (no pre-roll ad). This is the integration seam between the page and `app2.js`. The shim also holds the **domain lock guard**. Off `paperio.site`, both engines arm `setTimeout(() => location.replace('http://paper-io.com/?bc=' + host), (Math.PI + Math.random()) * 60000)` during their top-level evaluation. That threw players off localhost and the live demo 3-4 minutes in. `location` and its members are `[LegacyUnforgeable]`, so the shim wraps `window.setTimeout` instead. A call whose `document.currentScript` is an `app2.js`, with a delay in [π, π+1) minutes, keeps its delay and id but gets a no-op callback, and `window.paperio2domainLockDefused` counts it. The engines stay identical to each other, so the differential test is untouched. `test/differential/domain-lock.integration.test.ts` proves it over 5 virtual minutes on both engines. A second inline script, the engine switch, picks which engine loads (see **Editing guidance**).
- `joystick.js` + `joystick.css` — hand-written on-screen joystick (added by this repo, not part of the original). See the input contract below. A bottom-left `#joystick-toggle` button and the `J` key show or hide it on any device; the choice is stored in `localStorage` under `paperio2.joystick` (`shown`/`hidden`, every access in try/catch), and with none stored it is shown on touch-likely sessions (coarse pointer, touch support, or a viewport <= 820 px) and hidden otherwise. **The toggle must never take keyboard focus** (`tabIndex = -1`, `preventDefault` on pointer/mouse down, `blur()` after click): the engine reads keys only when `event.target === document.body`, so a focused button silently kills arrow/WASD steering.
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

**The original `app2.js` has no user-facing pause** (no button or key, and no
`visibilitychange`/`blur` handler). Its only lever is the `stopped` flag, which the loop checks
before rescheduling `requestAnimationFrame`: `paperio2api.game.stopped = true` kills the rAF chain,
and `stopped = false; loop()` restarts it. That lever is **not a pause**. The real clock keeps
running under it, so the first frame after a restart sees the whole stopped span as one delta,
clamped to `MAX_DELTA_MILLISECONDS` (10 s): the game jumps up to 10 s at once, the FPS governor reads
it as a 10-second frame, and the death-delay `setTimeout` keeps counting. A hidden tab does the same,
because the browser stops rAF. `stopped` is also what the engine sets on death and on `Game.stop()`.

**The `ts/` reconstruction has a real pause.** All game logic reads `game.clock`, a `GameClock`
(`ts/src/shared/game-clock.ts`): real time minus every paused span, plus `setTimeout` timers that
are suspended on pause and re-armed with what they had left.

- **API:** `paperio2api.game.pause()` / `resume()` (each returns `false` when it changed nothing),
  `game.paused`, and `game.onPauseChange` (the UI's hook). While paused, `loop()` parks: it ends the
  rAF chain and sets `loopParked`, and `resume()` restarts it with a `requestAnimationFrame` at the
  point a running loop takes its frames, so there is never a second chain.
- **UI:** `PauseControl` in `ui.ts`, mounted beside the canvas on the `game` route: a top-centre
  button, a full-screen "Paused" overlay (tap to resume), and `Esc` / `P` by `KeyboardEvent.code`, so
  P works on any layout. Like the joystick toggle, none of it may take focus (`tabIndex = -1`,
  `preventDefault` on pointer/mouse down, `blur()` after a click): the engine reads keys only from
  `document.body`.
- **Hidden tab:** the `Game` constructor listens for `visibilitychange`. Hiding pauses. Showing
  resumes on its own only when no player is in play (the menu's bots), so a player who comes back
  finds the game paused rather than lost.
- **Bit-identical until the first pause.** `GameClock.now()` returns the real time minus a zero
  offset, and a timer is armed as one `setTimeout` with the delay it was given. That is why the
  differential test against the original stays green, so keep it that way.
- **Time sources, and which clock each one reads.** These read the game clock: the loop's frame delta
  (and through it the FPS/quality governor), the death delay in `gameOver`, the playtime
  (`startTime` and `result.time`), and `Unit.bornTime`. These stay on real time, deliberately:
  `timings.*` (CPU time inside a frame), the 500 ms particle-cleanup interval (it only filters dead
  particles, so it is idempotent while nothing ages), the prepare phase's `setInterval(0)` and its
  `maxPreparingTime` CPU budget, the domain-lock redirect and ad-pixel timers (not game logic, kept
  faithful), the recording-label blink, and the menu's tip rotation and CSS `fadein` (UI-only
  animations keep running). Bot AI, particles, labels, scores and quests are driven by the update
  delta, so they freeze with the loop. **A new time-based mechanic must read `game.clock`**, never
  `now()`/`Date`/a bare `setTimeout`, or it will fire during a pause.
- **Proven by `test/differential/pause.integration.test.ts`** (part of `npm run test:integration`).
  It plays one scenario twice on the reconstruction. One run pauses for 10 virtual minutes mid-play
  (Esc, then P) and again during the death delay (hidden tab, then the button). Every later frame's
  draw calls, the game state and the results screen, playtime included, must equal the unpaused run.
  It was falsified by reverting each of the loop delta, the death timer and the playtime to real time.

`paperio2api.game` is the live game object (subsystems: `rng`, `controller`, `nameManager`,
`bots`, `units`, `player`, `clock`, …).

## Snapshots, checkpoints & saved games

**The `ts/` reconstruction can snapshot the whole game and restore it exactly** (`ts/src/snapshot.ts`), and a
practice mode (`ts/src/practice.ts`) and saved games (`ts/src/save-format.ts`) are built on that. The original has
neither.

- **A snapshot** is an identity-preserving deep clone of the `Game` fields listed in `SnapshotFields` (units,
  territories, trails, the spatial grid and border, particles, labels, camera, FPS governor), cloned as ONE graph so
  shared references stay shared. Alongside it go the state that lives outside `Game`: the three seeded generators
  (game, name pool, skin manager; `readRandomSeed` / `writeRandomSeed` in `shared/random.ts` read them through a
  registry), the skin manager's `usedBy` / `unusedAssets` **in key order** (`randomAssetName` draws from
  `Object.keys`) plus each in-use skin's `user`, the vector pool, the id counter, and the game time. Restoring clones
  it again, clears the clock's timers (a running death delay is forgotten) and moves the clock with
  `GameClock.setNow`. Shared, never cloned: functions, the DOM, canvas patterns, skins and assets, config, language,
  controller, the stores. A `Path2D` is copied (`Polyline.add2` extends its path in place). `Unit.log` is written
  every frame and read nowhere, so a snapshot keeps it empty. The clone uses a work list, never recursion: point →
  segment → point chains run thousands deep.
- **A new piece of mutable game state must reach the snapshot**: a `Game` field goes into `SnapshotFields` and
  `readFields`, and module-level state (like the vector pool or the id counter) needs an accessor and a line in
  `captureSnapshot` / `restoreSnapshot`. `Math.random` is not restored in play: the original never seeded it, and
  only spawn positions, the frame-split jitter and particles draw from it.
- **A snapshot cannot be taken while a game timer is pending** (`canCaptureSnapshot`), which in practice means the
  player's death delay: the timer's callback closes over the game as it was.
- **Practice mode is opt-in** (the menu's Practice button, remembered as `paperio2.practice` in `localStorage`).
  `Game.practice` is `null` otherwise, and the engine's three hooks (a death intercept in `gameOver`, `afterFrame`
  at the end of `loop`, `drawMarkers` in `renderGame`) are inert, so a normal run makes no extra calls and the
  differential test stays green. A practice run takes an automatic checkpoint every 10 s of game time **only while
  the player is inside their own territory**, keeps the last 10 automatic and 20 manual ones, and on death restores
  the latest after the engine's own death delay. `Z` / `X` / `K` add, remove and save, by `KeyboardEvent.code`; the
  HUD follows the pause button's no-focus rule. Practice runs set no best score, track no achievements, and their
  result carries `practice: true`. A loaded save always runs as practice.
- **A saved game** is the snapshot through `shared/graph-codec.ts` (a flat object table with back-references and a
  class registry, never `constructor.name`), with skins saved by name and paths rebuilt on load, as gzipped base64
  under `paperio2.save.<id>`, indexed by `paperio2.saves`. Particles, quest notifications and the vector pool are
  left out. **Bump `SAVE_FORMAT_VERSION` whenever the saved shape changes**; a save from another version or
  `GAME_BUILD` is refused with a message. An early-game save measured about 0.9 M characters against the 4 M limit
  `writeSave` enforces, and a full `localStorage` is reported, never half written.
- **Cost:** a capture measured about 32 ms in headless Chrome mid-game, so an automatic checkpoint is a two-frame
  hitch every 10 s in practice mode only.
- **Proven by `test/differential/checkpoint.integration.test.ts`** (see that folder's README): a snapshot, a detour
  that kills the player, a restore during the death delay, then frame-for-frame state and pixel equality with a page
  that never left the scenario, from memory and through a save; plus a practice run end to end. It stops at frame 960
  because both pages then throw in `spawnBot`: with 15 bots during a death delay the strict conversion's
  bot-type lookup runs off its table where the original spawns a 16th bot. That is a reconstruction bug outside the
  snapshot, and it also freezes the loop in a normal run.

## Editing guidance

- Real changes belong in `index.html` (the shim) or the CSS/assets — **not** in `app2.js`.
- A readable, typed **reconstruction** of the engine lives in the **`ts/` project**
  (`ts/src/`, entry `ts/src/main.ts`). It is the single maintained deobfuscated source (the
  older root-level `app2.deobfuscated.js`/`.ts` copies have been removed). Originally one big
  IIFE in `app2.ts`, it has been **split into layered ES modules** — see **the module-split
  subsection above** for the current file layout (`shared/`, `geometry/`, `i18n.ts`, `ui.ts`,
  `skins/`, `scoring.ts`, `particles.ts`, `entities/`, `controller.ts`, `game-render.ts`,
  `game-api.ts`, `engine.ts`; `main.ts` is the entry and `global.d.ts` holds the ambient
  `window`/DOM augmentations) and the no-circular-dependency / lint conventions. The engine was
  originally shipped with **preact** (10.4.2–10.5.4; treated as **10.5.4**) and **js-cookie**
  (2.2.x) inlined into the same bundle; those two libraries have been **extracted to real npm
  dependencies** (`ts/package.json` pins `preact@10.5.4` + `js-cookie@2.2.1`) and are now
  `import`ed instead of inlined.
  - Build: `cd ts && npm install && npm run build` → esbuild bundles `src/main.ts` + the two
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
    rotated string array.
  - **The page serves the `ts/` build, not the original.** `index.html`'s engine switch (an
    inline script after the shim) `document.write`s a parser-inserted `<script>` for
    `ts/dist/app2.js` by default, or for the root `app2.js` when the URL carries `?original`, and
    sets `window.paperio2engine` to `reconstruction`/`original`. When the bundle fails to load (a
    local serve with no `npm run build`) it warns in the console and falls back to the original.
    `document.write` rather than a created `<script>` keeps the engine in order before
    `joystick.js`, exactly like the old static tag. The root `app2.js` stays byte for byte.
  - **GitHub Pages is deployed by `.github/workflows/pages.yml`** (Pages source: GitHub Actions,
    no longer the legacy branch build). On every push to `main` it builds `ts/`, assembles `_site`
    from the tracked files minus `ts/` and `.github/` plus `ts/dist/app2.js`, plays the
    differential suite against that directory (`DIFFERENTIAL_SITE_ROOT`), and only then deploys.
- Changes already made from the original (documented in README.md): removed ad/analytics scripts, dropped cache-busting version query strings (`app2.js?v7`, `style3.css?v50`), and localized the font instead of loading from Google Fonts.
- `app2.js`, `style3.css`, `manifest.json`, and assets are the site's original copyrighted content, kept for local/offline personal use.
