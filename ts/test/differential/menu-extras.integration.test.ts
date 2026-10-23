/**
 * @file
 *
 * Proves the menu's layout in a real page. Everything this copy adds sits behind one Extras button, so the closed
 * menu fits the window like the original's. Opened in a short window, the menu scrolls under the wheel until the
 * Recordings panel near its bottom is on screen. Recording mode hides the Extras button too, and R brings it back.
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
const SHORT_HEIGHT = 600;
const WIDTH = 1280;
const WHEEL_DELTA = 200;
const MAX_WHEELS = 40;
const WHEEL_SETTLE_MILLISECONDS = 50;
/** Preact runs effects (the recording class, the R listener's rebind) on a frame after the render. */
const EFFECT_FRAMES = 3;
const SCENARIO: Scenario = { expectedCoverage: {}, frames: 0, keys: [], name: 'menu extras', seed: 7, startFrame: 0 };
/** The menu elements this copy adds; recording mode must leave none of them. */
const ADDED_IDS = ['extras-toggle', 'extras-panel', 'practice-menu', 'recordings', 'stats-logs'] as const;

interface Layout {
  readonly clientHeight: number;
  readonly overflowY: string;
  readonly scrollHeight: number;
}

async function addedIdsShown(page: Page): Promise<string[]> {
  return page.evaluate((ids: readonly string[]) => ids.filter((id) => document.getElementById(id) !== null), ADDED_IDS);
}

async function layout(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const ui = document.getElementById('ui');
    if (!ui) {
      throw new Error('No #ui');
    }
    return { clientHeight: ui.clientHeight, overflowY: getComputedStyle(ui).overflowY, scrollHeight: ui.scrollHeight };
  });
}

async function pressRecordingKey(page: Page): Promise<void> {
  // The R listener is bound by an effect, so let a pending one run first.
  await steps(page, EFFECT_FRAMES);
  await page.evaluate(() => {
    for (const type of ['keydown', 'keyup']) {
      document.body.dispatchEvent(new KeyboardEvent(type, { bubbles: true, code: 'KeyR', key: 'r' }));
    }
  });
  await steps(page, EFFECT_FRAMES);
}

async function recordingsBelowFold(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const recordings = document.getElementById('recordings');
    if (!recordings) {
      throw new Error('No #recordings');
    }
    return recordings.getBoundingClientRect().bottom > window.innerHeight;
  });
}

async function steps(page: Page, count: number): Promise<void> {
  for (let frame = 0; frame < count; frame++) {
    await stepPage(page);
  }
}

describe('the menu', () => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    await promisify(execFile)(process.execPath, ['build.mjs'], { cwd: TS_ROOT });
    browser = await launchBrowser();
  }, TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    await browser?.close();
  });

  async function open(storage: Readonly<Record<string, string>>): Promise<Page> {
    if (!browser) {
      throw new Error('The browser did not start');
    }
    return openVariant(browser, 'reconstruction', SCENARIO, { storage, traceCanvas: false });
  }

  it('keeps the additions behind a closed Extras button, so the menu fits the window', async () => {
    const page = await open({});
    try {
      expect(await addedIdsShown(page)).toEqual(['extras-toggle']);
      const { clientHeight, scrollHeight } = await layout(page);
      expect(scrollHeight, 'the closed menu fits').toBeLessThanOrEqual(clientHeight);
    } finally {
      await page.close();
    }
  }, TIMEOUT_MILLISECONDS);

  it('scrolls an open Extras panel until the Recordings panel is on screen in a short window', async () => {
    const page = await open({ 'paperio2.extras': 'open' });
    try {
      await page.setViewport({ deviceScaleFactor: 1, height: SHORT_HEIGHT, width: WIDTH });
      const before = await layout(page);
      expect(before.overflowY).toBe('auto');
      expect(before.scrollHeight, 'the open menu is taller than the window').toBeGreaterThan(before.clientHeight);
      expect(await recordingsBelowFold(page), 'Recordings starts below the fold').toBe(true);
      await page.mouse.move(WIDTH / 2, SHORT_HEIGHT / 2);
      for (let wheel = 0; wheel < MAX_WHEELS && await recordingsBelowFold(page); wheel++) {
        await page.mouse.wheel({ deltaY: WHEEL_DELTA });
        await new Promise((resolve) => {
          setTimeout(resolve, WHEEL_SETTLE_MILLISECONDS);
        });
      }
      expect(await recordingsBelowFold(page), 'the wheel reaches Recordings').toBe(false);
      expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0), 'the page itself never scrolls').toBe(0);
    } finally {
      await page.close();
    }
  }, TIMEOUT_MILLISECONDS);

  it('hides the Extras button in recording mode and brings it back on R', async () => {
    const page = await open({ 'paperio2.extras': 'open' });
    try {
      expect(await addedIdsShown(page)).toEqual([...ADDED_IDS]);
      await pressRecordingKey(page);
      expect(await page.evaluate(() => document.documentElement.classList.contains('paperio2-recording'))).toBe(true);
      expect(await addedIdsShown(page), 'recording mode leaves nothing this copy adds in the menu').toEqual([]);
      await pressRecordingKey(page);
      expect(await addedIdsShown(page), 'R brings Extras back, still open').toEqual([...ADDED_IDS]);
    } finally {
      await page.close();
    }
  }, TIMEOUT_MILLISECONDS);
});
