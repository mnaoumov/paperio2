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

The reconstruction's menu looks like the original's plus one **Extras** button.
Everything below that this copy adds to the menu sits behind it: sound, the
demo pilot, enemy modes, racing, practice mode and saved games, recording
mode, and the Recordings panel. The browser remembers whether Extras is open.
When the menu does not fit the window, it scrolls.

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
- **Warning loops:** while your head is off your own territory a quiet loop
  plays, so you feel exposed: a soft low pulse on empty ground, and a sharper,
  faster throb on another player's territory. It crossfades between the two and
  fades out when you get home, and it gets louder and faster as your trail grows,
  reaching its peak at 1500 units, the length at which the nearest bot comes for
  your trail whatever its nature. It sits below the capture sounds, stops when you
  die or pause, and is part of the effects, so `N` silences it. It is made in the
  browser, so it adds nothing to download. A downloaded recording does not hold
  it.
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
  is. Nor are the demo readout, its overlay and the ghost, which are drawn on
  layers of their own.
- **It looks like the original:** while a take runs, the canvas is drawn as the
  original draws it. The leaderboard goes back to the original's layout, which
  cuts long names short, and the showcase view's camera goes back to the player.
  The menu's **Additions in recordings** button (off by default, remembered by
  the browser) keeps both in the video instead. Enemy modes and the bot count are
  part of the game, not of the screen, so a recorded run plays with them either
  way.
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
**Extras** button and everything behind it, so the menu is the original's, the in-game record button,
and the practice note on the results screen. Practice still runs, and its keys
still work: `Z`, `X`, `K`, `Esc` / `P`, and `V` for the in-game recorder.

It also draws the canvas as the original does: the leaderboard takes the
original's layout, cut-off names included, and the showcase view's camera goes
back to the player. The menu's **Additions in recordings** button, next to
**Recording mode**, keeps the name fit and the showcase in the recording
instead; it is off by default, the browser remembers it, and it applies to the
in-game recorder too. Enemy modes and the bot count still apply to a recorded
run.

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
  and flies a cautious rectangle from its territory. It keeps its bearings the
  way a person does, from the ground sliding past, so it remembers the way it
  came and where it left home even when neither is in view. Before it turns for
  home it flies each way back in a simulation (its own speed and turning circle,
  sliding along the wall as you do) and takes the quickest one that does not
  touch its own trail. It never reads the engine; a unit test checks that its
  code imports nothing of it.

Either way it steers with the same pointer the mouse or a touch gives, so it has
your speed and turning circle and changes nothing else in the game. Once a
pilot is picked the demo runs by itself: the pilot steers from the first frame,
and after a death or a win the results show for 5 seconds, then the next round
starts (the readout counts down; **Continue** stops it). A mouse that only moves
over the game leaves the pilot steering. Steering yourself (arrows, W/A/S/D, the
joystick, a touch, or a click on the game) takes control from it; `O` hands
control back. The readout at the bottom shows the pilot, the game time and your
percent. It combines with practice mode.

**Overlay** (`I`, or the menu button next to **Demo**) draws what the pilot is
doing on a layer of its own, which the in-game recorder never records: the
whitebox's planned loop, its target and the nearest bot with the distance it
keeps from the trail, or the blackbox's view, colour by class. While you steer,
the whitebox keeps planning and the overlay shows the loop it suggests. Recording
mode hides the readout and the overlay.

**View** (`L`, or the menu button next to **Overlay**) is the showcase: the
camera follows whoever holds the most territory, the pilot or a bot, and glides
over when the lead changes hands. A unit takes the camera only once it is ahead
by 0.2% of the arena, so two units trading the lead do not make it flicker. The
readout names the unit it is watching. While you steer, the camera is yours
again. It only moves the camera and changes nothing in the game. While
recording, the camera stays on the player as in the original, unless
**Additions in recordings** is on.

**How well it plays.** `npm run benchmark` in `ts/` plays seeded games at full
speed in headless Chrome and reports, per pilot, the win rate, the median and
best time to win and how runs end. The same seed replays the same game. On
2026-10-22:

| Pilot | Enemies | Runs | Limit | Wins | Deaths (cause) | Alive at the limit (median %) |
| --- | --- | --- | --- | --- | --- | --- |
| Whitebox | Original | 16 | 15 min | 0 | 1 (surrounded 1) | 15 (34.6%) |
| Whitebox | Original | 16 | 60 min | 0 | 4 (trail cut 2, surrounded 1, self-intersection 1) | 12 (52.6%) |
| Whitebox | Passive | 8 | 30 min | 0 | 0 | 8 (38.1%) |
| Blackbox | Original | 16 | 5 min | 0 | 7 (trail cut 6, wall 1) | 9 (4.6%) |

The whitebox now slides along the arena's wall without dying there: pressed
against the wall, it never turns through the wall's outward direction, which
would reverse the slide over its own trail. So its loops take the ring along the
wall, and once it holds 99% of the arena it laps the wall to close what is left.
An earlier version of the same pilot did win one 60-minute run in 16, in 59:05,
but it died in 13 of them; the version measured above defends its base more
carefully and survives an hour in 12 of 16, at the cost of growing more slowly.
The bots take back about a third of what it captures, which is why it has not
won yet. The blackbox no longer runs into its own trail or loses its way home
beyond the view; an earlier version measured on 8 of the same seeds died in 6,
4 of them on its own trail, and the 2 it kept alive held 0.3%. It still sees
only a small part of the arena, so the bots that cut its trail come into view
late.

**Frame rate.** In a live game both pilots do their heavy work in a background
worker, so the game keeps its full frame rate: the blackbox reads each frame
there, and the whitebox plans each loop there. `npm run benchmark:frames` in
`ts/` plays each mode in real time in headless Chrome at 1920x1080 and counts
the dropped frames, against the original as a baseline. On 2026-10-22, 60-90 s a
mode:

| Mode | Before | After |
| --- | --- | --- |
| Original | 0.03% dropped | (unchanged) |
| Reconstruction, no pilot | 0% dropped | 0% dropped |
| Whitebox | 0.9-1.7% dropped, a 40-450 ms stall every few seconds | 0-0.03% dropped, no stall |
| Blackbox | 30 fps: 27 ms of every frame in the pilot | 60 fps, 0-0.12% dropped |
| Recording (whitebox) | 0.6% dropped, all from the whitebox | 0.03% dropped |

The in-game recorder takes 0.14 ms a frame. The pilots play as before: the
benchmark above runs them inside the frame, as it always did, and replays the
same games.

### Enemy modes

The reconstruction can change how the bots play. Four menu buttons set it, the
browser remembers them, and they apply at once, to the menu's bots as well. They
combine with practice mode and the demo autopilot, and recording mode hides them
with the rest of the menu.

**How the original bots play.** Each bot is a small state machine. It leaves its
base at a nearby edge point (or, one time in four, straight outwards), draws a
loop beside its territory and turns home when the loop gets too long, too big,
too far from where it started, or when another unit gets closer to its trail
than it is to home. A bot that is out of its base and sees your trail close by
hunts it, and once your trail is longer than 1500 units the bot nearest it is
sent after it whatever its range. Four numbers make its personality (aggression,
greed, caution, defence). They come from a level that rises as you grow, so the
bots get bolder the more you hold. The bots never hunt each other; they kill
each other only by accident.

**Enemies** picks the mode:

- **Original** (the default): exactly the shipped game's bots.
- **Avoid you**: your head and trail are danger. The bots never attack, stay
  home while you are near, and turn home as soon as you near their loop.
- **Chase you**: every bot that sees you hunts your trail, or lurks at your head
  while you are home. The 1500-unit trigger and the aggression range do not
  apply, and a hunter never gives up to save itself.
- **Suicidal**: in this game crossing a trail kills the trail's owner, never the
  one who crosses it, so a bot cannot kill itself on yours. Instead the bots head
  straight out, throw their trail in front of the nearest head they see so that
  unit cuts it, and otherwise hook back over their own trail.
- **Passive**: the bots never leave their bases.
- **Land grabbers**: greedier than the original's greediest bot and as reckless
  as its most reckless one; they race you for space and never attack.
- **Pack hunters**: while you have a trail, the three bots nearest you that see
  you hunt together: one at your trail, two across your way home.
- **Free-for-all**: a bot hunts whichever trail is in range, another bot's as
  well as yours.
- **Civil war**: the bots hunt each other and ignore you. They steer around
  your head and trail, turn home early when you are near, and do not close a loop
  that would surround you. That is steering, not a rule of the game, so it is not
  complete: a bot that cannot turn in time can still cut your trail, and the
  check that a loop would surround you is an approximation.
- **Mixed**: each bot plays a random one of the modes above. The debug overlay
  (Shift+Alt+Q+B+M) lists how many bots play each.

**Vision** (for Avoid you, Chase you and Pack hunters): **Whitebox** bots know
where you are everywhere; **Blackbox** bots see you only within their own view
range of their own position, as an honest player would.

**Difficulty**: **Ramp (original)** is the original's rising level; a percentage
fixes the level from timid (0%) to hardest (100%). Past 100% the button wraps back
to Ramp (original).

**Bots**: how many bots play, from 0 to 30. **15 (original)** is the original's
count; past 30 the button wraps back to it.

**Against the demo autopilot.** `npm run benchmark -- --enemies <mode>[:<vision>],...`
adds a row per enemy mode. The whitebox pilot against each, 4 seeds, 15 minutes
each, on 2026-10-22:

| Enemies | Wins | Deaths (cause) | Alive at the limit (median %) |
| --- | --- | --- | --- |
| Original | 0 | 1 (exit point taken 1) | 3 (46.7%) |
| Avoid you, whitebox | 0 | 1 (exit point taken 1) | 3 (40.3%) |
| Avoid you, blackbox | 0 | 1 (exit point taken 1) | 3 (36.7%) |
| Chase you, whitebox | 0 | 4 (trail cut 4) | 0 |
| Chase you, blackbox | 0 | 3 (trail cut 2, exit point taken 1) | 1 (44.7%) |
| Suicidal | 0 | 1 (trail cut 1) | 3 (57.9%) |
| Passive | 0 | 2 (wall 2) | 2 (25.2%) |
| Land grabbers | 0 | 1 (self-intersection 1) | 3 (21.9%) |
| Pack hunters, whitebox | 0 | 2 (trail cut 2) | 2 (16.8%) |
| Pack hunters, blackbox | 0 | 2 (trail cut 1, exit point taken 1) | 2 (44.3%) |
| Free-for-all | 0 | 3 (self-intersection 1, exit point taken 1, surrounded 1) | 1 (40.2%) |
| Civil war | 0 | 1 (self-intersection 1) | 3 (36.9%) |
| Mixed | 0 | 3 (self-intersection 1, trail cut 1, wall 1) | 1 (39.3%) |

Whitebox Chase is the only mode that killed the pilot in every run. Suicidal
bots free the most ground. Passive shows the pilot's own limit rather than the
bots'. In that run it died at the wall twice. That was before the wall slide
described under **Demo autopilot**, and it no longer does.

### Racing: a shared seed and a ghost

Two more menu switches are for racing.

**Seeded map.** With `?seed=<anything>` on the page's address, every Play starts
on the same map, with the same bots and the same spawn point, on any device.
**Seeded map: off** picks a new seed and reloads with it; on a seeded page the
panel shows the seed, **Copy link** copies the address to share, **New seed**
picks another and **Off** goes back to a new map every time. The page prepares a
seeded map in one go instead of spreading it over the first seconds, so the menu
appears a moment later. What happens after Play is not pinned: the game steps by
your frame times and the bots react to what you do, so two runs part ways as
soon as you steer differently. `?original` ignores the seed.

**Ghost** (`H`, or the button) races the best run on this map as a translucent
ghost with a short tail, and names the gap between you: `Ghost 12.30% · you
behind by 1.20%`. Off screen it waits at the edge of the screen in its
direction. The best run is the one that held the most territory, or as much
sooner, whoever flew it: you, the demo pilot, or both (the label says which).
Each seed keeps its own, and so does play without a seed; **Forget** drops it.
Practice runs are never kept. The ghost is drawn on a layer of its own, so the
in-game recorder never records it, and recording mode hides it. A ghost replays
where a run went, not what was pressed: the game steps by real frame times, so
the same keys never give the same run twice.

### Stats logs

Every run is logged as it is played, and **Stats logs** in **Extras** lists the
last 20 runs. Each has **Download**, and **Download all** puts every listed run
in one file. A log is a text file, `paperio2-<yyyy-mm-dd-hhmm>.jsonl`, with one
JSON object per line:

- a `header`: the build and commit, the enemy settings, who started the run
  (`human`, `whitebox` or `blackbox`), recording mode, the seed and the window
  size;
- a `sample` every 250 ms of game time: your share of the arena (`pct`), your
  rank, your trail's length, where your head is and whether that is your own
  ground, open ground or an enemy's (`zone`), who steered, and the frames since
  the last sample (how many, their mean and longest time, how many took longer
  than two 60 fps frames);
- an `event` for each capture (`gained`), each piece of ground taken from you
  (`lost`), each unit you kill (`victim`), your death (`killer`, `reason`), a
  win, and in practice a respawn (`rewind`);
- an `end` line with how the run ended and its totals.

It is kept in this browser (IndexedDB) and leaves it only by your download. The
log only reads the game, so a run plays exactly as it would without it. The
benchmark writes the same format for the demo pilots
(`npm run benchmark -- --stats <dir>`), and `npm run stats:report -- <files or
directories>` compares any number of logs side by side, a summary row per run
and the area curves.

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
  `leaderboardFitNames` config key turns it off. While recording (recording mode
  or the in-game recorder) it is off too, so the recording shows the original's
  cut-off names, unless **Additions in recordings** is on.
- A demo autopilot in the `ts/` reconstruction (`ts/src/autopilot/`): a whitebox
  pilot that reads the engine and a blackbox pilot that reads only the screen,
  both steering through the pointer, with a debug overlay and a benchmark
  (`npm run benchmark`). It is off by default and attaches nothing to the game
  while off.
- Enemy modes in the `ts/` reconstruction (`ts/src/entities/enemy-modes.ts`,
  `ts/src/enemy-menu.ts`): nine alternative state tables for the bots, built
  from the original's without editing it, plus a fixed difficulty and a bot
  count. Original is the default and runs the bots exactly as the shipped game
  does, which `npm run test:integration` checks frame for frame.
- Racing in the `ts/` reconstruction (`ts/src/seed.ts`, `ts/src/ghost/`): a
  shareable `?seed=` that starts every Play on the same map, a ghost of the best
  run on that map, and a showcase view for the demo that follows the leader
  (`ts/src/autopilot/showcase.ts`). All off by default.
- Stats logs in the `ts/` reconstruction (`ts/src/stats/`): every run's area
  over time, events and frame times as downloadable JSONL, in the same format
  the autopilot benchmark writes. It only reads the game.

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
