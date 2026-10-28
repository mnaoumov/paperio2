import type {
  Browser,
  Page
} from 'puppeteer-core';

import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import {
  afterAll,
  beforeAll,
  expect,
  it
} from 'vitest';

import type {
  RolloutFrame,
  RolloutRequest
} from '../../src/rollout/protocol.ts';
import type { RolloutTestApi } from './rollout-page.ts';

import {
  applyFrameInput,
  launchBrowser,
  openVariant,
  stepPage,
  TS_ROOT
} from './harness.ts';

let browser: Browser;

beforeAll(async () => {
  await promisify(execFile)('node', ['build.mjs'], { cwd: TS_ROOT });
  browser = await launchBrowser();
});

afterAll(async () => {
  await browser.close();
});

it('runs in a real-clock browser sandbox without the deterministic test scheduler', async () => {
  const scenario = { expectedCoverage: {}, frames: 0, keys: [], name: 'native rollout', seed: 9, startFrame: 0 };
  const page = await openVariant(browser, 'reconstruction', scenario, { deterministic: false });
  try {
    await page.evaluate(() => {
      window.paperio2api.startGame();
    });
    await page.waitForFunction(() => 'game' in window.paperio2api && window.paperio2api.game.player !== null);
    await page.addScriptTag({ content: 'window.__rollout = window.paperio2api;' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    const result = await page.evaluate(async () => {
      const api = window.__rollout;
      api.game.pause();
      api.game.particles = [];
      return api.rollout({ frames: 100, inputs: [{ frame: 0, x: 1, y: 0 }], randomState: 12345 });
    });
    expect(result.frames.length).toBeGreaterThan(0);
    expect(result.elapsedMs).toBeGreaterThan(0);
    expect(await page.$('iframe')).toBeNull();
    expect(errors).toEqual([]);
    if (process.env['ROLLOUT_METRICS']) {
      await appendFile(process.env['ROLLOUT_METRICS'], `${JSON.stringify({ elapsedMs: result.elapsedMs, frames: result.frames.length, kind: 'native' })}\n`);
    }
  } finally {
    await page.browserContext().close();
  }
});

async function continuation(page: Page, request: RolloutRequest): Promise<RolloutFrame[]> {
  return page.evaluate((input) => {
    const game = window.__rollout.game;
    const frames: RolloutFrame[] = [];
    window.__differential.setRandomState(input.randomState);
    let index = 0;
    for (let frame = 0; frame < input.frames; frame++) {
      const direction = input.inputs[index];
      if (direction?.frame === frame) {
        game.direction.x = direction.x;
        game.direction.y = direction.y;
        game.direction.normalize();
        index++;
      }
      // As a live frame: the update's length is the difference of two clock readings.
      const before = game.clock.now();
      game.clock.setNow(before + (input.stepMs ?? 20));
      game.update(game.clock.now() - before);
      frames.push(window.__readRolloutFrame(game, frame, (window.__differential.randomState() + 4294967296) % 4294967296));
      if (game.pendingGameOver) {
        break;
      }
    }
    return frames;
  }, request);
}

async function facts(page: Page): Promise<string> {
  const serialized = await page.evaluate(async () => {
    const api: RolloutTestApi = window.__rollout;
    const snapshot = api.captureSnapshot();
    return JSON.stringify({
      cookies: document.cookie,
      dom: document.body.innerHTML,
      nextId: snapshot.nextId,
      payload: await api.encodeSnapshot(snapshot),
      pool: snapshot.graph.pool.map((vector) => [vector.x, vector.y]),
      random: window.__differential.randomState(),
      seeds: [snapshot.rngSeed, snapshot.nameManagerSeed, snapshot.skinManagerSeed],
      storage: Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]))
    });
  });
  return createHash('sha256').update(serialized).digest('hex');
}

async function prepared(): Promise<Page> {
  const scenario = { expectedCoverage: {}, frames: 150, keys: [], name: 'rollout', seed: 9, startFrame: 120 };
  const page = await openVariant(browser, 'reconstruction', scenario, { traceCanvas: false });
  for (let frame = 0; frame < 150; frame++) {
    await applyFrameInput(page, scenario, frame);
    await stepPage(page, 20);
  }
  const probe = await build({ bundle: true, stdin: { contents: 'import { readRolloutFrame } from \'./src/rollout/state.ts\'; window.__readRolloutFrame = readRolloutFrame; window.__rollout = window.paperio2api;', resolveDir: TS_ROOT }, write: false });
  await page.addScriptTag({ content: probe.outputFiles[0]?.text ?? '' });
  await page.evaluate(() => {
    const game = window.__rollout.game;
    game.pause();
    game.visible = false;
    // Fixtures start without cosmetic callbacks, which the transfer intentionally refuses.
    game.particles = [];
    game.controller.up = false;
    game.controller.down = false;
    game.controller.left = false;
    game.controller.right = false;
    game.controller.mouse = null;
    game.controller.lastMouse = null;
    const vectorClass = game.direction.constructor;
    const originalAlloc = vectorClass.alloc.bind(vectorClass);
    window.__poolAllocations = 0;
    vectorClass.alloc = (x, y): typeof game.direction => {
      window.__poolAllocations++;
      return originalAlloc(x, y);
    };
    const pool = vectorClass.pooled();
    const units = [...game.units];
    const skins = units.map((unit) => unit.skin);
    window.__rolloutIdentity = (): boolean => {
      const current = vectorClass.pooled();
      return current.length === pool.length && current.every((vector, index) => vector === pool[index])
        && game.units.length === units.length && game.units.every((unit, index) => unit === units[index] && unit.skin === skins[index]);
    };
  });
  return page;
}

it.each(['control', 'capture', 'self', 'cut', 'wall'])('matches %s continuation and leaves the live world unchanged', async (kind) => {
  const page = await prepared();
  try {
    const playerName = await page.evaluate(() => window.__rollout.game.player?.name);
    const request = await page.evaluate((fixture) => {
      const game = window.__rollout.game;
      const player = game.player;
      if (!player) {
        throw new Error('Missing player');
      }
      const inputs = [{ frame: 0, x: 1, y: 0 }, { frame: 100, x: 0, y: -1 }, { frame: 180, x: -1, y: 0 }, { frame: 280, x: 0, y: 1 }];
      if (fixture === 'capture') {
        const points = player.base.polygon.segments.map((segment) => segment.start);
        const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
        const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
        inputs.splice(0, inputs.length, { frame: 0, x: 1, y: 0 }, { frame: 60, x: 0, y: -1 }, { frame: 120, x: centerX - player.position.x - 108, y: centerY - player.position.y + 108 });
      }
      if (fixture === 'wall') {
        // A controlled situation at the arena's right wall, moving along it. The engine decides the slide/collision.
        player.position.x = 1949;
        player.position.y = 1000;
        player.in = null;
        inputs.splice(0, inputs.length, { frame: 0, x: 1, y: 1 });
      }
      if (fixture === 'cut') {
        const trail = player.track.polyline.segments[0];
        const bot = game.units.find((unit) => !unit.isPlayer);
        if (!trail || !bot?.fsm) {
          throw new Error('Missing trail or bot');
        }
        bot.position.x = (trail.start.x + trail.end.x) / 2;
        bot.position.y = (trail.start.y + trail.end.y) / 2 - 2;
        bot.in = null;
        bot.fsm.change('attack');
        inputs.splice(0, inputs.length, { frame: 0, x: 1, y: 0 });
      }
      return { frames: fixture === 'control' ? 30 : 600, inputs, randomState: 12345 };
    }, kind);
    if (kind === 'control') {
      request.inputs.splice(1);
    }
    const before = await facts(page);
    const captureStart = performance.now();
    const characters = await page.evaluate(async () => {
      const api = window.__rollout;
      return (await api.encodeSnapshot(api.captureSnapshot())).length;
    });
    const captureRoundtripMs = performance.now() - captureStart;
    const rolloutStart = performance.now();
    const result = await page.evaluate(async (input) => window.__rollout.rollout(input), request);
    const rolloutRoundtripMs = performance.now() - rolloutStart;
    expect(await facts(page), 'live state, pool, ids, RNG and DOM after success').toBe(before);
    const repeated = await page.evaluate(async (input) => window.__rollout.rollout(input), request);
    expect(repeated.frames).toEqual(result.frames);
    expect(await page.evaluate(() => window.__rolloutIdentity() && window.__poolAllocations === 0)).toBe(true);
    const actual = await continuation(page, request);
    expect(result.frames).toEqual(actual);
    expect(result.frames.flatMap((frame) => frame.units.map((unit) => unit.state))).toContain('capture');
    if (kind === 'control') {
      expect(result.death).toBeNull();
    }
    if (kind === 'capture') {
      expect(result.growth).toBeGreaterThan(0);
    }
    if (kind === 'cut') {
      expect(result.death?.reason).toBe(3);
    }
    if (kind === 'self') {
      expect(result.death?.reason).toBe(1);
    }
    if (kind === 'wall') {
      expect(result.frames).toHaveLength(600);
      const lastPlayer = result.frames.at(-1)?.units.find((unit) => unit.name === playerName);
      expect(lastPlayer?.x).toBeLessThan(1949);
      expect(lastPlayer?.y).toBeGreaterThan(1000);
    }
    const metrics = { captureRoundtripMs, characters, death: result.death, elapsedMs: result.elapsedMs, frames: result.frames.length, growth: result.growth, kind, returns: result.frames.at(-1)?.returns, rolloutRoundtripMs, states: [...new Set(result.frames.flatMap((frame) => frame.units.map((unit) => unit.state)))] };
    if (process.env['ROLLOUT_METRICS']) {
      await appendFile(process.env['ROLLOUT_METRICS'], `${JSON.stringify(metrics)}\n`);
    }
  } finally {
    await page.browserContext().close();
  }
});

it('matches a continuation at 60 fps frames', async () => {
  const page = await prepared();
  try {
    const request: RolloutRequest = { frames: 120, inputs: [{ frame: 0, x: 1, y: 0 }, { frame: 60, x: 0, y: -1 }], randomState: 12345, stepMs: 1000 / 60 };
    const result = await page.evaluate(async (input) => window.__rollout.rollout(input), request);
    expect(result.frames).toHaveLength(120);
    expect(result.frames).toEqual(await continuation(page, request));
  } finally {
    await page.browserContext().close();
  }
});

it('rejects invalid, aborted and unsupported requests without touching the live game', async () => {
  const page = await prepared();
  try {
    const before = await facts(page);
    const errors = await page.evaluate(async () => {
      const api = window.__rollout;
      const request = { frames: 1, inputs: [], randomState: 1 };
      const results: string[] = [];
      for (const frames of [0, 601, NaN]) {
        try {
          await api.rollout({ ...request, frames });
        } catch (error) {
          results.push(String(error));
        }
      }
      for (const stepMs of [0, 35]) {
        try {
          await api.rollout({ ...request, stepMs });
        } catch (error) {
          results.push(String(error));
        }
      }
      const abort = new AbortController();
      abort.abort();
      try {
        await api.rollout(request, abort.signal);
      } catch (error) {
        results.push(String(error));
      }
      api.game.particles.push({});
      try {
        await api.rollout(request);
      } catch (error) {
        results.push(String(error));
      } finally {
        api.game.particles.pop();
      }
      const during = new AbortController();
      const observer = new MutationObserver(() => {
        if (document.querySelector('iframe')) {
          during.abort();
        }
      });
      observer.observe(document.body, { childList: true });
      const pending = api.rollout(request, during.signal);
      try {
        await api.rollout(request);
      } catch (error) {
        results.push(String(error));
      }
      try {
        await pending;
      } catch (error) {
        results.push(String(error));
      } finally {
        observer.disconnect();
      }
      return results;
    });
    expect(errors).toHaveLength(9);
    expect(await facts(page)).toBe(before);
    expect(await page.evaluate(() => window.__rolloutIdentity() && window.__poolAllocations === 0)).toBe(true);
    // A valid graph referring to an unavailable skin fails inside the child after capture.
    const failure = await page.evaluate(async () => {
      const skin = window.__rollout.game.player?.skin;
      if (!skin) {
        throw new Error('Missing player skin');
      }
      const name = skin.name;
      skin.name = 'missing-rollout-skin';
      try {
        await window.__rollout.rollout({ frames: 1, inputs: [], randomState: 1 });
        return '';
      } catch (error) {
        return String(error);
      } finally {
        skin.name = name;
      }
    });
    expect(failure).toContain('This save uses a skin this game does not have');
    expect(await facts(page)).toBe(before);
    await page.evaluate(async () => window.__rollout.rollout({ frames: 1, inputs: [], randomState: 1 }));
    expect(await facts(page)).toBe(before);
  } finally {
    await page.browserContext().close();
  }
});
