/**
 * @file
 * Exercises the minimap-to-audio seam on one real game page. Hidden capture state is silent until rendered, and a
 * rendered loss is logged even with effects muted. Trail changes, respawns, pause and death must not cause alerts.
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

import type {
  PageConfig,
  PagePoint,
  PagePolygon,
  PageSpatialGrid,
  PageTerritory,
  PageTrail,
  PageUnit,
  PaperIo2PageGame
} from './page-instrumentation.ts';

import { INTEGRATION_TEST_TIMEOUT_MILLISECONDS } from '../../scripts/integration-timeout.ts';
import {
  launchBrowser,
  openVariant,
  stepPage,
  TS_ROOT
} from './harness.ts';

const TIMEOUT_MILLISECONDS = INTEGRATION_TEST_TIMEOUT_MILLISECONDS;
const BOOT_FRAMES = 10;

interface LossTestConfig extends PageConfig {
  unitSpeed: number;
}

/** The reconstruction-only fields this fixture writes; the shared harness also supports the original engine. */
interface LossTestGame extends PaperIo2PageGame {
  config: LossTestConfig;
  handleUnitMovements(milliseconds: number): void;
  pause(): void;
  player: LossTestPlayer | null;
  renderer(game: LossTestGame): void;
  resume(): void;
  sounds: LossTestSounds | null;
  space: LossTestGrid;
  units: LossTestPlayer[];
  videoRecorder: LossTestRecorder;
}

interface LossTestGrid extends PageSpatialGrid {
  center: LossTestPoint;
}

interface LossTestPlayer extends PageUnit {
  base: LossTestTerritory;
  cities: unknown[];
  death: boolean;
  direction: number;
  in: unknown;
  isPlayer: boolean;
  movement(): LossTestPoint | null;
  position: LossTestPoint;
  track: LossTestTrail;
}

interface LossTestPoint extends PagePoint {
  clone(): LossTestPoint;
  set(x: number, y: number): LossTestPoint;
  x: number;
  y: number;
}

interface LossTestPolygon extends PagePolygon {
  calcPath(): void;
  points(): LossTestPoint[];
}

interface LossTestRecorder {
  afterFrame(): void;
  onCheckpoint(): void;
  onRespawn(): void;
  onSound(name: string): void;
}

interface LossTestSounds {
  onRespawn(): void;
}

interface LossTestTerritory extends PageTerritory {
  calcSquare(): void;
  constructor: LossTestTerritoryConstructor;
  polygon: LossTestPolygon;
  remove(): void;
}

type LossTestTerritoryConstructor = new (unit: LossTestPlayer, points: LossTestPoint[]) => LossTestTerritory;

interface LossTestTrail extends PageTrail {
  length: number;
  remove(): void;
}

describe('the minimap territory-loss cue', () => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    await promisify(execFile)(process.execPath, ['build.mjs'], { cwd: TS_ROOT });
    browser = await launchBrowser();
    // Keep one page in total, including Chrome's initial blank tab.
    for (const page of await browser.pages()) {
      await page.close();
    }
  }, TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    await browser?.close();
  });

  it('logs a real bot capture only when its stolen area reaches the minimap', async () => {
    if (!browser) {
      throw new Error('The browser did not start');
    }
    const page = await openVariant(browser, 'reconstruction', { expectedCoverage: {}, frames: 0, keys: [], name: 'bot capture', seed: 9, startFrame: 0 }, {
      storage: { 'paperio2.effects': 'off', 'paperio2.music': 'off' },
      traceCanvas: false
    });
    try {
      await page.evaluate(() => {
        window.paperio2api.startGame();
      });
      for (let frame = 0; frame < BOOT_FRAMES; frame++) {
        await stepPage(page);
      }
      const result = await page.evaluate(() => {
        const game = window.paperio2api.game as LossTestGame;
        const player = game.player;
        const bot = game.units.find((unit) => !unit.isPlayer);
        if (!player || !bot) {
          throw new Error('No player or bot');
        }
        const heard: string[] = [];
        function noop(): undefined {
          return undefined;
        }
        game.videoRecorder = {
          afterFrame: noop,
          onCheckpoint: noop,
          onRespawn: noop,
          onSound(name: string): void {
            heard.push(name);
          }
        };
        const center = game.space.center;
        function point(x: number, y: number): LossTestPoint {
          return center.clone().set(center.x + x, center.y + y);
        }
        function rectangle(left: number, width: number): LossTestPoint[] {
          // The grid indexes vertices, so edges need the same short spacing as normal engine territories.
          const points: LossTestPoint[] = [];
          for (let x = 0; x < width; x += 20) {
            points.push(point(left + x, 0));
          }
          for (let y = 0; y < 600; y += 20) {
            points.push(point(left + width, y));
          }
          for (let x = width; x > 0; x -= 20) {
            points.push(point(left + x, 600));
          }
          for (let y = 600; y > 0; y -= 20) {
            points.push(point(left, y));
          }
          return points;
        }
        // Use the live engine's constructors and spatial grid. The bot makes a rectangular loop through the base.
        const Territory = player.base.constructor;
        for (const unit of game.units) {
          unit.base.remove();
          unit.track.remove();
        }
        game.units = [player, bot];
        player.base = new Territory(player, rectangle(0, 600));
        bot.base = new Territory(bot, rectangle(-500, 300));
        player.position = point(500, 500);
        bot.position = point(-300, 100);
        for (const unit of game.units) {
          unit.in = unit.base;
          unit.cities = [];
        }
        player.movement = (): null => null;
        game.config.unitSpeed = 1000;
        const beforeArea = player.base.square;
        game.sounds?.onRespawn();
        game.renderer(game);
        const attacker = bot;
        const route: string[] = [];
        function leg(angle: number, milliseconds: number): void {
          attacker.direction = angle;
          attacker.movement = (): LossTestPoint => center.clone().set(Math.cos(angle), Math.sin(angle));
          game.handleUnitMovements(milliseconds);
          route.push(JSON.stringify({ angle, base: attacker.base.square, dead: attacker.death, home: attacker.in === attacker.base, length: attacker.track.length, x: attacker.position.x - center.x, y: attacker.position.y - center.y }));
        }
        leg(0, 600);
        const pendingArea = player.base.square;
        game.renderer(game);
        const pending = heard.filter((name) => name === 'territory-loss').length;
        leg(Math.PI / 2, 300);
        leg(Math.PI, 600);
        const capturedArea = player.base.square;
        const hidden = heard.filter((name) => name === 'territory-loss').length;
        game.renderer(game);
        const visible = heard.filter((name) => name === 'territory-loss').length;
        return { beforeArea, capturedArea, hidden, pending, pendingArea, route, visible };
      });
      expect(result.pendingArea).toBe(result.beforeArea);
      expect(result.capturedArea, JSON.stringify(result)).toBeLessThan(result.beforeArea);
      expect(result.pending).toBe(0);
      expect(result.hidden).toBe(0);
      expect(result.visible).toBe(1);
    } finally {
      await page.browserContext().close();
    }
  }, TIMEOUT_MILLISECONDS);

  it('waits for the minimap, records muted losses once, and resets across respawns', async () => {
    if (!browser) {
      throw new Error('The browser did not start');
    }
    const page = await openVariant(browser, 'reconstruction', { expectedCoverage: {}, frames: 0, keys: [], name: 'territory loss', seed: 9, startFrame: 0 }, {
      storage: { 'paperio2.effects': 'off', 'paperio2.music': 'off' },
      traceCanvas: false
    });
    try {
      await page.evaluate(() => {
        window.paperio2api.startGame();
      });
      for (let frame = 0; frame < BOOT_FRAMES; frame++) {
        await stepPage(page);
      }
      const result = await page.evaluate(() => {
        const game = window.paperio2api.game as LossTestGame;
        const { player, sounds } = game;
        if (!player || !sounds) {
          throw new Error('The run has no player or sound observer');
        }
        const heard: string[] = [];
        function noop(): undefined {
          return undefined;
        }
        game.videoRecorder = {
          afterFrame: noop,
          onCheckpoint: noop,
          onRespawn: noop,
          onSound(name: string): void {
            heard.push(name);
          }
        };
        function losses(): number {
          return heard.filter((name) => name === 'territory-loss').length;
        }
        function shrink(target: LossTestPlayer): void {
          // A captured slice changes the polygon and path, just as handleReturn's victim merge does.
          const origin = target.base.polygon.points()[0];
          if (!origin) {
            throw new Error('No polygon');
          }
          for (const point of target.base.polygon.points().slice(1)) {
            point.x = origin.x + (point.x - origin.x) / 2;
            point.y = origin.y + (point.y - origin.y) / 2;
          }
          target.base.polygon.calcPath();
          target.base.calcSquare();
        }
        game.renderer(game);
        // Enemy planning and the player's live trail have no bearing on the rendered own-area observer.
        const enemy = game.units.find((unit) => !unit.isPlayer);
        if (enemy) {
          enemy.in = player.base;
        }
        player.track.length += 1000;
        game.renderer(game);
        const pending = losses();
        shrink(player);
        const hidden = losses();
        game.renderer(game);
        const visible = losses();
        game.renderer(game);
        shrink(player);
        game.renderer(game);
        const burst = losses();
        sounds.onRespawn();
        shrink(player);
        game.renderer(game);
        const respawn = losses();
        game.pause();
        shrink(player);
        game.renderer(game);
        const paused = losses();
        game.resume();
        player.death = true;
        shrink(player);
        game.renderer(game);
        return { burst, dead: losses(), hidden, paused, pending, respawn, visible };
      });
      expect(result).toEqual({ burst: 1, dead: 1, hidden: 0, paused: 1, pending: 0, respawn: 1, visible: 1 });
    } finally {
      await page.browserContext().close();
    }
  }, TIMEOUT_MILLISECONDS);
});
