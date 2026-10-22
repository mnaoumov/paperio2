/**
 * @file
 *
 * The enemy modes. Original, stored explicitly as a returning player's setting, must still play a recorded scenario
 * frame for frame like the shipped `app2.js`. Every other mode is played for 40 seconds of game time on the
 * reconstruction, with the whitebox demo autopilot as the player, and must show the behavior that names it.
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
import type { PageEnemySettings } from './page-instrumentation.ts';

import {
  launchBrowser,
  openVariant,
  runScenario,
  TS_ROOT
} from './harness.ts';
import { SCENARIOS } from './scenarios.ts';

const TIMEOUT_MILLISECONDS = 300_000;
const FRAME_MILLISECONDS = 1000 / 60;
const BOOT_FRAMES = 120;
/** 40 seconds of game time at 60 frames a second. */
const PLAY_FRAMES = 2400;
const SEED = 3;
const KILL_REASON_SELF_INTERSECTION = 1;
/** A crowded arena, for the blackbox bots that see only what is near them. */
const CROWDED_BOTS = 30;

interface ModeStats {
  /** Frames on which some bot was in `attack`. */
  readonly attackFrames: number;
  /** Bots killed by another bot. */
  readonly botKillsByBots: number;
  /** Bots that ran each distinct state table, at the last frame. */
  readonly distinctTables: number;
  /** The highest greed of any bot, against the config's maximum. */
  readonly greedRatio: number;
  /** The most bots in `attack` at once. */
  readonly maxAttacking: number;
  /** Bots outside their base during the second half of the run, summed over its frames. */
  readonly outsideLateFrames: number;
  /** Frames on which some bot hunted another bot. */
  readonly preyBotFrames: number;
  /** Frames on which some bot hunted the player. */
  readonly preyPlayerFrames: number;
  /** Bots that died crossing their own trail. */
  readonly selfKills: number;
}

async function playMode(browser: Browser, enemySettings: PageEnemySettings): Promise<ModeStats> {
  const scenario: Scenario = { expectedCoverage: {}, frames: 0, keys: [], name: enemySettings.mode, seed: SEED, startFrame: 0 };
  const page: Page = await openVariant(browser, 'reconstruction', scenario, { traceCanvas: false });
  try {
    await page.evaluate(
      async (frames: number, milliseconds: number) => {
        for (let frame = 0; frame < frames; frame++) {
          await window.__differential.step(milliseconds);
        }
      },
      BOOT_FRAMES,
      FRAME_MILLISECONDS
    );
    return await page.evaluate(
      async (frames: number, milliseconds: number, chosen: PageEnemySettings, selfReason: number): Promise<ModeStats> => {
        const api = window.paperio2api;
        if (!api.start || !api.attachAutopilot || !api.setEnemySettings) {
          throw new Error('This build has no enemy modes.');
        }
        api.setEnemySettings(chosen);
        api.start('Probe', '', undefined, undefined, undefined, true);
        window.__autopilot = api.attachAutopilot('whitebox');
        const { game } = api;
        game.renderer = null;
        let botKillsByBots = 0;
        let selfKills = 0;
        const kill = game.kill.bind(game);
        game.kill = (unit, killer, reason): void => {
          if (unit && !unit.isPlayer && !unit.death) {
            if (killer && !killer.isPlayer && killer !== unit) {
              botKillsByBots++;
            }
            if (reason === selfReason) {
              selfKills++;
            }
          }
          kill(unit, killer, reason);
        };
        let maxAttacking = 0;
        let attackFrames = 0;
        let preyBotFrames = 0;
        let preyPlayerFrames = 0;
        let outsideLateFrames = 0;
        let greedMax = 0;
        for (let frame = 0; frame < frames; frame++) {
          await window.__differential.step(milliseconds);
          let attacking = 0;
          let preyBot = false;
          let preyPlayer = false;
          for (const unit of game.units) {
            if (!unit.fsm) {
              continue;
            }
            greedMax = Math.max(greedMax, unit.greed ?? 0);
            if (unit.fsm.state === 'attack') {
              attacking++;
              const { prey } = unit.fsm.context;
              if (prey?.isPlayer) {
                preyPlayer = true;
              } else if (prey) {
                preyBot = true;
              }
            }
            if (frame >= frames / 2 && unit.in !== unit.base) {
              outsideLateFrames++;
            }
          }
          maxAttacking = Math.max(maxAttacking, attacking);
          attackFrames += attacking > 0 ? 1 : 0;
          preyBotFrames += preyBot ? 1 : 0;
          preyPlayerFrames += preyPlayer ? 1 : 0;
        }
        const tables = new Set(game.units.flatMap((unit) => unit.fsm ? [unit.fsm.states] : []));
        return {
          attackFrames,
          botKillsByBots,
          distinctTables: tables.size,
          greedRatio: greedMax / (game.config.botGreedMax ?? 1),
          maxAttacking,
          outsideLateFrames,
          preyBotFrames,
          preyPlayerFrames,
          selfKills
        };
      },
      PLAY_FRAMES,
      FRAME_MILLISECONDS,
      enemySettings,
      KILL_REASON_SELF_INTERSECTION
    );
  } finally {
    await page.browserContext().close();
  }
}

function settings(mode: string, vision: 'blackbox' | 'whitebox' = 'whitebox'): PageEnemySettings {
  return { count: null, level: null, mode, vision };
}

describe('the enemy modes', () => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    await promisify(execFile)(process.execPath, ['build.mjs'], { cwd: TS_ROOT });
    browser = await launchBrowser();
  }, TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    await browser?.close();
  });

  function requireBrowser(): Browser {
    if (!browser) {
      throw new Error('The browser did not start');
    }
    return browser;
  }

  it('plays a scenario identically to the original with Original stored explicitly', async () => {
    const scenario = SCENARIOS.find((candidate) => candidate.name === 'killed by a bot, bots play on');
    if (!scenario) {
      throw new Error('The scenario is missing');
    }
    const result = await runScenario(requireBrowser(), scenario, undefined, {
      storage: { 'paperio2.enemies': JSON.stringify(settings('original')) }
    });
    expect(result.divergence).toBeNull();
    expect(result.framesCompared).toBe(scenario.frames);
  }, TIMEOUT_MILLISECONDS);

  it('original: the bots hunt only the player', async () => {
    const stats = await playMode(requireBrowser(), settings('original'));
    expect(stats.preyBotFrames).toBe(0);
    expect(stats.distinctTables).toBe(1);
  }, TIMEOUT_MILLISECONDS);

  // At 15 bots and the ramped level the original's bots do not attack in this run either, so the comparison runs in a
  // Crowded arena at the hardest level, where they do.
  it.each(['whitebox', 'blackbox'] as const)('avoid (%s): no bot ever attacks where the original\'s do', async (vision) => {
    const original = await playMode(requireBrowser(), { ...settings('original'), count: CROWDED_BOTS, level: 1 });
    const stats = await playMode(requireBrowser(), { ...settings('avoid', vision), count: CROWDED_BOTS, level: 1 });
    expect(original.attackFrames).toBeGreaterThan(0);
    expect(stats.attackFrames).toBe(0);
  }, TIMEOUT_MILLISECONDS);

  it('chase (whitebox): several bots hunt at once', async () => {
    const stats = await playMode(requireBrowser(), settings('chase', 'whitebox'));
    expect(stats.maxAttacking).toBeGreaterThanOrEqual(3);
  }, TIMEOUT_MILLISECONDS);

  // With 15 bots the autopilot keeps every bot beyond its own view range for this whole run (measured: 1.26 view
  // Ranges at the closest), so a blackbox bot never sees it and plays the original's loop. Thirty bots crowd it.
  it('chase (blackbox): only the bots that see the player hunt it', async () => {
    const blackbox = await playMode(requireBrowser(), { ...settings('chase', 'blackbox'), count: CROWDED_BOTS });
    const whitebox = await playMode(requireBrowser(), { ...settings('chase', 'whitebox'), count: CROWDED_BOTS });
    expect(blackbox.attackFrames).toBeGreaterThan(0);
    expect(blackbox.maxAttacking).toBeLessThan(whitebox.maxAttacking);
  }, TIMEOUT_MILLISECONDS);

  it('suicidal: bots die on their own trails', async () => {
    const stats = await playMode(requireBrowser(), settings('suicidal'));
    expect(stats.selfKills).toBeGreaterThanOrEqual(3);
    expect(stats.attackFrames).toBe(0);
  }, TIMEOUT_MILLISECONDS);

  it('passive: no bot is outside its base in the second half', async () => {
    const stats = await playMode(requireBrowser(), settings('passive'));
    expect(stats.outsideLateFrames).toBe(0);
  }, TIMEOUT_MILLISECONDS);

  it('grabbers: greedier than the original allows, and never attack', async () => {
    const stats = await playMode(requireBrowser(), { ...settings('grabbers'), count: CROWDED_BOTS, level: 1 });
    expect(stats.greedRatio).toBeGreaterThan(1.5);
    expect(stats.attackFrames).toBe(0);
  }, TIMEOUT_MILLISECONDS);

  it('pack: more than one bot hunts at once', async () => {
    const stats = await playMode(requireBrowser(), settings('pack'));
    expect(stats.maxAttacking).toBeGreaterThanOrEqual(2);
  }, TIMEOUT_MILLISECONDS);

  it('free-for-all: bots hunt each other', async () => {
    const stats = await playMode(requireBrowser(), settings('free-for-all'));
    expect(stats.preyBotFrames).toBeGreaterThan(0);
  }, TIMEOUT_MILLISECONDS);

  it('civil war: bots hunt each other and never the player', async () => {
    const stats = await playMode(requireBrowser(), settings('civil-war'));
    expect(stats.preyBotFrames).toBeGreaterThan(0);
    expect(stats.preyPlayerFrames).toBe(0);
  }, TIMEOUT_MILLISECONDS);

  it('mixed: the bots run several modes', async () => {
    const stats = await playMode(requireBrowser(), settings('mixed'));
    expect(stats.distinctTables).toBeGreaterThanOrEqual(4);
  }, TIMEOUT_MILLISECONDS);
});
