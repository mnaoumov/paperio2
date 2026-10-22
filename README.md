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
taken every 10 seconds of play, wherever you are, out on a trail too, and when
you die you respawn at the latest one. Your own checkpoints are all kept, and so
are the automatic ones of the last 100 seconds; older automatic ones thin out to
one a minute, then one every ten minutes, since each holds the whole game.
The panel on the left has two buttons: **Set checkpoint** (`Z`) and **Remove
latest** (`X`). To go back to the latest checkpoint, die. Pausing shows **Save
game** (also `K`, at any time) and **End practice**. A saved game is kept in the
browser and loads from the menu into a new practice run. Practice runs do not
count: no best score and no achievements.

### Recording mode

**Recording mode** makes a screen recording look like the original game. Turn it
on with the menu's Recording mode button or the `R` key, and off again with `R`
(the button is hidden with everything else). The choice is remembered in the
browser. It hides every addition: the pause button and the Paused overlay, the
practice panel and its messages, the joystick
and its toggle (the joystick still steers, drawn invisibly), the menu's
Practice, Recording and saved-games panel, and the practice note on the results
screen. Practice still runs, and its keys still work: `Z`, `X`, `K`, `Esc` / `P`.

It also marks the frames to cut. A marker is the whole frame in one solid colour
with a large label, so it survives video compression and shows in a timeline
thumbnail:

- **Red, `CUT`**: cut from the first red frame. It stays up for the whole
  interruption, and for at least 0.7 s.
- **Green, `RESUME`**: 0.7 s with the game still paused under it. Cut up to the
  last green frame. The next frame is clean play.

Clean play never carries a marker. What gets marked:

- **A pause** (`Esc` / `P`, or a hidden tab): red while paused, green on resume.
- **A save** (`K`) and **a checkpoint removal** (`X`): the game pauses for it
  inside a red-then-green cut.
- **A death in practice**: red from the death, through the death delay and the
  restore, then green while the restored game waits, then play. The red frames
  say how far back the cut reaches, for example `cut from 8.7 s before this`:
  that is where the checkpoint's moment is on screen in the raw recording, so
  cutting from there to the last green frame joins two frames of the same game
  state.
- **Switching recording mode during a run**: turning it off flashes red (the
  additions come back); turning it on pauses the game for a red-then-green cut.
  To play a saved game in recording mode, turn it off (`R`), load the save, and
  turn it on again.

**How to cut:** in the raw recording, for each red span, cut from its first red
frame to the last green frame after it. For a death, cut from the time the red
frames name instead, counted back from the first red frame. Measure every cut on
the raw recording: the death hint counts in the raw timeline, so mark all the
cuts first and remove them together.

**Continuity across a cut.** A respawn restores the checkpoint's whole game
state, so the frame after the cut is the frame at the checkpoint: territory,
percent, leaderboard, kills, the minimap and the bots are all as they were then,
and the playtime the results show is the checkpoint's plus the play after it.
Nothing in the HUD jumps. Two things differ from the original that a recording
can show: a practice run never sets a best score, so its results screen never
shows a new best; and the results come up only when a death finds no checkpoint
left, or the run is ended.

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
- A recording mode in the `ts/` reconstruction (`ts/src/recording.ts`): it hides
  every addition above and marks the frames to cut with full-frame red and green
  markers. It is off by default.

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
