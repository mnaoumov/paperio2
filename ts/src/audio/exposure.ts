/**
 * @file
 *
 * Where the player's head is, for the warning loops: at home, out on open ground, or on another player's territory, and
 * how loud and fast each loop plays there. The zone is the engine's own `in`: the territory the head is inside, which it
 * sets on crossing into one and clears when a capture or a death takes that ground away.
 */

/** The player's trail, by the one field the loops read. */
export interface ExposedTrail {
  readonly length: number;
}

/** What the zone is read from: the engine's player, by the fields it uses. */
export interface ExposedUnit {
  readonly base: unknown;
  readonly death: boolean;
  readonly in: unknown;
  readonly track: ExposedTrail;
}

/** Where the player's head is. */
export type Exposure = 'enemy' | 'home' | 'open';

/** What the loops are asked to play: each loop's level from 0 to 1, and the pulses a second of the one playing. */
export interface ExposureMix {
  readonly enemy: number;
  readonly open: number;
  readonly rate: number;
}

/** What decides the mix on a frame. */
export interface ExposureState {
  readonly effectsEnabled: boolean;
  /** Whether a run is on screen; the menu's bots and the results screen make no warning sound. */
  readonly inRun: boolean;
  readonly paused: boolean;
  readonly player: ExposedUnit | null;
}

/** Both loops quiet. */
export const SILENT_MIX: ExposureMix = { enemy: 0, open: 0, rate: 0 };

/**
 * The trail length at which the loops reach their full level and tempo: the engine's default `botAttackTrackLength`, the
 * length past which the nearest bot hunts the trail whatever its personality.
 */
export const FULL_TENSION_TRAIL_LENGTH = 1500;
/** The intensity moves in steps this size, so the loops' gains are not rescheduled on every frame the trail grows. */
const INTENSITY_STEPS = 16;
/** A loop's level at the start of a trail, as a share of its full level. */
const OPEN_MIN_LEVEL = 0.4;
const ENEMY_MIN_LEVEL = 0.55;
/* eslint-disable no-magic-numbers -- the pulse rates are a data table. */
/** Pulses a second on open ground: a slow heartbeat that quickens. */
const OPEN_RATE = { max: 3.2, min: 1.4 } as const;
/** Pulses a second on enemy ground: an urgent throb. */
const ENEMY_RATE = { max: 8, min: 4.5 } as const;
/* eslint-enable no-magic-numbers -- end of the data table. */

/**
 * The mix for a frame: silent with the effects off, outside a run, while paused, once the player is dead and at home;
 * otherwise the zone's loop alone, rising with the trail.
 *
 * @param state - The frame's state.
 * @returns The mix.
 */
export function desiredExposureMix(state: ExposureState): ExposureMix {
  const { effectsEnabled, inRun, paused, player } = state;
  if (!effectsEnabled || !inRun || paused || !player) {
    return SILENT_MIX;
  }
  return exposureMix(exposureOf(player), player.track.length);
}

/**
 * How dangerous the trail is, from 0 for none to 1 at {@link FULL_TENSION_TRAIL_LENGTH} and beyond, in steps.
 *
 * @param trailLength - The trail's length.
 * @returns The intensity.
 */
export function exposureIntensity(trailLength: number): number {
  const share = Math.min(1, Math.max(0, trailLength / FULL_TENSION_TRAIL_LENGTH));
  return Math.floor(share * INTENSITY_STEPS) / INTENSITY_STEPS;
}

/**
 * Each loop's level and the tempo in a zone.
 *
 * @param exposure - The zone.
 * @param trailLength - The trail's length, in the arena's units.
 * @returns The mix: silent at home.
 */
export function exposureMix(exposure: Exposure, trailLength: number): ExposureMix {
  const intensity = exposureIntensity(trailLength);
  switch (exposure) {
    case 'enemy':
      return { enemy: lerp(ENEMY_MIN_LEVEL, 1, intensity), open: 0, rate: lerp(ENEMY_RATE.min, ENEMY_RATE.max, intensity) };
    case 'home':
      return SILENT_MIX;
    case 'open':
      return { enemy: 0, open: lerp(OPEN_MIN_LEVEL, 1, intensity), rate: lerp(OPEN_RATE.min, OPEN_RATE.max, intensity) };
    default:
      return SILENT_MIX;
  }
}

/**
 * Where a player's head is. A dead player is at home, so its loops fall silent.
 *
 * @param player - The player.
 * @returns The zone.
 */
export function exposureOf(player: ExposedUnit): Exposure {
  if (player.death || player.in === player.base) {
    return 'home';
  }
  return player.in === null ? 'open' : 'enemy';
}

export function sameMix(left: ExposureMix, right: ExposureMix): boolean {
  return left.enemy === right.enemy && left.open === right.open && left.rate === right.rate;
}

function lerp(from: number, to: number, share: number): number {
  return from + (to - from) * share;
}
