/**
 * @file
 *
 * The showcase view of the demo: the camera follows the unit with the most territory, whoever it is, so a demo reads
 * as a match between the pilot and the bots rather than a run seen over the pilot's shoulder. It only moves the
 * camera, through `Game.cameraFollow`; it reads the game and writes nothing in it. The camera glides to a new leader
 * rather than cutting, and a leader keeps the camera until another unit is ahead of it by a margin, so two units
 * trading the lead do not make it flicker. While a human steers, the camera is the player's again.
 */

import type { Game } from '../engine.ts';
import type { Unit } from '../entities/units.ts';

import { Vector } from '../geometry/vector.ts';

/** A unit must be ahead of the leader by this share of the arena to take the camera. */
export const LEAD_MARGIN = 0.002;
/** Each frame of a glide closes this share of the distance to the new leader. */
export const GLIDE_STEP = 0.12;
/** A glide closer than this to its leader snaps onto it. */
export const GLIDE_SNAP_DISTANCE = 2;

export interface Ranked {
  readonly percent: number;
}

export class ShowcaseCamera {
  /** The unit the camera follows, for the readout. */
  public leader: null | Unit = null;
  private readonly camera = new Vector(0, 0);
  private gliding = false;

  /**
   * Makes a camera for the game; {@link ShowcaseCamera.attach} hands it the camera.
   *
   * @param game - The game.
   * @param isActive - Whether the showcase drives the camera now; while it answers `false` the camera is the original's.
   */
  public constructor(private readonly game: Game, private readonly isActive: () => boolean) {}

  public attach(): void {
    this.game.cameraFollow = (): null | Vector => this.follow();
  }

  public detach(): void {
    this.game.cameraFollow = null;
    this.leader = null;
  }

  private follow(): null | Vector {
    if (!this.isActive()) {
      this.leader = null;
      return null;
    }
    const leader = pickLeader(this.game.units, this.leader);
    if (!leader) {
      return null;
    }
    if (leader !== this.leader) {
      const from = this.game.origin;
      this.gliding = from !== null;
      if (from) {
        this.camera.x = from.x;
        this.camera.y = from.y;
      }
      this.leader = leader;
    }
    if (!this.gliding) {
      return leader.position;
    }
    const dx = leader.position.x - this.camera.x;
    const dy = leader.position.y - this.camera.y;
    if (Math.hypot(dx, dy) < GLIDE_SNAP_DISTANCE) {
      this.gliding = false;
      return leader.position;
    }
    this.camera.x += dx * GLIDE_STEP;
    this.camera.y += dy * GLIDE_STEP;
    return this.camera;
  }
}

/**
 * Picks the unit the camera follows.
 *
 * @param units - The units alive.
 * @param current - The unit followed until now, or `null`.
 * @returns The unit with the most territory, unless the current one is within {@link LEAD_MARGIN} of it.
 */
export function pickLeader<T extends Ranked>(units: readonly T[], current: null | T): null | T {
  let best: null | T = null;
  for (const unit of units) {
    if (!best || unit.percent > best.percent) {
      best = unit;
    }
  }
  if (current && best && units.includes(current) && best.percent - current.percent < LEAD_MARGIN) {
    return current;
  }
  return best;
}
