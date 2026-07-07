# Paper.io 2 — offline copy

A local, self-contained copy of the browser game from https://paperio.site/.
It runs entirely client-side (JavaScript + Canvas) with AI bots — there is **no
server-side game logic**, so it works fully offline.

## Play it online

Live demo (GitHub Pages): **https://mnaoumov.dev/paperio2/**

On phones and other touch devices, an on-screen joystick appears — touch
anywhere in the play area to summon it under your thumb and steer in 8
directions.

## Running it locally

The game `fetch`es JSON files (`assets/skins/skins.json`, `assets/languages.json`),
so opening `index.html` directly via `file://` is blocked by the browser's CORS
policy. Serve the folder over HTTP instead:

```powershell
# Node (any of these works from this folder)
npx serve .
# or
npx http-server -p 8777
```

Then open the printed URL (e.g. http://localhost:8777/).

## What was changed from the original

- `index.html` was rewritten to remove third-party ad (AdinPlay / GameAds) and
  analytics (Google gtag, Yandex.Metrika) scripts. The game only needs
  `window.ShowPreroll()` to exist and calls `window.paperio2api.startGame()` to
  begin, so the offline shim just starts the game immediately (no pre-roll ad).
- Version query strings (`app2.js?v7`, `style3.css?v50`) were dropped.
- The Google Fonts stylesheet (`PT Sans Caption`) and its `.woff2` files were
  downloaded into `assets/fonts/` and referenced locally.

## What was added

- `joystick.js` + `joystick.css` — a floating on-screen joystick for touch /
  mobile-sized sessions (not part of the original). It materializes centered on
  the first touch and drives the engine's existing keyboard steering, giving
  full 8-way control; it hides on release and ignores taps on menu/HUD controls.

## Structure

- `app2.js` — the entire game engine (unmodified, obfuscated/minified original).
- `joystick.js` + `joystick.css` — on-screen touch joystick (added by this repo).
- `style3.css` — game UI styles (unmodified original).
- `manifest.json` — PWA manifest (unmodified original).
- `assets/skins/` — 56 skin `.svg` files + `skins.json` metadata.
- `assets/skins/select/` — 19 skin selector thumbnails (`.png`, incl. `noskin.png`).
- `assets/images/` — logo and PWA icons.
- `assets/languages.json` — UI translations (EN/RU/TR/SP/FR/NL/PT/DE/IT).
- `assets/fonts/` — locally-hosted PT Sans Caption font.

`app2.js`, `style3.css`, `manifest.json` and all assets are the site's original
content, © their respective owners. This copy is for local/offline personal use.
