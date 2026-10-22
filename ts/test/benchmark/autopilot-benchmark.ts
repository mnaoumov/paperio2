/**
 * @file
 *
 * The autopilot benchmark: plays N seeds per autopilot mode on the reconstruction, at full speed, and reports how
 * often each mode wins, how fast and how it dies. It reuses the differential test's page (served from the repository
 * through request interception, `Math.random` seeded, a virtual clock and scheduler), with canvas tracing off, and
 * steps the page's own game loop one 60 fps frame at a time inside the page, so a run is the live game, frame for
 * frame, and the same seed replays the same run. The whitebox mode runs with rendering off, which changes no game
 * state; the blackbox mode renders every frame, because pixels are all it sees.
 *
 * `npm run benchmark -- --modes whitebox,blackbox --enemies original,chase:blackbox --seeds 10 --first-seed 1 --max-minutes 20 --parallel 4 [--why]`
 *
 * `--enemies` takes the enemy modes to play against, each `<mode>` or `<mode>:<vision>` (`whitebox` by default), and reports a row
 * per autopilot mode and enemy mode.
 *
 * `--why` prints, for every run that does not win, its last phase changes and how its killer was behaving, and the
 * whitebox pilot's decision counts with the ground it gained and lost.
 */

import type {
  Browser,
  Page
} from 'puppeteer-core';

import {
  mkdir,
  writeFile
} from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import type { Scenario } from '../differential/harness.ts';
import type { PageEnemySettings } from '../differential/page-instrumentation.ts';

import {
  launchBrowser,
  openVariant
} from '../differential/harness.ts';

/** How `--dump` draws a frame: the frame, and beside it the pilot's classes, its remembered trail and its aim. */
interface DumpStyle {
  readonly aimColor: string;
  readonly aimRadius: number;
  readonly classColors: readonly (readonly number[])[];
  /** The frame and the class map side by side. */
  readonly panels: number;
  /** Every this many kept frames is written. */
  readonly stride: number;
  /** By the remembered trail's raster value; `null` shows the class beneath. */
  readonly trackColors: readonly (null | readonly number[])[];
  readonly unknownColor: readonly number[];
}

interface Job {
  /** The enemy mode, `<mode>` or `<mode>:<vision>`. */
  readonly enemies: string;
  readonly mode: Mode;
  readonly seed: number;
}

type Mode = 'blackbox' | 'whitebox';

interface Outcome {
  readonly enemies: string;
  readonly mode: Mode;
  readonly percent: number;
  readonly reason: null | string;
  readonly seconds: number;
  readonly seed: number;
  readonly wallSeconds: number;
}

interface PageState {
  readonly done: boolean;
  /** Trace lines, when asked for: every phase change and the killer's state. */
  readonly log: readonly string[];
  readonly percent: number;
  readonly reason: null | number;
  readonly seconds: number;
}

/** Numbers the page-side step needs, passed in because a function evaluated in the page cannot reach Node's scope. */
interface StepUnits {
  /** How many of the last frames `--dump` keeps. */
  readonly dumpFrames: number;
  readonly fractionDigits: number;
  readonly millisecondsPerSecond: number;
  readonly percentScale: number;
}

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const FRAMES_PER_SECOND = 60;
const FRAME_MILLISECONDS = MILLISECONDS_PER_SECOND / FRAMES_PER_SECOND;
/** The menu frames before the run starts, as in the differential scenarios. */
const BOOT_FRAMES = 120;
/** Frames stepped per round trip to the page. */
const CHUNK_FRAMES = 1800;
const PERCENT_SCALE = 100;
const MEDIAN_DIVISOR = 2;
const SECONDS_DIGITS = 2;
const FRACTION_DIGITS = 2;
/** `--dump` keeps the last 2 seconds of frames and writes every fifth. */
const DUMP_FRAMES = 120;
/* eslint-disable no-magic-numbers -- the dump's colors, RGBA. */
const DUMP_STYLE: DumpStyle = {
  aimColor: '#ff00ff',
  aimRadius: 2,
  // Floor, own, trail, foreign, outside, masked: the blackbox pilot's class order.
  classColors: [[235, 235, 235, 255], [0, 90, 255, 255], [140, 200, 255, 255], [230, 0, 0, 255], [0, 0, 0, 255], [140, 140, 140, 255]],
  panels: 2,
  stride: 5,
  // The remembered trail: none, olive near it, yellow where the way back must not pass.
  trackColors: [null, [160, 150, 60, 255], [255, 220, 0, 255]],
  unknownColor: [255, 0, 255, 255]
};
/* eslint-enable no-magic-numbers -- end of the dump's colors. */
const STEP_UNITS: StepUnits = { dumpFrames: DUMP_FRAMES, fractionDigits: FRACTION_DIGITS, millisecondsPerSecond: MILLISECONDS_PER_SECOND, percentScale: PERCENT_SCALE };
const REASONS: readonly string[] = ['win', 'self-intersection', 'wall', 'trail cut', 'exit point taken', 'surrounded', 'system', 'capital surrounded'];
const DEFAULT_PARALLEL_SHARE = 2;
/** How many trace lines `--why` prints before a death. */
const WHY_LINES = 12;

const { values } = parseArgs({
  options: {
    'dump': { type: 'string' },
    'enemies': { default: 'original', type: 'string' },
    'first-seed': { default: '1', type: 'string' },
    'max-minutes': { default: '20', type: 'string' },
    'modes': { default: 'whitebox,blackbox', type: 'string' },
    'parallel': { default: String(Math.max(1, Math.floor(availableParallelism() / DEFAULT_PARALLEL_SHARE))), type: 'string' },
    'seeds': { default: '10', type: 'string' },
    'why': { default: false, type: 'boolean' }
  }
});

const modes = values.modes.split(',').map((mode) => mode.trim()).filter((mode): mode is Mode => mode === 'whitebox' || mode === 'blackbox');
const seedCount = Number(values.seeds);
const firstSeed = Number(values['first-seed']);
const maxFrames = Math.round(Number(values['max-minutes']) * SECONDS_PER_MINUTE * FRAMES_PER_SECOND);
const parallel = Math.max(1, Number(values.parallel));

const enemyModes = values.enemies.split(',').map((enemies) => enemies.trim()).filter(Boolean);
const jobs: Job[] = modes.flatMap((mode) => enemyModes.flatMap((enemies) => Array.from({ length: seedCount }, (_unused, index) => ({ enemies, mode, seed: firstSeed + index }))));
const browser = await launchBrowser();
const outcomes: Outcome[] = [];
try {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, async () => {
    for (let job = jobs[next++]; job; job = jobs[next++]) {
      const outcome = await play(browser, job);
      outcomes.push(outcome);
      print(`${label(outcome)} seed ${String(outcome.seed)}: ${describe(outcome)} (${outcome.wallSeconds.toFixed(0)} s wall)`);
    }
  }));
} finally {
  await browser.close();
}
print('');
print(report(outcomes));

function describe(outcome: Outcome): string {
  const time = formatTime(outcome.seconds);
  if (outcome.reason === 'win') {
    return `won in ${time}`;
  }
  const percent = `${(outcome.percent * PERCENT_SCALE).toFixed(1)}%`;
  return outcome.reason === null ? `time limit at ${percent}` : `died (${outcome.reason}) at ${time}, ${percent}`;
}

/**
 * Writes the last frames the blackbox pilot saw, each beside its pixel classes, as PNGs.
 *
 * @param page - The page.
 * @param directory - Where to write them.
 */
async function dumpFrames(page: Page, directory: string): Promise<void> {
  const images = await page.evaluate((style: DumpStyle) => {
    const frames = window.__blackboxFrames ?? [];
    return frames.filter((_frame, index) => (frames.length - 1 - index) % style.stride === 0).map(({ aim, classes, frame, label: frameLabel, track }) => {
      const canvas = document.createElement('canvas');
      canvas.width = frame.width * style.panels;
      canvas.height = frame.height;
      const context = canvas.getContext('2d');
      if (!context) {
        return { data: '', label: frameLabel };
      }
      context.putImageData(frame, 0, 0);
      const map = context.createImageData(frame.width, frame.height);
      for (let index = 0; index < classes.length; index++) {
        const color = style.trackColors[track?.[index] ?? 0] ?? style.classColors[classes[index] ?? 0] ?? style.unknownColor;
        map.data.set(color, index * color.length);
      }
      context.putImageData(map, frame.width, 0);
      if (aim) {
        context.fillStyle = style.aimColor;
        context.fillRect(frame.width + aim.x - style.aimRadius, aim.y - style.aimRadius, style.aimRadius * style.panels + 1, style.aimRadius * style.panels + 1);
      }
      return { data: canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''), label: frameLabel };
    });
  }, DUMP_STYLE);
  await mkdir(directory, { recursive: true });
  for (const { data, label: frameLabel } of images) {
    await writeFile(join(directory, `${frameLabel}.png`), Buffer.from(data, 'base64'));
  }
  print(`dumped ${String(images.length)} frames to ${directory}`);
}

function formatTime(seconds: number): string {
  const whole = Math.round(seconds);
  return `${String(Math.floor(whole / SECONDS_PER_MINUTE))}:${String(whole % SECONDS_PER_MINUTE).padStart(SECONDS_DIGITS, '0')}`;
}

function label(run: Pick<Job, 'enemies' | 'mode'>): string {
  return `${run.mode} vs ${run.enemies}`;
}

function median(numbers: readonly number[]): null | number {
  if (numbers.length === 0) {
    return null;
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / MEDIAN_DIVISOR);
  return sorted.length % MEDIAN_DIVISOR ? sorted[middle] ?? null : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / MEDIAN_DIVISOR;
}

function parseEnemies(text: string): PageEnemySettings {
  const [mode = 'original', vision] = text.split(':');
  return { count: null, level: null, mode, vision: vision === 'blackbox' ? 'blackbox' : 'whitebox' };
}

async function play(browserToUse: Browser, job: Job): Promise<Outcome> {
  const { enemies, mode, seed } = job;
  const started = performance.now();
  const scenario: Scenario = { expectedCoverage: {}, frames: 0, keys: [], name: `${mode} ${String(seed)}`, seed, startFrame: 0 };
  const page = await openVariant(browserToUse, 'reconstruction', scenario, { traceCanvas: false });
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
    await page.evaluate(
      (pilot: Mode, enemySettings: PageEnemySettings) => {
        const api = window.paperio2api;
        if (!api.start || !api.attachAutopilot || !api.setEnemySettings) {
          throw new Error('This build has no autopilot.');
        }
        api.setEnemySettings(enemySettings);
        api.start('Autopilot', '', undefined, undefined, undefined, true);
        window.__autopilot = api.attachAutopilot(pilot);
        if (pilot === 'whitebox') {
          api.game.renderer = null;
        }
      },
      mode,
      parseEnemies(enemies)
    );
    const tail: string[] = [];
    let frames = 0;
    let state = await stepFrames(page, 0, tail);
    while (!state.done && frames < maxFrames) {
      const count = Math.min(CHUNK_FRAMES, maxFrames - frames);
      state = await stepFrames(page, count, tail);
      frames += count;
    }
    const reason = state.reason === null ? null : REASONS[state.reason] ?? `reason ${String(state.reason)}`;
    if (values.dump !== undefined && reason !== 'win') {
      await dumpFrames(page, join(values.dump, `${mode}-${enemies.replace(':', '-')}-seed${String(seed)}`));
    }
    if (values.why && reason !== 'win') {
      print([`--- ${label(job)} seed ${String(seed)}: ${String(reason)}`, ...tail].join('\n'));
      print(`stats ${label(job)} seed ${String(seed)}: ${await page.evaluate(() => JSON.stringify({ ...window.__autopilot?.whitebox?.stats, area: window.__areaTotals }))}`);
    }
    return { enemies, mode, percent: state.percent, reason, seconds: state.seconds, seed, wallSeconds: (performance.now() - started) / MILLISECONDS_PER_SECOND };
  } finally {
    await page.browserContext().close();
  }
}

function print(text: string): void {
  process.stdout.write(`${text}\n`);
}

function report(results: readonly Outcome[]): string {
  const lines = ['| Mode | Enemies | Runs | Wins | Median time to win | Best time to win | Deaths (cause) | Time limit (median %) |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const { enemies, mode } of modes.flatMap((pilot) => enemyModes.map((enemyMode) => ({ enemies: enemyMode, mode: pilot })))) {
    const runs = results.filter((outcome) => outcome.mode === mode && outcome.enemies === enemies);
    const wins = runs.filter((outcome) => outcome.reason === 'win');
    const deaths = runs.filter((outcome) => outcome.reason !== null && outcome.reason !== 'win');
    const timeouts = runs.filter((outcome) => outcome.reason === null);
    const causes = new Map<string, number>();
    for (const death of deaths) {
      causes.set(death.reason ?? '', (causes.get(death.reason ?? '') ?? 0) + 1);
    }
    const winSeconds = wins.map((outcome) => outcome.seconds);
    const medianWin = median(winSeconds);
    const bestWin = winSeconds.length ? Math.min(...winSeconds) : null;
    const timeoutPercent = median(timeouts.map((outcome) => outcome.percent * PERCENT_SCALE));
    lines.push(
      [
        '',
        mode,
        enemies,
        String(runs.length),
        `${String(wins.length)} (${(wins.length / Math.max(1, runs.length) * PERCENT_SCALE).toFixed(0)}%)`,
        medianWin === null ? '-' : formatTime(medianWin),
        bestWin === null ? '-' : formatTime(bestWin),
        deaths.length ? `${String(deaths.length)} (${[...causes].map(([cause, count]) => `${cause} ${String(count)}`).join(', ')})` : '0',
        timeouts.length ? `${String(timeouts.length)} (${(timeoutPercent ?? 0).toFixed(1)}%)` : '0',
        ''
      ].join(' | ').trim()
    );
  }
  return lines.join('\n');
}

async function stepFrames(page: Page, count: number, tail: string[]): Promise<PageState> {
  const state = await page.evaluate(
    // eslint-disable-next-line complexity -- page.evaluate serializes this function, so it cannot call helpers from this module.
    async (frames: number, milliseconds: number, trace: boolean, dump: boolean, units: StepUnits): Promise<PageState> => {
      const { game } = window.paperio2api;
      // A step can end the run, which the type narrowing of game.player cannot see, so it is read through a call.
      function currentPlayer(): typeof game.player {
        return game.player;
      }
      const log: string[] = [];
      let lastLine = '';
      for (let frame = 0; frame < frames && !game.pendingGameOver && game.player; frame++) {
        const before = game.player.percent ?? 0;
        await window.__differential.step(milliseconds);
        const change = (currentPlayer()?.percent ?? before) - before;
        const totals = window.__areaTotals ?? { gained: 0, lost: 0 };
        window.__areaTotals = { gained: totals.gained + Math.max(0, change), lost: totals.lost + Math.max(0, -change) };
        const debug = window.__autopilot?.whitebox?.debug ?? window.__autopilot?.blackbox?.debug;
        const player = currentPlayer();
        if (dump && debug?.classes && debug.width && debug.height) {
          const canvas = document.createElement('canvas');
          canvas.width = debug.width;
          canvas.height = debug.height;
          const context = canvas.getContext('2d');
          if (context) {
            context.drawImage(game.view, 0, 0, debug.width, debug.height);
            const kept = window.__blackboxFrames ?? [];
            const seconds = (game.clock.now() - (game.startTime ?? 0)) / units.millisecondsPerSecond;
            const stuck = debug.aim && debug.aimReached === false ? '-no-way-home' : '';
            kept.push({
              aim: debug.aim ?? null,
              classes: debug.classes,
              frame: context.getImageData(0, 0, debug.width, debug.height),
              label: `${seconds.toFixed(units.fractionDigits)}s-${debug.phase}${stuck}`,
              track: debug.track ?? null
            });
            kept.splice(0, Math.max(0, kept.length - units.dumpFrames));
            window.__blackboxFrames = kept;
          }
        }
        if (trace && debug && player) {
          const line = `${debug.phase} in=${String(player.in === player.base)}`;
          if (line !== lastLine) {
            lastLine = line;
            const seconds = (game.clock.now() - (game.startTime ?? 0)) / units.millisecondsPerSecond;
            log.push(`${seconds.toFixed(1)}s ${line} pos=${player.position.x.toFixed(0)},${player.position.y.toFixed(0)} pct=${((player.percent ?? 0) * units.percentScale).toFixed(units.fractionDigits)} threat=${JSON.stringify(debug.threat) ?? '-'}`);
          }
        }
      }
      const pending = game.pendingGameOver ?? null;
      const killer: unknown = pending && trace ? Reflect.get(Reflect.get(pending, 'player') ?? {}, 'killer') : null;
      if (killer) {
        log.push(`killed by a unit in state ${String(Reflect.get(Reflect.get(killer, 'fsm') ?? {}, 'state'))}`);
      }
      return {
        done: pending !== null || !game.player,
        log,
        percent: game.player?.percent ?? 0,
        reason: pending?.reason ?? null,
        seconds: (game.clock.now() - (game.startTime ?? 0)) / units.millisecondsPerSecond
      };
    },
    count,
    FRAME_MILLISECONDS,
    values.why,
    values.dump !== undefined,
    STEP_UNITS
  );
  tail.push(...state.log);
  tail.splice(0, Math.max(0, tail.length - WHY_LINES));
  return state;
}
