/**
 * @file
 *
 * The per-game stats log's line shapes: a JSON object per line (JSONL), the same for a human's game in the page and
 * for a pilot's game in the benchmark, so one report reads both. This file holds types and names only, so the Node
 * report script can import it without the browser's types.
 */

/** Bumped whenever a line's shape changes, so a reader can tell old logs apart. */
export const STATS_FORMAT_VERSION = 2;

/** Game time between two samples, in milliseconds. */
export const STATS_SAMPLE_MILLISECONDS = 250;

/** The kill reasons by the engine's codes (`KILL_REASON_*`). */
export const KILL_REASON_NAMES: readonly string[] = ['win', 'self-intersection', 'wall', 'trail cut', 'exit point taken', 'surrounded', 'system', 'capital surrounded'];

/** A frame slower than two frames at 60 fps dropped at least one. */
// eslint-disable-next-line no-magic-numbers -- two 60 fps frames.
export const SLOW_FRAME_MILLISECONDS = 2000 / 60;

/** A capture: the player's ground grew. */
export interface StatsCaptureEvent extends StatsEventBase {
  readonly event: 'capture';
  /** The share of the arena taken, in percent. */
  readonly gained: number;
  readonly pct: number;
}

/** The player died. */
export interface StatsDeathEvent extends StatsEventBase {
  readonly event: 'death';
  readonly killer: null | string;
  readonly pct: number;
  /** The kill reason, or `null` when a practice run took the death over before the engine named it. */
  readonly reason: null | string;
}

/** The last line: how the game ended and its totals. */
export interface StatsEndLine {
  /** The player's best share of the arena, in percent. */
  readonly best: number;
  readonly captures: number;
  /** Frames counted in the frame-time totals. */
  readonly frames: number;
  readonly frameTimeMax: number;
  readonly frameTimeMean: number;
  /** Who killed the player, when a unit did. */
  readonly killer: null | string;
  readonly kills: number;
  readonly outcome: StatsOutcome;
  readonly pct: number;
  readonly reason: null | string;
  /** Frames slower than {@link SLOW_FRAME_MILLISECONDS}. */
  readonly slowFrames: number;
  /** Seconds of game time since the run started. */
  readonly t: number;
  readonly type: 'end';
}

/** The enemy settings the game was played against. */
export interface StatsEnemies {
  readonly count: null | number;
  readonly level: null | number;
  readonly mode: string;
  readonly vision: string;
}

/** What every event line carries. */
export interface StatsEventBase {
  /** Seconds of game time since the run started. */
  readonly t: number;
  readonly type: 'event';
}

/** Something that happened between two samples. */
export type StatsEventLine = StatsCaptureEvent | StatsDeathEvent | StatsKillEvent | StatsLostEvent | StatsPracticeEvent | StatsRewindEvent | StatsWinEvent;

/** The first line: what the game was played with. */
export interface StatsHeaderLine {
  /** The engine's build number (`GAME_BUILD`). */
  readonly build: number;
  /** The commit the page was built from, or `null` outside `build.mjs`. */
  readonly commit: null | string;
  readonly enemies: StatsEnemies;
  readonly format: number;
  /** Who started the game: `human`, or the demo pilot's mode. */
  readonly pilot: string;
  readonly sampleMilliseconds: number;
  readonly seed: null | string;
  /** ISO time the log started. */
  readonly startedAt: string;
  readonly type: 'header';
  readonly viewport: StatsViewport;
}

/** The player killed a unit. */
export interface StatsKillEvent extends StatsEventBase {
  readonly event: 'kill';
  readonly victim: string;
}

export type StatsLine = StatsEndLine | StatsEventLine | StatsHeaderLine | StatsSampleLine;

/** Another unit took some of the player's ground. */
export interface StatsLostEvent extends StatsEventBase {
  readonly event: 'lost';
  /** The share of the arena lost, in percent. */
  readonly lost: number;
  readonly pct: number;
}

export type StatsOutcome = 'death' | 'quit' | 'win';

/** The run turned out to be a practice run. */
export interface StatsPracticeEvent extends StatsEventBase {
  readonly event: 'practice';
}

/** A practice respawn put the game back to a checkpoint: game time runs on from `t`. */
export interface StatsRewindEvent extends StatsEventBase {
  readonly event: 'rewind';
  /** The game time the respawn left. */
  readonly from: number;
}

/** The state every {@link STATS_SAMPLE_MILLISECONDS} of game time, with the frames since the last sample. */
export interface StatsSampleLine {
  /** Frames since the last sample. */
  readonly frames: number;
  /** The longest of those frames, in milliseconds. */
  readonly frameTimeMax: number;
  readonly frameTimeMean: number;
  /** The player's share of the arena, in percent. */
  readonly pct: number;
  /** 1 for the leader. */
  readonly rank: number;
  /** The mean render time of those frames, in milliseconds. */
  readonly renderTime: number;
  /** Those of the frames slower than {@link SLOW_FRAME_MILLISECONDS}. */
  readonly slowFrames: number;
  /** Who steered on the last frame: `human` or `pilot`. */
  readonly steer: StatsSteer;
  /** Seconds of game time since the run started. */
  readonly t: number;
  /** The trail's length, in arena units; 0 at home. */
  readonly trail: number;
  readonly type: 'sample';
  readonly units: number;
  /** The mean update time of those frames, in milliseconds. */
  readonly updateTime: number;
  readonly x: number;
  readonly y: number;
  /** Where the head is: on its own ground, open ground or another unit's ground. */
  readonly zone: StatsZone;
}

export type StatsSteer = 'human' | 'pilot';

/** The window the game was played in. */
export interface StatsViewport {
  readonly devicePixelRatio: number;
  readonly height: number;
  readonly width: number;
}

/** The player won. */
export interface StatsWinEvent extends StatsEventBase {
  readonly event: 'win';
}

export type StatsZone = 'enemy' | 'open' | 'own';
