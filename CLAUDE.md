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
- `style3.css`, `manifest.json` — unmodified original UI styles and PWA manifest.
- `assets/skins/` — 56 skin `.svg` layers + `skins.json` (metadata: colors, particle palettes, avatar layer composition) + `select/` thumbnails. `app2.js` fetches `skins.json` and composes skins from the referenced SVGs.
- `assets/languages.json` — UI translations (EN/RU/TR/SP/FR/NL/PT/DE/IT), fetched at runtime.
- `assets/fonts/` — locally-hosted PT Sans Caption (originally Google Fonts), referenced via `ptsans.css`.

## Editing guidance

- Real changes belong in `index.html` (the shim) or the CSS/assets — **not** in `app2.js`.
- Changes already made from the original (documented in README.md): removed ad/analytics scripts, dropped cache-busting version query strings (`app2.js?v7`, `style3.css?v50`), and localized the font instead of loading from Google Fonts.
- `app2.js`, `style3.css`, `manifest.json`, and assets are the site's original copyrighted content, kept for local/offline personal use.
