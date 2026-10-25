/**
 * @file
 *
 * The situation replay: a paired measure of a pilot change that does not re-roll every seed. A whole-run benchmark
 * cannot tell 6 deaths in 32 runs from 9, because any change to the pilot sends every seed down another path. This
 * plays the same situations instead (the snapshots the benchmark's `--situations` wrote, from shortly before each
 * death and from runs that were still alive) under whichever pilot `dist/` holds, several times each, with the bots'
 * generator and `Math.random` shifted per trial, so two replays face the same trials and can be compared trial by
 * trial.
 *
 * `npm run benchmark:replay -- --situations <dir> --out <file> [--label main] [--trials 16] [--control-trials 4] [--death-window 30] [--control-window 60] [--mode whitebox] [--parallel 2] [--fresh-pilot]`
 *
 * `npm run benchmark:replay -- --compare <a.json>,<b.json>` prints the paired comparison of two replays.
 *
 * Each trial attaches a new pilot and puts back the whitebox pilot's own state saved with the snapshot (its phase,
 * loop, waypoint, victim and way home), so the pilot carries on with what it was doing; both sides of a comparison
 * start from the same state. `--fresh-pilot`, or a situation saved before the state was kept, starts it fresh, and a
 * fresh pilot rarely repeats the recorded death. A death situation plays for `--death-window`
 * seconds from its snapshot, which is 8 to 13 s before the recorded death; a control plays `--control-window`.
 */

import type { Page } from 'puppeteer-core';

import { execFile } from 'node:child_process';
import {
  readdir,
  readFile,
  writeFile
} from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import {
  basename,
  join
} from 'node:path';
import {
  parseArgs,
  promisify
} from 'node:util';

import type { Scenario } from '../differential/harness.ts';
import type { PageEnemySettings } from '../differential/page-instrumentation.ts';
import type {
  ReplayResults,
  Situation,
  SituationResult,
  TrialOutcome
} from './situation.ts';

import {
  launchBrowser,
  openVariant,
  TS_ROOT
} from '../differential/harness.ts';
import { compareReplays } from './situation.ts';

/** What a trial's step reports back. */
interface StepState {
  readonly done: boolean;
  readonly percent: number;
  readonly reason: null | number;
  readonly seconds: number;
}

/** How one trial starts, handed to the page. */
interface TrialSetup {
  /** The recorded page's virtual clock to warp to, or `null` for a situation saved before it was kept. */
  readonly host: null | number;
  readonly millisecondsPerSecond: number;
  readonly mode: string;
  /** The pilot's saved state to put back, or `null` for a fresh pilot. */
  readonly pilot: unknown;
  /** The recorded `Math.random` state, or `null` for a situation saved before it was kept. */
  readonly random: null | number;
  /** Without a recorded state: the `Math.random` state the trial starts from. */
  readonly randomState: number;
  /** Without a recorded state: how many draws of the game's generator the trial skips. */
  readonly rngShift: number;
  readonly trial: number;
}

const MILLISECONDS_PER_SECOND = 1000;
const FRAMES_PER_SECOND = 60;
const FRAME_MILLISECONDS = MILLISECONDS_PER_SECOND / FRAMES_PER_SECOND;
/** The menu frames before the run starts, as in the benchmark. */
const BOOT_FRAMES = 120;
/** Frames stepped per round trip to the page. */
const CHUNK_FRAMES = 1800;
/** How far apart the trials' `Math.random` states start, per seed. */
const TRIAL_STATE_STRIDE = 1000;
/** Each trial draws this many more values from the game's generator before it starts than the trial before. */
const TRIAL_RNG_SHIFT = 7;
/** A `Math.random` state is a 32-bit integer. */
const UINT32_RANGE = 4_294_967_296;
const DEFAULT_PARALLEL_SHARE = 2;
const REASONS: readonly string[] = ['win', 'self-intersection', 'wall', 'trail cut', 'exit point taken', 'surrounded', 'system', 'capital surrounded'];
const SECONDS_PER_HOUR = 3600;
const RATE_DIGITS = 1;

const { values } = parseArgs({
  options: {
    'compare': { type: 'string' },
    'control-trials': { default: '4', type: 'string' },
    'control-window': { default: '60', type: 'string' },
    'death-window': { default: '30', type: 'string' },
    'fresh-pilot': { default: false, type: 'boolean' },
    'label': { default: 'replay', type: 'string' },
    'mode': { default: 'whitebox', type: 'string' },
    'out': { type: 'string' },
    'parallel': { default: String(Math.max(1, Math.floor(availableParallelism() / DEFAULT_PARALLEL_SHARE))), type: 'string' },
    'situations': { type: 'string' },
    'trials': { default: '16', type: 'string' }
  }
});

if (values.compare === undefined) {
  await replayAll();
} else {
  const [first = '', second = ''] = values.compare.split(',');
  print(compareReplays(await readResults(first), await readResults(second)));
}

function isReplayResults(value: unknown): value is ReplayResults {
  return typeof value === 'object' && value !== null && 'situations' in value && Array.isArray(value.situations) && 'label' in value;
}

function isSituation(value: unknown): value is Situation {
  return typeof value === 'object' && value !== null && 'payload' in value && typeof value.payload === 'string' && 'seed' in value && typeof value.seed === 'number' && 'kind' in value
    && (value.kind === 'death' || value.kind === 'control');
}

function parseEnemies(text: string): PageEnemySettings {
  const [mode = 'original', vision] = text.split(':');
  return { count: null, level: null, mode, vision: vision === 'blackbox' ? 'blackbox' : 'whitebox' };
}

function print(text: string): void {
  process.stdout.write(`${text}\n`);
}

async function readResults(path: string): Promise<ReplayResults> {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isReplayResults(parsed)) {
    throw new Error(`${path} is not a situation replay's results`);
  }
  return parsed;
}

async function replayAll(): Promise<void> {
  const directory = values.situations;
  const out = values.out;
  if (directory === undefined || out === undefined) {
    throw new Error('Pass --situations <dir> and --out <file>, or --compare <a.json>,<b.json>.');
  }
  const trials = { control: Number(values['control-trials']), death: Number(values.trials) };
  const windows = { control: Number(values['control-window']), death: Number(values['death-window']) };
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  // The page plays `dist/app2.js`, so build it first, as the benchmark does.
  await promisify(execFile)(process.execPath, ['build.mjs'], { cwd: TS_ROOT });
  const { stdout } = await promisify(execFile)('git', ['rev-parse', '--short', 'HEAD'], { cwd: TS_ROOT }).catch(() => ({ stdout: '' }));
  const browser = await launchBrowser();
  const situations: SituationResult[] = [];
  try {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(Math.max(1, Number(values.parallel)), files.length) }, async () => {
      for (let file = files[next++]; file; file = files[next++]) {
        const parsed: unknown = JSON.parse(await readFile(join(directory, file), 'utf8'));
        if (!isSituation(parsed)) {
          print(`${file}: not a situation, skipped`);
          continue;
        }
        const page = await openVariant(browser, 'reconstruction', { expectedCoverage: {}, frames: 0, keys: [], name: file, seed: parsed.seed, startFrame: 0 } satisfies Scenario, { traceCanvas: false });
        try {
          const result = await replaySituation(page, basename(file, '.json'), parsed, trials[parsed.kind], windows[parsed.kind]);
          situations.push(result);
          const deaths = result.outcomes.filter((outcome) => outcome.died).length;
          const [first] = result.outcomes;
          // With the recorded `Math.random` state, trial 0 is the recorded run again: a death situation's should die as recorded.
          const replayed = parsed.random === undefined || values['fresh-pilot'] || !first
            ? ''
            : `; trial 0 ${first.died ? `died (${String(first.reason)}) at +${first.seconds.toFixed(1)} s` : 'lived'}${parsed.deathSeconds === null ? '' : `, recorded death at +${(parsed.deathSeconds - parsed.snapshotSeconds).toFixed(1)} s`}`;
          print(`${result.name}: ${String(deaths)}/${String(result.outcomes.length)} died (${[...new Set(result.outcomes.map((outcome) => outcome.reason).filter(Boolean))].join(', ') || '-'})${replayed}`);
        } finally {
          await page.browserContext().close();
        }
      }
    }));
  } finally {
    await browser.close();
  }
  situations.sort((left, right) => left.name.localeCompare(right.name));
  const results: ReplayResults = {
    commit: stdout.trim() || null,
    controlWindowSeconds: windows.control,
    deathWindowSeconds: windows.death,
    freshPilot: values['fresh-pilot'],
    label: values.label,
    situations,
    trials: trials.death
  };
  await writeFile(out, JSON.stringify(results, null, 1));
  print('');
  print(summary(results));
}

/**
 * Plays one situation `trials` times, each from the same snapshot with a fresh pilot.
 *
 * @param page - A fresh page opened with the situation's seed.
 * @param name - The situation's name.
 * @param situation - The situation.
 * @param trials - How many trials.
 * @param windowSeconds - How long each trial plays, at most.
 * @returns Every trial's outcome.
 */
async function replaySituation(page: Page, name: string, situation: Situation, trials: number, windowSeconds: number): Promise<SituationResult> {
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
    async (enemySettings: PageEnemySettings, payload: string, mode: string) => {
      const api = window.paperio2api;
      if (!api.start || !api.setEnemySettings || !api.decodeSnapshot) {
        throw new Error('This build cannot replay situations.');
      }
      api.setEnemySettings(enemySettings);
      api.start('Autopilot', '', undefined, undefined, undefined, true);
      // Rendering changes no game state, and the whitebox pilot does not look at the pixels.
      if (mode === 'whitebox') {
        api.game.renderer = null;
      }
      window.__replaySnapshot = await api.decodeSnapshot(payload);
    },
    parseEnemies(situation.enemies),
    situation.payload,
    values.mode
  );
  const outcomes: TrialOutcome[] = [];
  for (let trial = 0; trial < trials; trial++) {
    const setup: TrialSetup = {
      host: situation.host ?? null,
      millisecondsPerSecond: MILLISECONDS_PER_SECOND,
      mode: values.mode,
      pilot: values['fresh-pilot'] ? null : situation.pilot ?? null,
      random: situation.random ?? null,
      randomState: (situation.seed * TRIAL_STATE_STRIDE + trial) % UINT32_RANGE,
      rngShift: trial * TRIAL_RNG_SHIFT,
      trial
    };
    const start = await page.evaluate((trialSetup: TrialSetup) => {
      const api = window.paperio2api;
      if (!api.restoreSnapshot || !api.attachAutopilot) {
        throw new Error('This build cannot replay situations.');
      }
      window.__autopilot?.detach();
      if (trialSetup.host !== null) {
        window.__differential.warpClock(trialSetup.host);
      }
      api.restoreSnapshot(window.__replaySnapshot);
      const { game } = api;
      if (trialSetup.random === null) {
        window.__differential.setRandomState(trialSetup.randomState);
        for (let draw = 0; draw < trialSetup.rngShift; draw++) {
          game.rng?.();
        }
      } else {
        // Trial 0 replays the recorded run; each later one is a draw further along, which alone is enough to change
        // the length of the next update and so everything after it.
        window.__differential.setRandomState(trialSetup.random);
        for (let draw = 0; draw < trialSetup.trial; draw++) {
          Math.random();
        }
      }
      window.__autopilot = api.attachAutopilot(trialSetup.mode === 'blackbox' ? 'blackbox' : 'whitebox');
      if (trialSetup.pilot !== null) {
        window.__autopilot.whitebox?.restoreState(structuredClone(trialSetup.pilot), game);
      }
      return { percent: game.player?.percent ?? 0, seconds: (game.clock.now() - (game.startTime ?? 0)) / trialSetup.millisecondsPerSecond };
    }, setup);
    let state: StepState = { done: false, percent: start.percent, reason: null, seconds: start.seconds };
    while (!state.done && state.seconds - start.seconds < windowSeconds) {
      state = await stepTrial(page, Math.min(CHUNK_FRAMES, Math.ceil((windowSeconds - (state.seconds - start.seconds)) * FRAMES_PER_SECOND)));
    }
    const reason = state.reason === null ? null : REASONS[state.reason] ?? `reason ${String(state.reason)}`;
    outcomes.push({ died: reason !== null && reason !== 'win', gain: state.percent - start.percent, reason, seconds: Math.min(windowSeconds, state.seconds - start.seconds) });
  }
  return { kind: situation.kind, name, outcomes };
}

async function stepTrial(page: Page, frames: number): Promise<StepState> {
  return page.evaluate(
    async (count: number, milliseconds: number, millisecondsPerSecond: number): Promise<StepState> => {
      const { game } = window.paperio2api;
      for (let frame = 0; frame < count && !game.pendingGameOver && game.player; frame++) {
        await window.__differential.step(milliseconds);
      }
      const pending = game.pendingGameOver ?? null;
      return {
        done: pending !== null || !game.player,
        percent: game.player?.percent ?? 0,
        reason: pending?.reason ?? null,
        seconds: (game.clock.now() - (game.startTime ?? 0)) / millisecondsPerSecond
      };
    },
    frames,
    FRAME_MILLISECONDS,
    MILLISECONDS_PER_SECOND
  );
}

function summary(results: ReplayResults): string {
  const lines = ['| Kind | Situations | Trials | Deaths | Deaths per game-hour |', '| --- | --- | --- | --- | --- |'];
  for (const kind of ['death', 'control']) {
    const situations = results.situations.filter((situation) => situation.kind === kind);
    const outcomes = situations.flatMap((situation) => situation.outcomes);
    const deaths = outcomes.filter((outcome) => outcome.died).length;
    const hours = outcomes.reduce((sum, outcome) => sum + outcome.seconds, 0) / SECONDS_PER_HOUR;
    lines.push(`| ${kind} | ${String(situations.length)} | ${String(outcomes.length)} | ${String(deaths)} | ${hours ? (deaths / hours).toFixed(RATE_DIGITS) : '-'} |`);
  }
  return lines.join('\n');
}
