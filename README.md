# Paper.io 2 — self-contained copy

A self-contained copy of the browser game from https://paperio.site/, with no ads,
analytics or servers. It runs entirely client-side (JavaScript + Canvas) with AI
bots — there is **no server-side game logic**, so it also works with no network.

## Play it online

Live demo (GitHub Pages): **https://mnaoumov.dev/paperio2/**

The page runs a readable reconstruction of the engine, built from the `ts/`
project, which is proven to play frame for frame like the original. The
shipped original engine is kept unmodified and runs instead with `?original`:
**https://mnaoumov.dev/paperio2/?original**

On phones and other touch devices, an on-screen joystick appears — touch
anywhere in the play area to summon it under your thumb and steer in 8
directions. The round button in the bottom-left corner (or the `J` key) shows
or hides it on any device, desktop included, where a mouse drag then summons it.
The choice is remembered in the browser; with none stored it is shown on touch
devices and hidden on desktop.

The reconstruction can be paused: the button at the top of the screen, or `Esc`
or `P` on a keyboard. Switching to another tab pauses it too, and coming back
leaves it paused until you resume. Nothing time-based in the game moves while it
is paused, so a resumed game carries on exactly where it stopped. The original
(`?original`) has no pause.

The reconstruction also has a **practice mode**, with checkpoints in the manner of
Geometry Dash. Turn it on with the menu's Practice button. A checkpoint is then
taken every 10 seconds while you are inside your own territory, and when you die
you respawn at the latest one. `Z` adds a checkpoint where you are, `X` removes
the latest, and the panel on the left removes any of them, saves the game (`K`)
or ends the run. Flags on the map mark the checkpoints. A saved game is kept in the
browser and loads from the menu into a new practice run. Practice runs do not
count: no best score and no achievements.

## Install it as an app on a Mac

The live demo installs as a standalone app, with its own window, a Dock icon
and a Launchpad entry. After the first launch it starts with no network too:
a service worker (`sw.js`) keeps a copy of the game and refreshes it whenever
you are online.

- **Chrome:** open https://mnaoumov.dev/paperio2/ and click the install icon
  at the right of the address bar, or use the menu > Cast, save and share >
  Install page as app. The app lands in `~/Applications/Chrome Apps`.
- **Safari** (17 or later, macOS Sonoma or later): open the same page and use
  File > Add to Dock.

An app installed before the manifest was fixed opens https://mnaoumov.dev/
instead of the game. Remove it and install again: in Chrome, right-click it in
`chrome://apps` > Remove from Chrome; in Safari, drag it out of the Dock and
delete it from `~/Applications`.

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

The page loads the reconstruction from `ts/dist/app2.js`, so build it first
(`cd ts && npm install && npm run build`). Without that build the page falls
back to the original `app2.js` and says so in the browser console. Add
`?original` to the URL to run the original on purpose.

## What was changed from the original

- `index.html` was rewritten to remove third-party ad (AdinPlay / GameAds) and
  analytics (Google gtag, Yandex.Metrika) scripts. The game only needs
  `window.ShowPreroll()` to exist and calls `window.paperio2api.startGame()` to
  begin, so the offline shim just starts the game immediately (no pre-roll ad).
- The engine's domain lock sends any host but `paperio.site` to `paper-io.com`
  3-4 minutes in. The shim in `index.html` defuses that timer for both engines,
  so the game stays put on localhost and on the live demo. `app2.js` itself is
  untouched.
- Version query strings (`app2.js?v7`, `style3.css?v50`) were dropped.
- `index.html` loads the engine through a switch: the `ts/` reconstruction by
  default, the original `app2.js` with `?original`.
- The Google Fonts stylesheet (`PT Sans Caption`) and its `.woff2` files were
  downloaded into `assets/fonts/` and referenced locally.

## What was added

- `joystick.js` + `joystick.css` — a floating on-screen joystick for touch /
  mobile-sized sessions (not part of the original). It materializes centered on
  the first touch and drives the engine's existing keyboard steering, giving
  full 8-way control; it hides on release and ignores taps on menu/HUD controls.
  A bottom-left toggle button and the `J` key show or hide it, remembered in
  `localStorage`.
- A pause in the `ts/` reconstruction: a top-centre button, `Esc` / `P`, and an
  automatic pause when the tab is hidden. All game logic reads a game clock that
  stops while paused (`ts/src/shared/game-clock.ts`).
- A practice mode in the `ts/` reconstruction: automatic and manual checkpoints,
  a respawn at the latest one on death, and saved games in `localStorage`, all
  built on a full game snapshot (`ts/src/snapshot.ts`, `ts/src/practice.ts`,
  `ts/src/save-format.ts`). It is off by default, so a normal run is untouched.

## Structure

- `app2.js` — the entire game engine (unmodified, obfuscated/minified original),
  preserved byte for byte and served with `?original`.
- `ts/` — the readable TypeScript reconstruction of the engine; its build
  `ts/dist/app2.js` is what the page serves. GitHub Pages is deployed by
  `.github/workflows/pages.yml`, which builds it and checks it against the
  original before publishing.
- `joystick.js` + `joystick.css` — on-screen touch joystick (added by this repo).
- `style3.css` — game UI styles (unmodified original).
- `manifest.json` — PWA manifest (the original's, with relative paths and a
  maskable icon, so it installs from `/paperio2/`).
- `sw.js` — service worker that lets the installed app start offline (added by
  this repo).
- `assets/skins/` — 56 skin `.svg` files + `skins.json` metadata.
- `assets/skins/select/` — 19 skin selector thumbnails (`.png`, incl. `noskin.png`).
- `assets/images/` — logo and PWA icons.
- `assets/languages.json` — UI translations (EN/RU/TR/SP/FR/NL/PT/DE/IT).
- `assets/fonts/` — locally-hosted PT Sans Caption font.

`app2.js`, `style3.css`, `manifest.json` and the other assets are the site's original
content, © their respective owners. This copy is for local/offline personal use.
