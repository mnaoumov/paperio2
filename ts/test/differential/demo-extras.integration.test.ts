/**
 * @file
 *
 * Proves the ghost race and the demo's showcase view in a real page. A run that ends is kept as the best run and comes
 * back as a ghost drawn on its own canvas in the next run; a practice run is never kept. With the showcase view on,
 * the camera follows the unit with the most territory, which at the start of a run is a bot, not the player.
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
const PLAYED_FRAMES = 240;
const GLIDE_FRAMES = 120;
const GHOST_FRAMES = 10;
const EFFECT_FRAMES = 3;
const KILL_REASON_SYSTEM = 6;
const MIN_SAMPLES = 20;
const SAMPLE_FIELDS = 4;
/** The camera counts as on a unit within this distance of it, in arena units. */
const CAMERA_TOLERANCE = 3;
const SCENARIO: Scenario = { expectedCoverage: {}, frames: 0, keys: [], name: 'demo extras', seed: 7, startFrame: 0 };

interface CameraView {
  readonly fromLeader: number;
  readonly fromPlayer: number;
  readonly leaderIsPlayer: boolean;
  readonly readout: string;
}

async function endRun(page: Page): Promise<void> {
  await page.evaluate((reason: number) => {
    const { game } = window.paperio2api;
    game.kill(game.player ?? undefined, undefined, reason);
  }, KILL_REASON_SYSTEM);
  await stepUntil(page, async () => page.evaluate(() => !document.getElementById('ui')?.classList.contains('hide')), 'the results screen');
  // Preact runs the run's effect cleanups, which keep the run, on a frame after the results screen renders.
  await steps(page, EFFECT_FRAMES);
}

async function play(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.paperio2api.startGame();
  });
  await stepUntil(page, async () => page.evaluate(() => window.paperio2api.game.player !== null), 'the player');
}

async function steps(page: Page, count: number): Promise<void> {
  for (let frame = 0; frame < count; frame++) {
    await stepPage(page);
  }
}

async function stepUntil(page: Page, done: () => Promise<boolean>, what: string): Promise<void> {
  for (let frame = 0; !await done(); frame++) {
    if (frame > MAX_WAIT_FRAMES) {
      throw new Error(`No ${what} within ${String(MAX_WAIT_FRAMES)} frames`);
    }
    await stepPage(page);
  }
}

describe('the demo extras', () => {
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

  it('keeps a finished run and races it as a ghost in the next one', async () => {
    const page = await open({ 'paperio2.ghost': 'on' });
    try {
      await play(page);
      expect(await page.evaluate(() => document.getElementById('ghost-overlay')), 'no ghost before any run').toBeNull();
      await steps(page, PLAYED_FRAMES);
      await endRun(page);
      const stored = await page.evaluate(() => localStorage.getItem('paperio2.ghost.free'));
      const track: unknown = JSON.parse(stored ?? 'null');
      expect(track, 'the run is kept').toMatchObject({ pilot: 'You', seed: null });
      const samples: unknown = Reflect.get(Object(track), 'samples');
      expect(Array.isArray(samples) ? samples.length / SAMPLE_FIELDS : 0, 'samples of the run').toBeGreaterThanOrEqual(MIN_SAMPLES);
      await play(page);
      await steps(page, GHOST_FRAMES);
      const drawn = await page.evaluate(() => {
        const canvas = document.getElementById('ghost-overlay');
        if (!(canvas instanceof HTMLCanvasElement)) {
          return -1;
        }
        const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data ?? [];
        let painted = 0;
        for (let index = 3; index < data.length; index += 4) {
          if (data[index] !== 0) {
            painted++;
          }
        }
        return painted;
      });
      expect(drawn, 'pixels of the ghost on its own canvas').toBeGreaterThan(0);
    } finally {
      await page.browserContext().close();
    }
  }, TIMEOUT_MILLISECONDS);

  it('never keeps a practice run', async () => {
    const page = await open({ 'paperio2.practice': 'on' });
    try {
      await play(page);
      await steps(page, PLAYED_FRAMES);
      // Without its checkpoints the death ends the run, the way running out of them does.
      await page.evaluate(() => {
        Reflect.set(window.paperio2api.game, 'practice', null);
      });
      await endRun(page);
      expect(await page.evaluate(() => localStorage.getItem('paperio2.ghost.free'))).toBeNull();
    } finally {
      await page.browserContext().close();
    }
  }, TIMEOUT_MILLISECONDS);

  it('points the showcase camera at the leader', async () => {
    const page = await open({ 'paperio2.autopilot': 'whitebox', 'paperio2.autopilotView': 'on' });
    try {
      await play(page);
      await steps(page, GLIDE_FRAMES);
      const view: CameraView = await page.evaluate(() => {
        const { game } = window.paperio2api;
        const leader = game.units.reduce((best, unit) => (unit.percent ?? 0) > (best.percent ?? 0) ? unit : best);
        const origin = game.origin ?? { x: Number.NaN, y: Number.NaN };
        const player = game.player ?? leader;
        return {
          fromLeader: Math.hypot(origin.x - leader.position.x, origin.y - leader.position.y),
          fromPlayer: Math.hypot(origin.x - player.position.x, origin.y - player.position.y),
          leaderIsPlayer: leader === game.player,
          readout: document.getElementById('autopilot-readout')?.textContent ?? ''
        };
      });
      expect(view.leaderIsPlayer, 'a bot leads at the start of a run').toBe(false);
      expect(view.fromLeader, 'the camera is on the leader').toBeLessThan(CAMERA_TOLERANCE);
      expect(view.fromPlayer, 'the camera is not on the player').toBeGreaterThan(CAMERA_TOLERANCE);
      expect(view.readout).toContain('watching');
    } finally {
      await page.browserContext().close();
    }
  }, TIMEOUT_MILLISECONDS);
});
