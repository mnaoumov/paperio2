/**
 * @file
 *
 * An experimental whitebox planner that checks its loops against the real engine before flying one: the best few loops
 * {@link findLoops} finds are each played as an isolated engine rollout (`rollout/`), steered by the schedule
 * {@link loopSchedule} gives, and the first one the player flies and closes without dying is taken. The rollout is
 * open-loop and the bots' future depends on the player's real flight, so a passed loop is a forecast, not a proof.
 */

import type {
  RolloutRequest,
  RolloutResult
} from '../rollout/protocol.ts';
import type { Point } from './plane.ts';
import type {
  LoopPlanner,
  PlanInput,
  PlannedLoop
} from './whitebox.ts';

import {
  MAX_ROLLOUT_FRAMES,
  ROLLOUT_STEP_MS
} from '../rollout/protocol.ts';
import {
  findLoops,
  loopSchedule
} from './whitebox.ts';

/** How many loops are tried in rollouts, best first. */
const ROLLOUT_CANDIDATES = 3;
/** The rollout carries on this many frames past the scheduled return, so a cut just after closing still counts. */
const RETURN_MARGIN_FRAMES = 25;
const MILLISECONDS_IN_SECOND = 1000;
/** Golden-ratio increments give each request its own explicit random state without drawing `Math.random`. */
const RANDOM_STATE_STEP = 0x9e37_79b9;
const EMPTY_TRAIL_PREFIX = '0:';
/** The out-of-reach skip adds this much flight time to every unit's reach. */
const REACH_MARGIN_SECONDS = 1;

export interface RolloutPlannerStats {
  accepted: number;
  /** Requests whose rollout could not run, answered with no loop. */
  errors: number;
  /** Requests with no loop to try. */
  none: number;
  /** Requests where every loop was rejected. */
  rejectedAll: number;
  rejectedDeath: number;
  rejectedNoReturn: number;
  /** Loops too long for one rollout. */
  rejectedTooLong: number;
  rollouts: number;
  /** Loops taken without a rollout, because no unit could reach them during the flight. */
  skipped: number;
}

export type RolloutRunner = (request: RolloutRequest) => Promise<RolloutResult>;

export type RolloutVerdict = 'death' | 'no-return' | 'safe';

export class RolloutPlanner {
  /** The checks in flight, so a benchmark can wait for them before its next frame and stay frame for frame. */
  public pending: null | Promise<void> = null;
  public readonly stats: RolloutPlannerStats = { accepted: 0, errors: 0, none: 0, rejectedAll: 0, rejectedDeath: 0, rejectedNoReturn: 0, rejectedTooLong: 0, rollouts: 0, skipped: 0 };
  private requests = 0;

  /**
   * Creates a planner; give {@link RolloutPlanner.plan} to the whitebox pilot.
   *
   * @param playerName - Reads the player's name, to find it in a rollout's frames.
   * @param run - Runs one rollout.
   */
  public constructor(private readonly playerName: () => null | string, private readonly run: RolloutRunner) {}

  /**
   * The planner to give the whitebox pilot.
   *
   * @param input - What the plan reads.
   * @param answer - Told the checked loop, or `null`.
   */
  public readonly plan: LoopPlanner = (input, answer): void => {
    this.pending = this.check(input).then(answer, () => {
      answer(null);
    }).finally(() => {
      this.pending = null;
    });
  };

  private async check(input: PlanInput): Promise<null | PlannedLoop> {
    const loops = findLoops(input, ROLLOUT_CANDIDATES);
    const name = this.playerName();
    if (loops.length === 0 || name === null) {
      this.stats.none++;
      return null;
    }
    const stepSeconds = ROLLOUT_STEP_MS / MILLISECONDS_IN_SECOND;
    for (const loop of loops) {
      const directions = loopSchedule(input, loop.waypoints, stepSeconds, MAX_ROLLOUT_FRAMES - RETURN_MARGIN_FRAMES);
      if (directions.length === 0 || directions.length >= MAX_ROLLOUT_FRAMES - RETURN_MARGIN_FRAMES) {
        this.stats.rejectedTooLong++;
        continue;
      }
      if (isOutOfReach(input, loop, (directions.length + RETURN_MARGIN_FRAMES) * stepSeconds)) {
        this.stats.skipped++;
        return loop;
      }
      let result: RolloutResult;
      try {
        this.stats.rollouts++;
        result = await this.run(rolloutRequest(directions, ++this.requests));
      } catch {
        // An unchecked loop is no better than none here: the pilot holds and asks again after its cooldown.
        this.stats.errors++;
        return null;
      }
      const verdict = judgeRollout(result, name);
      if (verdict === 'safe') {
        this.stats.accepted++;
        return { ...loop, checked: true, schedule: { directions, stepSeconds } };
      }
      if (verdict === 'death') {
        this.stats.rejectedDeath++;
      } else {
        this.stats.rejectedNoReturn++;
      }
    }
    this.stats.rejectedAll++;
    return null;
  }
}

/**
 * Whether every unit is too far from the loop and the player to touch either during the flight. Every unit moves at
 * the player's speed, so one farther than the flight's length plus a margin cannot cut the trail or meet the player.
 * A far bot whose own capture closes around the loop is not ruled out by this; the rollout skip accepts that.
 *
 * @param input - What the plan read.
 * @param loop - The loop.
 * @param seconds - How long the flight lasts, margin included.
 * @returns Whether no unit can reach it.
 */
export function isOutOfReach(input: PlanInput, loop: PlannedLoop, seconds: number): boolean {
  const reach = input.speed * (seconds + REACH_MARGIN_SECONDS);
  const { center, spread } = loop.check;
  return input.enemies.every((enemy) => Math.hypot(enemy.position.x - center.x, enemy.position.y - center.y) - spread > reach
    && Math.hypot(enemy.position.x - input.position.x, enemy.position.y - input.position.y) > reach);
}

/**
 * Whether the player in a rollout flew out, closed its trail at home and was still alive when the rollout ended.
 *
 * @param result - The rollout.
 * @param player - The player's name.
 * @returns `safe`, or why not.
 */
export function judgeRollout(result: RolloutResult, player: string): RolloutVerdict {
  if (result.death) {
    return 'death';
  }
  let left = false;
  for (const frame of result.frames) {
    const unit = frame.units.find((candidate) => candidate.name === player);
    if (!unit) {
      return 'death';
    }
    if (!unit.inOwnBase) {
      left = true;
    } else if (left && unit.trail.startsWith(EMPTY_TRAIL_PREFIX)) {
      return 'safe';
    }
  }
  return 'no-return';
}

/**
 * A rollout request steering by a schedule: one input wherever the direction changes, run past the scheduled return.
 *
 * @param directions - The direction for each frame.
 * @param request - The request's number, which picks its random state.
 * @returns The request.
 */
export function rolloutRequest(directions: readonly Point[], request: number): RolloutRequest {
  const inputs = [];
  let previous: null | Point = null;
  for (const [frame, direction] of directions.entries()) {
    if (previous?.x !== direction.x || previous.y !== direction.y) {
      inputs.push({ frame, x: direction.x, y: direction.y });
      previous = direction;
    }
  }
  // eslint-disable-next-line no-bitwise -- an unsigned 32-bit random state.
  const randomState = Math.imul(request, RANDOM_STATE_STEP) >>> 0;
  return { frames: directions.length + RETURN_MARGIN_FRAMES, ignoreParticles: true, inputs, randomState };
}
