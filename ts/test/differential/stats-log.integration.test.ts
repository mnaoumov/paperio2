/**
 * @file
 *
 * Proves the per-game stats log in a real page: a run that ends is listed in the menu's Extras, and its Download hands
 * over JSONL with the header, a sample every 250 ms of game time, the death and the end line.
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
const MAX_WAIT_FRAMES = 600;
/** About 4 seconds of play at 60 fps. */
const PLAYED_FRAMES = 240;
const MIN_SAMPLES = 15;
const KILL_REASON_SYSTEM = 6;
/** IndexedDB answers in real time, outside the page's virtual scheduler, so a wait gives it some. */
const STORAGE_SETTLE_MILLISECONDS = 20;
const SCENARIO: Scenario = { expectedCoverage: {}, frames: 0, keys: [], name: 'stats log', seed: 7, startFrame: 0 };

interface LogLine {
  readonly event?: string;
  readonly type: string;
}

async function stepUntil(page: Page, done: () => Promise<boolean>, what: string): Promise<void> {
  for (let frame = 0; !await done(); frame++) {
    if (frame > MAX_WAIT_FRAMES) {
      throw new Error(`No ${what} within ${String(MAX_WAIT_FRAMES)} frames`);
    }
    await stepPage(page);
    await new Promise((resolve) => {
      setTimeout(resolve, STORAGE_SETTLE_MILLISECONDS);
    });
  }
}

describe('the stats log', () => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    await promisify(execFile)(process.execPath, ['build.mjs'], { cwd: TS_ROOT });
    browser = await launchBrowser();
  }, TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    await browser?.close();
  });

  it('lists an ended run in Extras and downloads its JSONL', async () => {
    if (!browser) {
      throw new Error('The browser did not start');
    }
    const page = await openVariant(browser, 'reconstruction', SCENARIO, { storage: { 'paperio2.extras': 'open' }, traceCanvas: false });
    try {
      await page.evaluate(() => {
        window.paperio2api.startGame();
      });
      await stepUntil(page, async () => page.evaluate(() => window.paperio2api.game.player !== null), 'the player');
      for (let frame = 0; frame < PLAYED_FRAMES; frame++) {
        await stepPage(page);
      }
      await page.evaluate((reason: number) => {
        const { game } = window.paperio2api;
        game.kill(game.player ?? undefined, undefined, reason);
      }, KILL_REASON_SYSTEM);
      await stepUntil(page, async () => page.evaluate(() => document.getElementById('menu') !== null), 'the results screen');
      await page.evaluate(() => {
        const menu = document.getElementById('menu');
        if (menu instanceof HTMLElement) {
          menu.click();
        }
      });
      await stepUntil(page, async () => page.evaluate(() => document.querySelector('.stats-row .stats-download') !== null), 'a stats log in the menu');
      expect(await page.evaluate(() => document.querySelectorAll('.stats-row').length)).toBe(1);
      expect(await page.evaluate(() => document.querySelector('.stats-details')?.textContent)).toMatch(/^human · 0:0\d · [\d.]+% · died$/);

      await page.evaluate(() => {
        const original = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (object: Blob | MediaSource): string => {
          if (object instanceof Blob) {
            Reflect.set(window, '__downloaded', object);
          }
          return original(object);
        };
        const button = document.querySelector('.stats-row .stats-download');
        if (button instanceof HTMLElement) {
          button.click();
        }
      });
      const text = await page.evaluate(async () => {
        const blob: unknown = Reflect.get(window, '__downloaded');
        return blob instanceof Blob ? blob.text() : '';
      });
      const lines = text.trim().split('\n').map((line: string) => JSON.parse(line) as LogLine);
      expect(lines[0]).toMatchObject({ format: 2, pilot: 'human', type: 'header' });
      expect(lines.filter((line: LogLine) => line.type === 'sample').length).toBeGreaterThanOrEqual(MIN_SAMPLES);
      expect(lines.filter((line: LogLine) => line.type === 'event').map((line: LogLine) => line.event)).toContain('death');
      expect(lines.at(-1)).toMatchObject({ outcome: 'death', reason: 'system', type: 'end' });
    } finally {
      await page.browserContext().close();
    }
  }, TIMEOUT_MILLISECONDS);
});
