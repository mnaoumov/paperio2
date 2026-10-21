/**
 * @file
 *
 * Proves the reconstruction behaves like the shipped `app2.js`: every recorded scenario is played on both builds
 * in lockstep, under a seeded `Math.random`, a virtual clock and a virtual frame scheduler, and every frame's
 * canvas calls, a game-state snapshot every 30 frames and the final pixels must be identical.
 *
 * It needs a Chrome install (the stable channel, or `CHROME_PATH`) and builds `dist/app2.js` from the current
 * source first, so it always tests the code in the tree. Set `DIFFERENTIAL_DUMP` to a directory to have the two
 * call traces of a diverging frame written there.
 */

import type { Browser } from 'puppeteer-core';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import {
  COVERAGE_EVENTS,
  launchBrowser,
  runScenario,
  TS_ROOT
} from './harness.ts';
import { SCENARIOS } from './scenarios.ts';

const SCENARIO_TIMEOUT_MILLISECONDS = 300_000;

describe('the reconstruction against the original app2.js', () => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    await promisify(execFile)(process.execPath, ['build.mjs'], { cwd: TS_ROOT });
    browser = await launchBrowser();
  }, SCENARIO_TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    await browser?.close();
  });

  it.each(SCENARIOS)('plays "$name" (seed $seed) identically', async (scenario) => {
    if (!browser) {
      throw new Error('The browser did not start');
    }
    const result = await runScenario(browser, scenario);
    expect(result.divergence).toBeNull();
    expect(result.framesCompared).toBe(scenario.frames);
    for (const event of COVERAGE_EVENTS) {
      const minimum = scenario.expectedCoverage[event];
      if (minimum !== undefined) {
        expect.soft(result.coverage[event], `${event} in "${scenario.name}"; player path ${result.playerPath.join(' | ')}; player deaths ${JSON.stringify(result.playerDeaths)}; start ${result.startFacts}`).toBeGreaterThanOrEqual(minimum);
      }
    }
  }, SCENARIO_TIMEOUT_MILLISECONDS);
});
