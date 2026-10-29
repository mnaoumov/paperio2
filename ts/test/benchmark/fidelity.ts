/**
 * @file
 *
 * The pure half of the rollout fidelity benchmark (`rollout-fidelity.ts`): the loop schedules it flies, how a schedule
 * on the rollout's 20 ms grid is read at another frame length, and how a rollout's frames are compared with the live
 * game's. Every frame is placed by its game clock time since the capture, so a 20 ms rollout and a 60 fps live game
 * meet every 100 ms.
 */

import type {
  RolloutFrame,
  RolloutInput
} from '../../src/rollout/protocol.ts';

export interface Comparison {
  /** When the player is first more than {@link PLAYER_DIVERGENCE_UNITS} apart, or `null`. */
  readonly firstPlayerMs: null | number;
  /** When the bots first disagree on a state, or `null`. */
  readonly firstStateMs: null | number;
  readonly points: readonly GridPoint[];
}

/** The first thing two tracks disagree on, at any moment both have a frame. */
export interface Difference {
  readonly elapsedMs: number;
  readonly field: string;
  readonly forecast: string;
  readonly live: string;
  readonly unit: string;
}

export interface Direction {
  readonly x: number;
  readonly y: number;
}

/** One moment of a comparison, on the shared grid. */
export interface GridPoint {
  readonly botErrorMax: null | number;
  readonly botErrorMedian: null | number;
  /** Bots alive in only one of the two. */
  readonly botsInOne: number;
  readonly elapsedMs: number;
  /** `null` when the player is gone in one of the two. */
  readonly playerError: null | number;
  /** Bots alive in both whose state machine is in another state. */
  readonly stateMismatches: number;
}

/**
 * How a live update picks its direction from a schedule. `aligned` holds the direction the rollout held over the same
 * stretch of game time; `pilot` is the whitebox pilot's `floor((now - start) / step)`, which reads the clock at the end
 * of the update and so runs up to one step ahead.
 */
export type IndexRule = 'aligned' | 'pilot';

export type ScheduleShape = 'arc' | 'square';

/** The player's own death time, since the capture, or `null`. */
export interface Track {
  readonly deathMs: null | number;
  readonly poses: ReadonlyMap<number, ReadonlyMap<string, UnitPose>>;
}

export interface UnitPose {
  readonly angle: number;
  readonly state: null | string;
  /** The trail's fingerprint: segment count and two hashes of its exact coordinates. */
  readonly trail: string;
  readonly x: number;
  readonly y: number;
}

/** The rollout's frame length, the grid every schedule is written on. */
export const SCHEDULE_STEP_MS = 20;
/** Where a 20 ms rollout and a 60 fps game both have a frame. */
export const GRID_MS = 100;
export const PLAYER_DIVERGENCE_UNITS = 1;
/** The square loop's legs: out, sideways, back, in milliseconds from the start. */
const SQUARE_SIDE_MS = 1500;
const SQUARE_BACK_MS = 2500;
/** The arc goes straight out, then turns a full circle, then holds. */
const ARC_TURN_START_MS = 600;
const ARC_TURN_END_MS = 4200;
const HALF_TURNS_PER_TURN = 2;
const FULL_TURN = Math.PI * HALF_TURNS_PER_TURN;
const QUARTER_TURN = Math.PI / HALF_TURNS_PER_TURN;
/** Times are keyed in thirds of a millisecond, which both 20 ms and 50 / 3 ms frames land on. */
const KEY_SCALE = 3;
/** A clock reading that misses a step boundary by float noise still counts as on it. */
const INDEX_EPSILON = 1e-6;
const MEDIAN_HALF = 2;

/**
 * Compares two tracks on the {@link GRID_MS} grid, up to the first moment either has no frame.
 *
 * @param forecast - The rollout.
 * @param live - The live game.
 * @param player - The player's name.
 * @param endMs - The last moment compared.
 * @returns The comparison.
 */
export function compareTracks(forecast: Track, live: Track, player: string, endMs: number): Comparison {
  const points: GridPoint[] = [];
  let firstPlayerMs: null | number = null;
  let firstStateMs: null | number = null;
  for (let elapsedMs = GRID_MS; elapsedMs <= endMs; elapsedMs += GRID_MS) {
    const left = forecast.poses.get(timeKey(elapsedMs));
    const right = live.poses.get(timeKey(elapsedMs));
    if (!left || !right) {
      break;
    }
    const point = comparePoses(left, right, player, elapsedMs);
    points.push(point);
    if (firstPlayerMs === null && (point.playerError === null || point.playerError > PLAYER_DIVERGENCE_UNITS)) {
      firstPlayerMs = elapsedMs;
    }
    if (firstStateMs === null && point.stateMismatches > 0) {
      firstStateMs = elapsedMs;
    }
  }
  return { firstPlayerMs, firstStateMs, points };
}

/**
 * The first moment, unit and field two tracks disagree on exactly, over every moment both have a frame: each frame
 * when both run at one frame length, every 100 ms otherwise.
 *
 * @param forecast - The rollout.
 * @param live - The live game.
 * @returns The difference, or `null` when they agree to the end of the shorter.
 */
export function firstDifference(forecast: Track, live: Track): Difference | null {
  const keys = [...forecast.poses.keys()].filter((key) => live.poses.has(key)).sort((left, right) => left - right);
  for (const key of keys) {
    const left = forecast.poses.get(key) ?? new Map<string, UnitPose>();
    const right = live.poses.get(key) ?? new Map<string, UnitPose>();
    for (const name of new Set([...left.keys(), ...right.keys()])) {
      const a = left.get(name);
      const b = right.get(name);
      const elapsedMs = key / KEY_SCALE;
      if (!a || !b) {
        return { elapsedMs, field: 'alive', forecast: String(a !== undefined), live: String(b !== undefined), unit: name };
      }
      for (const field of ['x', 'y', 'angle', 'state', 'trail'] as const) {
        if (a[field] !== b[field]) {
          return { elapsedMs, field, forecast: String(a[field]), live: String(b[field]), unit: name };
        }
      }
    }
  }
  return null;
}

/**
 * One direction per {@link SCHEDULE_STEP_MS} step, the shape a rollout planner's schedule has.
 *
 * @param shape - `square`: three straight legs, out, sideways and back; `arc`: out, then a steady full turn, which
 *   changes direction on every step.
 * @param outward - The first leg's direction, a unit vector.
 * @param durationMs - How long the schedule lasts.
 * @returns The directions.
 */
export function loopSchedule(shape: ScheduleShape, outward: Direction, durationMs: number): Direction[] {
  const start = Math.atan2(outward.y, outward.x);
  const steps = Math.ceil(durationMs / SCHEDULE_STEP_MS);
  return Array.from({ length: steps }, (_unused, step) => {
    const time = step * SCHEDULE_STEP_MS;
    let angle = start;
    if (shape === 'square') {
      if (time >= SQUARE_BACK_MS) {
        angle = start + Math.PI;
      } else if (time >= SQUARE_SIDE_MS) {
        angle = start + QUARTER_TURN;
      }
    } else if (time >= ARC_TURN_START_MS) {
      angle = start + FULL_TURN * Math.min(1, (time - ARC_TURN_START_MS) / (ARC_TURN_END_MS - ARC_TURN_START_MS));
    }
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
}

export function median(values: readonly number[]): null | number {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / MEDIAN_HALF);
  return sorted.length % MEDIAN_HALF ? sorted[middle] ?? null : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / MEDIAN_HALF;
}

/**
 * The value at a quantile, nearest rank.
 *
 * @param values - The values.
 * @param fraction - From 0 to 1.
 * @returns The value, or `null` for none.
 */
export function quantile(values: readonly number[], fraction: number): null | number {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))] ?? null;
}

/**
 * Which schedule step an update reads.
 *
 * @param elapsedMs - The game clock at the update, since the schedule started; the engine reads it at the frame's end.
 * @param rule - See {@link IndexRule}.
 * @param length - The schedule's length; past its end the last direction is held.
 * @returns The step.
 */
export function scheduleIndex(elapsedMs: number, rule: IndexRule, length: number): number {
  const steps = elapsedMs / SCHEDULE_STEP_MS;
  const index = rule === 'aligned' ? Math.ceil(steps - INDEX_EPSILON) - 1 : Math.floor(steps);
  return Math.max(0, Math.min(length - 1, index));
}

/**
 * The rollout inputs that fly a schedule at another frame length: one wherever the direction changes.
 *
 * @param schedule - Directions on the {@link SCHEDULE_STEP_MS} grid.
 * @param stepMs - The rollout's frame length.
 * @param frames - How many frames it runs.
 * @param rule - See {@link IndexRule}.
 * @returns The inputs.
 */
export function scheduleInputs(schedule: readonly Direction[], stepMs: number, frames: number, rule: IndexRule): RolloutInput[] {
  const inputs: RolloutInput[] = [];
  let previous: Direction | undefined;
  for (let frame = 0; frame < frames; frame++) {
    const direction = schedule[scheduleIndex((frame + 1) * stepMs, rule, schedule.length)];
    if (direction && (direction.x !== previous?.x || direction.y !== previous.y)) {
      inputs.push({ frame, x: direction.x, y: direction.y });
      previous = direction;
    }
  }
  return inputs;
}

/**
 * Places frames by their game time since the capture.
 *
 * @param frames - A rollout's frames, or the live game's read the same way.
 * @param startTime - The game clock at the capture.
 * @returns The track.
 */
export function trackOf(frames: readonly RolloutFrame[], startTime: number): Track {
  const poses = new Map<number, Map<string, UnitPose>>();
  let deathMs: null | number = null;
  for (const frame of frames) {
    const elapsed = frame.time - startTime;
    poses.set(timeKey(elapsed), new Map(frame.units.map((unit) => [unit.name, { angle: unit.angle, state: unit.state, trail: unit.trail, x: unit.x, y: unit.y }])));
    if (frame.death !== null && deathMs === null) {
      deathMs = elapsed;
    }
  }
  return { deathMs, poses };
}

function comparePoses(left: ReadonlyMap<string, UnitPose>, right: ReadonlyMap<string, UnitPose>, player: string, elapsedMs: number): GridPoint {
  const leftPlayer = left.get(player);
  const rightPlayer = right.get(player);
  const errors: number[] = [];
  let stateMismatches = 0;
  let botsInOne = 0;
  for (const name of new Set([...left.keys(), ...right.keys()])) {
    if (name === player) {
      continue;
    }
    const a = left.get(name);
    const b = right.get(name);
    if (!a || !b) {
      botsInOne++;
      continue;
    }
    errors.push(Math.hypot(a.x - b.x, a.y - b.y));
    if (a.state !== b.state) {
      stateMismatches++;
    }
  }
  return {
    botErrorMax: errors.length ? Math.max(...errors) : null,
    botErrorMedian: median(errors),
    botsInOne,
    elapsedMs,
    playerError: leftPlayer && rightPlayer ? Math.hypot(leftPlayer.x - rightPlayer.x, leftPlayer.y - rightPlayer.y) : null,
    stateMismatches
  };
}

function timeKey(elapsedMs: number): number {
  return Math.round(elapsedMs * KEY_SCALE);
}
