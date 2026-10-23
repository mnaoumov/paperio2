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
- **Behavioral equivalence is proven, not assumed: `npm run test:integration`** (`ts/test/differential/`, its `README.md` has the detail). It plays six recorded scenarios (two served as `paperio.site`, so the domain lock takes its real-host branch) on the root `app2.js` and on `ts/dist/app2.js`, through `index.html`'s own engine switch (`?original` vs plain), in lockstep in headless Chrome, under a seeded `Math.random`, a virtual clock and a virtual rAF/timer scheduler, and fails on the first frame whose canvas calls, 30-frame game-state snapshot or final pixels differ, naming the call and both values. "Boots with 16 units and 0 console errors" is no longer the bar for a `ts/` change: run this. It needs Chrome (stable channel, or `CHROME_PATH`), serves every request through puppeteer's request interception rather than a real HTTP server (on this machine a desktop ad blocker injected a userscript into a localhost page, and its one `Math.random` call shifted the seeded stream, so local runs stopped matching CI), builds `dist/` itself, takes about two minutes, and is deliberately outside `npm test`; CI runs both. It and the audit beside it (that README's last section) caught divergences the boot check never could: the strict conversion's `new Path2D()` defaults on `Polygon.path`/`Territory.path`, and a declared `Player.moveTo` field that, under define semantics, hid the domain lock's `Player.prototype.moveTo = true` (now `declare`). **That class of change is the one to watch for**: a field default or declared field the original never set on the instance. When a scenario stops reaching an event its `expectedCoverage` asks for, fix the route or the seed rather than lowering the minimum. To bisect a divergence, set `DIFFERENTIAL_DUMP=<dir>` to get both frames' call lists.
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
- `index.html` — the only hand-written/maintained file. It contains an **offline shim** (inline `<script>`): the original relied on an ad network (adinplay/gameads) and analytics (gtag / Yandex.Metrika), all stripped here. The engine only requires `window.ShowPreroll()` to exist (called when the player presses Play) and calls `window.paperio2api.startGame()` to begin. The shim defines `ShowPreroll` to start the game immediately (no pre-roll ad). This is the integration seam between the page and `app2.js`. The shim also holds the **domain lock guard**. Off `paperio.site`, both engines arm `setTimeout(() => location.replace('http://paper-io.com/?bc=' + host), (Math.PI + Math.random()) * 60000)` during their top-level evaluation. That threw players off localhost and the live demo 3-4 minutes in. `location` and its members are `[LegacyUnforgeable]`, so the shim wraps `window.setTimeout` instead. A call whose `document.currentScript` is an `app2.js`, with a delay in [π, π+1) minutes, keeps its delay and id but gets a no-op callback, and `window.paperio2domainLockDefused` counts it. The engines stay identical to each other, so the differential test is untouched. `test/differential/domain-lock.integration.test.ts` proves it over 5 virtual minutes on both engines. The lock has a second half, which the shim defuses too. Only on `paperio.site` does the engine set `Player.prototype.moveTo = true`. Without it, `handleUnitMovements` gives a player outside its base a 1-in-2000 chance on every movement step to be marked as back inside (`unit.in = unit.base`). Its trail then never closes, so the territory never grows past the start circle, and `recoverTail` is switched off as well. Neither engine exposes `Player`, so off `paperio.site` the shim puts a `moveTo` accessor on `Object.prototype`. It answers `true` for `isPlayer === true` and `undefined` for everything else, and its setter makes a plain own property. The same test asserts the flag on both engines. A second inline script, the engine switch, picks which engine loads (see **Editing guidance**).
- `joystick.js` + `joystick.css` — hand-written on-screen joystick (added by this repo, not part of the original). See the input contract below. A bottom-left `#joystick-toggle` button and the `J` key show or hide it on any device; the choice is stored in `localStorage` under `paperio2.joystick` (`shown`/`hidden`, every access in try/catch), and with none stored it is shown on touch-likely sessions (coarse pointer, touch support, or a viewport <= 820 px) and hidden otherwise. **The toggle must never take keyboard focus** (`tabIndex = -1`, `preventDefault` on pointer/mouse down, `blur()` after click): the engine reads keys only when `event.target === document.body`, so a focused button silently kills arrow/WASD steering.
- `style3.css` — unmodified original UI styles.
- `manifest.json` + `sw.js` — the installable app (Chrome's install, Safari's Add to Dock). The manifest is the original's with every path made relative (`start_url`/`scope` `./`, relative icons) plus a maskable icon, because the original sat at its domain root and under `/paperio2/` an installed app opened https://mnaoumov.dev/. Its `id` is `/paperio2/`, not `./`: Chrome resolves `id` against the ORIGIN, so `./` gave the app the whole domain's identity. `index.html` adds a 180x180 `apple-touch-icon` and `apple-mobile-web-app-title` for Safari, and registers `sw.js` after `load` only where `navigator.serviceWorker` exists. `sw.js` precaches the shell, every file `skins.json` names and the selector thumbnails (tolerating a missing one), and answers same-origin GETs network first with a 4 s timeout and a cache fallback, so an online launch is current and an offline one still starts. **The differential test never registers it**: it serves `http://paperio2.test/`, which is not a secure context. Verifying offline in puppeteer needs the server shut down, because `page.setOfflineMode` does not reach the service worker's own fetches.
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
  `Object.keys`) plus each in-use skin's `user`, the vector pool, the id counter, the game time, and the game clock's
  pending timers (`GameClock.readTimers`: each callback with the game time it has left). Restoring clones it again,
  clears the clock's timers (a running death delay is forgotten), moves the clock with `GameClock.setNow` and sets
  the snapshot's own timers again. Shared, never cloned: functions, the DOM, canvas patterns, skins and assets, config, language,
  controller, the stores. A `Path2D` is copied (`Polyline.add2` extends its path in place). `Unit.log` is written
  every frame and read nowhere, so a snapshot keeps it empty. The clone uses a work list, never recursion: point →
  segment → point chains run thousands deep.
- **A new piece of mutable game state must reach the snapshot**: a `Game` field goes into `SnapshotFields` and
  `readFields`, and module-level state (like the vector pool or the id counter) needs an accessor and a line in
  `captureSnapshot` / `restoreSnapshot`. `Math.random` is not restored in play: the original never seeded it, and
  only spawn positions, the frame-split jitter and particles draw from it.
- **A snapshot can be taken at any time between frames** (`canCaptureSnapshot` only refuses a stopped game), pending
  game timers included. That holds because **a game-clock timer's callback must not close over anything the snapshot
  clones**: it reads the game instead. The engine's death delay keeps its player, reason and results in
  `Game.pendingGameOver` (a `SnapshotFields` entry) and its timer only calls `finishGameOver()`. A new
  `clock.setTimeout` follows the same rule, or a restore runs it against objects the game no longer holds. A save
  cannot hold a timer (its callback is code), so `encodeSave` refuses a snapshot with one and the HUD's save falls
  back to the latest checkpoint.
- **Practice mode is opt-in** (the menu's Practice button, remembered as `paperio2.practice` in `localStorage`).
  `Game.practice` is `null` otherwise, and the engine's two hooks (a death intercept in `gameOver`, `afterFrame` at
  the end of `loop`) are inert, so a normal run makes no extra calls and the differential test stays green. A
  practice run takes **uniform** automatic checkpoints: on a grid of 10 s of game time from the run's first one,
  wherever the player is (trail included), on the first frame at or past each grid point, so never more than a frame
  late; a manual one and a respawn do not move the grid. **No count cap**, but old automatic ones are thinned
  (`keepsAutoCheckpoint`, by grid index: the latest 10 all, then one in 6 up to 70 intervals old, then one in 60;
  every manual one kept), because a snapshot is megabytes (see **Cost**). On death it restores the latest after the engine's own death delay. The
  in-game panel is exactly two buttons, Set checkpoint (`Z`) and Remove latest (`X`), by `KeyboardEvent.code`; there
  is no checkpoint list and no map marker, and going back to a checkpoint is a death. Save (`K`, or the paused
  overlay's button) and End practice live on `PauseControl`'s paused overlay. All of it follows the pause button's
  no-focus rule. **No checkpoint is taken while the game is still preparing**
  (`game.preparing()`). Play pressed before the menu's 6000-cycle prepare phase is through gives `start` a 500 ms
  budget, and then the loop fast-forwards the rest at up to 30 updates a frame with the player already in play. That
  is the original's start, and a checkpoint from it would replay the fast-forward on every respawn. So a practice run
  (and a loaded save) calls `start` with `completePreparation`, which prepares in full before the player spawns. The
  first checkpoint is then taken where the player spawned. If the game is somehow still preparing, `afterFrame` takes
  it on the first frame after that. A frame that throws no longer ends the rAF chain:
  `Game.loop` logs it (`frameErrors`) and steps again on the next frame. Practice runs set no best score, track no achievements, and their
  result carries `practice: true`. A loaded save always runs as practice.
- **The menu's additions sit behind one `Extras` button** (`#extras-toggle`, open state remembered as
  `paperio2.extras`; owner, 2026-10-22). `MenuScreen` renders the original's menu plus that button, and
  `renderExtrasSections` builds the sections shown in `#extras-panel` while it is open. **A new menu section goes there,
  never into the bare menu.** `index.html` gives `#ui` `overflow-y: auto` (and `style3.css` stays untouched), so a menu
  or results screen taller than the window scrolls and `body` never does. Recording mode hides the button too, and the
  panel opens with a line naming R as the way back. A test that clicks a menu control opens Extras first
  (`openExtras` in `checkpoint.integration.test.ts`). `menu-extras.integration.test.ts` proves the closed menu fits
  1280x720, the wheel reaches `#recordings` at 1280x600, and recording mode leaves none of the added ids.
- **Recording mode** (`ts/src/recording.ts`, owner request 2026-10-21) hides every addition over the original and marks
  the frames to cut; the README's *Recording mode* section is the user-facing contract. `R` (by `KeyboardEvent.code`)
  toggles it, remembered as `paperio2.recording`, mirrored as the `paperio2-recording` class on `<html>` that
  `joystick.css` hides the joystick by. In `ui.ts`, `marker` (a `CutMarker`, or `null` when the mode is off) is passed
  to `PauseControl`, `PracticeControl` and `GameScreen`; each hides itself and routes its events through the marker.
  The marker is a `pointer-events: none` full-frame div, red (`cut`) until `resumeThen`, then green (`resume`) for
  700 ms while the game stays paused, then play. `Practice.onPlayerDeath` / `onRespawn` drive a respawn's cut, and
  `Checkpoint.seenAt` (wall time its state was last on screen, reset when a respawn resumes it) gives the red frames'
  rewind hint. **A new on-screen addition must hide in recording mode**, and a new interrupting action goes through
  `interruptPlay`. It is off by default and touches nothing the engine runs, so the differential test is unaffected.
  **Canvas-drawn additions revert while recording** (owner, 2026-10-22: the screen only, enemy modes and bot count
  still apply): `Game.looksOriginal` is true while `screenRecording` (mirrored from recording mode by an App effect)
  or `videoRecorder` is set, unless `recordingAdditions` (the menu's **Additions in recordings**,
  `paperio2.recordingAdditions`, off by default) is on. It turns off the leaderboard name fit (`fitsLeaderboardNames`
  in `game-render.ts`, which also redraws the cached rows when it flips) and ignores `cameraFollow`. **A new addition
  drawn on `game.view` must check `looksOriginal`**; one on its own layer is never in a take and recording mode hides
  it. Proven in `demo-extras.integration.test.ts`.
  Every switch in (R, the menu button, or a load with the mode stored as on) shows `RecordingNotice`, the owner's
  wording verbatim; in a run the switch pauses under red and `useRecordingMode` holds the green span and the resume
  until the notice is dismissed. **Keep its key effect's deps at `[shown]`**: a dep that changes on every App render
  (an inline callback) queues preact's after-paint rAF on every frame, and that alone broke the checkpoint-grid
  integration test (1 automatic checkpoint instead of 3+).
- **A saved game** is the snapshot through `shared/graph-codec.ts` (a flat object table with back-references and a
  class registry, never `constructor.name`), with skins saved by name and paths rebuilt on load, as gzipped base64
  under `paperio2.save.<id>`, indexed by `paperio2.saves`. Particles, quest notifications and the vector pool are
  left out. **Bump `SAVE_FORMAT_VERSION` whenever the saved shape changes**; a save from another version or
  `GAME_BUILD` is refused with a message. An early-game save measured about 0.9 M characters against the 4 M limit
  `writeSave` enforces, and a full `localStorage` is reported, never half written.
- **Cost** (measured 2026-10-21 in headless Chrome, CDP heap usage after GC around 5 retained captures): a snapshot
  holds **2.4 MB** at the start of a run (5.2 k territory points across all units) and **4.6-4.7 MB** mid-game
  (12.2 k points), roughly 0.38 KB per point, so it grows with the total territory outline. A capture took 54-135 ms
  (an earlier measurement said 32 ms), so an automatic checkpoint is a hitch of a few frames every 10 s, in practice
  mode only. Unthinned, an hour at 10 s would be 360 snapshots, about 1.7 GB mid-game; with the thinning an hour
  keeps 25 automatic ones (about 120 MB) and each further hour adds 6. A gzipped save of the same states is
  0.84-1.8 M characters.
- **Proven by `test/differential/checkpoint.integration.test.ts`** (see that folder's README): a snapshot, a detour
  that kills the player, a restore during the death delay, then frame-for-frame state and pixel equality with a page
  that never left the scenario, from memory and through a save; plus a practice run end to end. It runs to frame 1500,
  past the player's own death and the 16th bot that spawns during its death delay.
- **A 16th bot during a death delay is the original's behaviour, kept on purpose.** `spawnBot`'s guard discounts
  `this.player` even while the dead player is out of `units`, so with 15 bots it spawns one more, the level's bag of
  bot types runs out, and the bot gets an `undefined` type (`bots.undefined` becomes `NaN`). The strict conversion
  once asserted on that bag and threw, which ended the rAF chain and froze the game, practice respawns included.
  `spawnBot` now follows the original key for key (`String(type)` keys, `Number(...)` reads), and the scenario
  `capture loop on paperio.site, a 16th bot` pins it.

## In-game video recorder

**The `ts/` reconstruction records its own canvas** (`ts/src/video/`, owner request 2026-10-21); the README's
*Recording inside the game* section is the user-facing contract.

- **Hooks:** `Game.videoRecorder` (a `FrameRecorder`, `null` unless a take runs) gets `afterFrame()` at the end of
  `runFrame`, after the practice hook, and `Practice` calls `onCheckpoint` from `add` and `onRespawn` from `respawn`.
  With no take running nothing is called, so the differential test is unaffected. The UI (`video/ui.ts`,
  `useVideoRecording`) does nothing at all off a secure page, and the differential harness serves
  `http://paperio2.test/`, which is not one.
- **The cut** lives in `video/timeline.ts` (`RecordingTimeline`, unit-tested): video time is the game clock minus the
  clock at the take's first frame, frames go on a fixed grid of the chosen fps, a checkpoint's frame is a forced
  keyframe at its `snapshot.clockTime`, and a respawn drops every chunk after that keyframe (kept or still in the
  encoder) and forces a keyframe on the next frame. Since the restore puts the clock back to the checkpoint's, the
  video carries on from the checkpoint's own timestamp. A respawn at a checkpoint from before the take restarts it.
- **Storage** is IndexedDB (`video/store.ts`): one record per take, one per chunk keyed `[recordingId, seq]`, the cut a
  key-range delete, writes chained in issue order. A running take holds the Web Lock `recordingLockName(id)`; on load,
  a take still `recording` whose lock nobody holds is marked `recovered`.
- **Export** (`video/export.ts`) muxes with mediabunny into a non-fragmented MP4 through `StreamTarget` and
  `PositionedParts`. Do not pass `frameRate` to `addVideoTrack`: mediabunny rounds every timestamp to it, and a
  checkpoint keyframe can sit between two slots.
- **A restore redraws the leaderboard.** The render layer caches the leaderboard as an image that is redrawn only when
  `game.topListChanged`, and that image is not game state, so `restoreSnapshot` sets the flag. Without it the first
  frames after a respawn showed the abandoned attempt's standings, which the recorder made visible.
- **Bitrate** is `DEFAULT_BITRATE_720P30` (1 Mbit/s) scaled by pixels and fps. It was measured on 2026-10-21: 1, 1.5, 2
  and 4 Mbit/s gave mean PSNR 36.0 / 36.4 / 36.6 / 36.9 dB on a busy clip with no visible blocking, and a real
  practice take came to 9.3 MB a minute.

## Music and sound effects

**The `ts/` reconstruction has music and sound effects; the original has neither** (owner request, 2026-10-21). The README's *Music and sound effects* section is the user-facing contract.

- **Hooks:** `Game.sounds` (a `GameSounds`, `null` until the page attaches `audio/game-audio.ts`'s `GameAudio`) is told
  about the player's own moments only: `onCapture` from `handleReturn` (with the share of the arena taken),
  `onKill` and `onPlayerDeath` from `kill`, `onGameOver` from `finishGameOver`, `onPauseChange` from `pause` /
  `resume`, and `onRespawn` from `Practice.respawn`. The checkpoint clicks come from the practice controls in `ui.ts`.
  `audio/ui.ts`'s `useGameAudio` attaches it on the `game` route and drives the music by route.
- **Sound must never draw from `Math.random`.** The differential harness seeds `Math.random`, and the engine takes spawn
  positions from it, so one extra draw moves every later spawn. The first version shuffled the playlist with
  `Math.random` and failed all six scenarios at the player's spawn (frame 122). `audioRandom` in `audio/playlist.ts`
  reads `crypto.getRandomValues`, and a unit test asserts it never touches `Math.random`. The same holds for any new
  page-side randomness. Sound also never draws on the canvas, so the harness needs no switch for it.
- **Captures below 0.0001 of the arena are silent** (`captureCue`). Sliding along the base's edge re-enters it many times
  a second, each time taking under a millionth of the arena; the smallest real loop measured took 0.0018.
- **Warning loops** (`audio/exposure.ts`, `audio/exposure-loops.ts`, owner request 2026-10-22): two oscillator-built
  loops, open ground and enemy ground, read after every frame from a `game.frameObservers` entry that `GameAudio.attach`
  adds. The zone is the engine's own `player.in`: `player.base` is home, `null` open ground, any other territory enemy
  ground (`Territory.handleEnemyIntersect` sets it on crossing in; a capture or a death that removes that ground clears
  it). `desiredExposureMix` is silent with effects off, outside the `game` route, paused, dead and at home, and returns
  the shared `SILENT_MIX` then, so nothing (not even an `AudioContext`) is created while silent. Level and pulse rate
  rise with the trail in 16 steps up to 1500 units, so a growing trail does not reschedule automation every frame; each
  change is a 150 ms linear ramp from the current value. The differential page attaches `GameAudio` too, so the observer
  only reads: it never writes game state or draws `Math.random`. **The loops are not logged on a take**: the timeline logs one-shot cues, and a state would need a new record shape.
- **Recorder:** every gameplay cue is logged on the take's `RecordingTimeline` (`sound`), heard or not, at the game
  clock's time, and a respawn's cut drops the cues after the checkpoint's keyframe. They are stored on the take's record
  (`sounds`). The practice sounds (`PRACTICE_SOUNDS`) are never logged, and recording mode silences them. Music is never
  recorded: `video/audio-mix.ts` renders the effects plus an optional music bed (`planMusicBed`, crossfaded, over the
  final cut length) with `OfflineAudioContext` in 10 s windows, fed to the muxer as the video packets reach each window,
  and encodes AAC, or Opus where AAC cannot be encoded. The Recordings panel's **Sound** setting (`VideoSettings.audio`)
  picks what goes in.
- **Assets** are in `assets/audio/` (`music/`, `sounds/`, `CREDITS.md`), all CC0 by Juhani Junkala from OpenGameArt.
  `sw.js` precaches the effects; music is cached as each track plays. Only the track playing is kept decoded (about
  25 MB).

## Demo autopilot

**The `ts/` reconstruction can play itself** (`ts/src/autopilot/`, owner request 2026-10-21); the README's *Demo
autopilot* section is the user-facing contract and holds the benchmark table.

- **Hook:** `Game.autopilot` (an `AutopilotHook`, `null` unless the menu's Demo mode is on) gets `beforeInput()` right
  before `readInput` in `update` and `afterFrame()` at the end of `runFrame`. With it `null` nothing is called, so the
  differential test is unaffected. `GameApi.attachAutopilot(mode)` builds and attaches one; `autopilot/ui.ts`'s
  `useAutopilot` does that on the `game` route.
- **It steers only through `controller.mouse`**, the pointer `readInput` already turns into `game.direction`, so the
  player's speed, turn rate and 254-step angle apply. **Neither pilot may write game state, allocate from the engine's
  vector pool or draw `game.rng` / `Math.random`**: either would change the game it is watching, break the benchmark's
  replay of a seed, and shift snapshots. The whitebox works on plain `{ x, y }` copies (`autopilot/plane.ts`).
- **Hand-over:** a steering `keydown` (any `keyCode` the engine steers on, so the joystick's synthetic events count), a
  touch on the canvas or a trusted `mousedown` on it disengages; `O` (`KeyboardEvent.code`) re-engages. `I` toggles
  the overlay. The engine steers on arrows/WASD/C and `G` toggles its debug graph; the app uses R Z X K P J V M N H L Esc.
  **A mouse that only moves must never take over** (owner, 2026-10-22): the pointer rests over the canvas after the menu's
  click, so the old 6 px move threshold handed every demo to a human who was not steering, and the player flew straight
  until `O`.
- **The demo runs itself:** while a pilot is on, `useAutopilot` starts the next round from the `results` route after
  `DEMO_RESTART_SECONDS` (5) through the App's `start`, the same path as the results screen's Play, and the readout counts
  it down; leaving `results` (Continue) cancels it. The menu's default stays Off (owner, 2026-10-22). Both halves are
  proven in `test/differential/demo-extras.integration.test.ts`.
- **Blackbox purity:** `autopilot/blackbox.ts` imports only `./plane.ts`, and `blackbox.test.ts` asserts it. The driver
  hands it `grabDownscaledFrame(game.view)` (the canvas scaled down 4x) after each rendered frame, nothing else.
- **How the blackbox keeps its bearings and gets home** (`blackbox.ts`, `odometry.ts`): an odometer matches each
  classified frame's edges against a key frame, so the pilot knows its position, speed and heading from the ground
  sliding past, and remembers its trail and its exit point as positions rather than by colour (the trail's blend
  changes with the ground under it). The way back flies each candidate aim in `simulateReturn` (measured speed, the
  turn rate, the engine's wall slide: a step's part into the wall is dropped) and fails it on the remembered trail's
  raster; once a flight leaves the view it finishes as a straight line checked against the remembered trail itself
  (`trackCrosses`), so the exit point beyond the view is a real aim. Aims are taken only from the inside of own ground
  (`isOwnInside`): edges between foreign colours and the wall's dotted stroke blend into specks of the player's colour,
  which also made `capturedPixels` read a false capture. The last aim is kept while it stays within 25% + 10 frames of
  the best (`quickestAim`), or the aim flips between frames and the player curls over its own trail. With no reachable
  aim, `escape` prefers the clear heading that ends nearest the exit point. `guardWallTurn` is the whitebox's rule seen
  from pixels: the outward normal is the wall-distance gradient at the centre, and contact is a centre distance under
  12 (pressed, the player reads 10, because the avatar hides the edge). `--dump <dir>` on the benchmark writes the
  last 2 s of frames beside their classes, the remembered trail (yellow) and the aim (magenta); the minimap is not
  read, since the odometer already gives the way home beyond the view.
- **A live game runs the pilots' heavy work in a worker** (`autopilot/worker.ts`, owner report 2026-10-22: "drops
  frames often"). Measured with `npm run benchmark:frames` (`test/benchmark/frame-times.ts`: real time, real
  `localhost` server, a rAF probe, hook timings, `--profile` for a CPU profile): the blackbox's frame reading took
  27 ms of every frame (readback 6, `decide` 20), which held the game at 30 fps, and the whitebox's `planLoop` stalled
  a frame for 40-450 ms every few seconds. `useAutopilot` attaches with `attachAutopilot(mode, true)`, which starts
  the worker (`worker-client.ts`); the benchmark and tests call `attachAutopilot(mode)` and stay synchronous, frame
  for frame, so a seed still replays (verified: `--why` traces identical before and after). The worker is bundled
  first by `build.mjs` and inlined as the `AUTOPILOT_WORKER_SOURCE` define, started from a blob, so `dist/` is still
  one file and `pages.yml`/`sw.js` need nothing. **Anything the worker imports must not touch the DOM at module
  level**: it runs `blackbox.ts` and `whitebox.ts` (which still imports `entities/units.ts`), and the
  `runs the demo pilots' heavy work in a worker` test in `demo-extras.integration.test.ts` fails if it stops booting.
  - **Blackbox:** the page scales the canvas with `createImageBitmap(view, { resizeWidth, resizeHeight, resizeQuality:
    'low' })` (byte-identical to `grabDownscaledFrame`'s `drawImage`, measured) and transfers it; the worker decides
    on the NEWEST frame it has when free, dropping the rest. A first version sent the next frame only after the last
    reply, which gave 18 decisions a second and 5-7 deaths per 90 s against 0-1 before; the newest-frame queue gives
    about 38 and plays as before. A decision lands about a frame later than in-frame, and `epoch` drops one from
    before a takeover. `Autopilot.blackbox` is `null` in this mode: read `blackboxDebug`.
  - **Whitebox:** `findLoop(PlanInput)` is the plan as plain data; `WhiteboxPilot.planner` sends it and the pilot holds
    in its base until the answer, which counts only while the pilot kept waiting update after update (`planPending`).
    `threatens` also got an exact speed-up (a bounding-circle reject and one pass over the samples), which made the
    synchronous benchmark about 35% faster with identical traces.
- **The overlay is its own `pointer-events: none` canvas**, so the recorder, which records `game.view`, never sees it.
  While the human steers and the overlay is on, `Autopilot.coach` keeps the whitebox planning without steering (the
  "assist" mode).
- **Whitebox model of a bot** (the facts it relies on, from `entities/bot-ai.ts` and `engine.ts`): a bot hunts the trail
  (`attack`) once the trail is within `max(vrange) * aggro * AGGRO_RANGE_FACTOR` while it is in `capture`/`exit`, or when
  it is the nearest bot to a trail longer than `botAttackTrackLength` (the pilot keeps trails under 85% of that). A loop
  is planned only when every hunting unit is farther from it than the player will be from home (`farthestHome`, a
  chamfer distance field over a raster of the base), and every other bot is beyond its trigger distance plus a share of
  the loop that grows when the bot heads toward it. The top candidates are flown in `simulateApproach` (60 steps a
  second, the turn rate, a radial wall slide) from the player's real position and heading, and rejected if they leave
  the base before the exit, touch their own trail or slide backwards.
- **Wall:** pressed against the wall, the engine turns the heading the shortest way, and a heading that swings through
  the outward normal reverses the slide back over the trail's last segment, which it kills as a death by the wall.
  `guardWallTurn` filters every steer, live and in `simulateApproach`, so that near the wall the heading never crosses
  the outward normal: a target back along the wall keeps the slide going forward, and an inward turn behind goes the
  long way round. With it, loops reach past the wall (`WALL_MARGIN` is negative) and take the last ring, and once the
  player holds 99% with no unit within 300 the pilot makes a forward-only lap along the wall (`sweepTarget`) to close
  the slivers left there.
- **Defence:** a bot trail through the player's base is cut from inside it (`homeVictimPoint`), only at points at least
  `HOME_CUT_DEPTH` (30) inside, and the cut is dropped the moment the player is outside; a bot whose pending capture
  (`pendingCapture`) would enclose the player in its base is cut wherever is nearest. Only a victim chased in the open is
  left out of the threat check: one cut from home can turn on the player's trail, which was the commonest death.
- **Benchmark:** `npm run benchmark -- --modes whitebox,blackbox --seeds N --max-minutes M [--why]`
  (`test/benchmark/autopilot-benchmark.ts`). It reuses the differential harness's page (`openVariant` with
  `traceCanvas: false`, which `installDeterminism` honours by leaving the canvas prototypes alone), starts the run with
  `api.start(..., completePreparation = true)`, and steps the virtual clock one 60 fps frame at a time inside the page.
  The whitebox runs with `game.renderer = null` (rendering changes no game state): 16 fifteen-minute games in parallel
  took about 4 minutes here. The blackbox renders every frame and runs at about real time. `--why` prints each failed run's last phase changes, the killer's
  bot state, the whitebox's decision counts and the ground it gained and lost. `--enemies` picks the enemy modes to play against
  (see **Enemy modes**); it defaults to the original bots.

## Racing: seed, ghost and showcase

**The `ts/` reconstruction has a shareable seed, a ghost of the best run and a showcase camera for the demo** (owner
request 2026-10-21); the README's *Racing* section and *Demo autopilot*'s **View** paragraph are the user-facing
contract. All off by default and inert for the differential test.

- **Seed** (`ts/src/seed.ts`): `main()` reads `?seed=` and, before anything game-side draws, replaces `Math.random` with
  a seeded mulberry32, so the name pool's and the game's own generators (seeded from `Math.random`) follow. A seeded
  page **prepares in one synchronous go** (`GameApi.prepare`): spread over `setInterval` batches, preparation
  interleaves with timers and frames whose timing differs per page, and two pages on one seed got different maps. The
  API keeps a snapshot plus `Math.random`'s state the moment preparation ends and restores both on every seeded Play
  (`returnToSeededStart` in `start`), because the menu's bots then play on real time. Only the start is pinned: live
  play steps by real frame deltas, so a run diverges from there. Proven by `test/differential/seed.integration.test.ts`
  (two harness seeds, 2 vs 300 menu frames, same units at spawn; another seed differs).
- **Ghost** (`ts/src/ghost/`): `useGhostRace` samples the player's position and percent every 100 ms of game time
  through `Game.frameObservers`, keeps the best run per seed in `localStorage` (`paperio2.ghost.free` /
  `paperio2.ghost.seed:<seed>`, versioned by `GHOST_FORMAT_VERSION`) when the run's effect is cleaned up, never for a run
  that was practice at any point, and draws it on its own canvas after each frame, mapped through `camera-map.ts`'s
  `worldToScreen` from `game.origin` (the camera centre the frame was drawn from). It records positions, not inputs:
  inputs do not replay under real-time stepping.
- **Showcase** (`ts/src/autopilot/showcase.ts`): `Game.cameraFollow` (`null` by default) overrides the camera's target
  in the render context; with it `null` the camera code takes the original's path, smoothing included. The showcase
  returns the leader (`pickLeader`, with a 0.2% hysteresis) and does its own glide, and returns `null` while the human
  steers. The pilot stays `game.player`: steering goes through the player's controller, so making the pilot "just
  another unit" would need a second controller in the engine, which was not taken.
- **Hooks are inert when unused:** `cameraFollow` is one optional call, and `frameObservers` is an empty array loop.
  Proven in a page by `test/differential/demo-extras.integration.test.ts`.

## Enemy modes

**The `ts/` reconstruction can change how the bots play** (`ts/src/entities/enemy-modes.ts`, owner request
2026-10-21); the README's *Enemy modes* section is the user-facing contract and explains how the original bots work.

- **Tables, not edits.** Each mode is a `BotStates` table built from the original `botStates`. The original's `capture`,
  `cut` and `exit` handlers delegate to `updateCapture` / `enterCut` / `updateCut` / `enterExit` / `updateExit` in
  `bot-ai.ts`, which take the "should attack" test as a parameter, so a mode reuses them with another test. That
  refactor is behaviour-neutral (the differential suite proves it). Every table carries every state name the original
  has, so a switch mid-run never strands a bot (`enemy-modes.test.ts` asserts it).
- **Hooks, inert for Original:** `Game.enemies` (`EnemyHooks`, `null` for Original) is read in three places: the `Bot`
  constructor's table (`tableFor`), a personality override after the level lerp (`adjustPersonality`), and the
  eligibility test in `updateClosestBotAttack` (`canForceAttack`). Difficulty and bot count write `config.botLevel` /
  `config.botsCount`, restoring the values the config had before the settings first touched them.
- **Applies at once** (`GameApi.setEnemySettings`, from `useEnemySettings` in `enemy-menu.ts`), to the menu's bots too.
  Stored as JSON under `paperio2.enemies`; `parseEnemySettings` drops unknown values field by field.
- **Snapshot-safe.** No new `Bot` fields: a hunted unit lives in the fsm context (`BotStateContext.prey`), which the
  snapshot clones. Every table in `ENEMY_STATE_TABLES` is a shared instance in `snapshot.ts`, and a save names a
  non-original table `enemyStates:<id>` (the original keeps its `botStates` tag, so older saves load). The settings are
  the page's, not the game's, so `restoreSnapshot` ends with `syncBotStates`: bots from before a switch take the current
  mode, and a mixed bot keeps the table it drew.
- **Engine facts the modes rest on:** crossing a trail kills the trail's OWNER (`Trail.handleIntersect`), so a bot cannot
  kill itself on another trail, and Suicidal crosses its own trail or throws its trail in front of a head instead. A
  capture kills a unit it encloses while that unit is in its base, or that encloses its trail start or capital
  (`engine.ts`, after `polygon3`). Civil war's avoidance of the player is steering only and is NOT complete.
- **Vision** applies to Avoid, Chase and Pack: blackbox sees the player only when its head or trail is within the bot's
  own `vrange` of the bot. With 15 bots and the whitebox autopilot as the player no bot came within its `vrange` of the
  player in 40 s (closest 1.26 view ranges), which is why the integration test crowds the arena with 30 bots for the
  blackbox and Avoid comparisons. The Avoid comparison also needs the original's bots to attack, and the whitebox
  autopilot now keeps its trails out of their reach (no attack in 80 s even at 30 bots), so there the player steers a
  fixed wide circle instead (`playMode`'s `circle` pilot).
- **Proven by `test/differential/enemy-modes.integration.test.ts`**: Original stored explicitly plays a scenario frame
  for frame like `?original`, and each other mode, played 40 s with the whitebox autopilot as the player, shows its
  signature (no attack where the original attacks, several hunters at once, self-intersection deaths, nobody outside its
  base, greed above the original's maximum, bots hunting bots, several tables at once). `npm run benchmark -- --enemies
  original,chase:blackbox,...` adds a row per enemy mode.

## Leaderboard names

**The original clips leaderboard names, and the `ts/` reconstruction does not** (owner request, 2026-10-21). The
original puts each bar's left edge at `viewScreenWidth - halfBarWidth - scoreBarWidth`, so the lower the score, the
further right the bar starts, and it runs `barWidth` past that, off the right edge. Only the top bar ends exactly at
the edge. At 1280x720 the player's row read `16 – 0.10% mnao`, and on a phone `16 – 0.10`.
`ts/src/leaderboard-fit.ts` (`fitLeaderboardRow`, unit-tested) moves a bar left only as far as its `measureText` width
needs. It never goes left of `viewScreenWidth - barWidth`, which is the top bar's position and also the width of the
cached leaderboard canvas in `drawLeaderboard`, so the cache needs no change. A name that still cannot fit is cut with
`…`, and the rank and percent are never shortened. That limit is deliberate. On a phone the top bar is about a third
of the width, and the pause button sits just left of it, so a wider cap would overlap the pause button.

- **It is on by default, so the differential harness turns it off.** `openVariant` sets
  `paperio2api.config.leaderboardFitNames = false` after boot. `GameApi.config` exists from boot, because
  `paperio2api.game` does not exist until the canvas mounts, and the first attempt, which went through `game.config`,
  threw on every scenario. The original exposes no `config`, so it is skipped there. The flag is read as
  `String(...) === 'true'`, because the config screen writes values back as strings.
- **The faithful path makes the same canvas calls as before.** The flag lookup and the label string are not canvas
  calls. The fit path also sets `context.font` before measuring.

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
