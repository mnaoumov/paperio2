/**
 * @file
 *
 * The ghost race's data: a run's path as samples of game time, position and territory, the rule that says which of two
 * runs is better, and where the best run is kept. A ghost replays positions rather than inputs: live play steps the
 * game by real frame times, so the same inputs do not give the same run twice, but the path a run took can always be
 * drawn again.
 */

/** A sample is taken at most this often, in game time. */
export const GHOST_SAMPLE_INTERVAL_MILLISECONDS = 100;
/** A run is sampled for at most this long; past it, the ghost stops where the run was. */
export const GHOST_MAX_DURATION_MILLISECONDS = 1_800_000;
/** Bump when the stored shape changes; a stored ghost of another version is ignored. */
export const GHOST_FORMAT_VERSION = 1;
/** Ghosts are kept under this prefix plus the seed, or `free` for a page without one. */
export const GHOST_STORAGE_PREFIX = 'paperio2.ghost.';
/** Where the menu's Ghost switch is remembered, `on` or `off`; it is off unless switched on. */
export const GHOST_SWITCH_STORAGE_KEY = 'paperio2.ghost';
/** A run must beat the best by more than this share of the arena to be the better run on territory alone. */
const PERCENT_EPSILON = 1e-6;
const SAMPLE_FIELDS = 4;
const TIME_FIELD = 0;
const X_FIELD = 1;
const Y_FIELD = 2;
const PERCENT_FIELD = 3;
const POSITION_DIGITS = 1;
const PERCENT_DIGITS = 6;
const DECIMAL_BASE = 10;
const HALF = 0.5;

/** A point of the arena. */
export interface GhostPoint {
  readonly x: number;
  readonly y: number;
}

export interface GhostPose {
  /** Whether the run had already ended at this time; the ghost then stays where it ended. */
  readonly ended: boolean;
  readonly percent: number;
  readonly x: number;
  readonly y: number;
}

export interface GhostTrack {
  /** The most territory the run held, as a share of the arena. */
  readonly best: number;
  /** The game time the run first held {@link GhostTrack.best}. */
  readonly bestAt: number;
  readonly duration: number;
  /** Who flew it, for the label: `You`, `Demo (Whitebox)` and so on. */
  readonly pilot: string;
  readonly recordedAt: number;
  /** Game time, x, y and territory share, flattened, in time order. */
  readonly samples: readonly number[];
  /** The speedrun seed of the page it was flown on, or `null`. */
  readonly seed: null | string;
  readonly version: number;
}

export class GhostRecorder {
  private best = 0;
  private bestAt = 0;
  private lastTime = Number.NEGATIVE_INFINITY;
  private readonly samples: number[] = [];

  public constructor(private readonly seed: null | string) {}

  /**
   * Turns what was sampled into a track.
   *
   * @param pilot - Who flew the run.
   * @param recordedAt - When the run ended, as `Date.now()`.
   * @returns The track, or `null` when nothing was sampled.
   */
  public finish(pilot: string, recordedAt: number): GhostTrack | null {
    if (this.samples.length === 0) {
      return null;
    }
    return {
      best: this.best,
      bestAt: this.bestAt,
      duration: this.lastTime,
      pilot,
      recordedAt,
      samples: [...this.samples],
      seed: this.seed,
      version: GHOST_FORMAT_VERSION
    };
  }

  /**
   * Takes a sample if the last one is at least {@link GHOST_SAMPLE_INTERVAL_MILLISECONDS} old.
   *
   * @param time - Game time since the run started.
   * @param x - The player's x.
   * @param y - The player's y.
   * @param percent - The player's territory, as a share of the arena.
   */
  public sample(time: number, x: number, y: number, percent: number): void {
    if (percent > this.best) {
      this.best = percent;
      this.bestAt = time;
    }
    if (time < this.lastTime + GHOST_SAMPLE_INTERVAL_MILLISECONDS || time > GHOST_MAX_DURATION_MILLISECONDS) {
      return;
    }
    this.lastTime = time;
    this.samples.push(time, roundTo(x, POSITION_DIGITS), roundTo(y, POSITION_DIGITS), roundTo(percent, PERCENT_DIGITS));
  }
}

/**
 * Where the ghost is at a game time: between two samples it is interpolated, after the last one it has ended.
 *
 * @param track - The track.
 * @param time - Game time since the run started.
 * @returns Its pose, or `null` before the first sample.
 */
export function ghostAt(track: GhostTrack, time: number): GhostPose | null {
  const { samples } = track;
  const count = samples.length / SAMPLE_FIELDS;
  if (count === 0 || time < sampleField(samples, 0, TIME_FIELD)) {
    return null;
  }
  const last = count - 1;
  if (time >= sampleField(samples, last, TIME_FIELD)) {
    return { ended: true, percent: sampleField(samples, last, PERCENT_FIELD), x: sampleField(samples, last, X_FIELD), y: sampleField(samples, last, Y_FIELD) };
  }
  let low = 0;
  let high = last;
  while (high - low > 1) {
    const middle = Math.floor((low + high) * HALF);
    if (sampleField(samples, middle, TIME_FIELD) <= time) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const start = sampleField(samples, low, TIME_FIELD);
  const share = (time - start) / (sampleField(samples, high, TIME_FIELD) - start);
  function between(field: number): number {
    return lerp(sampleField(samples, low, field), sampleField(samples, high, field), share);
  }
  return { ended: false, percent: between(PERCENT_FIELD), x: between(X_FIELD), y: between(Y_FIELD) };
}

/**
 * The ghost's path over a span of game time, for the fading tail drawn behind it.
 *
 * @param track - The track.
 * @param from - The span's start.
 * @param to - The span's end.
 * @returns The sampled points in the span.
 */
export function ghostPath(track: GhostTrack, from: number, to: number): GhostPoint[] {
  const points: GhostPoint[] = [];
  for (let index = 0; index < track.samples.length / SAMPLE_FIELDS; index++) {
    const time = sampleField(track.samples, index, TIME_FIELD);
    if (time >= from && time <= to) {
      points.push({ x: sampleField(track.samples, index, X_FIELD), y: sampleField(track.samples, index, Y_FIELD) });
    }
  }
  return points;
}

/**
 * The key a seed's best run is kept under.
 *
 * @param seed - The speedrun seed, or `null`.
 * @returns The `localStorage` key.
 */
export function ghostStorageKey(seed: null | string): string {
  return `${GHOST_STORAGE_PREFIX}${seed === null ? 'free' : `seed:${seed}`}`;
}

/**
 * Whether a run beats the best one: more territory, or as much sooner.
 *
 * @param candidate - The run just flown.
 * @param best - The best so far, or `null`.
 * @returns `true` when the candidate should replace it.
 */
export function isBetterRun(candidate: GhostTrack, best: GhostTrack | null): boolean {
  if (!best) {
    return true;
  }
  if (Math.abs(candidate.best - best.best) > PERCENT_EPSILON) {
    return candidate.best > best.best;
  }
  return candidate.bestAt < best.bestAt;
}

/**
 * Reads a stored track, refusing anything that is not one of this version.
 *
 * @param text - The stored JSON, or `null`.
 * @returns The track, or `null`.
 */
export function parseGhost(text: null | string): GhostTrack | null {
  if (text === null) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isGhostTrack(value)) {
    return null;
  }
  return value;
}

function isGhostTrack(value: unknown): value is GhostTrack {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record: Record<string, unknown> = { ...value };
  const { samples } = record;
  return record['version'] === GHOST_FORMAT_VERSION
    && typeof record['best'] === 'number'
    && typeof record['bestAt'] === 'number'
    && typeof record['duration'] === 'number'
    && typeof record['pilot'] === 'string'
    && typeof record['recordedAt'] === 'number'
    && (record['seed'] === null || typeof record['seed'] === 'string')
    && Array.isArray(samples)
    && samples.length > 0
    && samples.length % SAMPLE_FIELDS === 0
    && samples.every((sample: unknown) => typeof sample === 'number' && Number.isFinite(sample));
}

function lerp(from: number, to: number, share: number): number {
  return from + (to - from) * share;
}

function roundTo(value: number, digits: number): number {
  const factor = DECIMAL_BASE ** digits;
  return Math.round(value * factor) / factor;
}

function sampleField(samples: readonly number[], index: number, field: number): number {
  return samples[index * SAMPLE_FIELDS + field] ?? 0;
}
