/**
 * @file
 *
 * The rollout fidelity benchmark: how faithfully an engine rollout (`paperio2api.rollout`) forecasts the live game
 * flying the same loop schedule, and which difference between the two makes them part.
 *
 * Per seed, the whitebox pilot plays the live game (the benchmark's page, virtual clock, seeded `Math.random`) up to
 * each capture time, then on to the first frame where the player is at home with no game timer pending. From that one
 * moment it asks rollouts of each loop schedule (20 ms or 60 fps frames, from a foreign or the live `Math.random`
 * state), and flies the same schedule in the live game, restored to that moment for every flight: by the step the
 * rollout held (`aligned`), by the pilot's `floor((now - start) / step)` (`pilot`), and with the moment's particles
 * kept (`particles`), which a rollout cannot carry. Each flight sets `game.direction` right before the update reads its
 * input, as the rollout does. Then the whitebox carries on from the same moment, so the next capture is the run's own.
 *
 * `npm run benchmark:fidelity -- --seeds 8 --first-seed 65 --captures 20,45,70 --parallel 2 [--out <file.jsonl>]`
 */

import type { Page } from 'puppeteer-core';

import { build } from 'esbuild';
import { appendFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import type { RolloutRequest } from '../../src/rollout/protocol.ts';
import type { Scenario } from '../differential/harness.ts';
import type {
  Comparison,
  Difference,
  Direction,
  IndexRule,
  ScheduleShape,
  Track
} from './fidelity.ts';

import {
  launchBrowser,
  openVariant,
  TS_ROOT
} from '../differential/harness.ts';
import { buildBenchmark } from './build.ts';
import {
  compareTracks,
  firstDifference,
  loopSchedule,
  median,
  quantile,
  SCHEDULE_STEP_MS,
  scheduleIndex,
  scheduleInputs,
  trackOf
} from './fidelity.ts';

/** What a live flight needs inside the page. */
interface LiveFlight {
  /** The schedule step each update reads, by update. */
  readonly indexOf: readonly number[];
  readonly keepParticles: boolean;
  readonly stepMs: number;
  /** How far an update's clock may be from one frame per update. */
  readonly tolerance: number;
}

/** One comparison of one situation. */
interface Row {
  readonly comparison: Comparison;
  readonly difference: Difference | null;
  readonly forecastDeathMs: null | number;
  readonly label: string;
  readonly liveDeathMs: null | number;
  readonly shape: ScheduleShape;
  readonly situation: string;
}

/** One run of a schedule: a rollout, or a live flight. */
interface Run {
  readonly label: RunLabel;
  readonly track: Track;
}

type RunLabel = 'L aligned' | 'L aligned again' | 'L particles' | 'L pilot' | 'R20 foreign' | 'R20 foreign 2' | 'R20 live' | 'R60 foreign' | 'R60 live';

interface Situation {
  readonly clock: number;
  readonly outward: Direction;
  readonly particles: number;
  readonly player: string;
  readonly random: number;
  readonly seconds: number;
}

const MILLISECONDS_PER_SECOND = 1000;
const FRAMES_PER_SECOND = 60;
const LIVE_STEP_MS = MILLISECONDS_PER_SECOND / FRAMES_PER_SECOND;
/** The menu frames before the run starts, as in the autopilot benchmark. */
const BOOT_FRAMES = 120;
/** How long a schedule lasts: past the 4 s mark, enough for a loop of a few hundred units. */
const SCHEDULE_MS = 4500;
const SHAPES: readonly ScheduleShape[] = ['square', 'arc'];
/** How long after a capture time the player may take to be home with no timer pending before the seed is given up. */
const SEEK_LIMIT_SECONDS = 30;
/** Golden-ratio increments give each foreign request its own random state, as the experimental planner does. */
const RANDOM_STATE_STEP = 0x9e_37_79_b9;
// eslint-disable-next-line no-magic-numbers -- the moments the report compares at.
const MARKS_MS: readonly number[] = [500, 1000, 2000, 4000];
const P90 = 0.9;
const HALF = 2;
const DIGITS = 1;
const PERCENT = 100;
/** The comparisons reported, forecast first, each separating one difference. */
const COMPARISONS: readonly (readonly [RunLabel, RunLabel])[] = [
  ['L aligned again', 'L aligned'],
  ['R60 live', 'L aligned'],
  ['R60 foreign', 'L aligned'],
  ['R20 live', 'L aligned'],
  ['R20 foreign', 'L aligned'],
  ['R20 foreign', 'R20 foreign 2'],
  ['R60 live', 'L pilot'],
  ['R60 live', 'L particles'],
  ['R20 foreign', 'L pilot']
];

const { values } = parseArgs({
  options: {
    'captures': { default: '20,45,70', type: 'string' },
    'first-seed': { default: '65', type: 'string' },
    'out': { type: 'string' },
    'parallel': { default: process.env['BULK_CORES'] ?? '2', type: 'string' },
    'seeds': { default: '8', type: 'string' }
  }
});
const captures = values.captures.split(',').map(Number);
if (captures.some((seconds) => !(seconds > 0))) {
  throw new Error(`--captures takes comma-separated seconds (quote it in PowerShell): ${values.captures}`);
}
const seeds = Array.from({ length: Number(values.seeds) }, (_unused, index) => Number(values['first-seed']) + index);
const parallel = Math.max(1, Number(values.parallel));

const benchmarkBuild = await buildBenchmark();
print(`Build: ${JSON.stringify(benchmarkBuild.identity)}`);
const probe = await build({
  bundle: true,
  stdin: { contents: 'import { readRolloutFrame } from \'./src/rollout/state.ts\'; window.__fidelityFrame = readRolloutFrame; window.__fidelity = window.paperio2api;', resolveDir: TS_ROOT },
  write: false
});
const probeSource = probe.outputFiles[0]?.text ?? '';
const browser = await launchBrowser();
const rows: Row[] = [];
try {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, seeds.length) }, async () => {
    for (let seed = seeds[next++]; seed !== undefined; seed = seeds[next++]) {
      rows.push(...await playSeed(seed));
    }
  }));
} finally {
  await browser.close();
}
print('');
print(report(rows));

async function capture(page: Page): Promise<Situation> {
  return page.evaluate((millisecondsPerSecond: number) => {
    const api = window.__fidelity;
    const { game } = api;
    const { player } = game;
    if (!player) {
      throw new Error('No player to capture.');
    }
    const points = player.base.polygon.segments.map((segment) => segment.start);
    const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const away = Math.hypot(player.position.x - centerX, player.position.y - centerY);
    // At the centre any way is out; otherwise the loop leaves through the nearest side.
    const outward = away > 1 ? { x: (player.position.x - centerX) / away, y: (player.position.y - centerY) / away } : { x: 1, y: 0 };
    const start = {
      clock: game.clock.now(),
      host: window.__differential.now(),
      pilot: window.__autopilot?.whitebox?.saveState(window.paperio2api.game) ?? null,
      random: window.__differential.randomState(),
      snapshot: api.captureSnapshot()
    };
    window.__fidelityStart = start;
    const startTime = window.paperio2api.game.startTime ?? 0;
    // The page's generator keeps a signed state; a rollout takes the same bits unsigned.
    // eslint-disable-next-line no-bitwise -- the unsigned view of a 32-bit state.
    return { clock: start.clock, outward, particles: game.particles.length, player: player.name, random: start.random >>> 0, seconds: (start.clock - startTime) / millisecondsPerSecond };
  }, MILLISECONDS_PER_SECOND);
}

/**
 * Restores the captured moment and flies a schedule in the live game, frame by frame.
 *
 * @param page - The page, at any moment after {@link capture}.
 * @param schedule - Directions on the {@link SCHEDULE_STEP_MS} grid.
 * @param rule - How an update picks its step.
 * @param keepParticles - Whether the moment's particles stay, which a rollout cannot carry.
 * @returns The live frames, read the way a rollout reads its own.
 */
async function fly(page: Page, schedule: readonly Direction[], rule: IndexRule, keepParticles: boolean): Promise<Track> {
  const indices = Array.from({ length: Math.ceil(SCHEDULE_MS / LIVE_STEP_MS) }, (_unused, frame) => frame);
  const frames = await page.evaluate(
    async (directions: readonly Direction[], live: LiveFlight) => {
      const api = window.__fidelity;
      const start = window.__fidelityStart;
      if (!start) {
        throw new Error('Nothing captured.');
      }
      window.__autopilot?.detach();
      window.__differential.warpClock(start.host);
      api.restoreSnapshot(start.snapshot);
      window.__differential.setRandomState(start.random);
      const { game } = api;
      if (!live.keepParticles) {
        game.particles = [];
      }
      const { controller } = game;
      controller.up = false;
      controller.down = false;
      controller.left = false;
      controller.right = false;
      controller.mouse = null;
      controller.lastMouse = null;
      let updates = 0;
      let misplaced = 0;
      game.autopilot = {
        afterFrame(): void {
          // The flight only steers.
        },
        beforeInput(): void {
          // The live loop takes one update per 60 fps frame, read at the frame's end, so update n reads the step
          // Node worked out for frame n. An update anywhere else is counted and reported.
          if (Math.abs(game.clock.now() - start.clock - (updates + 1) * live.stepMs) > live.tolerance) {
            misplaced++;
          }
          const direction = directions[live.indexOf[Math.min(updates, live.indexOf.length - 1)] ?? 0];
          if (direction) {
            game.direction.x = direction.x;
            game.direction.y = direction.y;
            game.direction.normalize();
          }
          updates++;
        }
      };
      const recorded = [];
      for (let frame = 0; frame < live.indexOf.length; frame++) {
        await window.__differential.step(live.stepMs);
        recorded.push(window.__fidelityFrame(game, frame, window.__differential.randomState()));
        if (game.pendingGameOver) {
          break;
        }
      }
      game.autopilot = null;
      if (misplaced > 0) {
        throw new Error(`${String(misplaced)} live update(s) did not fall one per 60 fps frame.`);
      }
      return recorded;
    },
    schedule,
    { indexOf: indices.map((frame) => scheduleIndex((frame + 1) * LIVE_STEP_MS, rule, schedule.length)), keepParticles, stepMs: LIVE_STEP_MS, tolerance: LIVE_STEP_MS / HALF }
  );
  const situationClock = await page.evaluate(() => window.__fidelityStart?.clock ?? 0);
  if (frames[0] && Math.abs(frames[0].time - situationClock - LIVE_STEP_MS) > 1) {
    throw new Error(`The first live frame came ${String(frames[0].time - situationClock)} ms after the capture, not one frame.`);
  }
  return trackOf(frames, situationClock);
}

async function forecast(page: Page, situation: Situation, schedule: readonly Direction[], stepMs: number, randomState: number): Promise<Track> {
  const frames = Math.ceil(SCHEDULE_MS / stepMs);
  const request: RolloutRequest = { frames, inputs: scheduleInputs(schedule, stepMs, frames, 'aligned'), randomState, stepMs };
  const result = await page.evaluate(async (input: RolloutRequest) => {
    const api = window.__fidelity;
    const start = window.__fidelityStart;
    if (!start) {
      throw new Error('Nothing captured.');
    }
    window.__autopilot?.detach();
    window.__differential.warpClock(start.host);
    api.restoreSnapshot(start.snapshot);
    window.__differential.setRandomState(start.random);
    const { game } = api;
    // A rollout refuses particles, so it starts without them; the transfer is taken before the first await.
    const kept = game.particles;
    game.particles = [];
    const pending = api.rollout(input);
    game.particles = kept;
    return pending;
  }, request);
  return trackOf(result.frames, situation.clock);
}

function format(value: null | number): string {
  return value === null ? '-' : value.toFixed(DIGITS);
}

async function playSeed(seed: number): Promise<Row[]> {
  const scenario: Scenario = { expectedCoverage: {}, frames: 0, keys: [], name: `fidelity ${String(seed)}`, seed, startFrame: 0 };
  const page = await openVariant(browser, 'reconstruction', scenario, { bundle: benchmarkBuild.bundle, traceCanvas: false });
  const seedRows: Row[] = [];
  try {
    await page.evaluate(
      async (frames: number, milliseconds: number) => {
        for (let frame = 0; frame < frames; frame++) {
          await window.__differential.step(milliseconds);
        }
        const api = window.paperio2api;
        if (!api.start || !api.attachAutopilot) {
          throw new Error('This build has no autopilot.');
        }
        api.start('Autopilot', '', undefined, undefined, undefined, true);
        window.__autopilot = api.attachAutopilot('whitebox');
        // Rendering changes no game state, and the whitebox pilot does not look at the pixels.
        api.game.renderer = null;
      },
      BOOT_FRAMES,
      LIVE_STEP_MS
    );
    await page.addScriptTag({ content: probeSource });
    let request = seed * captures.length;
    for (const captureSeconds of captures) {
      const reached = await seek(page, captureSeconds);
      if (!reached) {
        print(`seed ${String(seed)}: no situation at ${String(captureSeconds)} s (the player died, or was never home with no timer)`);
        break;
      }
      const situation = await capture(page);
      const name = `seed ${String(seed)} at ${situation.seconds.toFixed(DIGITS)} s`;
      for (const shape of SHAPES) {
        const schedule = loopSchedule(shape, situation.outward, SCHEDULE_MS);
        /* eslint-disable no-bitwise -- unsigned 32-bit random states. */
        const foreign = Math.imul(++request, RANDOM_STATE_STEP) >>> 0;
        const foreign2 = Math.imul(foreign, RANDOM_STATE_STEP) >>> 0;
        /* eslint-enable no-bitwise -- end of the random states. */
        const runs: Run[] = [
          { label: 'R20 foreign', track: await forecast(page, situation, schedule, SCHEDULE_STEP_MS, foreign) },
          { label: 'R20 foreign 2', track: await forecast(page, situation, schedule, SCHEDULE_STEP_MS, foreign2) },
          { label: 'R20 live', track: await forecast(page, situation, schedule, SCHEDULE_STEP_MS, situation.random) },
          { label: 'R60 foreign', track: await forecast(page, situation, schedule, LIVE_STEP_MS, foreign) },
          { label: 'R60 live', track: await forecast(page, situation, schedule, LIVE_STEP_MS, situation.random) },
          { label: 'L aligned', track: await fly(page, schedule, 'aligned', false) },
          { label: 'L aligned again', track: await fly(page, schedule, 'aligned', false) },
          { label: 'L pilot', track: await fly(page, schedule, 'pilot', false) },
          { label: 'L particles', track: await fly(page, schedule, 'aligned', true) }
        ];
        const shapeRows = COMPARISONS.flatMap(([left, right]) => {
          const a = runs.find((run) => run.label === left);
          const b = runs.find((run) => run.label === right);
          return a && b
            ? [{ comparison: compareTracks(a.track, b.track, situation.player, SCHEDULE_MS), difference: firstDifference(a.track, b.track), forecastDeathMs: a.track.deathMs, label: `${left} vs ${right}`, liveDeathMs: b.track.deathMs, shape, situation: name }]
            : [];
        });
        seedRows.push(...shapeRows);
        const matched = shapeRows.find((row) => row.label === 'R60 live vs L aligned')?.difference;
        if (matched) {
          print(`${name} ${shape}: a 60 fps rollout from the live state first differs from the live game at ${matched.elapsedMs.toFixed(DIGITS)} ms, ${matched.unit} ${matched.field} ${matched.forecast} vs ${matched.live}`);
        }
        const main = shapeRows.find((row) => row.label === 'R20 foreign vs L pilot');
        print(`${name} ${shape} (${String(situation.particles)} particles): player apart from ${format(main?.comparison.firstPlayerMs ?? null)} ms, a bot state from ${format(main?.comparison.firstStateMs ?? null)} ms; deaths ${format(main?.forecastDeathMs ?? null)} / ${format(main?.liveDeathMs ?? null)} ms`);
        if (values.out !== undefined) {
          await appendFile(values.out, shapeRows.map((row) => `${JSON.stringify(row)}\n`).join(''));
        }
      }
      await resume(page);
    }
  } finally {
    await page.browserContext().close();
  }
  return seedRows;
}

function pointsAt(selected: readonly Row[], mark: number): Comparison['points'][number][] {
  return selected.flatMap((row) => row.comparison.points.filter((point) => point.elapsedMs === mark));
}

function print(text: string): void {
  process.stdout.write(`${text}\n`);
}

function report(allRows: readonly Row[]): string {
  const lines: string[] = [];
  for (const shape of SHAPES) {
    lines.push(`### ${shape} loops`, '');
    lines.push(`| Forecast vs live | n | ${MARKS_MS.map((mark) => `player err ${String(mark / MILLISECONDS_PER_SECOND)} s (median / p90)`).join(' | ')} | ${MARKS_MS.map((mark) => `bot err ${String(mark / MILLISECONDS_PER_SECOND)} s`).join(' | ')} | ${MARKS_MS.map((mark) => `state differs ${String(mark / MILLISECONDS_PER_SECOND)} s`).join(' | ')} | first player / state split (median) | deaths both / forecast only / live only |`);
    lines.push(`| --- | --- | ${[...MARKS_MS, ...MARKS_MS, ...MARKS_MS].map(() => '---').join(' | ')} | --- | --- |`);
    for (const [left, right] of COMPARISONS) {
      const label = `${left} vs ${right}`;
      const selected = allRows.filter((row) => row.shape === shape && row.label === label);
      function at(mark: number): ReturnType<typeof pointsAt> {
        return pointsAt(selected, mark);
      }
      const playerCells = MARKS_MS.map((mark) => {
        const errors = at(mark).flatMap((point) => point.playerError === null ? [] : [point.playerError]);
        return `${format(median(errors))} / ${format(quantile(errors, P90))}`;
      });
      const botCells = MARKS_MS.map((mark) => format(median(at(mark).flatMap((point) => point.botErrorMedian === null ? [] : [point.botErrorMedian]))));
      const stateCells = MARKS_MS.map((mark) => {
        const points = at(mark);
        return points.length ? `${(points.filter((point) => point.stateMismatches > 0).length / points.length * PERCENT).toFixed(0)}%` : '-';
      });
      const firstSplit = `${format(median(selected.map((row) => row.comparison.firstPlayerMs ?? SCHEDULE_MS)))} / ${format(median(selected.map((row) => row.comparison.firstStateMs ?? SCHEDULE_MS)))}`;
      const both = selected.filter((row) => row.forecastDeathMs !== null && row.liveDeathMs !== null).length;
      const forecastOnly = selected.filter((row) => row.forecastDeathMs !== null && row.liveDeathMs === null).length;
      const liveOnly = selected.filter((row) => row.forecastDeathMs === null && row.liveDeathMs !== null).length;
      lines.push(`| ${label} | ${String(selected.length)} | ${playerCells.join(' | ')} | ${botCells.join(' | ')} | ${stateCells.join(' | ')} | ${firstSplit} | ${String(both)} / ${String(forecastOnly)} / ${String(liveOnly)} |`);
    }
    lines.push('');
  }
  lines.push(`Errors are world units. A split never seen counts as ${String(SCHEDULE_MS)} ms. A comparison stops at the first death in either run.`);
  return lines.join('\n');
}

/**
 * Puts the live game back to the captured moment and gives it back to the whitebox pilot, which carries on as if no
 * flight had happened.
 *
 * @param page - The page.
 */
async function resume(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = window.paperio2api;
    const start = window.__fidelityStart;
    if (!start || !api.restoreSnapshot || !api.attachAutopilot) {
      throw new Error('Nothing to resume.');
    }
    window.__autopilot?.detach();
    window.__differential.warpClock(start.host);
    api.restoreSnapshot(start.snapshot);
    window.__differential.setRandomState(start.random);
    window.__autopilot = api.attachAutopilot('whitebox');
    window.__autopilot.whitebox?.restoreState(structuredClone(start.pilot), api.game);
  });
}

/**
 * Plays the whitebox on to a capture time, then to the first frame from which a rollout can start with the player at
 * home.
 *
 * @param page - The page.
 * @param seconds - The capture time, in game seconds since the run started.
 * @returns Whether such a frame came.
 */
async function seek(page: Page, seconds: number): Promise<boolean> {
  return page.evaluate(
    async (target: number, limit: number, milliseconds: number, millisecondsPerSecond: number) => {
      const { game } = window.paperio2api;
      function elapsed(): number {
        return (game.clock.now() - (game.startTime ?? 0)) / millisecondsPerSecond;
      }
      function ready(): boolean {
        const { player } = game;
        return player !== null && !game.pendingGameOver && player.in === player.base && game.clock.pendingTimers === 0;
      }
      while (elapsed() < target + limit) {
        if (game.pendingGameOver || !game.player) {
          return false;
        }
        if (elapsed() >= target && ready()) {
          return true;
        }
        await window.__differential.step(milliseconds);
      }
      return false;
    },
    seconds,
    SEEK_LIMIT_SECONDS,
    LIVE_STEP_MS,
    MILLISECONDS_PER_SECOND
  );
}
