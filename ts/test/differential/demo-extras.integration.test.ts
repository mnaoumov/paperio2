/**
 * @file
 *
 * Proves the ghost race and the demo's showcase view in a real page. A run that ends is kept as the best run and comes
 * back as a ghost drawn on its own canvas in the next run; a practice run is never kept. With the showcase view on,
 * the camera follows the unit with the most territory, which at the start of a run is a bot, not the player. A demo
 * pilot keeps steering while the mouse wanders over the game, gives way to a click, and starts the next round by itself.
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
/**
 * A glide that started mid-run trails its moving leader by about its speed over the glide step (measured 10.6), and
 * never snaps onto it.
 */
const GLIDE_TOLERANCE = 20;
/** Where the mouse wanders over the game, in view pixels, each leg far past any jitter threshold. */
const MOUSE_PATH: readonly (readonly [number, number])[] = [[200, 200], [600, 300], [300, 500], [700, 150]];
const MOUSE_STEPS = 10;
const CLICK_X = 400;
const CLICK_Y = 400;
/** A page zoomed out to 80%, where the original's leaderboard image cut the top rows' left ends. */
const ZOOMED_OUT_PIXEL_RATIO = 0.8;
const VIEW_WIDTH = 1280;
const VIEW_HEIGHT = 720;
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

async function isEngaged(page: Page): Promise<unknown> {
  return page.evaluate(() => Reflect.get(Object(Reflect.get(window.paperio2api.game, 'autopilot')), 'engaged'));
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

  it('plays the demo round after round, and only a press takes it over', async () => {
    const page = await open({ 'paperio2.autopilot': 'whitebox' });
    try {
      await play(page);
      for (const [x, y] of MOUSE_PATH) {
        await page.mouse.move(x, y, { steps: MOUSE_STEPS });
        await stepPage(page);
      }
      expect(await isEngaged(page), 'a mouse that only moves leaves the pilot steering').toBe(true);
      await page.mouse.click(CLICK_X, CLICK_Y);
      await stepPage(page);
      expect(await isEngaged(page), 'a click on the game takes over').toBe(false);
      await page.keyboard.press('KeyO');
      await stepPage(page);
      expect(await isEngaged(page), 'O hands back').toBe(true);
      await endRun(page);
      expect(await page.evaluate(() => document.getElementById('autopilot-readout')?.textContent ?? '')).toContain('next round in');
      await stepUntil(page, async () => page.evaluate(() => document.getElementById('ui')?.classList.contains('hide') === true && window.paperio2api.game.player !== null), 'the next round');
      await steps(page, EFFECT_FRAMES);
      expect(await isEngaged(page), 'the next round is flown by the pilot').toBe(true);
    } finally {
      await page.browserContext().close();
    }
  }, TIMEOUT_MILLISECONDS);

  it('runs the demo pilots\' heavy work in a worker, off the frame', async () => {
    // The overlay is on, so the worker's blackbox pilot sends its view back, which shows it read a frame.
    const blackbox = await open({ 'paperio2.autopilot': 'blackbox', 'paperio2.autopilotOverlay': 'on' });
    try {
      await play(blackbox);
      expect(await blackbox.evaluate(() => Reflect.get(Object(Reflect.get(window.paperio2api.game, 'autopilot')), 'blackbox')), 'no blackbox pilot on the page').toBeNull();
      await stepUntil(blackbox, async () => blackbox.evaluate(() => Reflect.get(Object(Reflect.get(window.paperio2api.game, 'autopilot')), 'blackboxDebug') !== null), 'blackbox decision from the worker');
    } finally {
      await blackbox.browserContext().close();
    }
    const whitebox = await open({ 'paperio2.autopilot': 'whitebox' });
    try {
      await play(whitebox);
      await stepUntil(whitebox, async () =>
        whitebox.evaluate(() => {
          const pilot: unknown = Reflect.get(Object(Reflect.get(window.paperio2api.game, 'autopilot')), 'whitebox');
          return Reflect.get(Object(pilot), 'planner') !== null && Number(Reflect.get(Object(Reflect.get(Object(pilot), 'stats')), 'loops')) > 0;
        }), 'loop planned in the worker');
    } finally {
      await whitebox.browserContext().close();
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

  it('keeps the showcase out of a recording unless the setting lets it in, and the name fit in', async () => {
    const page = await open({ 'paperio2.autopilot': 'whitebox', 'paperio2.autopilotView': 'on', 'paperio2.recording': 'on' });
    try {
      await play(page);
      // The harness turns the name fit off to compare against the original; this test needs it as a player has it.
      await page.evaluate(() => {
        Reflect.set(Object(Reflect.get(window.paperio2api, 'config')), 'leaderboardFitNames', true);
      });
      await steps(page, GLIDE_FRAMES);
      const inRecordingMode = await cameraOffsets(page);
      expect(inRecordingMode.fromPlayer, 'recording mode keeps the camera on the player').toBeLessThan(CAMERA_TOLERANCE);
      expect(await measuredLeaderboard(page), 'recording mode keeps the leaderboard name fit').toBeGreaterThan(0);

      await page.evaluate(() => {
        window.paperio2api.game.recordingAdditions = true;
      });
      await steps(page, GLIDE_FRAMES);
      const withAdditions = await cameraOffsets(page);
      expect(withAdditions.fromLeader, 'with the setting on, the showcase is recorded').toBeLessThan(GLIDE_TOLERANCE);
      expect(withAdditions.fromPlayer, 'with the setting on, the camera leaves the player').toBeGreaterThan(GLIDE_TOLERANCE);
      expect(await measuredLeaderboard(page), 'with the setting on, the leaderboard fits the names')
        .toBeGreaterThan(0);

      // The in-game recorder's take counts as recording too, with recording mode off.
      await page.evaluate(() => {
        const { game } = window.paperio2api;
        game.recordingAdditions = false;
        game.screenRecording = false;
        Reflect.set(game, 'videoRecorder', { afterFrame: (): void => undefined });
      });
      await steps(page, GLIDE_FRAMES);
      expect((await cameraOffsets(page)).fromPlayer, 'a take keeps the camera on the player').toBeLessThan(CAMERA_TOLERANCE);
      expect(await measuredLeaderboard(page), 'a take keeps the leaderboard name fit').toBeGreaterThan(0);
    } finally {
      await page.browserContext().close();
    }
  }, TIMEOUT_MILLISECONDS);

  it('keeps every leaderboard row inside its cached image on a zoomed-out page', async () => {
    const page = await open({});
    try {
      await page.setViewport({ deviceScaleFactor: ZOOMED_OUT_PIXEL_RATIO, height: VIEW_HEIGHT, width: VIEW_WIDTH });
      await play(page);
      await page.evaluate(() => {
        Reflect.set(Object(Reflect.get(window.paperio2api, 'config')), 'leaderboardFitNames', true);
        window.dispatchEvent(new Event('resize'));
      });
      const rows = await leaderboardRowExtents(page);
      expect(rows.length, 'the leaderboard drew its rows').toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.left, `${row.text} starts inside the image`).toBeGreaterThanOrEqual(0);
        expect(row.right, `${row.text} ends inside the image`).toBeLessThanOrEqual(row.width);
        expect(row.bottom, `${row.text} sits above the image's bottom`).toBeLessThanOrEqual(row.height);
      }
    } finally {
      await page.browserContext().close();
    }
  }, TIMEOUT_MILLISECONDS);
});

interface RowExtent {
  readonly bottom: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly text: string;
  readonly width: number;
}

async function cameraOffsets(page: Page): Promise<Pick<CameraView, 'fromLeader' | 'fromPlayer'>> {
  return page.evaluate(() => {
    const { game } = window.paperio2api;
    const leader = game.units.reduce((best, unit) => (unit.percent ?? 0) > (best.percent ?? 0) ? unit : best);
    const origin = game.origin ?? { x: Number.NaN, y: Number.NaN };
    const player = game.player ?? leader;
    return {
      fromLeader: Math.hypot(origin.x - leader.position.x, origin.y - leader.position.y),
      fromPlayer: Math.hypot(origin.x - player.position.x, origin.y - player.position.y)
    };
  });
}

/**
 * Redraws the cached leaderboard on the next frame and returns where each row's text landed in the canvas it was
 * drawn on, in that canvas's pixels.
 *
 * @param page - The page.
 * @returns Each row's text extent and its canvas's size.
 */
async function leaderboardRowExtents(page: Page): Promise<RowExtent[]> {
  await page.evaluate(() => {
    const rows: RowExtent[] = [];
    Reflect.set(window, 'leaderboardRows', rows);
    const prototype = CanvasRenderingContext2D.prototype;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called below with the canvas context as `this`.
    const original = prototype.fillText;
    prototype.fillText = function fillText(this: CanvasRenderingContext2D, text: string, x: number, y: number): void {
      // A leaderboard row reads `<rank> – <percent> <name>`.
      if (/^\d+ – /.test(text)) {
        const transform = this.getTransform();
        const width = this.measureText(text).width;
        rows.push({
          bottom: transform.d * y + transform.f,
          height: this.canvas.height,
          left: transform.a * x + transform.e,
          right: transform.a * (x + width) + transform.e,
          text,
          width: this.canvas.width
        });
      }
      original.call(this, text, x, y);
    };
    window.paperio2api.game.topListChanged = true;
  });
  await stepPage(page);
  return page.evaluate(() => Reflect.get(window, 'leaderboardRows') as RowExtent[]);
}

/**
 * Redraws the cached leaderboard on the next frame and counts the leaderboard rows measured in it; only the name fit
 * measures them.
 *
 * @param page - The page.
 * @returns How many rows `measureText` measured in that frame.
 */
async function measuredLeaderboard(page: Page): Promise<number> {
  await page.evaluate(() => {
    Reflect.set(window, 'measuredRows', 0);
    if (!Reflect.get(window, 'measuredRowsWrapped')) {
      Reflect.set(window, 'measuredRowsWrapped', true);
      const prototype = CanvasRenderingContext2D.prototype;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- called below with the canvas context as `this`.
      const original = prototype.measureText;
      prototype.measureText = function measureText(this: CanvasRenderingContext2D, text: string): TextMetrics {
        // A leaderboard row reads `<rank> – <percent> <name>`.
        if (/^\d+ – /.test(text)) {
          Reflect.set(window, 'measuredRows', Number(Reflect.get(window, 'measuredRows')) + 1);
        }
        return original.call(this, text);
      };
    }
    window.paperio2api.game.topListChanged = true;
  });
  await stepPage(page);
  return page.evaluate(() => Number(Reflect.get(window, 'measuredRows')));
}
