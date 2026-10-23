/**
 * @file
 *
 * Practice mode: checkpoints in the manner of Geometry Dash. While a practice run is on, a checkpoint is taken every
 * {@link PracticeConstructorOptions.autoIntervalMilliseconds} of game time, a death respawns the player at the latest one, and
 * the player can add one or remove the latest at any time. A practice run does not count: no achievement is tracked
 * and no best score is set, and the results screen says it was practice.
 *
 * Automatic checkpoints are uniform: they fall on a fixed grid of game time that starts at the run's first
 * checkpoint, wherever the player is, trail and all, and a manual one does not move the grid.
 *
 * Nothing caps how many are kept, but a mid-game snapshot holds about 5 MB, so a checkpoint every 10 s would hold
 * gigabytes within the hour. Every manual checkpoint and the recent automatic ones are kept; older automatic ones are
 * thinned by age (see {@link keepsAutoCheckpoint}), so an hour holds 25 automatic ones and each further hour adds 6.
 */

import type { Game } from './engine.ts';
import type { GameSnapshot } from './snapshot.ts';

import { KILL_REASON_SYSTEM } from './shared/constants.ts';
import {
  canCaptureSnapshot,
  captureSnapshot,
  restoreSnapshot
} from './snapshot.ts';

export interface Checkpoint {
  /** For an automatic checkpoint, its point on the grid: 0 for the run's first, then one per interval. */
  readonly autoIndex: null | number;
  readonly id: number;
  readonly isAuto: boolean;
  /** The run's playtime when it was taken, in milliseconds of game time. */
  readonly playtime: number;
  readonly snapshot: GameSnapshot;
}

export interface PracticeConstructorOptions {
  readonly autoIntervalMilliseconds: number;
}

const DEFAULT_AUTO_INTERVAL_MILLISECONDS = 10_000;
export const DEFAULT_PRACTICE_OPTIONS: PracticeConstructorOptions = {
  autoIntervalMilliseconds: DEFAULT_AUTO_INTERVAL_MILLISECONDS
};

/** How many of the latest automatic checkpoints are all kept: the last 100 s at the default interval. */
export const RECENT_AUTO_CHECKPOINTS = 10;
/** Past the recent ones, every this many is kept (one a minute at the default interval)... */
export const MIDDLE_AUTO_CHECKPOINT_SPACING = 6;
/** ...until they are this many intervals old (about the last 11 minutes)... */
export const MIDDLE_AUTO_CHECKPOINT_AGE = 70;
/** ...and older ones, every this many (one every 10 minutes). */
export const OLD_AUTO_CHECKPOINT_SPACING = 60;

export class Practice {
  public checkpoints: Checkpoint[] = [];
  /** How many times the player has died in this run. */
  public deaths = 0;
  /** Set once the player ends the run; a death after it ends the game as usual. */
  public ended = false;
  public readonly game: Game;
  /** Told whenever the checkpoints, the death count or the run's state change, so the page can show them. */
  public onChange: (() => void) | null = null;
  /** Shows a short message to the player, such as why a checkpoint could not be taken. */
  public onMessage: ((text: string) => void) | null = null;
  public readonly options: PracticeConstructorOptions;
  public respawnPending = false;

  /** The game time of the run's first automatic checkpoint, where the grid of automatic ones starts. */
  private autoGridStart: null | number = null;
  private nextAutoTime = Infinity;
  private nextId = 1;

  public constructor(game: Game, options: PracticeConstructorOptions = DEFAULT_PRACTICE_OPTIONS) {
    this.game = game;
    this.options = options;
  }

  /**
   * Adds a checkpoint now. Call it between frames.
   *
   * @param isAuto - Whether the timer took it rather than the player.
   * @returns The checkpoint, or `null` while one cannot be taken: no player in play, a death delay running, or the
   * game still preparing.
   */
  public add(isAuto = false): Checkpoint | null {
    const { player } = this.game;
    // Play pressed before the menu's prepare phase is through leaves the game fast-forwarding, at up to
    // `prepareAcceleration` updates a frame, until it reaches `prepareCounter`. A checkpoint from then would replay that
    // Fast-forward on every respawn and throw the player off its base.
    if (this.ended || !player || !this.game.units.includes(player) || this.game.preparing() || !canCaptureSnapshot(this.game)) {
      return null;
    }
    const snapshot = captureSnapshot(this.game);
    if (isAuto) {
      this.autoGridStart ??= snapshot.clockTime;
    }
    const autoIndex = isAuto && this.autoGridStart !== null ? Math.floor((snapshot.clockTime - this.autoGridStart) / this.options.autoIntervalMilliseconds) : null;
    const checkpoint: Checkpoint = {
      autoIndex,
      id: this.nextId++,
      isAuto,
      playtime: snapshot.clockTime - this.game.startTime,
      snapshot
    };
    this.checkpoints.push(checkpoint);
    if (autoIndex !== null) {
      this.scheduleNextAuto(snapshot.clockTime);
      this.thin(autoIndex);
    }
    this.game.videoRecorder?.onCheckpoint(checkpoint);
    this.changed();
    return checkpoint;
  }

  /**
   * Takes an automatic checkpoint when one is due, wherever the player is: on the first frame at or past its point on
   * the grid, so it is never more than a frame late. With no checkpoint left, it takes one at once. The game loop
   * calls it after each frame.
   */
  public afterFrame(): void {
    const { game } = this;
    const { player } = game;
    if (this.ended || this.respawnPending || !player || !game.units.includes(player)) {
      return;
    }
    if (this.checkpoints.length === 0 || game.clock.now() >= this.nextAutoTime) {
      this.add(true);
    }
  }

  /**
   * Starts the run: the player's achievements stop being tracked, and the first checkpoint is taken where they
   * spawned. If the game is still preparing, `afterFrame` takes it instead, on the first frame after the preparation.
   */
  public begin(): void {
    const { player } = this.game;
    if (player) {
      player.achievements = null;
    }
    this.add(true);
  }

  /** Ends the run: the player is removed, and the results come up as after any death, marked as practice. */
  public end(): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    this.respawnPending = false;
    this.changed();
    const { player } = this.game;
    if (player && this.game.units.includes(player)) {
      this.game.kill(player, undefined, KILL_REASON_SYSTEM);
    } else if (player) {
      this.game.gameOver(KILL_REASON_SYSTEM);
    }
  }

  /**
   * Takes over the player's death: after the engine's usual death delay, the latest checkpoint is restored instead
   * of the results coming up.
   *
   * @param reason - The kill reason, for the results if no checkpoint is left by the end of the delay.
   * @param delay - The death delay the engine would wait before the results.
   * @returns `true` when the death is handled here, `false` when the game should end as usual.
   */
  public handlePlayerDeath(reason: number, delay: number): boolean {
    if (this.ended || this.checkpoints.length === 0) {
      return false;
    }
    this.deaths++;
    this.respawnPending = true;
    this.changed();
    this.game.clock.setTimeout(() => {
      if (this.ended) {
        // `end` already handed the game over to the results.
        return;
      }
      this.respawnPending = false;
      if (!this.respawn()) {
        this.ended = true;
        this.changed();
        this.game.gameOver(reason);
      }
    }, delay);
    return true;
  }

  /**
   * Removes the latest checkpoint.
   *
   * @returns `false` when there was none.
   */
  public removeLatest(): boolean {
    if (this.checkpoints.pop() === undefined) {
      return false;
    }
    this.changed();
    return true;
  }

  /**
   * Puts the game back to the latest checkpoint. Call it between frames.
   *
   * @returns `false` when there is none.
   */
  public respawn(): boolean {
    const latest = this.checkpoints[this.checkpoints.length - 1];
    if (!latest || this.ended) {
      return false;
    }
    restoreSnapshot(this.game, latest.snapshot);
    this.respawnPending = false;
    this.scheduleNextAuto(latest.snapshot.clockTime);
    this.game.videoRecorder?.onRespawn(latest);
    this.game.sounds?.onRespawn();
    this.changed();
    return true;
  }

  private changed(): void {
    this.onChange?.();
  }

  /**
   * Sets the next automatic checkpoint to the first point of the grid after `time`.
   *
   * @param time - The game time the run is at.
   */
  private scheduleNextAuto(time: number): void {
    if (this.autoGridStart === null) {
      return;
    }
    const interval = this.options.autoIntervalMilliseconds;
    this.nextAutoTime = this.autoGridStart + (Math.floor((time - this.autoGridStart) / interval) + 1) * interval;
  }

  /**
   * Drops the old automatic checkpoints {@link keepsAutoCheckpoint} does not keep. Manual ones are never dropped.
   *
   * @param latestIndex - The grid index of the automatic checkpoint just taken.
   */
  private thin(latestIndex: number): void {
    this.checkpoints = this.checkpoints.filter((checkpoint: Checkpoint) => checkpoint.autoIndex === null || keepsAutoCheckpoint(checkpoint.autoIndex, latestIndex));
  }
}

/**
 * Tells whether an automatic checkpoint survives the thinning. The rule goes by grid index, so a checkpoint kept at
 * one age is still kept at an older one only if the coarser spacing keeps it, and the first one (index 0) is never
 * dropped.
 *
 * @param index - The checkpoint's point on the grid.
 * @param latestIndex - The latest automatic checkpoint's point on the grid.
 * @returns `false` when it is dropped.
 */
export function keepsAutoCheckpoint(index: number, latestIndex: number): boolean {
  const age = latestIndex - index;
  if (age < RECENT_AUTO_CHECKPOINTS) {
    return true;
  }
  if (age < MIDDLE_AUTO_CHECKPOINT_AGE && index % MIDDLE_AUTO_CHECKPOINT_SPACING === 0) {
    return true;
  }
  return index % OLD_AUTO_CHECKPOINT_SPACING === 0;
}
