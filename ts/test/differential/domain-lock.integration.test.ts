/**
 * @file
 *
 * Proves the page's domain lock guard holds: off `paperio.site`, both engines arm a timer that sends the page to
 * `paper-io.com` between 3.1 and 4.1 minutes after load, and `index.html`'s shim defuses it. Each engine is played
 * for 5 virtual minutes on a host that is not `paperio.site`, and no navigation may leave the page. On `paperio.site`
 * the engine arms no such timer, so the guard must not touch anything there.
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

import type {
  Scenario,
  Variant
} from './harness.ts';

import {
  launchBrowser,
  openVariant,
  stepPage,
  TS_ROOT,
  VARIANTS
} from './harness.ts';

const TIMEOUT_MILLISECONDS = 300_000;
const STEP_MILLISECONDS = 1000;
const PLAYED_MILLISECONDS = 300_000;
const START_STEP = 2;

interface MoveToFlags {
  readonly bot: string;
  readonly plain: string;
  readonly player: string;
}

async function defusedTimers(page: Page): Promise<unknown> {
  return page.evaluate(() => Reflect.get(window, 'paperio2domainLockDefused') ?? 0);
}

// Off paperio.site the engine never sets `Player.prototype.moveTo`, and without it a player outside its base is
// Marked now and then as back inside, so its trail never captures. The shim answers the flag for the player only.
async function moveToFlags(page: Page): Promise<MoveToFlags> {
  return page.evaluate(() => {
    const { player, units } = window.paperio2api.game;
    const bot = units.find((unit) => unit !== player);
    // `undefined` does not survive the trip out of the page, so each flag is reduced to a string.
    return { bot: String(Reflect.get(bot ?? {}, 'moveTo')), plain: String(Reflect.get({}, 'moveTo')), player: String(Reflect.get(player ?? {}, 'moveTo')) };
  });
}

function scenarioOn(host: string): Scenario {
  return { expectedCoverage: {}, frames: 0, host, keys: [], name: `domain lock on ${host}`, seed: 1, startFrame: START_STEP };
}

describe('the domain lock guard', () => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    await promisify(execFile)(process.execPath, ['build.mjs'], { cwd: TS_ROOT });
    browser = await launchBrowser();
  }, TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    await browser?.close();
  });

  it.each(VARIANTS)('keeps the %s engine on a host that is not paperio.site for 5 minutes', async (variant: Variant) => {
    if (!browser) {
      throw new Error('The browser did not start');
    }
    const page = await openVariant(browser, variant, scenarioOn('paperio2.test'));
    const redirects: string[] = [];
    page.on('request', (request) => {
      if (request.isNavigationRequest()) {
        redirects.push(request.url());
      }
    });
    function hasLeft(): boolean {
      return redirects.length > 0;
    }
    try {
      expect.soft(await defusedTimers(page), 'the engine armed the lock timer and the shim defused it').toBe(1);
      for (let elapsed = 0, step = 0; elapsed < PLAYED_MILLISECONDS && !hasLeft(); elapsed += STEP_MILLISECONDS, step++) {
        try {
          if (step === START_STEP) {
            await page.evaluate(() => {
              window.paperio2api.startGame();
            });
          }
          await stepPage(page, STEP_MILLISECONDS);
          if (step === START_STEP) {
            expect(await moveToFlags(page), 'the lock\'s moveTo flag is on for the player only').toEqual({ bot: 'undefined', plain: 'undefined', player: 'true' });
          }
        } catch (error) {
          // A navigation destroys the page's context mid-step; the assertion below names where it went.
          if (!hasLeft()) {
            throw error;
          }
        }
      }
      expect(redirects, 'redirects away from the page').toEqual([]);
      expect(await page.evaluate(() => 'paperio2api' in window && document.querySelector('canvas') !== null)).toBe(true);
    } finally {
      await page.browserContext().close();
    }
  }, TIMEOUT_MILLISECONDS);

  it.each(VARIANTS)('leaves the %s engine untouched on paperio.site', async (variant: Variant) => {
    if (!browser) {
      throw new Error('The browser did not start');
    }
    const page = await openVariant(browser, variant, scenarioOn('paperio.site'));
    try {
      expect(await defusedTimers(page)).toBe(0);
      expect(await page.evaluate(() => Object.getOwnPropertyDescriptor(Object.prototype, 'moveTo')), 'no moveTo accessor on the real host').toBeUndefined();
    } finally {
      await page.browserContext().close();
    }
  }, TIMEOUT_MILLISECONDS);
});
