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
 * `npm run benchmark -- --modes whitebox,blackbox --enemies original,chase:blackbox --seeds 10 --first-seed 1 [--seed-list 3,7] --max-minutes 20 --parallel 4 [--why] [--stats <dir>]`
 *
 * `--enemies` takes the enemy modes to play against, each `<mode>` or `<mode>:<vision>` (`whitebox` by default), and reports a row
 * per autopilot mode and enemy mode.
 *
 * `--why` prints, for every run that does not win, its last phase changes and how its killer was behaving, and the
 * whitebox pilot's decision counts with the ground it gained and lost.
 *
 * `--stats <dir>` writes each run's stats log there, the same JSONL the page keeps for a human's game, as
 * `<mode>-<enemies>-seed<n>.jsonl`; `npm run stats:report` compares them.
 *
 * `--situations <dir>` writes the situations `npm run benchmark:replay` plays again (see `situation-replay.ts`): for
 * each death, a snapshot from 8 to 13 s before it, and for every run a control snapshot every 10 minutes it lives.
 */

import type {
  Browser,
  Page
} from 'puppeteer-core';

import { execFile } from 'node:child_process';
import {
  mkdir,
  writeFile
} from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import {
  parseArgs,
  promisify
} from 'node:util';

import type { Scenario } from '../differential/harness.ts';
import type {
  PageEnemySettings,
  PagePlainPoint,
  PageShotUnit,
  PageSituationSnapshot,
  PageUnit,
  PageWhiteboxShot
} from '../differential/page-instrumentation.ts';
import type {
  Situation,
  SituationKind
} from './situation.ts';

import {
  launchBrowser,
  openVariant,
  TS_ROOT
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
  /** The map share at each of {@link CURVE_MINUTES}, or `null` once the run had ended. */
  readonly curve: readonly (null | number)[];
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

/** What {@link playChunks} returns: the growth curve and the run's last state. */
interface PlayedChunks {
  readonly curve: readonly (null | number)[];
  readonly state: PageState;
}

/** Numbers the page-side step needs, passed in because a function evaluated in the page cannot reach Node's scope. */
interface StepUnits {
  /** How many of the last frames `--dump` keeps. */
  readonly dumpFrames: number;
  readonly fractionDigits: number;
  readonly millisecondsPerSecond: number;
  readonly percentScale: number;
  /** With `--trace`, a trace line every this many updates, not only on a change of phase; 0 without it. */
  readonly traceEvery: number;
}

/** How {@link installWhiteboxShots} records and {@link dumpWhiteboxShots} draws. */
interface WhiteboxShotStyle {
  readonly background: string;
  /** A record every this many updates. */
  readonly every: number;
  readonly font: string;
  readonly fullHue: number;
  readonly halves: number;
  readonly hueStep: number;
  /** How many records are kept. */
  readonly keep: number;
  readonly killerBox: number;
  readonly killerColor: string;
  readonly lineHeight: number;
  readonly lineWidth: number;
  readonly marker: number;
  readonly millisecondsPerSecond: number;
  readonly ownFill: string;
  readonly ownStroke: string;
  /** The image's side, in pixels. */
  readonly size: number;
  /** Every this many kept records is drawn. */
  readonly stride: number;
  readonly targetColor: string;
  readonly text: string;
  readonly trailStroke: string;
  /** The image's side, in world units, and how near the player a unit must be to be kept. */
  readonly view: number;
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
/** A whitebox `--dump`: a record every tenth of a second, the last 4 seconds kept, every third drawn, 700 world units across. */
const WHITEBOX_SHOT_STYLE: WhiteboxShotStyle = {
  background: '#ffffff',
  every: 6,
  font: '13px sans-serif',
  fullHue: 360,
  halves: 2,
  hueStep: 67,
  keep: 40,
  killerBox: 8,
  killerColor: '#ff0000',
  lineHeight: 16,
  lineWidth: 2,
  marker: 4,
  millisecondsPerSecond: MILLISECONDS_PER_SECOND,
  ownFill: 'rgba(0, 90, 255, 0.3)',
  ownStroke: 'rgba(0, 90, 255, 0.8)',
  size: 700,
  stride: 3,
  targetColor: '#ff00ff',
  text: '#000000',
  trailStroke: '#0040ff',
  view: 700
};
/* eslint-enable no-magic-numbers -- end of the dump's colors. */
/** `--trace` writes a line every tenth of a second and keeps the last 4 seconds of them. */
const TRACE_EVERY_UPDATES = 6;
const TRACE_LINES = 40;
const REASONS: readonly string[] = ['win', 'self-intersection', 'wall', 'trail cut', 'exit point taken', 'surrounded', 'system', 'capital surrounded'];
const DEFAULT_PARALLEL_SHARE = 2;
const STEP_UNITS = { dumpFrames: DUMP_FRAMES, fractionDigits: FRACTION_DIGITS, millisecondsPerSecond: MILLISECONDS_PER_SECOND, percentScale: PERCENT_SCALE };
/** How many trace lines `--why` prints before a death. */
const WHY_LINES = 12;
/** The minutes at which the growth curve samples the map share, the human baseline's marks; each is a whole number of chunks. */
// eslint-disable-next-line no-magic-numbers -- the curve's marks.
const CURVE_MINUTES: readonly number[] = [0.5, 1, 2, 3, 5, 10, 15, 30, 60];
const CURVE_FRAMES: readonly number[] = CURVE_MINUTES.map((minutes) => Math.round(minutes * SECONDS_PER_MINUTE * FRAMES_PER_SECOND));
/** `--situations` takes a snapshot every 5 seconds and keeps the last 4, so one from 8 to 13 s before a death is there. */
const SITUATION_EVERY_FRAMES = 300;
const SITUATION_KEEP = 4;
const SITUATION_LEAD_SECONDS = 8;
/** And a control situation every 10 minutes a run lives, a whole number of chunks. */
const CONTROL_SITUATION_FRAMES = 36_000;

const { values } = parseArgs({
  options: {
    'dump': { type: 'string' },
    'enemies': { default: 'original', type: 'string' },
    'first-seed': { default: '1', type: 'string' },
    'max-minutes': { default: '20', type: 'string' },
    'modes': { default: 'whitebox,blackbox', type: 'string' },
    'parallel': { default: String(Math.max(1, Math.floor(availableParallelism() / DEFAULT_PARALLEL_SHARE))), type: 'string' },
    'seed-list': { type: 'string' },
    'seeds': { default: '10', type: 'string' },
    'situations': { type: 'string' },
    'stats': { type: 'string' },
    'trace': { default: false, type: 'boolean' },
    'why': { default: false, type: 'boolean' }
  }
});

const modes = values.modes.split(',').map((mode) => mode.trim()).filter((mode): mode is Mode => mode === 'whitebox' || mode === 'blackbox');
const seedCount = Number(values.seeds);
const firstSeed = Number(values['first-seed']);
const maxFrames = Math.round(Number(values['max-minutes']) * SECONDS_PER_MINUTE * FRAMES_PER_SECOND);
const parallel = Math.max(1, Number(values.parallel));

const enemyModes = values.enemies.split(',').map((enemies) => enemies.trim()).filter(Boolean);
// `--seed-list` names the seeds outright, such as the ones a whole run died on, in place of `--seeds` and `--first-seed`.
const seeds = values['seed-list']?.split(',').map(Number) ?? Array.from({ length: seedCount }, (_unused, index) => firstSeed + index);
if (seeds.some((seed) => !Number.isInteger(seed))) {
  // In PowerShell an unquoted `1,2` becomes two arguments, and parseArgs keeps only the first.
  throw new Error(`--seed-list takes comma-separated whole numbers (quote it in PowerShell): ${String(values['seed-list'])}`);
}
const jobs: Job[] = modes.flatMap((mode) => enemyModes.flatMap((enemies) => seeds.map((seed) => ({ enemies, mode, seed }))));
// The page plays `dist/app2.js`, so build it first, as the integration tests do: a stale bundle measures other code.
await promisify(execFile)(process.execPath, ['build.mjs'], { cwd: TS_ROOT });
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
/**
 * The growth curve: per mode and enemy mode, the median map share at each mark over the runs still alive there, and how
 * many runs that is.
 *
 * @param results - The runs.
 * @returns A markdown table.
 */
function curveReport(results: readonly Outcome[]): string {
  const marks = CURVE_MINUTES.filter((_minutes, index) => (CURVE_FRAMES[index] ?? Infinity) <= maxFrames);
  const lines = [`| Mode | Enemies | ${marks.map((minutes) => formatTime(minutes * SECONDS_PER_MINUTE)).join(' | ')} |`, `| --- | --- | ${marks.map(() => '---').join(' | ')} |`];
  for (const { enemies, mode } of modes.flatMap((pilot) => enemyModes.map((enemyMode) => ({ enemies: enemyMode, mode: pilot })))) {
    const runs = results.filter((outcome) => outcome.mode === mode && outcome.enemies === enemies);
    const cells = CURVE_MINUTES.slice(0, marks.length).map((_minutes, index) => {
      const alive = runs.map((outcome) => outcome.curve[index]).filter((percent): percent is number => typeof percent === 'number');
      const value = median(alive);
      return value === null ? '-' : `${(value * PERCENT_SCALE).toFixed(1)}% (${String(alive.length)}/${String(runs.length)})`;
    });
    lines.push(`| ${mode} | ${enemies} | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

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

/**
 * Draws the moments {@link installWhiteboxShots} kept, each centred on the player: every base near it, every trail,
 * each unit's state (`*` while it is in its base), the pilot's target (magenta) and the killer (red square), as PNGs.
 *
 * @param page - The page.
 * @param directory - Where to write them.
 */
async function dumpWhiteboxShots(page: Page, directory: string): Promise<void> {
  const images = await page.evaluate((style: WhiteboxShotStyle) => {
    const pending = window.paperio2api.game.pendingGameOver;
    const killer: unknown = pending ? Reflect.get(Reflect.get(pending, 'player') ?? {}, 'killer') : null;
    const killerAt: unknown = killer ? Reflect.get(killer, 'position') : null;
    const shots = window.__whiteboxShots ?? [];
    return shots.filter((_shot, index) => (shots.length - 1 - index) % style.stride === 0).map((shot) => {
      const canvas = document.createElement('canvas');
      canvas.width = style.size;
      canvas.height = style.size;
      const context = canvas.getContext('2d');
      if (!context) {
        return { data: '', label: '' };
      }
      const half = style.size / style.halves;
      const zoom = style.size / style.view;
      function place(point: PagePlainPoint): [number, number] {
        return [(point.x - shot.player.position.x) * zoom + half, (point.y - shot.player.position.y) * zoom + half];
      }
      function trace(points: readonly PagePlainPoint[], close: boolean): void {
        context?.beginPath();
        for (const point of points) {
          context?.lineTo(...place(point));
        }
        if (close) {
          context?.closePath();
        }
      }
      context.fillStyle = style.background;
      context.fillRect(0, 0, style.size, style.size);
      context.lineWidth = style.lineWidth;
      context.font = style.font;
      shot.units.forEach((unit, index) => {
        const hue = String(index * style.hueStep % style.fullHue);
        trace(unit.base, true);
        context.fillStyle = `hsla(${hue}, 60%, 60%, 0.35)`;
        context.fill();
        trace([...unit.trail, unit.position], false);
        context.strokeStyle = `hsl(${hue}, 80%, 40%)`;
        context.stroke();
        const [x, y] = place(unit.position);
        context.fillStyle = `hsl(${hue}, 80%, 30%)`;
        context.fillRect(x - style.marker, y - style.marker, style.marker * style.halves, style.marker * style.halves);
        context.fillText(`${unit.state}${unit.inBase ? '*' : ''}`, x + style.marker, y - style.marker);
      });
      trace(shot.player.base, true);
      context.fillStyle = style.ownFill;
      context.fill();
      context.strokeStyle = style.ownStroke;
      context.stroke();
      trace([...shot.player.trail, shot.player.position], false);
      context.strokeStyle = style.trailStroke;
      context.stroke();
      context.fillStyle = style.text;
      context.fillRect(half - style.marker, half - style.marker, style.marker * style.halves, style.marker * style.halves);
      if (shot.target) {
        const [x, y] = place(shot.target);
        context.fillStyle = style.targetColor;
        context.fillRect(x - style.marker, y - style.marker, style.marker * style.halves, style.marker * style.halves);
      }
      if (killerAt) {
        const [x, y] = place({ x: Number(Reflect.get(killerAt, 'x')), y: Number(Reflect.get(killerAt, 'y')) });
        context.strokeStyle = style.killerColor;
        context.strokeRect(x - style.killerBox, y - style.killerBox, style.killerBox * style.halves, style.killerBox * style.halves);
      }
      context.fillStyle = style.text;
      context.fillText(`${shot.seconds.toFixed(1)}s ${shot.phase} in=${String(shot.player.inBase)}`, style.marker, style.lineHeight);
      return { data: canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''), label: `${shot.seconds.toFixed(1)}s-${shot.phase}` };
    });
  }, WHITEBOX_SHOT_STYLE);
  await mkdir(directory, { recursive: true });
  for (const { data, label: shotLabel } of images) {
    await writeFile(join(directory, `${shotLabel}.png`), Buffer.from(data, 'base64'));
  }
  print(`dumped ${String(images.length)} shots to ${directory}`);
}

function formatTime(seconds: number): string {
  const whole = Math.round(seconds);
  return `${String(Math.floor(whole / SECONDS_PER_MINUTE))}:${String(whole % SECONDS_PER_MINUTE).padStart(SECONDS_DIGITS, '0')}`;
}

/**
 * Installs the snapshot ring `--situations` picks a death's situation from: every few frames, while the player lives, a
 * snapshot of the game, the oldest dropped past the count. Taking one changes no game state.
 *
 * @param every - A snapshot every this many frames.
 * @param keep - How many are kept.
 * @param millisecondsPerSecond - Passed in, since the page cannot reach this module's constants.
 */
function installSituationRing(every: number, keep: number, millisecondsPerSecond: number): void {
  const api = window.paperio2api;
  const kept: PageSituationSnapshot[] = [];
  window.__situations = kept;
  let frames = 0;
  window.__situationTick = (): void => {
    const { game } = api;
    if (frames++ % every !== 0 || !game.player || game.pendingGameOver || !api.captureSnapshot) {
      return;
    }
    kept.push({
      host: window.__differential.now(),
      pilot: window.__autopilot?.whitebox?.saveState(game) ?? null,
      random: window.__differential.randomState(),
      seconds: (game.clock.now() - (game.startTime ?? 0)) / millisecondsPerSecond,
      snapshot: api.captureSnapshot()
    });
    kept.splice(0, Math.max(0, kept.length - keep));
  };
}

/**
 * Installs the recorder {@link dumpWhiteboxShots} draws from: every few updates it keeps the player's base and trail,
 * and those of every unit near it, dropping the oldest past the style's count. It only reads the game.
 *
 * @param style - How often it records, how much it keeps and how far around the player it looks.
 */
function installWhiteboxShots(style: WhiteboxShotStyle): void {
  const { game } = window.paperio2api;
  const shots: PageWhiteboxShot[] = [];
  window.__whiteboxShots = shots;
  function copy(points: readonly PagePlainPoint[]): PagePlainPoint[] {
    return points.map(({ x, y }) => ({ x, y }));
  }
  function describeUnit(unit: PageUnit): PageShotUnit {
    return {
      base: copy(unit.base.polygon.simplify),
      inBase: unit.in === unit.base,
      position: { x: unit.position.x, y: unit.position.y },
      state: unit.fsm?.state ?? 'unit',
      trail: copy(unit.track.simplyline)
    };
  }
  window.__whiteboxShot = (): void => {
    const { player } = game;
    if (!player || game.cycle % style.every !== 0) {
      return;
    }
    const debug = window.__autopilot?.whitebox?.debug;
    shots.push({
      phase: debug?.phase ?? '-',
      player: describeUnit(player),
      seconds: (game.clock.now() - (game.startTime ?? 0)) / style.millisecondsPerSecond,
      target: debug?.target ? { x: debug.target.x, y: debug.target.y } : null,
      units: game.units.filter((unit) => unit !== player && unit.position.distance(player.position) < style.view).map(describeUnit)
    });
    shots.splice(0, Math.max(0, shots.length - style.keep));
  };
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
        if (!api.start || !api.attachAutopilot || !api.setEnemySettings || !api.createStatsLog) {
          throw new Error('This build has no autopilot.');
        }
        api.setEnemySettings(enemySettings);
        api.start('Autopilot', '', undefined, undefined, undefined, true);
        window.__autopilot = api.attachAutopilot(pilot);
        window.__statsLog = api.createStatsLog(pilot);
        if (pilot === 'whitebox') {
          api.game.renderer = null;
        }
      },
      mode,
      parseEnemies(enemies)
    );
    if (values.dump !== undefined && mode === 'whitebox') {
      await page.evaluate(installWhiteboxShots, WHITEBOX_SHOT_STYLE);
    }
    if (values.situations !== undefined) {
      await page.evaluate(installSituationRing, SITUATION_EVERY_FRAMES, SITUATION_KEEP, MILLISECONDS_PER_SECOND);
    }
    const tail: string[] = [];
    const { curve, state } = await playChunks(page, job, tail);
    const reason = state.reason === null ? null : REASONS[state.reason] ?? `reason ${String(state.reason)}`;
    if (values.situations !== undefined && reason !== null && reason !== 'win') {
      await saveSituation(page, job, 'death', state.seconds, reason, values.situations);
    }
    if (values.stats !== undefined) {
      const text = await page.evaluate(() => window.__statsLog?.finish() ?? '');
      await mkdir(values.stats, { recursive: true });
      await writeFile(join(values.stats, `${mode}-${enemies.replace(':', '-')}-seed${String(seed)}.jsonl`), text);
    }
    if (values.dump !== undefined && reason !== 'win') {
      const directory = join(values.dump, `${mode}-${enemies.replace(':', '-')}-seed${String(seed)}`);
      await (mode === 'whitebox' ? dumpWhiteboxShots(page, directory) : dumpFrames(page, directory));
    }
    if (values.why && reason !== 'win') {
      print([`--- ${label(job)} seed ${String(seed)}: ${String(reason)}`, ...tail].join('\n'));
      print(`stats ${label(job)} seed ${String(seed)}: ${await page.evaluate(() => JSON.stringify({ ...window.__autopilot?.whitebox?.stats, area: window.__areaTotals }))}`);
    }
    return { curve, enemies, mode, percent: state.percent, reason, seconds: state.seconds, seed, wallSeconds: (performance.now() - started) / MILLISECONDS_PER_SECOND };
  } finally {
    await page.browserContext().close();
  }
}

/**
 * Steps a started run chunk by chunk until it ends or reaches the time limit, sampling the growth curve, and with
 * `--situations` writing a control situation every {@link CONTROL_SITUATION_FRAMES}.
 *
 * @param page - The page.
 * @param job - The run.
 * @param tail - The trace lines kept so far.
 * @returns The growth curve and the last state.
 */
async function playChunks(page: Page, job: Job, tail: string[]): Promise<PlayedChunks> {
  let frames = 0;
  let state = await stepFrames(page, 0, tail);
  const curve: (null | number)[] = CURVE_MINUTES.map(() => null);
  while (!state.done && frames < maxFrames) {
    const count = Math.min(CHUNK_FRAMES, maxFrames - frames);
    state = await stepFrames(page, count, tail);
    frames += count;
    const mark = CURVE_FRAMES.indexOf(frames);
    if (mark >= 0 && !state.done) {
      curve[mark] = state.percent;
    }
    if (values.situations !== undefined && !state.done && frames % CONTROL_SITUATION_FRAMES === 0) {
      await saveSituation(page, job, 'control', null, null, values.situations);
    }
  }
  return { curve, state };
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
  return [...lines, '', curveReport(results)].join('\n');
}

/**
 * Writes one situation for `npm run benchmark:replay`: for a death, the latest kept snapshot from at least
 * {@link SITUATION_LEAD_SECONDS} before it (the oldest kept when none is that old), and for a control, the game now.
 *
 * @param page - The page.
 * @param job - The run.
 * @param kind - A death's situation or a control.
 * @param deathSeconds - When the player died, in game seconds; `null` for a control.
 * @param cause - How it died; `null` for a control.
 * @param directory - Where to write it.
 */
async function saveSituation(page: Page, job: Job, kind: SituationKind, deathSeconds: null | number, cause: null | string, directory: string): Promise<void> {
  const picked = await page.evaluate(
    async (death: null | number, lead: number, millisecondsPerSecond: number) => {
      const api = window.paperio2api;
      if (!api.captureSnapshot || !api.encodeSnapshot) {
        return { error: 'This build has no snapshots.', host: 0, payload: '', pilot: null, random: 0, seconds: 0 };
      }
      const { game } = api;
      const kept = window.__situations ?? [];
      const entry = death === null
        ? {
          host: window.__differential.now(),
          pilot: window.__autopilot?.whitebox?.saveState(game) ?? null,
          random: window.__differential.randomState(),
          seconds: (game.clock.now() - (game.startTime ?? 0)) / millisecondsPerSecond,
          snapshot: api.captureSnapshot()
        }
        : [...kept].reverse().find((situation) => situation.seconds <= death - lead) ?? kept[0];
      if (!entry) {
        return { error: 'No snapshot was kept.', host: 0, payload: '', pilot: null, random: 0, seconds: 0 };
      }
      try {
        return { error: '', host: entry.host, payload: await api.encodeSnapshot(entry.snapshot), pilot: entry.pilot, random: entry.random, seconds: entry.seconds };
      } catch (error) {
        return { error: String(error), host: 0, payload: '', pilot: null, random: 0, seconds: entry.seconds };
      }
    },
    deathSeconds,
    SITUATION_LEAD_SECONDS,
    MILLISECONDS_PER_SECOND
  );
  const name = `${job.mode}-${job.enemies.replace(':', '-')}-seed${String(job.seed)}-${kind}-${picked.seconds.toFixed(0)}s`;
  if (picked.error) {
    print(`situation ${name} not written: ${picked.error}`);
    return;
  }
  const situation: Situation = {
    cause,
    deathSeconds,
    enemies: job.enemies,
    host: picked.host,
    kind,
    mode: job.mode,
    payload: picked.payload,
    pilot: picked.pilot,
    random: picked.random,
    seed: job.seed,
    snapshotSeconds: picked.seconds
  };
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${name}.json`), JSON.stringify(situation));
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
        window.__whiteboxShot?.();
        window.__situationTick?.();
        if (trace && debug && player) {
          const line = `${debug.phase} in=${String(player.in === player.base)}${units.traceEvery > 0 ? ` #${String(Math.floor(game.cycle / units.traceEvery))}` : ''}`;
          if (line !== lastLine) {
            lastLine = line;
            const seconds = (game.clock.now() - (game.startTime ?? 0)) / units.millisecondsPerSecond;
            log.push(`${seconds.toFixed(1)}s ${line} pos=${player.position.x.toFixed(0)},${player.position.y.toFixed(0)} pct=${((player.percent ?? 0) * units.percentScale).toFixed(units.fractionDigits)} threat=${JSON.stringify(debug.threat) ?? '-'}${units.traceEvery > 0 && 'target' in debug && debug.target ? ` target=${debug.target.x.toFixed(0)},${debug.target.y.toFixed(0)}` : ''}`);
          }
        }
      }
      const pending = game.pendingGameOver ?? null;
      const killer: unknown = pending && trace ? Reflect.get(Reflect.get(pending, 'player') ?? {}, 'killer') : null;
      if (killer) {
        const at: unknown = Reflect.get(killer, 'position');
        log.push(`killed by a unit in state ${String(Reflect.get(Reflect.get(killer, 'fsm') ?? {}, 'state'))} at ${String(Reflect.get(at ?? {}, 'x'))},${String(Reflect.get(at ?? {}, 'y'))}`);
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
    { ...STEP_UNITS, traceEvery: values.trace ? TRACE_EVERY_UPDATES : 0 }
  );
  tail.push(...state.log);
  tail.splice(0, Math.max(0, tail.length - (values.trace ? TRACE_LINES : WHY_LINES)));
  return state;
}
