/**
 * @file
 *
 * Where the player is exposed, for the warning loops: at home, out on open ground, or with the head or trail on a living
 * enemy's current territory, and how loud and fast each loop plays there. The calculation only reads game state.
 */

import type {
  Polygon,
  Segment
} from '../geometry/shapes.ts';

export interface ExposedEnemy {
  readonly base: ExposedTerritory;
  readonly death: boolean;
}

export interface ExposedGame {
  readonly units: readonly ExposedEnemy[];
}

export interface ExposedPolyline {
  readonly segments: readonly Segment[];
}

export interface ExposedTerritory {
  readonly polygon: Polygon;
}

/** The player's trail, by the fields the loops read. */
export interface ExposedTrail {
  readonly length: number;
  readonly polyline: ExposedPolyline;
}

/** What the zone is read from: the engine's player, by the fields it uses. */
export interface ExposedUnit {
  readonly base: unknown;
  readonly death: boolean;
  readonly game: ExposedGame;
  readonly in: unknown;
  readonly track: ExposedTrail;
}

/** Where the player's head or trail is exposed. */
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

/** An axis-aligned box in arena units, `top` the smaller y. */
interface Box {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

/**
 * How far the boxes are widened, in arena units. A point or segment that meets a territory lies inside the territory's
 * box, so a box test only skips work, but the engine's own tests allow a near-zero tolerance, which this margin covers
 * many times over.
 */
const BOX_MARGIN = 1;

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
 * Where a player's head or trail is exposed. A dead player or one back home has silent loops.
 *
 * @param player - The player.
 * @returns The zone.
 */
export function exposureOf(player: ExposedUnit): Exposure {
  if (player.death || player.in === player.base) {
    return 'home';
  }
  if (player.in !== null) {
    return 'enemy';
  }
  const trail = player.track.polyline.segments;
  const trailBox = boxOf(trail);
  if (!trailBox) {
    return 'open';
  }
  const touchesEnemy = player.game.units.some((unit: ExposedEnemy) => {
    if (unit.death || unit.base === player.base) {
      return false;
    }
    const polygon = unit.base.polygon;
    // Read fresh every frame: the engine reshapes a territory in place and lets `Polygon.bounds` go stale.
    const polygonBox = boxOf(polygon.segments);
    if (!polygonBox || !overlaps(trailBox, polygonBox)) {
      return false;
    }
    return trail.some((segment: Segment) =>
      overlaps(segmentBox(segment), polygonBox)
      && (polygon.inside(segment.start) || polygon.inside(segment.end) || polygon.intersections(segment).length > 0)
    );
  });
  return touchesEnemy ? 'enemy' : 'open';
}

export function sameMix(left: ExposureMix, right: ExposureMix): boolean {
  return left.enemy === right.enemy && left.open === right.open && left.rate === right.rate;
}

/**
 * The box around segments' end points, widened by {@link BOX_MARGIN}, or `null` for none.
 *
 * @param segments - The segments.
 * @returns The box.
 */
function boxOf(segments: readonly Segment[]): Box | null {
  if (segments.length === 0) {
    return null;
  }
  let bottom = -Infinity;
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  for (const { end, start } of segments) {
    left = Math.min(left, start.x, end.x);
    right = Math.max(right, start.x, end.x);
    top = Math.min(top, start.y, end.y);
    bottom = Math.max(bottom, start.y, end.y);
  }
  return { bottom: bottom + BOX_MARGIN, left: left - BOX_MARGIN, right: right + BOX_MARGIN, top: top - BOX_MARGIN };
}

function lerp(from: number, to: number, share: number): number {
  return from + (to - from) * share;
}

function overlaps(first: Box, second: Box): boolean {
  return first.left <= second.right && second.left <= first.right && first.top <= second.bottom && second.top <= first.bottom;
}

function segmentBox({ end, start }: Segment): Box {
  return {
    bottom: Math.max(start.y, end.y),
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y)
  };
}
