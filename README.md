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

### Music and sound effects

The reconstruction has music and sound effects; the original has neither.

- **Music** plays during a run: a shuffled playlist of five chiptune tracks,
  quieter than the effects. It pauses with the game, fades out when the results
  come up, and the menu is quiet. `M` switches it on and off.
- **Sound effects:** taking ground (a single coin, a double or a cluster, louder
  the more you took), killing a player, your own death, and the results screen
  (a fanfare for a win or a new best). In practice mode there are quiet clicks for
  setting and removing a checkpoint, and a chime when you respawn. `N` switches
  the effects on and off.
- Both are on by default. The two buttons left of the pause button, or the
  menu's **Music** and **Sounds** buttons, switch them too, and the browser
  remembers both choices. Browsers allow sound only after you click or press a
  key, so it starts when you press Play.
- Nothing is downloaded before you press Play: the effects (65 KB) are fetched
  then, and each music track (about 1 MB) when it is due. The music is 5 MB in
  all.
- Recording mode hides the two buttons, while `M` and `N` keep working. It also
  silences the practice sounds (the respawn chime and the checkpoint clicks),
  which would give a practice run away.
- Every file is CC0, by Juhani Junkala; `assets/audio/CREDITS.md` lists each one
  with its source.

### Recording inside the game

The reconstruction can record itself, and in practice mode it cuts every failed
attempt out as it goes, so the video plays as one unbroken run. Press `V` (or the
**Rec (V)** button beside the pause button) to start; `V` or **Stop** ends the
take, and **Discard** (click it twice) throws it away. The take also ends by
itself when the run ends or the browser's storage is nearly full.

- **What is recorded:** the game canvas only, so the map, the players, the
  leaderboard, the percent and the minimap are in the video, and the page around
  it (the pause button, the practice panel, menus, dialogs, the joystick) never
  is.
- **Sound:** the sound effects of the run are recorded with the take, whether
  or not you hear them, and cut with it, so a failed attempt's sounds go too. The
  practice sounds (the respawn chime and the checkpoint clicks) are never
  recorded, since the cut exists to hide where a respawn was. Music is not
  recorded during play, because each cut would make it jump: a download lays one
  continuous music track, crossfading between tracks, under the finished video
  instead. The **Recordings** panel's **Sound** setting picks effects and music,
  effects only, music only, or none. The audio is AAC (or Opus where a browser
  cannot encode AAC).
- **Game time, not wall time:** a pause, a hidden tab or a dialog leaves no
  frames behind.
- **The cut:** every checkpoint is a keyframe. When you die and respawn at a
  checkpoint, everything recorded after that checkpoint (the failed attempt, the
  death and the death delay) is dropped, and the video carries on from the
  checkpoint's frame, which is exactly the state the respawn restored. Removing
  a checkpoint (`X`) cuts nothing by itself: the next death goes back to the one
  before it, and the cut reaches back that far. A respawn at a checkpoint taken
  before you pressed `V` starts the take over from that checkpoint. A death
  with no checkpoint, or ending the run, keeps everything.
- **Size:** 720p at 30 fps by default, never larger than the game canvas.
  The menu's **Recordings** panel sets 480p, 720p or the canvas size, and 30 or
  60 fps, and what sound goes into a download. The default bitrate is 1 Mbit/s at 720p30, scaled by pixels and frame
  rate. On a busy clip, 1, 1.5, 2 and 4 Mbit/s looked the same at 1:1 (mean PSNR
  36.0, 36.4, 36.6 and 36.9 dB), because what remains is H.264's colour
  subsampling on sharp edges, which bitrate does not fix. A real practice take
  measured **9.3 MB a minute**, about 0.56 GB an hour.
- **Where the takes are:** in the browser (IndexedDB), written as they are
  encoded, so they survive a reload. The menu's **Recordings** panel lists each
  take with its thumbnail, date, length and size, and has **Play** (a preview in
  the page), **Download** (`paperio2-<yyyy-mm-dd-hhmm>.mp4`; the take stays
  listed) and **Delete** (click it twice). Its footer shows the space used and
  left. A take cut short by a reload, a crash or a closed tab is listed as
  _recovered_ the next time the page loads, and plays like any other.
- **Browsers:** it needs WebCodecs and a secure page (https, or localhost). It
  uses H.264 in an `.mp4`, which QuickTime plays, and falls back to VP9 or AV1 in
  an `.mp4` where a browser cannot encode H.264. Where none can be encoded, the
  button is hidden and the panel says why. Tested in Chrome on Windows.

This makes recording mode below unnecessary for recording practice runs. It is
kept for anyone who records the screen with another program.

### Recording mode

**Recording mode** makes a screen recording look like the original game. Turn it
on with the menu's Recording mode button or the `R` key, and off again with `R`
(the button is hidden with everything else). The choice is remembered in the
browser. It hides every addition: the pause button and the Paused overlay, the
practice panel and its messages, the music and sound buttons, the joystick
and its toggle (the joystick still steers, drawn invisibly), the menu's
Practice, Recording, saved-games and Recordings panels, the in-game record button,
and the practice note on the results screen. Practice still runs, and its keys
still work: `Z`, `X`, `K`, `Esc` / `P`, and `V` for the in-game recorder.

Every switch into recording mode shows a dialog, _You are in recording mode.
Press R to return to normal mode_, with an OK button. That includes a page load
with the mode remembered as on, so the mode is never on without you knowing.
OK, `Enter`, `Space` or `Esc` closes it, and nothing on screen gives the mode
away after that. Switching out needs no dialog: the additions just come back.
`R` does nothing while the name field has the focus, since it types an `r`
there. Click outside the field first.

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
  additions come back); turning it on pauses the game under red with the dialog
  on top, and the green frames and play follow once the dialog is closed.
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

### Demo autopilot

The reconstruction can play the game for you, trying to take the whole arena as
fast as it can. The menu's **Demo** button picks the pilot, and the browser
remembers the choice:

- **Off** (the default): you play.
- **Whitebox** reads the engine: its own base and trail, every bot's position,
  trail, state and the distance at which it starts hunting a trail. It plans each
  loop out of its base by ground taken per second, keeps it short enough that no
  bot can reach the trail before the loop closes, checks every loop by flying it
  in a simulation first (its own speed and turning circle), and heads home the
  moment a bot could cut it. It cuts a bot's trail whenever the bot runs it
  through its territory.
- **Blackbox** sees only what you see: the canvas, scaled down. It learns its
  colour from the score bar, ignores the score bar, leaderboard, minimap and its
  own name, treats small foreign shapes as danger and large ones as enemy ground,
  and flies a cautious rectangle from its territory, keeping its bearings by
  memory. It never reads the engine; a unit test checks that its code imports
  nothing of it.

Either way it steers with the same pointer the mouse or a touch gives, so it has
your speed and turning circle and changes nothing else in the game. Steering
yourself (arrows, W/A/S/D, the joystick, a touch, or moving the mouse over the
game) takes control from it; `O` hands control back. The readout at the bottom
shows the pilot, the game time and your percent. It combines with practice mode.

**Overlay** (`I`, or the menu button next to **Demo**) draws what the pilot is
doing on a layer of its own, which the in-game recorder never records: the
whitebox's planned loop, its target and the nearest bot with the distance it
keeps from the trail, or the blackbox's view, colour by class. While you steer,
the whitebox keeps planning and the overlay shows the loop it suggests. Recording
mode hides the readout and the overlay.

**How well it plays.** `npm run benchmark` in `ts/` plays seeded games at full
speed in headless Chrome and reports, per pilot, the win rate, the median and
best time to win and how runs end. The same seed replays the same game. On
2026-10-22:

| Pilot | Runs | Limit | Wins | Deaths (cause) | Alive at the limit (median %) |
| --- | --- | --- | --- | --- | --- |
| Whitebox | 16 | 15 min | 0 | 2 (trail cut 1, exit point taken 1) | 14 (40.3%) |
| Blackbox | 8 | 5 min | 0 | 6 (self-intersection 4, trail cut 1, surrounded 1) | 2 (0.3%) |

Neither pilot wins yet. The whitebox survives most runs and keeps growing, to
about 70% after 40 minutes in a longer run, but it keeps 16 units clear of the
arena's wall, because a turn while pressed against the wall makes the engine
count a death by the wall, so it can never take the last few percent. The
blackbox sees only a small part of the arena and dies early.

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
- An in-game recorder in the `ts/` reconstruction (`ts/src/video/`): `V` records
  the game canvas with WebCodecs, cuts each failed practice attempt back to its
  checkpoint, keeps the takes in IndexedDB and exports them as `.mp4`. It makes
  no call into the game while nobody records, so a normal run is untouched.
- Music and sound effects in the `ts/` reconstruction (`ts/src/audio/`,
  `assets/audio/`): a shuffled CC0 chiptune playlist during a run and effects for
  the player's moments, each switchable (`M` / `N`) and remembered. Sound never
  touches the canvas or the game's random numbers, so `?original` is untouched
  and the reconstruction still plays frame for frame like it.
- Readable leaderboard names in the `ts/` reconstruction
  (`ts/src/leaderboard-fit.ts`). The original staggers the top-right bars and
  runs them off the right edge, so names are cut short, the player's own row
  worst. Now a bar moves left just enough for its text to fit, measured in the
  loaded font. It never goes further left than the top bar, and a name that
  still cannot fit there ends in `…`. Where the text already fits, the original
  layout is kept. On a phone the top bar is narrow, so long names still end in
  `…`, but the rank and percent always show. `?original` is unchanged. The
  `leaderboardFitNames` config key turns it off. It stays on in recording mode,
  because it changes no control on screen.
- A demo autopilot in the `ts/` reconstruction (`ts/src/autopilot/`): a whitebox
  pilot that reads the engine and a blackbox pilot that reads only the screen,
  both steering through the pointer, with a debug overlay and a benchmark
  (`npm run benchmark`). It is off by default and attaches nothing to the game
  while off.

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
- `assets/audio/` — the music (`music/`) and sound effects (`sounds/`), all CC0,
  credited in `assets/audio/CREDITS.md` (added by this repo).

`app2.js`, `style3.css`, `manifest.json` and the other assets are the site's original
content, © their respective owners. This copy is for local/offline personal use.
