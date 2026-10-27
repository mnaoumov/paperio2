/**
 * @file
 *
 * The situations the autopilot benchmark's `--situations` writes and `situation-replay.ts` plays again, the replay's
 * results, and the paired comparison of two replays: the statistics live here, apart from the browser, so they are
 * unit-tested.
 */

import type { BuildIdentity } from './build.ts';

/** One replay's results file. */
export interface ReplayResults {
  /** Exact served bundle and build inputs; absent in historical results. */
  readonly build?: BuildIdentity;
  /** The commit the replayed bundle was built from, when the checkout has one. */
  readonly commit: null | string;
  readonly controlWindowSeconds: number;
  readonly deathWindowSeconds: number;
  /** Whether every trial started a fresh pilot rather than the one saved with the situation; absent in older files. */
  readonly freshPilot?: boolean;
  readonly label: string;
  readonly situations: readonly SituationResult[];
  readonly trials: number;
}

/** One situation file. */
export interface Situation {
  /** How the player died after it; `null` for a control. */
  readonly cause: null | string;
  /** When the player died, in game seconds from the run's start; `null` for a control. */
  readonly deathSeconds: null | number;
  /** The enemy mode the run played against, as the benchmark's `--enemies` names it. */
  readonly enemies: string;
  /**
   * The recorded page's virtual clock at the snapshot. The replay warps its page there before restoring, because the
   * game clock reads that clock minus an offset, and a nonzero offset rounds every frame's length differently from the
   * recorded run; absent from situations written before it was kept.
   */
  readonly host?: number;
  readonly kind: SituationKind;
  /** The pilot that played the run it came from. */
  readonly mode: string;
  /** The snapshot, encoded as a saved game. */
  readonly payload: string;
  /**
   * The whitebox pilot's own state at the snapshot (its phase, loop, waypoint, victim and way home), which the replay
   * puts back into each trial's pilot; absent from situations written before it was kept, and from other pilots'.
   */
  readonly pilot?: unknown;
  /**
   * The seeded `Math.random`'s state at the snapshot. The engine adds a draw from it to every update's length, so only
   * this state replays the recorded run; absent from situations written before it was kept.
   */
  readonly random?: number;
  /** The run's seed, which the replay's page is opened with. */
  readonly seed: number;
  /** When the snapshot was taken, in game seconds from the run's start. */
  readonly snapshotSeconds: number;
}

/** A snapshot from shortly before a death, or a control taken from a run that was still alive. */
export type SituationKind = 'control' | 'death';

/** Every trial of one situation. */
export interface SituationResult {
  readonly kind: SituationKind;
  /** The situation's file name, which pairs it with the same situation in another replay. */
  readonly name: string;
  readonly outcomes: readonly TrialOutcome[];
}

/** How one replay of a situation ended. */
export interface TrialOutcome {
  /** Whether the player died inside the window. A win counts as survival. */
  readonly died: boolean;
  /** The share of the arena the player held at the end, less what it held at the start. */
  readonly gain: number;
  /** How it ended, as the benchmark names a death; `null` when the window ran out. */
  readonly reason: null | string;
  /** The game seconds played from the snapshot. */
  readonly seconds: number;
}

/** The totals of one side of a comparison, for one kind of situation. */
interface SideTotals {
  readonly deaths: number;
  readonly gain: number;
  readonly seconds: number;
}

/** Death situations first: they are what a pilot change is aimed at. */
const KINDS: readonly SituationKind[] = ['death', 'control'];
const SECONDS_PER_HOUR = 3600;
const PERCENT_SCALE = 100;
const TWO_SIDED = 2;
/** The normal quantile of a 95% interval. */
const Z_95 = 1.96;
const BYAR_NINE = 9;
const BYAR_THREE = 3;
const BYAR_CUBE = 3;
const RATE_DIGITS = 1;
const P_DIGITS = 3;
const GAIN_DIGITS = 2;

/**
 * Compares two replays of the same situations, pairing each trial with the same trial of the other: per kind, the
 * deaths of each, the trials only one of them died in, an exact McNemar p over those, deaths per game-hour with a 95%
 * interval, and the mean gain; then each death situation's deaths on both sides.
 *
 * @param a - The first replay, usually main.
 * @param b - The second, usually a variant.
 * @returns A markdown report.
 */
export function compareReplays(a: ReplayResults, b: ReplayResults): string {
  const byName = new Map(b.situations.map((situation) => [situation.name, situation]));
  const lines = [
    `A = ${a.label} (${a.commit ?? '?'}), B = ${b.label} (${b.commit ?? '?'})`,
    '',
    '| Kind | Situations | Trials | Deaths A | Deaths B | Only A died | Only B died | McNemar p | Deaths/h A | Deaths/h B | Mean gain A | Mean gain B |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  ];
  const perSituation: string[] = [];
  for (const kind of KINDS) {
    let situations = 0;
    let trials = 0;
    let onlyA = 0;
    let onlyB = 0;
    const totals = { a: { deaths: 0, gain: 0, seconds: 0 }, b: { deaths: 0, gain: 0, seconds: 0 } };
    for (const left of a.situations.filter((situation) => situation.kind === kind)) {
      const right = byName.get(left.name);
      if (!right) {
        continue;
      }
      situations++;
      const count = Math.min(left.outcomes.length, right.outcomes.length);
      let deathsA = 0;
      let deathsB = 0;
      for (let trial = 0; trial < count; trial++) {
        const outcomeA = left.outcomes[trial];
        const outcomeB = right.outcomes[trial];
        if (!outcomeA || !outcomeB) {
          continue;
        }
        trials++;
        totals.a = addOutcome(totals.a, outcomeA);
        totals.b = addOutcome(totals.b, outcomeB);
        deathsA += Number(outcomeA.died);
        deathsB += Number(outcomeB.died);
        onlyA += Number(outcomeA.died && !outcomeB.died);
        onlyB += Number(outcomeB.died && !outcomeA.died);
      }
      if (kind === 'death') {
        perSituation.push(`| ${left.name} | ${String(deathsA)}/${String(count)} | ${String(deathsB)}/${String(count)} |`);
      }
    }
    lines.push(
      `| ${kind} | ${String(situations)} | ${String(trials)} | ${String(totals.a.deaths)} | ${String(totals.b.deaths)} | ${String(onlyA)} | ${String(onlyB)} | ${exactMcNemarP(onlyA, onlyB).toFixed(P_DIGITS)} | ${formatRate(totals.a)} | ${formatRate(totals.b)} | ${formatGain(totals.a, trials)} | ${formatGain(totals.b, trials)} |`
    );
  }
  return [...lines, '', '| Death situation | Deaths A | Deaths B |', '| --- | --- | --- |', ...perSituation].join('\n');
}

/**
 * The exact two-sided McNemar test: under "neither pilot is better", each trial only one of them died in is a fair coin.
 *
 * @param onlyA - The trials only the first died in.
 * @param onlyB - The trials only the second died in.
 * @returns The p-value, 1 when there is nothing to tell them apart.
 */
export function exactMcNemarP(onlyA: number, onlyB: number): number {
  const total = onlyA + onlyB;
  const smaller = Math.min(onlyA, onlyB);
  let tail = 0;
  let term = (1 / TWO_SIDED) ** total;
  for (let index = 0; index <= smaller; index++) {
    tail += term;
    term *= (total - index) / (index + 1);
  }
  return Math.min(1, TWO_SIDED * tail);
}

/**
 * A 95% interval for a Poisson count, by Byar's approximation, which is within a few percent of the exact one from a
 * count of 1.
 *
 * @param count - The observed count.
 * @returns The lower and upper bound.
 */
export function poissonInterval(count: number): readonly [number, number] {
  const lower = count === 0 ? 0 : count * (1 - 1 / (BYAR_NINE * count) - Z_95 / (BYAR_THREE * Math.sqrt(count))) ** BYAR_CUBE;
  const next = count + 1;
  const upper = next * (1 - 1 / (BYAR_NINE * next) + Z_95 / (BYAR_THREE * Math.sqrt(next))) ** BYAR_CUBE;
  return [lower, upper];
}

function addOutcome(totals: SideTotals, outcome: TrialOutcome): SideTotals {
  return { deaths: totals.deaths + Number(outcome.died), gain: totals.gain + outcome.gain, seconds: totals.seconds + outcome.seconds };
}

function formatGain(totals: SideTotals, trials: number): string {
  return trials ? `${(totals.gain / trials * PERCENT_SCALE).toFixed(GAIN_DIGITS)}%` : '-';
}

function formatRate(totals: SideTotals): string {
  if (totals.seconds === 0) {
    return '-';
  }
  const hours = totals.seconds / SECONDS_PER_HOUR;
  const [lower, upper] = poissonInterval(totals.deaths);
  return `${(totals.deaths / hours).toFixed(RATE_DIGITS)} (${(lower / hours).toFixed(RATE_DIGITS)}-${(upper / hours).toFixed(RATE_DIGITS)})`;
}
