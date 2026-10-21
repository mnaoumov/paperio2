/**
 * @file
 *
 * Proves a pause leaves no trace on the game: the same scenario is played twice on the reconstruction, in lockstep,
 * one run unpaused and the other paused twice for 10 minutes of virtual time, once mid-play through the Esc and P
 * keys, and once during the delay between the player's death and the results screen through a hidden tab and the
 * pause button. Every frame after each resume must draw exactly what the unpaused run draws at the same game time,
 * and the game state and the results screen, playtime included, must be the same.
 *
 * Frames here are exactly 16 ms rather than 1000/60 ms, so every virtual time is an integer and a 10-minute pause
 * subtracts out exactly: with a fractional frame the paused run's clock reads the same game time to within a
 * rounding error, which would change a frame delta in its last bit. The page claims to be `paperio.site`, where the
 * domain lock arms no redirect timer at all; elsewhere the page's shim defuses it.
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
import {
  randomWalk,
  route
} from './scenarios.ts';

const TIMEOUT_MILLISECONDS = 300_000;
const FRAME_MILLISECONDS = 16;
const PAUSE_MILLISECONDS = 600_000;
const FIRST_PAUSE_FRAME = 400;
const SNAPSHOT_INTERVAL_FRAMES = 30;
const START_FRAME = 120;
const FIRST_INPUT_FRAME = 150;

const SCENARIO: Scenario = {
  expectedCoverage: {},
  frames: 1800,
  host: 'paperio.site',
  keys: route(FIRST_INPUT_FRAME, randomWalk(18, 40)),
  name: 'pause',
  seed: 18,
  startFrame: START_FRAME
};

interface PauseState {
  readonly overlay: boolean;
  readonly paused: boolean;
}

async function pauseState(page: Page): Promise<PauseState> {
  return page.evaluate(() => ({ overlay: document.getElementById('pause-overlay') !== null, paused: window.paperio2api.game.paused }));
}

async function playerAwaitingResults(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const { player, units } = window.paperio2api.game;
    return player !== null && !units.includes(player);
  });
}

async function pressPauseKey(page: Page, code: string): Promise<void> {
  await page.evaluate((keyCode: string) => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: keyCode }));
  }, code);
}

async function setTabHidden(page: Page, isHidden: boolean): Promise<void> {
  await page.evaluate((hidden: boolean) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: hidden ? 'hidden' : 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, isHidden);
}

// A removed unit's `frame` counts the page's steps, and the paused run takes one extra step per pause, so it is left
// Out; the per-frame draw-call comparison already pins the frame each unit dies on.
async function snapshotOf(page: Page): Promise<string> {
  const snapshot = await page.evaluate(() => window.__differential.snapshot());
  return JSON.stringify({ ...snapshot, removed: snapshot.removed.map(({ frame: _frame, ...unit }) => unit) });
}

async function uiText(page: Page): Promise<string> {
  return page.evaluate(() => document.getElementById('ui')?.textContent ?? '');
}

describe('pausing the reconstruction', () => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    await promisify(execFile)(process.execPath, ['build.mjs'], { cwd: TS_ROOT });
    browser = await launchBrowser();
  }, TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    await browser?.close();
  });

  it('plays on after two 10-minute pauses exactly as a run that never paused', async () => {
    if (!browser) {
      throw new Error('The browser did not start');
    }
    const startedBrowser = browser;
    const [unpaused, paused] = await Promise.all([0, 1].map(async () => openVariant(startedBrowser, 'reconstruction', SCENARIO)));
    if (!unpaused || !paused) {
      throw new Error('Expected two pages');
    }
    let deathPauseFrame: null | number = null;
    let resultsShownFrame: null | number = null;
    try {
      for (let frame = 0; frame < SCENARIO.frames; frame++) {
        await Promise.all([unpaused, paused].map(async (page) => applyFrameInput(page, SCENARIO, frame)));
        const [unpausedFrame, pausedFrame] = await Promise.all([unpaused, paused].map(async (page) => stepPage(page, FRAME_MILLISECONDS)));
        expect(pausedFrame?.hash, `draw calls of frame ${String(frame)}`).toBe(unpausedFrame?.hash);

        if (frame === FIRST_PAUSE_FRAME) {
          await pressPauseKey(paused, 'Escape');
          expect(await pauseState(paused)).toEqual({ overlay: true, paused: true });
          await stepPage(paused, PAUSE_MILLISECONDS);
          await pressPauseKey(paused, 'KeyP');
          expect(await pauseState(paused)).toEqual({ overlay: false, paused: false });
        }

        if (frame > START_FRAME && deathPauseFrame === null && await playerAwaitingResults(paused)) {
          deathPauseFrame = frame;
          await setTabHidden(paused, true);
          expect((await pauseState(paused)).paused).toBe(true);
          await stepPage(paused, PAUSE_MILLISECONDS);
          await setTabHidden(paused, false);
          // A player is in play, so showing the tab again leaves the game paused for the player to resume.
          expect(await pauseState(paused)).toEqual({ overlay: true, paused: true });
          await paused.evaluate(() => {
            const button = document.getElementById('pause-button');
            if (button instanceof HTMLButtonElement) {
              button.click();
            }
          });
          expect((await pauseState(paused)).paused).toBe(false);
        }

        if (deathPauseFrame !== null && resultsShownFrame === null && await unpaused.evaluate(() => window.paperio2api.game.player === null)) {
          resultsShownFrame = frame;
        }

        if (frame % SNAPSHOT_INTERVAL_FRAMES === 0 || frame === SCENARIO.frames - 1) {
          const [left, right] = await Promise.all([unpaused, paused].map(snapshotOf));
          expect(right, `game state at frame ${String(frame)}`).toBe(left);
        }
      }
      expect(deathPauseFrame, 'the player dies, so the death delay is paused').not.toBeNull();
      expect(resultsShownFrame, 'the results screen comes up within the run').not.toBeNull();
      const [unpausedResults, pausedResults] = await Promise.all([unpaused, paused].map(uiText));
      expect(pausedResults).toBe(unpausedResults);
      const [unpausedPixels, pausedPixels] = await Promise.all([unpaused, paused].map(async (page) => page.evaluate(() => window.__differential.canvasHash())));
      expect(pausedPixels).toBe(unpausedPixels);
    } finally {
      await Promise.all([unpaused, paused].map(async (page) => page.browserContext().close()));
    }
  }, TIMEOUT_MILLISECONDS);
});
