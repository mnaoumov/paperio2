/**
 * @file
 *
 * Proves the speedrun seed: two pages on the same `?seed=`, whose other randomness differs (the harness seeds
 * `Math.random` differently for each) and whose menus run for different lengths of time before Play, start on the same
 * map, with the same bots and the same spawn point. From there play steps by real frame times, so the run itself is
 * not pinned, and this test does not ask for it. Another seed starts somewhere else, and a page without a seed is left
 * to the harness's own `Math.random`.
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
  launchBrowser,
  openVariant,
  stepPage,
  TS_ROOT
} from './harness.ts';

const TIMEOUT_MILLISECONDS = 300_000;
const SHORT_MENU_FRAMES = 2;
/** Long enough for the menu's bots to play on for a while. */
const LONG_MENU_FRAMES = 300;
const MAX_FRAMES_TO_SPAWN = 60;

async function hasPlayer(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__differential.snapshot().player !== null);
}

async function readUnits(page: Page): Promise<string> {
  return page.evaluate(() => {
    const { player, units } = window.__differential.snapshot();
    return JSON.stringify({ player, units });
  });
}

function scenario(harnessSeed: number): Scenario {
  return { expectedCoverage: {}, frames: 0, keys: [], name: `seed with harness seed ${String(harnessSeed)}`, seed: harnessSeed, startFrame: 0 };
}

describe('the speedrun seed', () => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    await promisify(execFile)(process.execPath, ['build.mjs'], { cwd: TS_ROOT });
    browser = await launchBrowser();
  }, TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    await browser?.close();
  });

  /**
   * Plays the menu for a while, presses Play and reads the units the moment the player is in.
   *
   * @param harnessSeed - The harness's own `Math.random` seed.
   * @param menuFrames - How many frames the menu runs before Play.
   * @param query - The page's query, such as `seed=race`.
   * @returns The units, as JSON.
   */
  async function unitsAtSpawn(harnessSeed: number, menuFrames: number, query?: string): Promise<string> {
    if (!browser) {
      throw new Error('The browser did not start');
    }
    const page = await openVariant(browser, 'reconstruction', scenario(harnessSeed), { traceCanvas: false, ...query ? { query } : {} });
    try {
      for (let frame = 0; frame < menuFrames; frame++) {
        await stepPage(page);
      }
      await page.evaluate(() => {
        window.paperio2api.startGame();
      });
      // The run starts when the game screen's effect runs, a frame or a few after Play.
      for (let frame = 0; !await hasPlayer(page); frame++) {
        if (frame > MAX_FRAMES_TO_SPAWN) {
          throw new Error('The player did not spawn');
        }
        await stepPage(page);
      }
      return await readUnits(page);
    } finally {
      await page.browserContext().close();
    }
  }

  it('starts every Play on a seed from the same game, however long the menu ran', async () => {
    const early = await unitsAtSpawn(1, SHORT_MENU_FRAMES, 'seed=race');
    const late = await unitsAtSpawn(2, LONG_MENU_FRAMES, 'seed=race');
    expect(late, 'the units when the player spawns').toBe(early);
    const other = await unitsAtSpawn(1, SHORT_MENU_FRAMES, 'seed=other');
    expect(other, 'another seed').not.toBe(early);
  }, TIMEOUT_MILLISECONDS);

  it('leaves a page without a seed to its own randomness', async () => {
    const first = await unitsAtSpawn(1, SHORT_MENU_FRAMES);
    const second = await unitsAtSpawn(2, SHORT_MENU_FRAMES);
    expect(second).not.toBe(first);
  }, TIMEOUT_MILLISECONDS);
});
