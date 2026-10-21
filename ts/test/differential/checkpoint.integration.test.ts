/**
 * @file
 *
 * Proves a snapshot restores the whole game: the same scenario is played on two pages of the reconstruction. The
 * second takes a snapshot at frame {@link SNAPSHOT_FRAME}, then plays on with different input until its player dies,
 * and restores the snapshot while the death delay is still running. From there it is fed the first page's input
 * again, and every frame's game state, and the canvas pixels every {@link PIXELS_INTERVAL_FRAMES} frames, must match
 * the page that never left the scenario. The death delay it cancelled must never bring up the results screen.
 *
 * It runs twice: once restoring the snapshot held in memory, as a checkpoint does, and once restoring it after a
 * round trip through the compressed text a saved game stores.
 *
 * The seeded `Math.random` is rewound with the snapshot. The game itself does not rewind it in play, since the
 * original never seeded it: the test rewinds it so that any other state a restore missed shows up as a difference.
 *
 * Frames are 20 ms, so a detour of whole 25-frame chunks is a whole number of the engine's 500 ms particle-cleanup
 * interval, which keeps that real-time timer in the same phase against the game on both pages. Draw-call hashes are
 * not compared after the restore: the trace names each `Path2D` by when it was created, and the detour creates some.
 */

import type {
  Browser,
  Page
} from 'puppeteer-core';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import type { Scenario } from './harness.ts';

import {
  applyFrameInput,
  launchBrowser,
  openVariant,
  stepPage,
  TS_ROOT
} from './harness.ts';
import { route } from './scenarios.ts';

const TIMEOUT_MILLISECONDS = 300_000;
const FRAME_MILLISECONDS = 20;
const START_FRAME = 120;
const FIRST_INPUT_FRAME = 150;
const SNAPSHOT_FRAME = 330;
const DETOUR_CHUNK_FRAMES = 25;
const MAX_DETOUR_CHUNKS = 40;
const PIXELS_INTERVAL_FRAMES = 50;
const KEY_LEFT = 37;
const KEY_UP = 38;
const KEY_RIGHT = 39;
const KEY_DOWN = 40;
/** Out of the territory, then up, left and down across the outgoing trail: a self-intersection. */
const DETOUR: readonly DetourLeg[] = [{ fromFrame: 0, keyCode: KEY_RIGHT }, { fromFrame: 150, keyCode: KEY_UP }, { fromFrame: 190, keyCode: KEY_LEFT }, { fromFrame: 230, keyCode: KEY_DOWN }];
const SNAPSHOT_KEY = '__checkpointTestSnapshot';
/** A save leaves the sparks out, and the longest-lived spark lasts a second: pixels are compared from then on. */
const SAVE_PIXELS_FROM_FRAME = SNAPSHOT_FRAME + 60;
const MAX_SAVE_CHARACTERS = 4_000_000;

const SCENARIO: Scenario = {
  expectedCoverage: {},
  // The scenario's own player dies near frame 1000, and both pages then throw in `spawnBot` on the same frame: with
  // 15 bots alive during the death delay the strict conversion's bot-type lookup runs past its table, where the
  // Original spawns a 16th bot. The run stops short of that until the engine follows the original there.
  frames: 960,
  host: 'paperio.site',
  keys: route(FIRST_INPUT_FRAME, [[[KEY_RIGHT], 90], [[KEY_UP], 90], [[KEY_LEFT], 115], [[KEY_DOWN], 90], [[KEY_RIGHT], 60], [[KEY_UP], 630]]),
  name: 'checkpoint',
  seed: 9,
  startFrame: START_FRAME
};

interface DetourLeg {
  readonly fromFrame: number;
  readonly keyCode: number;
}

function heldKeysBefore(frame: number): number[] {
  const held = new Set<number>();
  for (const keyEvent of SCENARIO.keys) {
    if (keyEvent.frame < frame) {
      if (keyEvent.isDown) {
        held.add(keyEvent.keyCode);
      } else {
        held.delete(keyEvent.keyCode);
      }
    }
  }
  return [...held];
}

async function playerAwaitingResults(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const { player, units } = window.paperio2api.game;
    return player !== null && !units.includes(player);
  });
}

async function playWithDetour(browser: Browser, viaSave: boolean): Promise<void> {
  const [straight, restored] = await Promise.all([0, 1].map(async () => openVariant(browser, 'reconstruction', SCENARIO)));
  if (!straight || !restored) {
    throw new Error('Expected two pages');
  }
  try {
    for (let frame = 0; frame < SCENARIO.frames; frame++) {
      if (frame === SNAPSHOT_FRAME) {
        const { randomState, saveCharacters } = await restored.evaluate(
          async (key: string, encode: boolean) => {
            const api = window.paperio2api;
            const snapshot = api.captureSnapshot?.();
            const payload = encode ? await api.encodeSnapshot?.(snapshot) : undefined;
            Reflect.set(window, key, encode ? payload : snapshot);
            return { randomState: window.__differential.randomState(), saveCharacters: payload?.length ?? 0 };
          },
          SNAPSHOT_KEY,
          viaSave
        );
        if (viaSave) {
          expect(saveCharacters, 'the save fits the storage limit').toBeGreaterThan(0);
          expect(saveCharacters).toBeLessThan(MAX_SAVE_CHARACTERS);
        }
        const stateAtSnapshot = await stateOf(restored);
        const { player } = await restored.evaluate(() => window.__differential.snapshot());
        expect(player, 'the player is in play at the snapshot').not.toBeNull();
        const held = heldKeysBefore(frame);
        await pressKeys(restored, held, false);
        let detourFrames = 0;
        let detourKey: null | number = null;
        for (let chunk = 0; chunk < MAX_DETOUR_CHUNKS && !await playerAwaitingResults(restored); chunk++) {
          for (let step = 0; step < DETOUR_CHUNK_FRAMES; step++) {
            const legFrame = detourFrames;
            const leg = DETOUR.find((candidate) => candidate.fromFrame === legFrame);
            if (leg) {
              if (detourKey !== null) {
                await pressKeys(restored, [detourKey], false);
              }
              detourKey = leg.keyCode;
              await pressKeys(restored, [detourKey], true);
            }
            await stepPage(restored, FRAME_MILLISECONDS);
            detourFrames++;
          }
        }
        expect(await playerAwaitingResults(restored), `the detour kills the player within ${String(detourFrames)} frames`).toBe(true);
        expect(await stateOf(restored)).not.toBe(stateAtSnapshot);
        if (detourKey !== null) {
          await pressKeys(restored, [detourKey], false);
        }
        await restored.evaluate(
          async (key: string, state: number, decode: boolean) => {
            const api = window.paperio2api;
            const stored: unknown = Reflect.get(window, key);
            api.restoreSnapshot?.(decode && typeof stored === 'string' ? await api.decodeSnapshot?.(stored) : stored);
            window.__differential.setRandomState(state);
          },
          SNAPSHOT_KEY,
          randomState,
          viaSave
        );
        await pressKeys(restored, held, true);
        expect(await stateOf(restored), 'the state right after the restore').toBe(stateAtSnapshot);
      }

      await Promise.all([straight, restored].map(async (page) => applyFrameInput(page, SCENARIO, frame)));
      const [straightFrame, restoredFrame] = await Promise.all([straight, restored].map(async (page) => stepPage(page, FRAME_MILLISECONDS)));
      if (frame < SNAPSHOT_FRAME) {
        expect(restoredFrame?.hash, `draw calls of frame ${String(frame)}`).toBe(straightFrame?.hash);
        continue;
      }
      const [left, right] = await Promise.all([straight, restored].map(stateOf));
      expect(right, `game state at frame ${String(frame)}`).toBe(left);
      const comparesPixels = !viaSave || frame >= SAVE_PIXELS_FROM_FRAME;
      if (comparesPixels && (frame % PIXELS_INTERVAL_FRAMES === 0 || frame === SCENARIO.frames - 1)) {
        const [straightPixels, restoredPixels] = await Promise.all([straight, restored].map(async (page) => page.evaluate(() => window.__differential.canvasHash())));
        expect(restoredPixels, `canvas pixels at frame ${String(frame)}`).toBe(straightPixels);
      }
    }
    const [straightUi, restoredUi] = await Promise.all([straight, restored].map(async (page) => page.evaluate(() => document.getElementById('ui')?.textContent ?? '')));
    expect(restoredUi, 'the cancelled death delay never showed the results screen').toBe(straightUi);
  } finally {
    await Promise.all([straight, restored].map(async (page) => page.browserContext().close()));
  }
}

async function pressKeys(page: Page, keyCodes: readonly number[], isDown: boolean): Promise<void> {
  await page.evaluate(
    (codes: readonly number[], down: boolean) => {
      for (const code of codes) {
        window.__differential.key(code, down);
      }
    },
    keyCodes,
    isDown
  );
}

// The removed-units log and the capture count are per page, and the detour adds to both, so they are left out.
async function stateOf(page: Page): Promise<string> {
  const { cycle, player, stopped, units } = await page.evaluate(() => window.__differential.snapshot());
  return JSON.stringify({ cycle, player, stopped, units });
}

const PRACTICE_SCENARIO: Scenario = {
  expectedCoverage: {},
  frames: 900,
  keys: route(FIRST_INPUT_FRAME, [[[KEY_RIGHT], 90], [[KEY_UP], 60], [[KEY_LEFT], 45], [[KEY_DOWN], 120]]),
  name: 'practice',
  seed: 7,
  startFrame: START_FRAME
};

interface PracticeView {
  readonly hud: string;
  readonly inPlay: boolean;
  readonly results: boolean;
}

async function clickById(page: Page, id: string): Promise<void> {
  await page.evaluate((elementId: string) => {
    const element = document.getElementById(elementId);
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error(`No button #${elementId}`);
    }
    element.click();
  }, id);
}

// The route runs back across its own trail, so the player dies; practice mode must bring it back at its latest
// Checkpoint after the death delay, keep the results screen away, and show a practice result once the run is ended.
async function playPractice(browser: Browser): Promise<void> {
  const page = await openVariant(browser, 'reconstruction', PRACTICE_SCENARIO);
  try {
    await clickById(page, 'practice-toggle');
    let deathFrame: null | number = null;
    let respawnFrame: null | number = null;
    for (let frame = 0; frame < PRACTICE_SCENARIO.frames && respawnFrame === null; frame++) {
      await applyFrameInput(page, PRACTICE_SCENARIO, frame);
      await stepPage(page);
      if (frame <= START_FRAME) {
        continue;
      }
      if (frame === START_FRAME + 10) {
        expect((await practiceView(page)).hud, 'the run starts with a checkpoint').toContain('Checkpoints: 1');
        await pressCode(page, 'KeyZ');
        expect((await practiceView(page)).hud, 'Z adds one').toContain('Checkpoints: 2');
        await pressCode(page, 'KeyX');
        expect((await practiceView(page)).hud, 'X removes the latest').toContain('Checkpoints: 1');
      }
      const view = await practiceView(page);
      expect(view.results, `no results screen at frame ${String(frame)}`).toBe(false);
      if (deathFrame === null && !view.inPlay) {
        deathFrame = frame;
        expect(view.hud).toContain('Respawning');
      } else if (deathFrame !== null && view.inPlay) {
        respawnFrame = frame;
        expect(view.hud).toContain('Deaths: 1');
      }
    }
    expect(deathFrame, 'the player dies').not.toBeNull();
    expect(respawnFrame, 'the player respawns').not.toBeNull();
    await clickById(page, 'practice-end');
    for (let frame = 0; frame < 200 && !(await practiceView(page)).results; frame++) {
      await stepPage(page);
    }
    expect((await practiceView(page)).results, 'ending the run shows a practice result').toBe(true);
  } finally {
    await page.browserContext().close();
  }
}

async function practiceView(page: Page): Promise<PracticeView> {
  return page.evaluate(() => {
    const { player, units } = window.paperio2api.game;
    return { hud: document.getElementById('practice-hud')?.textContent ?? '', inPlay: player !== null && units.includes(player), results: document.getElementById('practice-results') !== null };
  });
}

async function pressCode(page: Page, code: string): Promise<void> {
  await page.evaluate((keyCode: string) => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: keyCode }));
  }, code);
}

describe('restoring a snapshot of the reconstruction', () => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    await promisify(execFile)(process.execPath, ['build.mjs'], { cwd: TS_ROOT });
    browser = await launchBrowser();
  }, TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    await browser?.close();
  });

  it('plays on after a detour and a death exactly as a run that never left the scenario', async () => {
    if (!browser) {
      throw new Error('The browser did not start');
    }
    await playWithDetour(browser, false);
  }, TIMEOUT_MILLISECONDS);

  it('does the same after the snapshot went through a saved game', async () => {
    if (!browser) {
      throw new Error('The browser did not start');
    }
    await playWithDetour(browser, true);
  }, TIMEOUT_MILLISECONDS);

  it('respawns a practice run at its latest checkpoint and ends it as practice', async () => {
    if (!browser) {
      throw new Error('The browser did not start');
    }
    await playPractice(browser);
  }, TIMEOUT_MILLISECONDS);
});
