/**
 * @file
 *
 * Practice mode: checkpoints in the manner of Geometry Dash. While a practice run is on, a checkpoint is taken every
 * {@link PracticeConstructorOptions.autoIntervalMilliseconds} of game time, a death respawns the player at the latest one, and
 * the player can add one or remove one at any time. A practice run does not count: no achievement is tracked and no
 * best score is set, and the results screen says it was practice.
 *
 * An automatic checkpoint waits until the player is inside their own territory, so it never saves a trail that is
 * about to be cut. A manual one is taken wherever the player asks for it.
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
  readonly id: number;
  readonly isAuto: boolean;
  /** The run's playtime when it was taken, in milliseconds of game time. */
  readonly playtime: number;
  readonly snapshot: GameSnapshot;
  /** Where the player was, for the marker. */
  readonly x: number;
  readonly y: number;
}

export interface PracticeConstructorOptions {
  readonly autoIntervalMilliseconds: number;
  readonly maxAutoCheckpoints: number;
  readonly maxManualCheckpoints: number;
}

const DEFAULT_AUTO_INTERVAL_MILLISECONDS = 10_000;
const DEFAULT_MAX_AUTO_CHECKPOINTS = 10;
const DEFAULT_MAX_MANUAL_CHECKPOINTS = 20;
export const DEFAULT_PRACTICE_OPTIONS: PracticeConstructorOptions = {
  autoIntervalMilliseconds: DEFAULT_AUTO_INTERVAL_MILLISECONDS,
  maxAutoCheckpoints: DEFAULT_MAX_AUTO_CHECKPOINTS,
  maxManualCheckpoints: DEFAULT_MAX_MANUAL_CHECKPOINTS
};

const HALF = 2;
const MARKER_POLE_HEIGHT = 30;
const MARKER_FLAG_WIDTH = 18;
const MARKER_FLAG_HEIGHT = 12;
const MARKER_LINE_WIDTH = 2.5;
const LATEST_MARKER_COLOR = '#2ecc71';
const AUTO_MARKER_COLOR = '#ffffff';
const MANUAL_MARKER_COLOR = '#f5c400';
const MARKER_OUTLINE_COLOR = '#2b3a33';

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

  private lastAutoTime: number;
  private nextId = 1;

  public constructor(game: Game, options: PracticeConstructorOptions = DEFAULT_PRACTICE_OPTIONS) {
    this.game = game;
    this.options = options;
    this.lastAutoTime = game.clock.now();
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
    const checkpoint: Checkpoint = {
      id: this.nextId++,
      isAuto,
      playtime: snapshot.clockTime - this.game.startTime,
      snapshot,
      x: player.position.x,
      y: player.position.y
    };
    this.checkpoints.push(checkpoint);
    this.trim(isAuto);
    this.lastAutoTime = snapshot.clockTime;
    this.changed();
    return checkpoint;
  }

  /** Takes an automatic checkpoint when one is due. The game loop calls it after each frame. */
  public afterFrame(): void {
    const { game } = this;
    const { player } = game;
    if (this.ended || this.respawnPending || !player || player.in !== player.base) {
      return;
    }
    if (this.checkpoints.length === 0 || game.clock.now() - this.lastAutoTime >= this.options.autoIntervalMilliseconds) {
      this.add(true);
    }
  }

  /**
   * Starts the run: the player's achievements stop being tracked, and the first checkpoint is taken where they
   * spawned. If the game is still preparing, `afterFrame` takes it instead, on the first frame after the preparation
   * that finds the player in its base.
   */
  public begin(): void {
    const { player } = this.game;
    if (player) {
      player.achievements = null;
    }
    this.add(true);
  }

  /**
   * Draws a flag at each checkpoint. The renderer calls it with the canvas in world coordinates.
   *
   * @param context - The canvas context.
   * @param scale - The world-to-canvas scale, so the flags keep their size on screen.
   */
  public drawMarkers(context: CanvasRenderingContext2D, scale: number): void {
    if (this.checkpoints.length === 0) {
      return;
    }
    const latest = this.checkpoints[this.checkpoints.length - 1];
    const size = 1 / scale;
    context.save();
    context.lineWidth = MARKER_LINE_WIDTH * size;
    context.strokeStyle = MARKER_OUTLINE_COLOR;
    for (const checkpoint of this.checkpoints) {
      const { x, y } = checkpoint;
      const top = y - MARKER_POLE_HEIGHT * size;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x, top);
      context.stroke();
      context.beginPath();
      context.moveTo(x, top);
      context.lineTo(x + MARKER_FLAG_WIDTH * size, top + MARKER_FLAG_HEIGHT * size / HALF);
      context.lineTo(x, top + MARKER_FLAG_HEIGHT * size);
      context.closePath();
      if (checkpoint === latest) {
        context.fillStyle = LATEST_MARKER_COLOR;
      } else {
        context.fillStyle = checkpoint.isAuto ? AUTO_MARKER_COLOR : MANUAL_MARKER_COLOR;
      }
      context.fill();
      context.stroke();
    }
    context.restore();
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
   * Removes a checkpoint.
   *
   * @param id - The checkpoint's id, or nothing for the latest.
   * @returns `false` when there was no such checkpoint.
   */
  public remove(id?: number): boolean {
    const index = id === undefined ? this.checkpoints.length - 1 : this.checkpoints.findIndex((checkpoint: Checkpoint) => checkpoint.id === id);
    if (index < 0) {
      return false;
    }
    this.checkpoints.splice(index, 1);
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
    this.lastAutoTime = latest.snapshot.clockTime;
    this.changed();
    return true;
  }

  private changed(): void {
    this.onChange?.();
  }

  private trim(isAuto: boolean): void {
    const limit = isAuto ? this.options.maxAutoCheckpoints : this.options.maxManualCheckpoints;
    const ofKind = this.checkpoints.filter((checkpoint: Checkpoint) => checkpoint.isAuto === isAuto);
    const excess = ofKind.length - limit;
    if (excess > 0) {
      const dropped = new Set(ofKind.slice(0, excess));
      this.checkpoints = this.checkpoints.filter((checkpoint: Checkpoint) => !dropped.has(checkpoint));
    }
  }
}
