import Cookies from 'js-cookie';

import type {
  Language,
  LanguageStrings
} from './i18n.ts';

import {
  Border,
  createCirclePoints,
  MIN_POINT_DISTANCE_SQUARED,
  Polygon,
  Polyline,
  Segment,
  SIMPLIFY_LOOKBACK_COUNT,
  SpatialGrid,
  Vector,
  WALL_PROXIMITY_THRESHOLD
} from './geometry.ts';
import {
  LANGUAGE_CODE_LENGTH,
  russianLanguage
} from './i18n.ts';
import {
  brighten,
  hexToRgb,
  hsvToHex,
  rgbToHsv,
  scaleValue,
  setValue
} from './shared/color-utils.ts';
import {
  FIXED_DECIMAL_DIGITS,
  HEX_CHANNEL_DIGITS,
  HEX_RADIX,
  PERCENT_MAX,
  RGB_CHANNEL_MAX
} from './shared/constants.ts';
import {
  clamp,
  easeOutCubic,
  formatFixed2,
  intervalOverlap,
  isBetween,
  isNearlyEqual,
  isNearlyZero,
  lerp,
  now
} from './shared/math-utils.ts';
import { createRandomGenerator } from './shared/random.ts';
import {
  assertNonNullable,
  ensureNonNullable
} from './type-guards.ts';

type StoredChallenges = Record<string, boolean>;

// --- shared structural types inferred from usage across the engine ---
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export type ShapeOwner = Territory | Trail;
export interface TrailCrossing {
  base: ShapeOwner;
  enter: boolean;
  intersection: Intersection;
}
export interface TrailIntersectionRecord {
  intersections: TrailCrossing[];
  point: Vector;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface BotStateContext {
  exitPoint?: Vector;
  minDistance?: number;
  point?: Vector;
}
export interface BotStateHandlers {
  enter?: (payload: Bot, context: BotStateContext) => BotStateContext | undefined;
  leave?: (payload: Bot, context: BotStateContext) => BotStateContext | undefined;
  update: (payload: Bot, context: BotStateContext) => string | undefined;
}
export type BotStates = Record<string, BotStateHandlers>;
export interface UnitScores {
  accumulator: number;
  kills: number;
}
export interface UnitStatistics {
  kills: number;
}
export interface UnitTrackDistance {
  danger: number;
  trackDistance: number;
  trackPoint: null | Vector;
  unit: Unit;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface Label {
  color: string;
  fading?: boolean;
  text: string;
  time: number;
  unit?: null | Unit;
}
export type ParticleColor = HTMLCanvasElement | HTMLImageElement | string;

export const KILL_REASON_WIN = 0;
export const KILL_REASON_SELF_INTERSECTION = 1;
export const KILL_REASON_WALL = 2;
export const KILL_REASON_TRAIL = 3;
export const KILL_REASON_EXIT_POINT = 4;
export const KILL_REASON_SURROUNDED = 5;
export const KILL_REASON_SYSTEM = 6;
export const KILL_REASON_CAPITAL_SURROUNDED = 7;
// DeathReasons[8] ("убит разделением со столицей" / separated-from-capital) has
// No constant here — no code path ever produces reason code 8. Codes 0-7 are all used.
export const MILLISECONDS_IN_SECOND = 1000;
export const FRAMES_PER_SECOND = 60;
export const FRAME_DURATION_MILLISECONDS = MILLISECONDS_IN_SECOND / FRAMES_PER_SECOND;
// eslint-disable-next-line no-magic-numbers -- two-frame threshold (2x the single-frame duration).
export const TWO_FRAME_DURATION_MILLISECONDS = FRAME_DURATION_MILLISECONDS * 2;
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve: (value: HTMLImageElement) => void) => {
    const element = document.createElement('img');
    element.src = src;
    element.onload = (): void => {
      resolve(element);
    };
  });
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class Territory {
  public isTrack = false;
  // Never populated by any observed code path; element type is not inferable from usage.
  public merges: Polygon[];
  public path = new Path2D();
  public polygon: Polygon;
  public square = 0;
  public unit: Unit;
  public constructor(unit: Unit, points: Vector[]) {
    this.unit = unit;
    this.merges = [];
    this.polygon = new Polygon(points);
    this.polygon.commit(this);
    this.calcSquare();
    this.polygon.calcPath();
  }

  public calcPath(): Path2D {
    this.path = new Path2D();
    const {
      segments
    } = this.polygon;
    const {
      length
    } = segments;
    const {
      start
    } = ensureNonNullable(segments[0]);
    this.path.moveTo(start.x, start.y);
    for (let segmentIndex = 1; segmentIndex < length; segmentIndex++) {
      const {
        start: point
      } = ensureNonNullable(segments[segmentIndex]);
      this.path.lineTo(point.x, point.y);
    }
    this.path.closePath();
    return this.path;
  }

  public calcSquare(): void {
    this.square = this.polygon.square();
  }

  public handleEnemyIntersect(intersection: Intersection, unit: Unit, segment: Segment): void {
    const {
      point: intersectionPoint,
      segment: intersectionSegment
    } = intersection;
    if (unit.in === this) {
      if (intersection.zn < 0) {
        return;
      }
      this.polygon.insert(intersectionSegment, intersectionPoint);
      unit.track.add(intersectionPoint);
      unit.track.intersect(intersection, this, false);
      unit.in = null;
    } else {
      if (intersection.zn > 0) {
        return;
      }
      if (intersection.overlay) {
        return;
      }
      if (intersectionPoint.equal(segment.end)) {
        return;
      }
      if (unit.in) {
        return;
      }
      this.polygon.insert(intersectionSegment, intersectionPoint);
      unit.track.add(intersectionPoint);
      unit.track.intersect(intersection, this, true);
      unit.in = this;
    }
  }

  public handleIntersect(intersection: Intersection, unit: Unit, segment: Segment): void {
    if (unit === this.unit) {
      this.handleSelfIntersect(intersection, unit, segment);
    } else {
      this.handleEnemyIntersect(intersection, unit, segment);
    }
  }

  public handleSelfIntersect(intersection: Intersection, unit: Unit, segment: Segment): void {
    if (intersection.overlay) {
      return;
    }
    this.unit.onScoreChanged();
    const {
      point: intersectionPoint,
      segment: intersectionSegment
    } = intersection;
    if (unit.in === this) {
      if (intersection.zn < 0) {
        return;
      }
      if (intersectionPoint.equal(segment.end)) {
        return;
      }
      this.polygon.insert(intersectionSegment, intersectionPoint);
      unit.track.add(intersectionPoint);
      unit.in = null;
      if (unit.schemes) {
        unit.schemes.out();
      }
      if (unit.achievements) {
        unit.achievements.onOut();
      }
    } else {
      if (intersection.zn > 0) {
        return;
      }
      if (intersectionPoint.equal(segment.start)) {
        return;
      }
      if (unit.in) {
        return;
      }
      this.polygon.insert(intersectionSegment, intersectionPoint);
      unit.track.add(intersectionPoint);
      if (unit.track.polyline.end) {
        this.unit.game.handleReturn(unit);
      }
      unit.in = this;
      unit.track.remove();
    }
  }

  public remove(): void {
    this.polygon.remove();
  }
}
export class Trail {
  public intersections: TrailIntersectionRecord[];
  public isTrack: boolean;
  public length: number;
  public polyline: Polyline;
  public simplyline: Vector[];
  public unit: Unit;
  public constructor(unit: Unit) {
    this.polyline = new Polyline(this);
    this.simplyline = [];
    this.unit = unit;
    this.length = 0;
    this.intersections = [];
    this.isTrack = true;
  }

  public add(point: Vector): void {
    if (this.polyline.add2(point)) {
      const length2 = this.polyline.segments.length;
      if (length2 > 0) {
        const segment = ensureNonNullable(this.polyline.segments[length2 - 1]);
        this.length += segment.start.distance(segment.end);
      }
      const {
        simplyline
      } = this;
      const {
        length
      } = simplyline;
      if (length > SIMPLIFY_LOOKBACK_COUNT) {
        const previousPoint = ensureNonNullable(simplyline[length - SIMPLIFY_LOOKBACK_COUNT]);
        if (point.distance2(previousPoint) < MIN_POINT_DISTANCE_SQUARED) {
          simplyline[length - 1] = point;
        } else {
          simplyline.push(point);
        }
      } else {
        simplyline.push(point);
      }
    }
  }

  public handleIntersect(intersection: Intersection, unit: Unit, _segment: Segment): void {
    const game = unit.game;
    if (unit === this.unit) {
      if (intersection.overlay || intersection.point !== ensureNonNullable(this.polyline.segments[this.polyline.segments.length - 1]).end) {
        this.unit.position = intersection.point;
        const killReason = game.border.radius - unit.position.distance(game.space.center) < WALL_PROXIMITY_THRESHOLD ? KILL_REASON_WALL : KILL_REASON_SELF_INTERSECTION;
        game.kill(this.unit, undefined, killReason);
      }
    } else {
      game.kill(this.unit, unit, KILL_REASON_TRAIL);
    }
  }

  public intersect(intersection: Intersection, base: ShapeOwner, enter: boolean): void {
    const existingRecord = this.intersections.find((record: TrailIntersectionRecord) => record.point.equal(intersection.point));
    if (existingRecord) {
      existingRecord.intersections.push({
        base,
        enter,
        intersection
      });
    } else {
      this.intersections.push({
        intersections: [{
          base,
          enter,
          intersection
        }],
        point: intersection.point
      });
    }
  }

  public remove(): void {
    this.polyline.remove();
    this.polyline = new Polyline(this);
    this.length = 0;
    this.simplyline = [];
    this.intersections = [];
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class StateMachine {
  public context: BotStateContext;
  public payload: Bot;
  public state: string;
  public states: BotStates;
  public constructor(states: BotStates, initialState: string, payload: Bot) {
    this.states = states;
    this.state = '';
    this.payload = payload;
    this.context = {};
    this.change(initialState);
  }

  public change(stateName: string): void {
    const currentState = this.states[this.state];
    if (currentState?.leave) {
      this.context = currentState.leave(this.payload, this.context) ?? this.context;
    }
    const nextState = this.states[stateName];
    if (nextState) {
      this.state = stateName;
      this.context = nextState.enter?.(this.payload, this.context) ?? this.context;
      this.update();
    }
  }

  public update(): void {
    const currentState = this.states[this.state];
    const nextStateName = currentState?.update(this.payload, this.context);
    if (nextStateName) {
      this.change(nextStateName);
    }
  }
}
export const AGGRO_RANGE_FACTOR = 0.75;
export const DANGER_DEF_FACTOR = 0.8;
export const BACK_SMOOTHNESS_FACTOR = 4;
export const BORDER_SLOWDOWN_DISTANCE = 20;
export const BORDER_EXIT_MARGIN = 10;
export const EXIT_SPEED_DECAY = 0.75;
export const CUT_PROBABILITY = 0.25;
export const RETREAT_DISTANCE_FACTOR = 0.8;
export const MAX_RATIO_APPROACH_THRESHOLD = 0.75;
// eslint-disable-next-line no-magic-numbers -- 90° in radians.
export const QUARTER_TURN = Math.PI / 2;
// eslint-disable-next-line no-magic-numbers -- 45° in radians.
export const EIGHTH_TURN = Math.PI / 4;
// eslint-disable-next-line no-magic-numbers -- 22.5° in radians.
export const SIXTEENTH_TURN = Math.PI / 8;
// eslint-disable-next-line no-magic-numbers -- a full turn is 2π radians (circumference = 2πr).
export const FULL_TURN = Math.PI * 2;
export const CAPTURE_RETURN_SPEED_DIVISOR = 4;
export const CAPTURE_RETURN_TRACK_FACTOR = 2;
export const CAPTURE_RETURN_BORDER_MARGIN = 10;
export const STEP_HALVING_DIVISOR = 2;
export const SHOELACE_DIVISOR = 2;
export const SAFE_DISTANCE_RECKLESS_FACTOR = 3;
export const SAFE_DISTANCE_CAUTIOUS_FACTOR = 0.7;
export const MIN_TRACK_DISTANCE_FACTOR = 0.8;
export const PASS_SMOOTHNESS_DANGER_FACTOR = 3;
export const BORDER_BAND_OUTER_FACTOR = 2;
export const BORDER_BAND_INNER_DIVISOR = 4;
export const ANGLE_REFLECT_FACTOR = 2;
export const BORDER_OVERSHOOT_FACTOR = 0.75;
export const CHORD_DENOMINATOR_FACTOR = 2;
export function isPlayerTrailInRange(unit: Bot): boolean {
  const {
    player
  } = unit.game;
  if (player) {
    const maxVrange = Math.max(unit.vrange, player.vrange);
    const aggroRange = maxVrange * unit.aggro * AGGRO_RANGE_FACTOR;
    const {
      simplyline
    } = player.track;
    for (let i2 = 0, length = simplyline.length; i2 < length; i2++) {
      if (unit.position.distance2(ensureNonNullable(simplyline[i2])) < aggroRange * aggroRange) {
        return true;
      }
    }
  }
  return false;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function isBotInDanger(unit: Bot): boolean {
  if (unit.in === unit.base) {
    return false;
  }
  return unit.maxDanger > unit.def * DANGER_DEF_FACTOR;
}
export const botStates: BotStates = {
  attack: {
    enter: () => ({}),
    update(unit, _context) {
      const {
        player
      } = unit.game;
      if (!player || player.death) {
        return 'idle';
      }
      const {
        simplyline
      } = player.track;
      if (!simplyline.length) {
        return 'idle';
      }
      if (player.track.length < unit.game.config.botAttackTrackLength && isBotInDanger(unit)) {
        return 'idle';
      }
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      simplyline.forEach((point, index) => {
        const distanceSquared = unit.position.distance2(point);
        if (distanceSquared < nearestDistance) {
          nearestDistance = distanceSquared;
          nearestIndex = index;
        }
      });
      unit.target = simplyline[nearestIndex] ?? null;
      return undefined;
    }
  },
  back: {
    update(unit, _context) {
      if (unit.in === unit.base) {
        return 'idle';
      }
      unit.smoothness = lerp(1, Math.max(1, Math.max(1, Math.min(unit.def, unit.greed) * BACK_SMOOTHNESS_FACTOR)), Math.max(1, unit.maxDanger));
      const distanceToBorder = unit.game.border.radius - unit.position.distance(unit.game.space.center);
      if (distanceToBorder < BORDER_SLOWDOWN_DISTANCE) {
        unit.smoothness = 1;
      }
      unit.target = unit.baseNearestPoint;
      return undefined;
    }
  },
  capital: {
    update(unit, context) {
      if (unit.in !== unit.base) {
        return 'capture';
      }
      unit.target = context.point ?? null;
      return undefined;
    }
  },
  capture: {
    update(unit, _context) {
      if (unit.in === unit.base) {
        return 'idle';
      }
      if (isPlayerTrailInRange(unit)) {
        return 'attack';
      }
      const {
        unitSpeed
      } = unit.game.config;
      const {
        center
      } = unit.game.space;
      const {
        radius
      } = unit.game.border;
      const distanceToCenter = unit.position.distance(center);
      const distanceToBorder = radius - distanceToCenter;
      if (unit.baseDistance < unitSpeed / CAPTURE_RETURN_SPEED_DIVISOR && unit.track.length > unitSpeed * CAPTURE_RETURN_TRACK_FACTOR && distanceToBorder > CAPTURE_RETURN_BORDER_MARGIN) {
        return 'back';
      }
      const stepDistance = 25;
      const halfStep = stepDistance / STEP_HALVING_DIVISOR;
      const halfStepSquared = halfStep * halfStep;
      if (unit.position.distance2(ensureNonNullable(unit.target)) < halfStepSquared && distanceToBorder > stepDistance) {
        return;
      }
      let signedArea = 0;
      for (let length = unit.track.simplyline.length, segmentIndex = 1; segmentIndex < length; segmentIndex++) {
        const point2 = ensureNonNullable(unit.track.simplyline[segmentIndex - 1]);
        const point3 = ensureNonNullable(unit.track.simplyline[segmentIndex]);
        signedArea += (point2.x + point3.x) * (point3.y - point2.y);
      }
      let point = ensureNonNullable(unit.track.simplyline[unit.track.simplyline.length - 1]);
      let baseNearestPoint = ensureNonNullable(unit.baseNearestPoint);
      signedArea += (point.x + baseNearestPoint.x) * (baseNearestPoint.y - point.y);
      point = ensureNonNullable(unit.baseNearestPoint);
      baseNearestPoint = ensureNonNullable(unit.track.simplyline[0]);
      signedArea += (point.x + baseNearestPoint.x) * (baseNearestPoint.y - point.y);
      const windingSign = Math.sign(signedArea);
      signedArea = Math.abs(signedArea / SHOELACE_DIVISOR);
      unit.capSquare = signedArea;
      const {
        def,
        greed,
        safety
      } = unit;
      const circumference = FULL_TURN * unit.vrange * greed;
      const lengthRatio = unit.track.length / circumference;
      const areaThreshold = Math.min(unit.base.square, Math.PI * unit.vrange * unit.vrange) * greed;
      const areaRatio = unit.capSquare / areaThreshold;
      const safeDistance = unit.vrange * lerp(SAFE_DISTANCE_RECKLESS_FACTOR, SAFE_DISTANCE_CAUTIOUS_FACTOR, safety);
      const startDistanceRatio = unit.position.distance(ensureNonNullable(unit.track.polyline.start)) / safeDistance;
      const minTrackDistance = unit.unitToTrackDistances.reduce((minDistance, distanceRecord) => Math.min(distanceRecord.trackDistance, minDistance), Infinity) * MIN_TRACK_DISTANCE_FACTOR * def;
      const baseDistanceRatio = unit.baseDistance / minTrackDistance;
      const maxRatio = Math.max(lengthRatio, areaRatio, startDistanceRatio, baseDistanceRatio);
      if (maxRatio > 1) {
        return 'back';
      }
      const greedDistance = unit.vrange * greed;
      const approachDistance = greedDistance;
      const retreatDistance = approachDistance * RETREAT_DISTANCE_FACTOR;
      const toTarget = ensureNonNullable(unit.target).clone().sub(unit.position);
      let steerVector;
      if (unit.baseDistance > approachDistance || maxRatio > MAX_RATIO_APPROACH_THRESHOLD) {
        unit.aspect = 'приближение';
        steerVector = ensureNonNullable(unit.baseNearestPointNormal).clone().mulScalar(stepDistance).rotate((QUARTER_TURN + EIGHTH_TURN) * windingSign);
      } else if (unit.baseDistance < retreatDistance) {
        unit.aspect = 'отдаление';
        let angle = EIGHTH_TURN;
        const trackRatio = unit.track.length / retreatDistance;
        if (trackRatio < 1) {
          unit.aspect = 'отстрел';
          angle = lerp(QUARTER_TURN * greed, 0, trackRatio);
        }
        steerVector = ensureNonNullable(unit.baseNearestPointNormal).clone().mulScalar(stepDistance).rotate((QUARTER_TURN - angle) * windingSign);
      } else {
        unit.aspect = 'проход';
        steerVector = ensureNonNullable(unit.baseNearestPointNormal).clone().mulScalar(stepDistance).rotate(QUARTER_TURN * windingSign);
        unit.smoothness = 1 + (1 - Math.min(1, unit.maxDanger)) * PASS_SMOOTHNESS_DANGER_FACTOR;
      }
      unit.smoothness = 1 + (1 - Math.min(1, unit.maxDanger)) * 1;
      if (distanceToBorder < stepDistance * BORDER_BAND_OUTER_FACTOR && distanceToBorder > stepDistance / BORDER_BAND_INNER_DIVISOR && distanceToBorder < unit.position.clone().add(steerVector).distance(center)) {
        const fromCenter = unit.position.clone().sub(center);
        const targetAngle = fromCenter.angle(toTarget);
        const targetAngleSign = Math.sign(targetAngle);
        let steerAngle = fromCenter.angle(steerVector);
        let steerAngleSign = Math.sign(steerAngle);
        if (targetAngleSign !== steerAngleSign) {
          steerAngle *= -1;
          steerAngleSign *= -1;
          steerVector.rotate(steerAngle * ANGLE_REFLECT_FACTOR);
        }
        const steerAngleAbs = Math.abs(steerAngle);
        if (steerAngleAbs < EIGHTH_TURN) {
          steerVector.rotate((EIGHTH_TURN - steerAngleAbs) * steerAngleSign);
        }
      }
      unit.target = unit.position.clone().add(steerVector);
      if (unit.target.distance(center) > radius + stepDistance * BORDER_OVERSHOOT_FACTOR) {
        const fromCenter2 = unit.position.clone().sub(center);
        const targetAngle2 = fromCenter2.angle(toTarget);
        const centerDistance = distanceToCenter;
        const chordProjection = (radius * radius - stepDistance * stepDistance + centerDistance * centerDistance) / (centerDistance * CHORD_DENOMINATOR_FACTOR);
        const chordHalfLength = Math.sqrt(radius * radius - chordProjection * chordProjection);
        const centerDirection = unit.position.clone().sub(center).normalize();
        const projectionPoint = center.clone().add(centerDirection.clone().mulScalar(chordProjection));
        steerVector = centerDirection.clone().rotate(QUARTER_TURN * targetAngle2).rotate(SIXTEENTH_TURN * -targetAngle2).mulScalar(chordHalfLength);
        unit.target = projectionPoint.clone().add(steerVector);
      }
      return undefined;
    }
  },
  cut: {
    enter(unit) {
      const vector = unit.position.clone().sub(unit.game.space.center);
      const segment = new Segment(unit.position, vector.normalize().mulScalar(unit.game.border.radius + BORDER_EXIT_MARGIN).add(unit.game.space.center));
      const list4 = unit.base.polygon.intersections(segment);
      const context: BotStateContext = {};
      list4.sort((intersectionA, intersectionB) => intersectionA.distance - intersectionB.distance);
      const first = list4[0];
      if (first) {
        context.exitPoint = first.point;
      }
      return context;
    },
    update(unit, context) {
      if (unit.in !== unit.base) {
        return 'capture';
      }
      const distanceToCenter = unit.position.distance(unit.game.space.center);
      const distanceToBorder = unit.game.border.radius - distanceToCenter;
      if (!context.exitPoint || distanceToBorder < 1) {
        return 'idle';
      }
      unit.target = context.exitPoint;
      return undefined;
    }
  },
  exit: {
    enter(unit) {
      const context: BotStateContext = {};
      let nearestDistance = Infinity;
      let bestIndex;
      const {
        length
      } = unit.base.polygon.segments;
      let unitSpeed = unit.game.config.unitSpeed;
      context.minDistance = unitSpeed;
      while (bestIndex === undefined) {
        for (let i2 = 0; i2 < 1; i2++) {
          const segmentIndex = Math.trunc(unit.game.rng() * length);
          const start = ensureNonNullable(unit.base.polygon.segments[segmentIndex]).start;
          const distance = start.distance(unit.position);
          if (distance < nearestDistance && distance > unitSpeed) {
            nearestDistance = distance;
            bestIndex = segmentIndex;
          }
        }
        unitSpeed *= EXIT_SPEED_DECAY;
      }
      context.exitPoint = ensureNonNullable(unit.base.polygon.segments[bestIndex]).start;
      return context;
    },
    update(unit, context) {
      if (unit.in !== unit.base) {
        return 'capture';
      }
      if (isPlayerTrailInRange(unit)) {
        return 'attack';
      }
      const {
        length
      } = unit.base.polygon.segments;
      const minDistance = ensureNonNullable(context.minDistance);
      const segmentIndex = Math.trunc(unit.game.rng() * length);
      const start = ensureNonNullable(unit.base.polygon.segments[segmentIndex]).start;
      const distance = start.distance(unit.position);
      const exitPointDistance = ensureNonNullable(context.exitPoint).distance(unit.position);
      if (distance > minDistance && distance < exitPointDistance) {
        context.exitPoint = start;
      } else {
        if (!Object.values(ensureNonNullable(context.exitPoint).segments).some((segment) => segment.shape === unit.base.polygon)) {
          context.exitPoint = start;
        }
        if (unit.target && unit.target.distance(unit.game.space.center) > unit.game.border.radius - 1) {
          context.exitPoint = start;
        }
      }
      unit.target = context.exitPoint ?? null;
      return undefined;
    }
  },
  idle: {
    enter() {
      return {};
    },
    update(unit, _context) {
      if (unit.in === unit.base) {
        if (unit.game.rng() < CUT_PROBABILITY) {
          return 'cut';
        }
        return 'exit';
      }
      return 'back';
    }
  }
};
export function createParticleSquarePath(): Path2D {
  const path2D = new Path2D();
  const halfSize = 1;
  path2D.moveTo(-halfSize, -halfSize);
  path2D.lineTo(halfSize, -halfSize);
  path2D.lineTo(halfSize, halfSize);
  path2D.lineTo(-halfSize, halfSize);
  path2D.closePath();
  return path2D;
}
export const particleSquarePath = createParticleSquarePath();
export const RANDOM_MIDPOINT = 0.5;
export const IMAGE_CENTER_DIVISOR = 2;
export const NOM_SCALE_HALF_DIVISOR = 2;
// eslint-disable-next-line no-magic-numbers -- ±6° velocity spread for spawned nom particles.
export const NOM_VELOCITY_SPREAD_ANGLE = Math.PI / 30;
// eslint-disable-next-line no-magic-numbers -- ±18° acceleration spread for spawned nom particles.
export const NOM_ACCEL_SPREAD_ANGLE = Math.PI / 10;
export const NOM_DECELERATION_FACTOR = -6;
export const NOM_SCALE_MIN = 0.75;
export const NOM_SCALE_RANGE = 0.5;
export const NOM_VSCALE_FACTOR = -2;
export const NOM_PARTICLE_LIFETIME_MS = 300;
export const PARTICLE_IMAGE_SCALE_DIVISOR = 20;
export const SCORE_PARTICLE_SPACING = 5;
export const SCORE_PARTICLE_SPEED_MIN = 25;
export const SCORE_PARTICLE_SPEED_RANGE = 100;
export const SCORE_PARTICLE_SLOW_CHANCE = 0.25;
export const SCORE_PARTICLE_SLOW_FACTOR = 0.1;
export const SCORE_TRANSFER_ROTATION_FACTOR = 3;
export const ROTATION_SPEED_RANGE = 0.5;
export const SCORE_PARTICLE_LIFETIME_MIN_MS = 500;
export const SCORE_PARTICLE_LIFETIME_RANGE_MS = 500;
export const VSCALE_ROTATION_FACTOR = 0.7;
export const SCORE_ACCEL_MIN = 1.5;
export const SCORE_ACCEL_RANGE = 0.5;
export class Particle {
  // `velocity`/`acceleration` are normally Vectors, but the score-collection path in
  // SpawnScoreParticles reassigns them to scalar speeds on already-expiring particles (time===1),
  // So the field type is a union and the vector math below is typeof-guarded.
  public acceleration: null | number | Vector;
  public color: ParticleColor;
  public fn: ((particle: Particle) => void) | null;
  public position: Vector;
  public rotate: number;
  public rotation: number;
  public scale: number;
  public target: null | Unit;
  public time: number;
  public velocity: number | Vector;
  public vscale: number;
  public constructor(target: null | Unit, color: ParticleColor, position: Vector, velocity: number | Vector, acceleration: null | number | Vector, rotate: number, scale: number, vscale: number, time: number, callback?: (particle: Particle) => void) {
    this.target = target;
    this.color = color;
    this.position = position;
    this.velocity = velocity;
    this.acceleration = acceleration;
    this.rotate = rotate;
    this.scale = scale;
    this.vscale = vscale;
    this.rotation = Math.random() * FULL_TURN;
    this.time = time;
    this.fn = callback ?? null;
  }

  public static nom(unit: Unit, segment: Segment, scale: number): Particle {
    const randomSign = Math.sign(Math.random() - RANDOM_MIDPOINT);
    const scaledMaxScale = unit.skin.container.maxScale * scale;
    const {
      baseHeight,
      unitSpeed
    } = unit.game.config;
    const velocity = ensureNonNullable(segment.vector).clone().normalize().rotate(randomSign * Math.random() * NOM_VELOCITY_SPREAD_ANGLE).mulScalar(unitSpeed * (1 + Math.random()));
    const perpendicularOffset = ensureNonNullable(segment.vector).clone().rotate(QUARTER_TURN).normalize().mulScalar(randomSign * Math.random() * scaledMaxScale / NOM_SCALE_HALF_DIVISOR);
    const forwardOffset = ensureNonNullable(segment.vector).clone().normalize().mulScalar(scaledMaxScale / NOM_SCALE_HALF_DIVISOR);
    const acceleration = ensureNonNullable(segment.vector).clone().normalize().mulScalar(unitSpeed * NOM_DECELERATION_FACTOR).rotate(randomSign * Math.random() * NOM_ACCEL_SPREAD_ANGLE);
    const {
      particles
    } = ensureNonNullable(unit.in).unit.skin.colors;
    const scale2 = NOM_SCALE_MIN + Math.random() * NOM_SCALE_RANGE;
    const particle = new Particle(null, ensureNonNullable(particles[Math.trunc(Math.random() * particles.length)]), segment.start.clone().add(perpendicularOffset).add(forwardOffset).add(new Vector(0, -baseHeight)), velocity, acceleration, Math.PI + Math.random() * Math.PI, scale2, scale2 * NOM_VSCALE_FACTOR, NOM_PARTICLE_LIFETIME_MS);
    return particle;
  }

  public draw(context: CanvasRenderingContext2D): void {
    const {
      x,
      y
    } = this.position;
    const {
      color,
      rotation,
      scale
    } = this;
    const savedTransform = context.getTransform();
    context.translate(x, y);
    context.rotate(rotation);
    context.scale(scale, scale);
    if (typeof color === 'string') {
      if (context.fillStyle !== color) {
        context.fillStyle = color;
      }
      context.fill(particleSquarePath);
    } else {
      context.scale(1 / PARTICLE_IMAGE_SCALE_DIVISOR, 1 / PARTICLE_IMAGE_SCALE_DIVISOR);
      context.drawImage(color, -color.width / IMAGE_CENTER_DIVISOR, -color.height / IMAGE_CENTER_DIVISOR);
    }
    context.setTransform(savedTransform);
  }

  public update(deltaTimeMilliseconds: number): void {
    const deltaTimeSeconds = deltaTimeMilliseconds / MILLISECONDS_IN_SECOND;
    this.time -= deltaTimeMilliseconds;
    if (this.time <= 0) {
      if (this.fn) {
        this.fn(this);
      }
      return;
    }
    if (typeof this.velocity !== 'number') {
      this.position.x += this.velocity.x * deltaTimeSeconds;
      this.position.y += this.velocity.y * deltaTimeSeconds;
      if (this.acceleration && typeof this.acceleration !== 'number') {
        this.velocity.x += this.acceleration.x * deltaTimeSeconds;
        this.velocity.y += this.acceleration.y * deltaTimeSeconds;
      }
    }
    this.rotation += this.rotate * deltaTimeSeconds;
    this.scale += this.vscale * deltaTimeSeconds;
  }
}
export function spawnScoreParticles(unit: Unit, scoreCollector: null | Unit, list4: Segment[], shouldTransferScore?: boolean): void {
  const game = unit.game;
  if (game.visible) {
    const totalScores = ensureNonNullable(unit.schemes).scores();
    let i2 = 0;
    let accumulatedDistance = 0;
    let scorePerParticle = 0;
    list4.forEach((segment: Segment) => {
      accumulatedDistance += ensureNonNullable(segment.vector).magnitude();
      if (accumulatedDistance > SCORE_PARTICLE_SPACING) {
        accumulatedDistance = 0;
        const velocity = ensureNonNullable(segment.vector).clone().normalize().rotate(Math.sign(Math.random() - RANDOM_MIDPOINT) * QUARTER_TURN).mulScalar(SCORE_PARTICLE_SPEED_MIN + Math.random() * SCORE_PARTICLE_SPEED_RANGE);
        if (Math.random() > SCORE_PARTICLE_SLOW_CHANCE) {
          velocity.mulScalar(SCORE_PARTICLE_SLOW_FACTOR);
        }
        const rotationSpeed = (shouldTransferScore ? SCORE_TRANSFER_ROTATION_FACTOR : 1) * (1 + Math.random() * ROTATION_SPEED_RANGE);
        const time = SCORE_PARTICLE_LIFETIME_MIN_MS + Math.random() * SCORE_PARTICLE_LIFETIME_RANGE_MS;
        const vscale = -rotationSpeed * VSCALE_ROTATION_FACTOR * (MILLISECONDS_IN_SECOND / time);
        const particle = new Particle(null, ensureNonNullable(unit.skin.colors.particles[Math.trunc(Math.random() * unit.skin.colors.particles.length)]), segment.start.clone(), velocity, null, FULL_TURN * (1 + Math.random()) * Math.sign(Math.random() - RANDOM_MIDPOINT || 1), rotationSpeed, vscale, time, (particle2: Particle) => {
          if (scoreCollector) {
            particle2.target = scoreCollector;
            particle2.time = 1;
            particle2.velocity = typeof particle2.velocity === 'number' ? particle2.velocity : particle2.velocity.magnitude();
            particle2.acceleration = (SCORE_ACCEL_MIN + Math.random() * SCORE_ACCEL_RANGE) * game.config.unitSpeed;
            particle2.fn = (): void => {
              if (shouldTransferScore) {
                ensureNonNullable(scoreCollector.schemes).getScheme().accumulator += scorePerParticle;
              }
            };
            particle2.vscale = 0;
            particle2.scale = 1;
          }
        });
        game.particles.push(particle);
        i2++;
      }
    });
    scorePerParticle = totalScores / i2;
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export type SchemeConstructor = new (unit: Unit) => ScoreLabel;
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface ComebackInfo {
  game: Game;
  increment: number;
  rise: Polygon;
  victims: ComebackVictim[];
}
export interface ComebackVictim {
  base: Territory;
  poly: Polygon;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface AchievementChecker {
  check(unit: Unit, dt: number, game: Game): boolean;
  onKill(unit: Unit): void;
  onOut(): void;
  progress: number;
  update(unit: Unit, dt: number, game: Game): void;
}
export interface AchievementConfig {
  description: string;
  getChecker: () => AchievementChecker;
  modes: string[];
  name: string;
  onEarned?: (game: Game, achievement: Achievement) => void;
  url: string;
}
export interface StoredAchievement {
  best: number;
  earned: boolean;
  name: string;
}
export interface StoredProfile {
  achievements?: StoredAchievement[];
}
export class SchemeCycler {
  public current: number;
  public Schemes: SchemeConstructor[];
  public constructor(...schemeConstructors: SchemeConstructor[]) {
    this.Schemes = schemeConstructors;
    this.current = 0;
  }

  public getSchemes(unit: Unit): Scoreboard {
    return new Scoreboard(this.Schemes.map((SchemeClass: SchemeConstructor) => new SchemeClass(unit)), this);
  }

  public next(): void {
    this.current++;
    if (this.current === this.Schemes.length) {
      this.current = 0;
    }
  }
}
export class Scoreboard {
  public manager: SchemeCycler;
  public schemes: ScoreLabel[];
  public constructor(schemes: ScoreLabel[], manager: SchemeCycler) {
    this.schemes = schemes;
    this.manager = manager;
  }

  public comeback(info?: ComebackInfo): void {
    this.schemes.forEach((scheme: ScoreLabel, index: number) => {
      scheme.comeback(info, this.manager.current !== index);
    });
  }

  public getScheme(name?: string): ScoreLabel {
    if (name) {
      return ensureNonNullable(this.schemes.find((scheme: ScoreLabel) => scheme.name === name));
    }
    return ensureNonNullable(this.schemes[this.manager.current]);
  }

  public kill(killer?: Unit, cause?: number): void {
    this.schemes.forEach((scheme: ScoreLabel, index: number) => {
      scheme.kill(killer, cause, this.manager.current !== index);
    });
  }

  public out(): void {
    this.schemes.forEach((scheme: ScoreLabel, index: number) => {
      scheme.out(this.manager.current !== index);
    });
  }

  public print(score?: number): string {
    return ensureNonNullable(this.schemes[this.manager.current]).print(score);
  }

  public result(): number {
    return ensureNonNullable(this.schemes[this.manager.current]).result();
  }

  public scores(): number {
    return ensureNonNullable(this.schemes[this.manager.current]).scores();
  }

  public update(dt?: number): void {
    this.schemes.forEach((scheme: ScoreLabel, index: number) => {
      scheme.update(dt, this.manager.current !== index);
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-empty-function -- the shared no-op used by overridable defaults.
export function noop(): void {}
export const MIN_LABEL_INCREMENT_PERCENT = 0.01;
export class ScoreLabel {
  public accumulator = 0;
  public name: string;
  public unit: Unit;
  public constructor(unit: Unit, name: string) {
    this.unit = unit;
    this.name = name;
  }

  public comeback(_info?: ComebackInfo, _isNotCurrent?: boolean): void {
    noop();
  }

  public getScheme(): this {
    return this;
  }

  public kill(_killer?: Unit, _cause?: number, _isNotCurrent?: boolean): void {
    noop();
  }

  public out(_isNotCurrent?: boolean): void {
    noop();
  }

  public print(_score?: number): string {
    return formatFixed2(this.scores());
  }

  public result(): number {
    return this.scores();
  }

  public scores(): number {
    return 0;
  }

  public update(_dt?: number, _isNotCurrent?: boolean): void {
    noop();
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class BotScoreLabel extends ScoreLabel {
  public constructor(unit: Unit) {
    super(unit, 'percent');
  }

  public override comeback({
    increment
  }: ComebackInfo, isNotCurrent?: boolean): void {
    if (!isNotCurrent && increment * PERCENT_MAX >= MIN_LABEL_INCREMENT_PERCENT && this.unit.isPlayer) {
      this.unit.addLabel({
        color: this.unit.skin.colors.nick,
        fading: true,
        text: `+${(increment * PERCENT_MAX).toFixed(FIXED_DECIMAL_DIGITS)}%`,
        time: MILLISECONDS_IN_SECOND,
        unit: this.unit
      });
    }
  }

  public override kill(killer?: Unit, _cause?: number, isNotCurrent?: boolean): void {
    if (!isNotCurrent && this.unit.isPlayer) {
      this.unit.addLabel({
        color: ensureNonNullable(killer).skin.colors.main,
        fading: true,
        text: this.unit.game.language.killText,
        time: MILLISECONDS_IN_SECOND,
        unit: this.unit
      });
    }
  }

  public override print(scoreOverride?: number): string {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- a 0 override should fall through to the live score, matching the original.
    const score = scoreOverride || this.scores();
    return `${formatFixed2(score)}%`;
  }

  public override result(): number {
    return Number(this.scores().toFixed(FIXED_DECIMAL_DIGITS));
  }

  public override scores(): number {
    return this.unit.percent * PERCENT_MAX;
  }
}
export const QUEST_FADE_MS = 500;
export const QUEST_HOLD_MS = 3000;
export const QUEST_LINGER_MS = 250;
export const QUEST_STATE_FADE_OUT = 2;
export class Quest {
  public current: number;
  public description: string;
  public image: HTMLImageElement | null;
  public ready: boolean;
  public state: number;
  public states: number[];
  public title: string;
  public constructor(title: string, description: string, imageUrl?: string) {
    this.title = title;
    this.description = description;
    this.state = 0;
    this.current = 0;
    this.states = [QUEST_FADE_MS, QUEST_HOLD_MS, QUEST_FADE_MS, QUEST_LINGER_MS];
    this.image = null;
    if (imageUrl) {
      this.ready = false;
      const image = new Image();
      image.onload = (): void => {
        this.ready = true;
        this.image = image;
      };
      image.onerror = (): void => {
        this.ready = true;
      };
      image.src = imageUrl;
    } else {
      this.ready = true;
    }
  }

  public position(): number {
    switch (this.state) {
      case 0:
        return easeOutCubic(this.current / ensureNonNullable(this.states[0]));
      case 1:
        return 1;
      case QUEST_STATE_FADE_OUT:
        return 1 - easeOutCubic(this.current / ensureNonNullable(this.states[QUEST_STATE_FADE_OUT]));
      default:
        return 0;
    }
  }

  public update(amount: number): void {
    this.current += amount;
    if (this.current > ensureNonNullable(this.states[this.state])) {
      this.state++;
      this.current = 0;
    }
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class Achievement {
  public best: number;
  public checker: AchievementChecker | null;
  public description: string;
  public earned: boolean;
  public getChecker: () => AchievementChecker;
  public modes: string[];
  public name: string;
  public onEarned?: (game: Game, achievement: Achievement) => void;
  public url: string;
  public constructor(name: string, modes: string[], getChecker: () => AchievementChecker, description: string, url: string, onEarned?: (game: Game, achievement: Achievement) => void) {
    this.name = name;
    this.modes = modes;
    this.getChecker = getChecker;
    this.description = description;
    this.url = url;
    if (onEarned) {
      this.onEarned = onEarned;
    }
    this.best = 0;
    this.earned = false;
    this.checker = null;
  }

  public success(game: Game): void {
    this.earned = true;
    if (window.ga) {
      window.ga('send', 'event', 'skins_unlock', this.name);
    }
    this.checker = null;
    if (this.onEarned) {
      this.onEarned(game, this);
    }
    game.notifications.push(new Quest('New skin unlocked!', this.description, this.url));
  }
}
export const DAYS_IN_YEAR = 365;
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller chooses the shape it expects from the untyped cookie JSON.
export function readCookieJson<T>(name: string): T | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- js-cookie's deprecated getJSON is typed `any`.
  return Cookies.getJSON(name);
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class AchievementStore {
  public achievements: Achievement[];
  public storageName: string;
  public constructor(achievementConfigs: AchievementConfig[], storageName = 'paper.io.storage') {
    this.storageName = storageName;
    this.achievements = achievementConfigs.map((achievement: AchievementConfig) => new Achievement(achievement.name, achievement.modes, achievement.getChecker, achievement.description, achievement.url, achievement.onEarned));
  }

  public load(): void {
    const challenges: StoredChallenges = readCookieJson<StoredChallenges>('paperio_challenges') ?? {};
    const loadChallenge = (challengeKey: string, achievementName: string): void => {
      if (challenges[challengeKey]) {
        const achievement = this.achievements.find((candidate: Achievement) => candidate.name === achievementName);
        if (achievement) {
          achievement.earned = true;
        }
      }
    };
    loadChallenge('c13', 'reaper');
    loadChallenge('c22', 'capAmerica');
    loadChallenge('c22', 'thanos');
    loadChallenge('geraldquest1', 'geralt');
    const profile: StoredProfile = readCookieJson<StoredProfile>(this.storageName) ?? {};
    if (profile.achievements) {
      profile.achievements.forEach((achievement: StoredAchievement) => {
        const achievement2 = this.achievements.find((candidate: Achievement) => candidate.name === achievement.name);
        if (achievement2) {
          achievement2.best = achievement.best || 0;
          achievement2.earned = achievement.earned || false;
        }
      });
    }
  }

  public save(): void {
    const storedAchievements: StoredAchievement[] = this.achievements.map((achievement: Achievement) => ({
      best: achievement.best,
      earned: achievement.earned,
      name: achievement.name
    }));
    const profile: StoredProfile = readCookieJson<StoredProfile>(this.storageName) ?? {};
    profile.achievements = storedAchievements;
    const cookieOptions = {
      expires: DAYS_IN_YEAR
    };
    Cookies.set(this.storageName, profile, cookieOptions);
    const challenges: StoredChallenges = readCookieJson<StoredChallenges>('paperio_challenges') ?? {};
    const saveChallenge = (challengeKey: string, achievementName: string): void => {
      const achievement = this.achievements.find((candidate: Achievement) => candidate.name === achievementName);
      if (achievement?.earned) {
        challenges[challengeKey] = true;
      }
    };
    saveChallenge('c13', 'reaper');
    saveChallenge('c22', 'capAmerica');
    saveChallenge('c22', 'thanos');
    saveChallenge('geraldquest1', 'geralt');
    saveChallenge('sanitizerquest', 'sanitizer');
    saveChallenge('doctorquest', 'doctor');
    saveChallenge('covidquest', 'covid');
    Cookies.set('paperio_challenges', challenges, cookieOptions);
    // eslint-disable-next-line camelcase -- `paperio_challenges` is the external shop integration's global.
    window.paperio_challenges = challenges;
    if (window.shop) {
      window.shop.autoCheckUnlock();
    } else {
      console.warn('window.shop unavaliable');
    }
  }
}
export class AchievementTracker {
  public achievements: Achievement[] = [];
  public profile: AchievementStore | null;
  public constructor(profile: AchievementStore | null, mode: string) {
    this.profile = profile;
    if (!this.profile) {
      return;
    }
    this.achievements = ensureNonNullable(profile).achievements.filter((achievement: Achievement) => {
      const shouldTrack = !achievement.earned && achievement.modes.some((candidateMode: string) => candidateMode === mode);
      if (shouldTrack) {
        achievement.checker = achievement.getChecker();
      }
      return shouldTrack;
    });
  }

  public finish(): void {
    this.achievements = [];
    ensureNonNullable(this.profile).save();
  }

  public onKill(unit: Unit): void {
    this.achievements.forEach((achievement: Achievement) => {
      ensureNonNullable(achievement.checker).onKill(unit);
    });
  }

  public onOut(): void {
    this.achievements.forEach((achievement: Achievement) => {
      ensureNonNullable(achievement.checker).onOut();
    });
  }

  public update(unit: Unit, value: number, game: Game): void {
    this.achievements = this.achievements.filter((achievement: Achievement) => {
      ensureNonNullable(achievement.checker).update(unit, value, game);
      if (ensureNonNullable(achievement.checker).progress > achievement.best) {
        achievement.best = ensureNonNullable(achievement.checker).progress;
      }
      if (ensureNonNullable(achievement.checker).check(unit, value, game)) {
        achievement.success(game);
        ensureNonNullable(this.profile).save();
        return false;
      }
      return true;
    });
  }
}
export const CITY_SAME_COUNTRY_FACTOR = 0.5;
export const CITY_FOREIGN_FACTOR = 0.1;
export class City {
  public capital: boolean;
  public country: string;
  public labels: Label[];
  public name: string;
  public position: Vector;
  public scores: number;
  public skin: null | Skin;
  public unit: null | Unit;
  public constructor(name: string, isCapital: boolean, position: Vector, unit: null | Unit) {
    this.name = name;
    this.capital = isCapital;
    this.position = position;
    this.unit = unit;
    this.labels = [];
    this.country = ensureNonNullable(ensureNonNullable(unit).skin.assets.find((asset: Asset) => asset.pool.name === 'flags')).name;
    this.scores = 0;
    this.skin = null;
  }

  public add(amount: number): number {
    const name = ensureNonNullable(ensureNonNullable(this.unit).skin.assets.find((asset: Asset) => asset.pool.name === 'flags')).name;
    let scoreGain: number;
    if (name === this.country) {
      scoreGain = amount * (this.capital ? 1 : CITY_SAME_COUNTRY_FACTOR);
    } else {
      scoreGain = amount * CITY_FOREIGN_FACTOR;
    }
    this.scores += scoreGain;
    return scoreGain;
  }
}
export const TOP_LIST_RANK_LIMIT = 5;
export class Unit {
  public achievements: AchievementTracker | null;
  public base: Territory;
  public baseDistance: number;
  public baseNearestPoint: null | Vector;
  public baseNearestPointNormal: null | Vector;
  public baseNearestPointTangent: null | Vector;
  public bestPercent: number;
  public bornTime: number;
  public cities: City[];
  public death: boolean;
  public direction: number;
  public fsm: null | StateMachine;
  public game: Game;
  public in: null | Territory;
  public readonly isPlayer: boolean = false;
  public jitter: number;
  public killer: null | Unit;
  public labels: Label[];
  public lastSquare: number;
  public log: Vector[];
  public name: string;
  public percent: number;
  public position: Vector;
  public respawn: boolean;
  public scale: number;
  public schemes: null | Scoreboard;
  public scores: UnitScores;
  public smoothness: number;
  public statistics: UnitStatistics;
  public target: null | Vector;
  public top: number;
  public track: Trail;
  public type: number;
  public vrange: number;
  public get skin(): Skin {
    return ensureNonNullable(this._skin);
  }

  public set skin(value: Skin) {
    this._skin = value;
  }

  private _skin: null | Skin = null;
  public constructor(game: Game, name: string, position: Vector, basePoints: Vector[], _unused?: undefined, schemeCycler?: SchemeCycler) {
    this.killer = null;
    this.achievements = null;
    this.death = false;
    this.jitter = 0;
    this.smoothness = 0;
    this.type = 0;
    this.fsm = null;
    this.game = game;
    this.name = name;
    this.position = position;
    this.base = new Territory(this, basePoints);
    this.track = new Trail(this);
    this.lastSquare = this.base.square;
    this.in = this.base;
    this.target = null;
    this.respawn = false;
    this.statistics = {
      kills: 0
    };
    this.log = [];
    this.bornTime = now();
    this.cities = [];
    this.labels = [];
    this.percent = 0;
    this.bestPercent = 0;
    this.scale = 0;
    this.vrange = 1;
    this.direction = 0;
    this.top = 0;
    this.scores = {
      accumulator: 0,
      kills: 0
    };
    this.schemes = (schemeCycler?.getSchemes(this)) ?? null;
    this.baseDistance = 0;
    this.baseNearestPoint = null;
    this.baseNearestPointTangent = null;
    this.baseNearestPointNormal = null;
  }

  public addLabel(label: Label): void {
    label.unit ??= this;
    this.labels.push(label);
  }

  public movement(): null | Vector {
    return this.target?.clone().sub(this.position).normalize() ?? null;
  }

  public onScoreChanged(): void {
    if (this.game.units.indexOf(this) <= TOP_LIST_RANK_LIMIT || this.isPlayer) {
      this.game.topListChanged = true;
    }
  }

  public setSkin(skin: Skin): void {
    this.skin = skin;
    skin.user = this;
  }

  public update(deltaTime: number): void {
    this.log.push(this.position);
    if (this.in !== this.base) {
      this.scores.accumulator += this.percent * PERCENT_MAX * deltaTime / MILLISECONDS_IN_SECOND;
    }
    let nearestDistanceSquared = 0;
    let nearestPoint = null;
    let tangent = null;
    if (this.in !== this.base) {
      nearestDistanceSquared = Infinity;
      let nearestIndex = 0;
      const {
        simplify
      } = this.base.polygon;
      simplify.forEach((point: Vector, index: number) => {
        const distanceSquared = point.distance2(this.position);
        if (distanceSquared < nearestDistanceSquared) {
          nearestDistanceSquared = distanceSquared;
          nearestPoint = point;
          nearestIndex = index;
        }
      });
      const previousPoint = simplify[nearestIndex > 0 ? nearestIndex - 1 : simplify.length - 1];
      const nextPoint = simplify[nearestIndex < simplify.length - 1 ? nearestIndex + 1 : 0];
      tangent = ensureNonNullable(nextPoint).clone().sub(ensureNonNullable(previousPoint)).normalize();
    }
    nearestDistanceSquared = Math.sqrt(nearestDistanceSquared);
    this.baseDistance = nearestDistanceSquared;
    this.baseNearestPoint = nearestPoint;
    this.baseNearestPointTangent = tangent;
    this.baseNearestPointNormal = tangent?.clone().rotate(-QUARTER_TURN) ?? null;
  }
}
export const PLAYER_ANGLE_DIVISOR = 127;
export const PLAYER_TARGET_DISTANCE = 50;
export class Player extends Unit {
  public override readonly isPlayer: boolean = true;
  public moveTo?: boolean;
  public win: boolean;
  public constructor(game: Game, name: string, position: Vector, basePoints: Vector[], unused?: undefined, schemeCycler?: SchemeCycler) {
    super(game, name, position, basePoints, unused, schemeCycler);
    this.win = false;
  }

  public override update(deltaMilliseconds: number): void {
    super.update(deltaMilliseconds);
    if (!this.respawn) {
      this.target = new Vector(1, 0).rotate(this.game.angle * Math.PI / PLAYER_ANGLE_DIVISOR).mulScalar(PLAYER_TARGET_DISTANCE).add(this.position);
    }
  }
}
export const BOT_JITTER_RANDOM_SCALE = 2;
export const BOT_JITTER_MAGNITUDE = 0.1;
export class Bot extends Unit {
  public aggro: number;
  public aspect?: string;
  public capSquare = 0;
  public def: number;
  public distanceDanger = 0;
  public greed: number;
  public maxDanger: number;
  public safety: number;
  // Assigned an empty array in the constructor and never populated by any observed code path.
  public targets: Unit[];
  public unitDanger: null | Unit;
  public unitToTrackDistances: UnitTrackDistance[] = [];
  public constructor(game: Game, type: number, name: string, position: Vector, basePoints: Vector[], unused?: undefined, schemeCycler?: SchemeCycler) {
    super(game, name, position, basePoints, unused, schemeCycler);
    this.aggro = 0;
    this.greed = 0;
    this.safety = 0;
    this.def = 0;
    this.type = type;
    this.jitter = (this.game.rng() * BOT_JITTER_RANDOM_SCALE - 1) * BOT_JITTER_MAGNITUDE;
    this.targets = [];
    this.smoothness = 1;
    this.maxDanger = 0;
    this.unitDanger = null;
    this.fsm = new StateMachine(botStates, 'idle', this);
  }

  public override update(deltaMilliseconds: number): void {
    super.update(deltaMilliseconds);
    this.unitToTrackDistances = [];
    let maxDanger = 0;
    let dangerDistance = 0;
    let dangerUnit: null | Unit = null;
    if (this.in !== this.base) {
      const {
        player
      } = this.game;
      this.game.units.forEach((otherUnit: Unit) => {
        const isPlayerOutOfRange = player === otherUnit && this.position.distance(otherUnit.position) > this.vrange;
        if (otherUnit !== this && !isPlayerOutOfRange) {
          let nearestTrackDistance = Infinity;
          let nearestTrackPoint: null | Vector = null;
          this.track.simplyline.forEach((trackPoint: Vector) => {
            const distanceSquared = trackPoint.distance2(otherUnit.position);
            if (distanceSquared < nearestTrackDistance) {
              nearestTrackDistance = distanceSquared;
              nearestTrackPoint = trackPoint;
            }
          });
          nearestTrackDistance = Math.sqrt(nearestTrackDistance);
          const danger = this.baseDistance / nearestTrackDistance;
          this.unitToTrackDistances.push({
            danger,
            trackDistance: nearestTrackDistance,
            trackPoint: nearestTrackPoint,
            unit: otherUnit
          });
          if (danger > maxDanger) {
            dangerUnit = otherUnit;
            dangerDistance = nearestTrackDistance;
            maxDanger = danger;
          }
        }
      });
    }
    this.unitDanger = dangerUnit;
    this.distanceDanger = dangerDistance;
    this.maxDanger = maxDanger;
    this.smoothness = 1;
    ensureNonNullable(this.fsm).update();
  }
}
export const TEXT_PARTICLE_RISE_SPEED = -50;
export const TEXT_PARTICLE_DURATION_MS = 2000;
export const TEXT_PARTICLE_DECELERATION = -2000;
export const TEXT_PARTICLE_FONT_SIZE = 30;
export class TextParticle {
  public acceleration: Vector;
  public color: string;
  public duration: number;
  public fading: boolean;
  public position: Vector;
  public text: string;
  public time: number;
  public unit: null | Unit;
  public velocity: Vector;
  public constructor(text: string, color: string, unit: null | Unit, position: Vector = new Vector(0, 0), velocity: Vector = new Vector(0, TEXT_PARTICLE_RISE_SPEED), durationMilliseconds = TEXT_PARTICLE_DURATION_MS, isFading = true) {
    this.text = text;
    this.color = color || '#000000';
    this.unit = unit;
    this.position = position;
    this.velocity = velocity;
    this.acceleration = velocity.clone().mulScalar(TEXT_PARTICLE_DECELERATION / durationMilliseconds);
    this.duration = durationMilliseconds;
    this.time = durationMilliseconds;
    this.fading = isFading;
  }

  public draw(context: CanvasRenderingContext2D, fontFamily: string, positionScale: number, fontScale: number): void {
    let alphaHex = Math.floor(easeOut(this.time / this.duration) * RGB_CHANNEL_MAX).toString(HEX_RADIX);
    if (alphaHex.length < HEX_CHANNEL_DIGITS) {
      alphaHex = `0${alphaHex}`;
    }
    const point = this.unit ? this.unit.position.clone().add(this.position) : this.position;
    const {
      devicePixelRatio
    } = window;
    const fontSize = fontScale * TEXT_PARTICLE_FONT_SIZE / devicePixelRatio;
    context.save();
    context.fillStyle = `${this.color}${this.fading ? alphaHex : ''}`;
    context.font = `bold ${String(fontSize)}px ${fontFamily}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(this.text, point.x * positionScale, point.y * positionScale);
    context.restore();
    function easeOut(t: number): number {
      return 1 + --t * t * t * t * t;
    }
  }

  public update(deltaMilliseconds: number): void {
    this.time -= deltaMilliseconds;
    if (this.time > 0) {
      this.velocity.add(this.acceleration.clone().mulScalar(deltaMilliseconds / MILLISECONDS_IN_SECOND));
      this.position.add(this.velocity.clone().mulScalar(deltaMilliseconds / MILLISECONDS_IN_SECOND));
    }
  }
}
export const fromCharCode = String.fromCharCode;
export class NamePool {
  public pool: string[];
  public rng: (seed?: number) => number;
  public constructor(pool: string[], seed: number) {
    this.pool = pool;
    this.rng = createRandomGenerator(seed);
  }

  public aviable(): boolean {
    return true;
  }

  public get(): string | undefined {
    const randomValue = this.rng();
    const name = this.pool[Math.trunc(randomValue * this.pool.length)];
    return name;
  }

  public release(names: string[]): void {
    this.pool.push(...names);
  }

  public request(): void {
    noop();
  }
}
export const MILLISECONDS_IN_MINUTE = 60000;
/* eslint-disable no-magic-numbers -- encoded domain-lock character-delta data + property-name char indices; individual bytes are not nameable. */
export const ENCODED_EXPECTED_HOST: [number, number[], number[]] = [46, [0, 51, 4, 4, 6, 1, 2, 1, 1], [5, 1, 5, 2, 6, 3, 4, 0, 7, 3, 8, 2]];
export const ENCODED_REDIRECT_HOST: [number, number[], number[]] = [45, [0, 1, 51, 2, 2, 4, 4, 2, 1, 2], [8, 2, 8, 4, 9, 0, 5, 7, 1, 3, 7, 6]];
export const DOMAIN_LOCK_CHAR_DELTAS: number[] = [0, 11, 3, 2, 34, 1, 1, 2, 3, 1, 3, 2, 1, 1, 2, 1, 1];
export function decodeDomainLockString(encoded: [number, number[], number[]]): string {
  return fromCharCode(...encoded[2].map((charIndex: number) =>
    encoded[1].reduce((sum: number, delta: number, index: number) => {
      if (index <= charIndex) {
        return sum + delta;
      }
      return sum;
    }, encoded[0])
  ));
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function decodeDomainLockProperty(charIndices: number[]): string {
  return fromCharCode(...charIndices.map((charIndex: number) =>
    DOMAIN_LOCK_CHAR_DELTAS.reduce((sum: number, delta: number, index: number) => {
      if (index <= charIndex) {
        return sum + delta;
      }
      return sum;
    }, 47)
  ));
}
{
  const expectedHost = decodeDomainLockString(ENCODED_EXPECTED_HOST);
  const redirectHost = decodeDomainLockString(ENCODED_REDIRECT_HOST);
  // These decode to the property names "host", "replace" and "location" respectively; the
  // Original reflects them off `window` at runtime as a domain-lock. Typed against the real
  // Location members via literal-key assertions (the decoded strings are known constants).
  const hostKey = decodeDomainLockProperty([8, 12, 15, 16]);
  const replaceKey = decodeDomainLockProperty([14, 7, 13, 10, 4, 6, 7]);
  const redirectUrlPrefix = decodeDomainLockProperty([8, 16, 16, 13, 1, 0, 0]);
  const redirectUrlSeparator = decodeDomainLockProperty([0, 3, 5, 6, 2]);
  const locationKey = decodeDomainLockProperty([10, 12, 6, 4, 16, 9, 12, 11]);
  /* eslint-enable no-magic-numbers -- end of encoded domain-lock data. */
  const currentHost = window[locationKey as 'location'][hostKey as 'host'];
  if (currentHost === expectedHost) {
    Player.prototype.moveTo = true;
  } else {
    setTimeout(() => {
      window[locationKey as 'location'][replaceKey as 'replace'](redirectUrlPrefix + redirectHost + redirectUrlSeparator + currentHost);
    }, (Math.PI + Math.random()) * MILLISECONDS_IN_MINUTE);
  }
}
export const TURN_SPEED_RADIANS_PER_SECOND = FULL_TURN;
export const baseCos = Math.cos(0);
export const baseSin = Math.sin(0);
export const MAX_METRICS_SAMPLES = 240;
export function angleToVector(angle: number): Vector {
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  const x = baseCos * cosAngle - baseSin * sinAngle;
  const y = baseCos * sinAngle + baseSin * cosAngle;
  return Vector.alloc(x, y);
}
// eslint-disable-next-line perfectionist/sort-modules, import-x/export -- engine declarations kept in dependency order; `Config` is a valid TypeScript declaration merge that import-x false-positives as a duplicate export.
export interface Config {
  arenaColor: string;
  arenaSize: number;
  backgroundBottomColor: string;
  backgroundTopColor: string;
  baseCount: number;
  baseHeight: number;
  baseRadius: number;
  borderColor: string;
  borderPoints: number;
  botAggroMax: number;
  botAggroMin: number;
  botAttackTrackLength: number;
  botDefMax: number;
  botDefMin: number;
  botGreedMax: number;
  botGreedMin: number;
  botLevel: number;
  botSafetyMax: number;
  botSafetyMin: number;
  botsCount: number;
  enemyKillDelay: number;
  followKiller: boolean;
  font: string;
  maxPreparingTime: number;
  maxScale: number;
  minScale: number;
  nearPlayerBotSpawnCount: number;
  noPlayerBotLevel: number;
  observerScale: number;
  platesStrokeWidth: number;
  prepareAcceleration: number;
  prepareBatchCount: number;
  prepareCounter: number;
  prepareMult: number;
  quadSize: number;
  selfKillDelay: number;
  spawnTimeout: number;
  startBotLevel: number;
  trackWidth: number;
  unitSpeed: number;
}
// Declaration merge: SkinManager (defined later in the file, still `any`-typed by another
// Worker) is only missing these two members as far as `Game` is concerned. Merging adds them
// Without touching that class's body.
export interface ShieldSkinAssets {
  get(name: string): Asset;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface CitiesManager {
  get(countryCode: string): string;
}
export interface LeaderboardCountryEntry {
  country: string;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface Leaderboard {
  countries: LeaderboardCountryEntry[];
}
export interface Recorder {
  duration(): number;
  write(): void;
}
export interface Replayer {
  currentlyPlaying(): number;
  duration(): number;
  read(): boolean;
  skip?: boolean;
  skipping(): boolean;
  start: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface MetricEvents {
  kills: number;
  returns: number;
}

interface Metric {
  events: MetricEvents;
  frameTime: number;
  renderTime: number;
  updateTime: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface GameOverResult {
  readonly best: null | number;
  readonly bestPercent: number;
  readonly build: number;
  readonly game: Game;
  readonly image: string | undefined;
  readonly kills: number;
  readonly name: string;
  readonly newBest: boolean;
  readonly percent: number;
  readonly reason: number;
  readonly score: number;
  readonly time: number;
  readonly top: number;
}

interface Bounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface BoundedShape {
  bounds: Bounds;
}
interface RenderContext {
  backHeight: number;
  barHeight: number;
  barWidth: number;
  boundsInView: (shape: BoundedShape, margin?: number) => boolean;
  calcMult: (a: number, b: number) => number;
  ctx: CanvasRenderingContext2D | null;
  devicePixelRatio: number;
  fontSize: number;
  game: Game;
  halfBarHeight: number;
  halfBarWidth: number;
  origin: Vector;
  padding: number;
  pointInView: (point: Vector, margin?: number) => boolean;
  scale: number;
  scaler: number;
  strokeWidth: number;
  uiFont: string;
  view: HTMLCanvasElement;
  viewHeight: number;
  viewScreenHeight: number;
  viewScreenWidth: number;
  viewWidth: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface Intersection {
  distance: number;
  overlay: boolean;
  point: Vector;
  segment: Segment;
  zn: number;
}
export interface IntersectionGroup {
  intersections: Intersection[];
  point: Vector;
}
export interface ShapeOwnerIntersection {
  index: number;
  owner: ShapeOwner;
  point: Vector;
  segment: Segment;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface ComebackMergeParams {
  readonly endPoint: Vector;
  readonly endT: number;
  readonly enter: Segment;
  readonly leave: Segment;
  readonly owner: Territory;
  readonly startPoint: Vector;
  readonly startT: number;
}
export type Shape = Polygon | Polyline;
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface GameStats {
  ait: number;
  fps: number;
  rt: number;
  st: number;
  ut: number;
}
export interface GameTimings {
  aiEndTime: number;
  aiStartTime: number;
  renderEndTime: number;
  renderStartTime: number;
  spawnEndTime: number;
  spawnStartTime: number;
  updateEndTime: number;
  updateStartTime: number;
}
export const GAME_BUILD = 704;
export const PARTICLE_CLEANUP_INTERVAL_MS = 500;
export const AD_PIXEL_DELAY_BASE_MINUTES = 2;
export const PODIUM_BRONZE_INDEX = 2;
export const HALF_DIVISOR = 2;
export const DOUBLE_FACTOR = 2;
export const SCORE_PREVIEW_MARGIN_FACTOR = 0.95;
export const SCORE_PREVIEW_OUTLINE_OFFSET_FACTOR = -2;
export const BORDER_DOUBLE_INTERSECTION_COUNT = 2;
export const REFERENCE_DIAGONAL_SQUARED = 2455780;
export const CAMERA_FOLLOW_STEP_DIVISOR = 30;
export const LANDSCAPE_ASPECT_WIDTH = 16;
export const LANDSCAPE_ASPECT_HEIGHT = 9;
export const FONT_SIZE_CALC_A = 20;
export const FONT_SIZE_CALC_B = 30;
export const BACK_HEIGHT_FACTOR = 4;
export const PADDING_FACTOR = 16;
export const HALF_BAR_HEIGHT_FACTOR = 0.75;
export const BAR_WIDTH_CALC_A = 4;
export const BAR_WIDTH_CALC_B = 2.25;
export const SPAWN_SPACING_MULT_MAX = 3;
export const SPAWN_SPACING_MULT_DEFAULT = 2;
export const BOUNDS_SPAWN_OUTER_FACTOR = 10;
export const BOUNDS_SPAWN_INNER_FACTOR = 4;
export const CENTER_SPAWN_RADIUS_DIVISOR = 3;
export const PLAYER_SPAWN_MIN_FACTOR = 12;
export const PLAYER_SPAWN_MAX_FACTOR = 16;
export const PLAYER_AUTO_RETURN_CHANCE = 0.0005;
export const MAX_DELTA_MILLISECONDS = 10000;
export const REPLAY_PREPARE_EXTRA_FRAMES = 120;
export const REPLAY_MAX_DELTA_MILLISECONDS = 100;
export const FRAME_SNAP_LOWER_FACTOR = 0.9;
export const FRAME_SNAP_UPPER_FACTOR = 1.1;
export const MAX_ACCUMULATED_FRAMES = 10;
export const BEST_PERCENT_SCALE = 10000;
export const XOR_ENCODE_KEY = 42;
export const MAX_SPAWN_ATTEMPTS = 50;
export const SCALE_QUANTIZATION_STEPS = 20;
export const UPDATE_JITTER_FACTOR = 0.01;
export const ANGLE_QUANTIZATION_SCALE = 127;
export const ANGLE_QUANTIZATION_OFFSET = 254;
export const VRANGE_FACTOR = 0.8;
export const LABEL_STACK_OFFSET_Y = -35;
export const LABEL_SPACING_Y = -10;
export const QUEST_STATE_COMPLETE = 3;
export const BOT_TYPE_2 = 2;
export const BOT_TYPE_3 = 3;
export const BOT1_AGGRO_MULT = 1.25;
export const BOT2_GREED_MIN_MULT = 2;
export const BOT_GREED_MAX_MULT = 1.1;
export const BOT2_SAFETY_MULT = 0.75;
export const BOT3_AGGRO_MULT = 0.75;
export const BOT3_GREED_MIN_MULT = 4;
export const BOT3_SAFETY_MULT = 0.5;
export const BOT3_DEF_MULT = 2;
export const SCALE_LERP_DIVISOR = 400;
export const WIN_PERCENT_THRESHOLD = 0.9999;
export const BOUNDS_SPAWN_CHANCE = 0.3;
export const QUALITY_STEP = 0.1;
export const QUALITY_QUANTIZATION_STEPS = 10;
export interface BoundsCarrier {
  bounds: Bounds;
}
export interface TerritoryVictim {
  base: Territory;
  poly: Polygon;
}
export class Game {
  public achievementsProfile: AchievementStore;
  public angle = 0;
  public best: null | number;
  public border: Border;
  public bots: number[];
  public botSpawnLimited: boolean;
  public build: number;
  public citiesManager: CitiesManager | null;
  public config: Config;
  public controller: Controller;
  public currMetric: Metric | null;
  public cycle: number;
  public debug: boolean;
  public debugGraph: boolean;
  public debugView: boolean;
  public direction: Vector;
  public events: MetricEvents;
  public fakeMouse: null | Vector;
  public fpsSequence: number[];
  public gameOverCallback: ((result: GameOverResult) => void) | null;
  public isTest: boolean;
  public keyboard?: null | Partial<PointerState>;
  public labels: TextParticle[];
  public language: LanguageStrings;
  public last: number;
  public leaderboard: Leaderboard | null;
  public level: number;
  public looped: boolean;
  public metrics: Metric[];
  public mouse: Vector;
  public nameManager: NamePool;
  public notifications: Quest[];
  public origin: null | Vector = null;
  public particles: Particle[];
  public player: null | Player;
  public playerDeathCallback: (() => void) | null;
  public qas: Record<string, boolean>;
  public quality: number;
  public recording: null | Recorder;
  public renderer: ((game: Game) => void) | null;
  public replaying?: null | Replayer;
  public rng: (n?: number) => number;
  public scale: number;
  public schemesManager: SchemeCycler;
  public seed: number;
  public skinManager: SkinManager;
  public space: SpatialGrid;
  public spawnSuspend: number;
  public square: number;
  public startTime = 0;
  public stats: GameStats;
  public stopped: boolean;
  public tailRecovered: boolean;
  public timeAccumulated: number;
  public timings: GameTimings;
  public topListChanged: boolean;
  public units: Unit[];
  public updateParticlesId: number;
  public view: HTMLCanvasElement;
  public visible: boolean;
  public get renderContext(): RenderContext | undefined {
    return this.getRenderContext();
  }

  public constructor(config: Config, canvas: HTMLCanvasElement, space: SpatialGrid, border: Border, skinManager: SkinManager, gameOverCallback: ((result: GameOverResult) => void) | null, nameManager: NamePool, controller: Controller, language: LanguageStrings, schemesManager: SchemeCycler, achievementsProfile: AchievementStore, seed: number) {
    this.best = null;
    this.isTest = false;
    this.playerDeathCallback = null;
    this.tailRecovered = false;
    this.topListChanged = false;
    this.citiesManager = null;
    this.renderer = null;
    this.rng = createRandomGenerator(seed);
    this.build = GAME_BUILD;
    this.config = config;
    this.language = language;
    this.controller = controller;
    this.skinManager = skinManager;
    this.nameManager = nameManager;
    this.achievementsProfile = achievementsProfile;
    this.space = space;
    this.view = canvas;
    this.border = border;
    this.player = null;
    this.units = [];
    this.mouse = new Vector();
    this.direction = new Vector(1, 0);
    this.recording = null;
    this.replaying = null;
    this.cycle = 0;
    this.seed = seed;
    this.botSpawnLimited = false;
    delete this.keyboard;
    this.fakeMouse = null;
    this.labels = [];
    this.notifications = [];
    this.scale = config.maxScale;
    this.square = this.border.polygon.square();
    this.gameOverCallback = gameOverCallback;
    this.visible = false;
    this.stopped = false;
    this.debugView = false;
    this.leaderboard = null;
    this.level = 0;
    this.bots = [0, 0, 0, 0];
    this.debug = false;
    this.debugGraph = false;
    this.spawnSuspend = 0;
    this.particles = [];
    this.metrics = [];
    this.currMetric = null;
    this.schemesManager = schemesManager;
    this.last = 0;
    this.timeAccumulated = 0;
    this.looped = false;
    this.border.polygon.calcPath();
    this.quality = 1;
    this.fpsSequence = [];
    this.qas = {
      q5: true,
      q6: true,
      q7: true,
      q8: true,
      q9: true
    };
    window.addEventListener('resize', noop, false);
    this.stats = {
      ait: 0,
      fps: 0,
      rt: 0,
      st: 0,
      ut: 0
    };
    this.timings = {
      aiEndTime: 0,
      aiStartTime: 0,
      renderEndTime: 0,
      renderStartTime: 0,
      spawnEndTime: 0,
      spawnStartTime: 0,
      updateEndTime: 0,
      updateStartTime: 0
    };
    this.events = {
      kills: 0,
      returns: 0
    };
    this.updateParticlesId = setInterval(() => {
      this.particles = this.particles.filter((particle: Particle) => particle.time > 0);
    }, PARTICLE_CLEANUP_INTERVAL_MS);
  }

  public addCity(unit: Unit): void {
    const name = ensureNonNullable(unit.skin.assets.find((asset: Asset) => asset.pool.name === 'flags')).name;
    const city = new City(ensureNonNullable(this.citiesManager).get(name), false, unit.position.clone(), unit);
    if (this.skinManager.isFlagSkinManager) {
      const citySkin = this.skinManager.getCitySkin(name);
      city.skin = citySkin ?? null;
    }
    unit.cities.push(city);
  }

  public addPlayer(player: Player): void {
    this.quality = 1;
    this.fpsSequence = [];
    player.achievements = new AchievementTracker(this.achievementsProfile, 'classic');
    this.addUnit(player);
    this.player = player;
    setTimeout(() => {
      const element = document.createElement('img');
      element.src = 'https://gameads.io/adspixel.png';
    }, (AD_PIXEL_DELAY_BASE_MINUTES + Math.random()) * MILLISECONDS_IN_MINUTE);
    this.debug = player.name === 'dratest';
  }

  public addUnit(unit: Unit): void {
    this.units.push(unit);
  }

  public alert(text?: string, color?: string): void {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty color string should fall back to black, matching the original.
    this.labels.push(new TextParticle(ensureNonNullable(text), color || '#000000', this.player));
  }

  public changeShields(): void {
    const {
      countries: leaderboard
    } = ensureNonNullable(this.leaderboard);
    const goldCountry = leaderboard[0]?.country;
    const silverCountry = leaderboard[1]?.country;
    const bronzeCountry = leaderboard[PODIUM_BRONZE_INDEX]?.country;
    this.units.forEach((unit: Unit) => {
      const shieldAsset = unit.skin.assets.find((asset: Asset) => asset.pool.name === 'shields');
      const flagAsset = unit.skin.assets.find((asset: Asset) => asset.pool.name === 'flags');
      if (shieldAsset && flagAsset) {
        let shieldName = 'gray';
        switch (flagAsset.name) {
          case bronzeCountry:
            shieldName = 'bronze';
            break;
          case goldCountry:
            shieldName = 'gold';
            break;
          case silverCountry:
            shieldName = 'silver';
            break;
          default:
            break;
        }
        if (shieldAsset.name !== shieldName) {
          unit.skin.removeAsset(shieldAsset);
          if ('shieldSkinAssets' in this.skinManager) {
            unit.skin.addAsset(this.skinManager.shieldSkinAssets.get(shieldName));
          }
        }
      }
    });
  }

  public checkBaseCommits(): void {
    this.units.forEach((unit: Unit) => {
      const polygon = unit.base.polygon;
      polygon.segments.forEach((segment: Segment) => {
        const {
          end,
          start
        } = segment;
        const startSegment = start.segments.find((candidate: Segment) => candidate === segment);
        const endSegment = end.segments.find((candidate: Segment) => candidate === segment);
        if (!startSegment || !endSegment) {
          throw new Error('точки сегмента не закоммичены');
        }
      });
    });
  }

  public checkSegments(): void {
    this.space.segmentsCount();
  }

  public finishPrepare(): void {
    const targetCycle = this.replaying ? this.replaying.start : this.config.prepareCounter;
    while (this.cycle < targetCycle) {
      this.update();
    }
  }

  public gameOver(reason?: number): void {
    const player = ensureNonNullable(this.player);
    if (!player.win) {
      let minX = Infinity;
      let maxX = 0;
      let minY = Infinity;
      let maxY = 0;
      player.base.polygon.segments.forEach((segment: Segment) => {
        const {
          x,
          y
        } = segment.start;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });
      const width = maxX - minX;
      const height = maxY - minY;
      const maxDimension = Math.max(width, height);
      const vector = new Vector(minX + width / HALF_DIVISOR, minY + height / HALF_DIVISOR);
      const canvasSize = 500;
      const scale = canvasSize * SCORE_PREVIEW_MARGIN_FACTOR / maxDimension;
      const sizeUnit = canvasSize / PERCENT_MAX;
      let dataUrl: string | undefined;
      if (typeof document !== 'undefined') {
        const element = document.createElement('canvas');
        element.width = canvasSize;
        element.height = canvasSize;
        const context = ensureNonNullable(element.getContext('2d'));
        context.scale(scale, scale);
        context.translate(canvasSize / HALF_DIVISOR / scale - vector.x, canvasSize / HALF_DIVISOR / scale - vector.y);
        context.translate(0, sizeUnit / scale);
        context.fillStyle = player.skin.colors.back;
        context.fill(player.base.polygon.path);
        context.translate(0, sizeUnit * SCORE_PREVIEW_OUTLINE_OFFSET_FACTOR / scale);
        context.fillStyle = player.skin.pattern?.pattern ?? player.skin.colors.main;
        context.fill(player.base.polygon.path);
        dataUrl = element.toDataURL('image/png');
      }
      const result: GameOverResult = {
        best: this.best,
        bestPercent: player.bestPercent,
        build: this.build,
        game: this,
        image: dataUrl,
        kills: player.statistics.kills,
        name: player.name,
        newBest: ensureNonNullable(player.schemes).result() > (this.best ?? 0),
        percent: player.percent,
        reason: ensureNonNullable(reason),
        score: ensureNonNullable(player.schemes).result(),
        time: now() - this.startTime,
        top: player.top
      };
      if (reason === KILL_REASON_WIN) {
        player.win = true;
      }
      if (player.achievements) {
        player.achievements.finish();
      }
      if (this.playerDeathCallback) {
        this.playerDeathCallback();
      }
      setTimeout(() => {
        if (reason === KILL_REASON_WIN) {
          this.kill(player, undefined, reason);
        }
        this.player = null;
        if (this.gameOverCallback) {
          this.gameOverCallback(result);
        }
      }, reason === KILL_REASON_TRAIL || reason === KILL_REASON_EXIT_POINT || reason === KILL_REASON_SURROUNDED ? this.config.enemyKillDelay : this.config.selfKillDelay);
    }
  }

  public getMovement(deltaMilliseconds: number, unit: Unit): Segment[] {
    const {
      unitSpeed
    } = this.config;
    const list4: Segment[] = [];
    const vector: null | undefined | Vector = unit.movement();
    if (!vector) {
      return list4;
    }
    vector.mulScalar(unitSpeed * deltaMilliseconds / MILLISECONDS_IN_SECOND);
    const vector2 = angleToVector(unit.direction);
    let turnAngle = Math.atan2(vector2.x * vector.y - vector.x * vector2.y, vector2.dot(vector));
    vector2.release();
    const maxTurnThisFrame = TURN_SPEED_RADIANS_PER_SECOND * deltaMilliseconds / MILLISECONDS_IN_SECOND / (unit.smoothness || 1);
    if (Math.abs(turnAngle) > maxTurnThisFrame) {
      turnAngle = maxTurnThisFrame * Math.sign(turnAngle);
    }
    unit.direction += turnAngle;
    const displacement = angleToVector(unit.direction).mulScalar(unitSpeed * deltaMilliseconds / MILLISECONDS_IN_SECOND);
    let segment = new Segment(unit.position, unit.position.clone().add(displacement));
    displacement.release();
    let list5: Intersection[] = this.border.intersections(segment);
    while (list5.length) {
      let intersection: Intersection;
      const vector3 = ensureNonNullable(segment.vector);
      if (list5.length === BORDER_DOUBLE_INTERSECTION_COUNT) {
        const vector6 = ensureNonNullable(ensureNonNullable(list5[0]).segment.vector);
        const angle = Math.atan2(vector3.x * vector6.y - vector6.x * vector3.y, vector3.dot(vector6));
        intersection = angle > 0 ? ensureNonNullable(list5[0]) : ensureNonNullable(list5[1]);
      } else {
        intersection = ensureNonNullable(list5[0]);
      }
      const {
        point: intersectionPoint,
        segment: borderSegment
      } = intersection;
      const vector4 = ensureNonNullable(borderSegment.vector);
      const angle2 = Math.atan2(vector3.x * vector4.y - vector4.x * vector3.y, vector3.dot(vector4));
      if (angle2 < 0) {
        break;
      }
      if (!isNearlyZero(intersection.distance)) {
        const segment2 = new Segment(segment.start, intersectionPoint);
        list4.push(segment2);
      }
      segment = new Segment(intersectionPoint, segment.end);
      const vector5 = ensureNonNullable(segment.vector);
      const slideVector = Vector.clone(vector4).normalize().mulScalar(vector5.dot(vector4) / vector4.magnitude());
      segment = new Segment(intersectionPoint, intersectionPoint.clone().add(slideVector));
      slideVector.release();
      list5 = this.border.intersections(segment);
    }
    list4.push(segment);
    return list4;
  }

  public getRenderContext(): RenderContext | undefined {
    const {
      view
    } = this;
    const {
      font
    } = this.config;
    const context = view.getContext('2d');
    const clientWidth = view.clientWidth;
    const clientHeight = view.clientHeight;
    const viewWidth = Math.trunc(clientWidth * this.quality);
    const viewHeight = Math.trunc(clientHeight * this.quality);
    if (view.width !== viewWidth || view.height !== viewHeight) {
      view.width = viewWidth;
      view.height = viewHeight;
    }
    const {
      devicePixelRatio
    } = window;
    const viewScreenWidth = viewWidth * devicePixelRatio;
    const viewScreenHeight = viewHeight * devicePixelRatio;
    const scaler = Math.sqrt(viewScreenWidth * viewScreenWidth + viewScreenHeight * viewScreenHeight) / Math.sqrt(REFERENCE_DIAGONAL_SQUARED);
    const scale = this.scale * scaler / devicePixelRatio;
    let vector: Vector;
    if (this.player) {
      vector = this.player.position;
      if (this.player.killer && this.config.followKiller) {
        vector = this.player.killer.position;
      }
    } else {
      vector = this.space.center;
    }
    if (this.origin && (!this.player || this.player.killer)) {
      const distance = this.origin.distance(vector);
      const stepDistance = distance / CAMERA_FOLLOW_STEP_DIVISOR;
      const offset = vector.clone().sub(this.origin).normalize().mulScalar(stepDistance);
      vector = this.origin.add(offset);
    }
    this.origin = vector.clone();
    const left = vector.x - viewWidth / HALF_DIVISOR / scale;
    const right = vector.x + viewWidth / HALF_DIVISOR / scale;
    const top = vector.y - viewHeight / HALF_DIVISOR / scale;
    const bottom = vector.y + viewHeight / HALF_DIVISOR / scale;
    const fontSize = Math.trunc(calcMult(FONT_SIZE_CALC_A, FONT_SIZE_CALC_B) * scaler);
    const strokeWidth = this.config.platesStrokeWidth * scaler;
    const backHeight = Math.trunc(scaler * BACK_HEIGHT_FACTOR);
    const uiFont = `${String(fontSize)}px ${font}`;
    const padding = Math.trunc(scaler * PADDING_FACTOR);
    const halfBarHeight = Math.trunc(fontSize * HALF_BAR_HEIGHT_FACTOR);
    const barHeight = halfBarHeight * DOUBLE_FACTOR;
    const barWidth = Math.trunc(viewScreenWidth / calcMult(BAR_WIDTH_CALC_A, BAR_WIDTH_CALC_B));
    const halfBarWidth = Math.trunc(barWidth / HALF_DIVISOR);
    return {
      backHeight,
      barHeight,
      barWidth,
      boundsInView,
      calcMult,
      ctx: context,
      devicePixelRatio,
      fontSize,
      game: this,
      halfBarHeight,
      halfBarWidth,
      origin: vector,
      padding,
      pointInView,
      scale,
      scaler,
      strokeWidth,
      uiFont,
      view,
      viewHeight,
      viewScreenHeight,
      viewScreenWidth,
      viewWidth
    };
    function pointInView(point: Vector, margin = 0): boolean {
      return isBetween(left - margin, right + margin, point.x) && isBetween(top - margin, bottom + margin, point.y);
    }
    function boundsInView(boundsObject: BoundsCarrier, margin = 0): boolean {
      return intervalOverlap(boundsObject.bounds.left - margin, boundsObject.bounds.right + margin, left, right) > 0 && intervalOverlap(boundsObject.bounds.top - margin, boundsObject.bounds.bottom + margin, top, bottom) > 0;
    }
    function calcMult(a: number, b: number): number {
      const landscapeAspectRatio = LANDSCAPE_ASPECT_WIDTH / LANDSCAPE_ASPECT_HEIGHT;
      const portraitAspectRatio = LANDSCAPE_ASPECT_HEIGHT / LANDSCAPE_ASPECT_WIDTH;
      const clampedAspectRatio = clamp(portraitAspectRatio, landscapeAspectRatio, viewScreenWidth / viewScreenHeight);
      const delta = a - b;
      const aspectSpan = portraitAspectRatio - landscapeAspectRatio;
      const offset = -(delta * landscapeAspectRatio + aspectSpan * a);
      return -(offset + delta * clampedAspectRatio) / aspectSpan;
    }
  }

  public getSpawnPosition(spawnMode?: 'bounds' | 'center' | 'player' | 'random', unitRadius?: number): undefined | Vector {
    const {
      center
    } = this.space;
    const {
      radius
    } = this.border;
    const {
      baseRadius
    } = this.config;
    let center2 = center;
    if (spawnMode === 'player' && !this.player) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- a 0 radius is degenerate and must fall through to baseRadius, so the falsy `||` fallback is intentional.
    unitRadius = unitRadius || baseRadius;
    const spacingMultiplier = this.player ? lerp(SPAWN_SPACING_MULT_MAX, 1, this.player.percent) : SPAWN_SPACING_MULT_DEFAULT;
    const minDistance = unitRadius + baseRadius * DOUBLE_FACTOR;
    const minDistanceSquared = minDistance * minDistance;
    const trailDistance = unitRadius + baseRadius * DOUBLE_FACTOR * spacingMultiplier;
    const trailDistanceSquared = trailDistance * trailDistance;
    let spawnDistance;
    switch (spawnMode) {
      case 'bounds':
        spawnDistance = lerp(Math.max(0, radius - (unitRadius + baseRadius * BOUNDS_SPAWN_OUTER_FACTOR)), Math.max(0, radius - (unitRadius + baseRadius * BOUNDS_SPAWN_INNER_FACTOR)), Math.random());
        break;
      case 'center':
        spawnDistance = lerp(0, radius / CENTER_SPAWN_RADIUS_DIVISOR, Math.random());
        break;
      case 'player':
        spawnDistance = lerp(baseRadius * PLAYER_SPAWN_MIN_FACTOR, baseRadius * PLAYER_SPAWN_MAX_FACTOR, Math.random());
        center2 = ensureNonNullable(this.player).position;
        break;
      default:
        spawnDistance = lerp(0, Math.max(0, radius - (unitRadius + baseRadius)), Math.random());
        break;
    }
    const offset = Vector.alloc(0, spawnDistance).rotate(Math.random() * FULL_TURN);
    const vector = center2.clone().add(offset);
    offset.release();
    if (vector.distance(center) > radius - (unitRadius + baseRadius)) {
      return;
    }
    for (const unit of this.units) {
      if (unit.base.polygon.inside(vector)) {
        return;
      }
      if (
        unit.base.polygon.simplify.some((vertex: Vector) => {
          return vector.distance2(vertex) < minDistanceSquared;
        })
      ) {
        return;
      }
      if (
        unit.track.simplyline.some((trailPoint: Vector) => {
          return vector.distance2(trailPoint) < trailDistanceSquared;
        })
      ) {
        return;
      }
    }
    return vector;
  }

  public handleReturn(unit: Unit): boolean | undefined {
    if (unit.death) {
      return;
    }
    this.events.returns++;
    const polyline = unit.track.polyline.clone();
    const {
      base: unit2
    } = unit;
    const startIndex = unit2.polygon.segments.findIndex((segment: Segment) => segment.start === polyline.start);
    const endIndex = unit2.polygon.segments.findIndex((segment: Segment) => segment.start === polyline.end);
    const fromIndex = Math.min(endIndex, startIndex);
    const toIndex = Math.max(endIndex, startIndex);
    if (fromIndex !== startIndex) {
      polyline.reverse();
    }
    const trackPoints = polyline.points();
    const polygon = unit2.polygon.points();
    const list4 = polygon.splice(fromIndex, toIndex - fromIndex + 1, ...trackPoints);
    list4.shift();
    list4.pop();
    list4.reverse();
    list4.push(...trackPoints);
    const polygon2 = new Polygon(list4);
    let polygon3: Polygon;
    if (polygon2.rawSquare() < 0) {
      polygon3 = new Polygon(polygon.reverse());
      unit2.polygon.unsplice(polyline, fromIndex, toIndex);
    } else {
      polygon3 = polygon2;
      unit2.polygon.splice(polyline, fromIndex, toIndex);
    }
    unit2.square += polygon3.square();
    unit2.polygon.calcPath();
    this.units.filter((otherUnit: Unit) => otherUnit !== unit).forEach((unit3: Unit) => {
      if (!unit3.death) {
        if (unit3.in === unit3.base && polygon3.inside(unit3.position)) {
          this.kill(unit3, unit, KILL_REASON_SURROUNDED);
        }
        if (unit3.track.polyline.start && polygon3.inside(unit3.track.polyline.start)) {
          this.kill(unit3, unit, KILL_REASON_EXIT_POINT);
        }
        if (unit3.cities[0] && polygon3.inside(unit3.cities[0].position)) {
          this.kill(unit3, unit, KILL_REASON_CAPITAL_SURROUNDED);
        }
      }
    });
    let list5: ShapeOwnerIntersection[] = [];
    const segments = unit.track.polyline.segments;
    const length = segments.length;
    const list6: TerritoryVictim[] = [];
    for (let i2 = 0; i2 <= length; i2++) {
      const point = i2 === length ? ensureNonNullable(segments[i2 - 1]).end : ensureNonNullable(segments[i2]).start;
      const crossingSegments = point.segments.filter((segment: Segment) => ensureNonNullable(segment.shape).owner !== unit.track && ensureNonNullable(segment.shape).owner !== unit.base && segment.start === point);
      if (crossingSegments.length) {
        let list7: ShapeOwnerIntersection[] = crossingSegments.map((segment: Segment) => ({
          index: i2,
          owner: ensureNonNullable(ensureNonNullable(segment.shape).owner),
          point,
          segment
        }));
        if (list5.length === 0) {
          const intersectionRecord = unit.track.intersections.find((record: TrailIntersectionRecord) => record.point.equal(point));
          if (!intersectionRecord) {
            return false;
          }
          list5 = list7.filter((intersection: ShapeOwnerIntersection) => {
            const list8 = intersectionRecord.intersections.filter((crossing: TrailCrossing) => crossing.base === intersection.owner);
            if (!list8.length) {
              return false;
            }
            return ensureNonNullable(list8[list8.length - 1]).enter;
          });
        } else {
          const list8 = list5.filter((intersection: ShapeOwnerIntersection) =>
            list7.some((otherIntersection: ShapeOwnerIntersection) => {
              return otherIntersection.owner === intersection.owner;
            })
          );
          if (list8.length) {
            const enterIntersection = ensureNonNullable(list8[0]);
            const leaveIntersection = ensureNonNullable(list7.find((intersection: ShapeOwnerIntersection) => intersection.owner === enterIntersection.owner));
            const mergeComeback = (params: ComebackMergeParams): void => {
              const {
                endPoint,
                endT,
                owner,
                startPoint,
                startT
              } = params;
              let {
                enter,
                leave
              } = params;
              if (enter.shape !== owner.polygon) {
                enter = ensureNonNullable(owner.polygon.segments.find((segment: Segment) => segment.start === startPoint));
              }
              if (leave.shape !== owner.polygon) {
                leave = ensureNonNullable(owner.polygon.segments.find((segment: Segment) => segment.start === endPoint));
              }
              if (enter === leave) {
                return;
              }
              const points = unit.track.polyline.points().splice(startT, endT - startT + 1);
              const enterIndex = owner.polygon.segments.findIndex((segment: Segment) => segment === enter);
              const leaveIndex = owner.polygon.segments.findIndex((segment: Segment) => segment === leave);
              const mergeStartIndex = Math.min(leaveIndex, enterIndex);
              const mergeEndIndex = Math.max(leaveIndex, enterIndex);
              if (mergeStartIndex !== enterIndex) {
                points.reverse();
              }
              const list10 = owner.polygon.points();
              const list11 = list10.splice(mergeStartIndex, mergeEndIndex - mergeStartIndex + 1, ...points);
              list11.shift();
              list11.pop();
              list11.push(...points.slice().reverse());
              const polygon4 = new Polygon(list11);
              const polygon5 = new Polygon(list10);
              let polygon6: Polygon;
              if ((owner.unit.in === owner.unit.base && polygon4.inside(owner.unit.position)) || (owner.unit.in !== owner.unit.base && polygon4.inside(ensureNonNullable(owner.unit.track.polyline.start)))) {
                owner.polygon.right(points, mergeStartIndex, mergeEndIndex);
                polygon6 = polygon5;
              } else {
                owner.polygon.left(points, mergeStartIndex, mergeEndIndex);
                polygon6 = polygon4;
              }
              owner.square -= polygon6.square();
              owner.polygon.calcPath();
              list6.push({
                base: owner,
                poly: polygon6
              });
              this.units.forEach((unit3: Unit) => {
                if (owner.unit !== unit3 && unit3.in === owner && polygon6.inside(unit3.position)) {
                  unit3.in = null;
                }
              });
            };
            if (!(enterIntersection.owner instanceof Territory)) {
              throw new Error('Это не база');
            }
            mergeComeback({
              endPoint: leaveIntersection.point,
              endT: leaveIntersection.index,
              enter: enterIntersection.segment,
              leave: leaveIntersection.segment,
              owner: enterIntersection.owner,
              startPoint: enterIntersection.point,
              startT: enterIntersection.index
            });
            const intersectionRecord2 = ensureNonNullable(unit.track.intersections.find((record: TrailIntersectionRecord) => record.point.equal(point)));
            const list9 = intersectionRecord2.intersections.filter((crossing: TrailCrossing) => crossing.base === enterIntersection.owner);
            if (list9.length === 1 || !ensureNonNullable(list9[list9.length - 1]).enter) {
              list7 = list7.filter((intersection: ShapeOwnerIntersection) => intersection.owner !== enterIntersection.owner);
            }
          }
          list5 = list7;
        }
      }
    }
    this.units.forEach((unit3: Unit) => {
      if (unit !== unit3 && polygon3.inside(unit3.position)) {
        unit3.in = unit.base;
      }
    });
    const increment = (unit.base.square - unit.lastSquare) / this.square;
    if (unit.schemes) {
      unit.schemes.comeback({
        game: this,
        increment,
        rise: polygon3,
        victims: list6
      });
    }
    return undefined;
  }

  public handleUnitMovements(deltaMilliseconds?: number): void {
    this.units.slice().forEach((unit: Unit) => {
      if (unit.death) {
        return;
      }
      const list4 = this.getMovement(ensureNonNullable(deltaMilliseconds), unit);
      if (unit === this.player && !this.player.moveTo && unit.in === null && Math.random() < PLAYER_AUTO_RETURN_CHANCE) {
        unit.in = unit.base;
      }
      while (list4.length) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- unit.death may be set to true by kill() via handleIntersect in a prior loop iteration; TS control-flow narrowing from the top-of-function guard is stale.
        if (unit.death) {
          return;
        }
        const segment = ensureNonNullable(list4.shift());
        const list5: Intersection[] = this.space.intersections(segment);
        const list6: IntersectionGroup[] = [];
        list5.forEach((intersection: Intersection) => {
          const groupIndex = list6.findIndex((group: IntersectionGroup) => group.point.equal(intersection.point));
          if (groupIndex === -1) {
            list6.push({
              intersections: [intersection],
              point: intersection.point
            });
          } else {
            const group = ensureNonNullable(list6[groupIndex]);
            if (intersection.point !== group.point) {
              if (intersection.point.cell) {
                if (group.point.cell) {
                  throw new Error('Бывает ли такое?');
                } else {
                  group.point = intersection.point;
                }
              } else {
                intersection.point = group.point;
              }
            }
            group.intersections.push(intersection);
          }
        });
        list5.forEach((intersection: Intersection) => {
          intersection.distance = segment.start.distance2(intersection.point);
        });
        list5.sort((intersectionA: Intersection, intersectionB: Intersection) => intersectionA.distance - intersectionB.distance);
        const list7: Intersection[][] = [];
        let list8: Intersection[] | null = null;
        let lastDistance = -1;
        list5.forEach((intersection: Intersection) => {
          if (!isNearlyEqual(intersection.distance, lastDistance)) {
            list8 = [];
            lastDistance = intersection.distance;
            list7.push(list8);
          }
          ensureNonNullable(list8).push(intersection);
        });
        list7.forEach((list9: Intersection[]) => {
          const list10: Shape[] = [];
          list9.forEach((intersection: Intersection) => {
            const {
              shape
            } = intersection.segment;
            if (shape && !list10.includes(shape)) {
              list10.push(shape);
            }
          });
          while (list10.length) {
            const inShapeIndex = list10.findIndex((shape: Shape) => shape.owner === unit.in);
            if (inShapeIndex > 0) {
              const firstShape = ensureNonNullable(list10[0]);
              list10[0] = ensureNonNullable(list10[inShapeIndex]);
              list10[inShapeIndex] = firstShape;
            }
            const trackShapeIndex = list10.findIndex((shape: Shape) => ensureNonNullable(shape.owner).isTrack);
            if (trackShapeIndex > 0) {
              const firstShape2 = ensureNonNullable(list10[0]);
              list10[0] = ensureNonNullable(list10[trackShapeIndex]);
              list10[trackShapeIndex] = firstShape2;
            }
            const shape = ensureNonNullable(list10.shift());
            const list11: Intersection[] = [];
            list9.forEach((intersection: Intersection) => {
              if (intersection.segment.shape === shape) {
                list11.push(intersection);
              }
            });
            while (!unit.death && list11.length) {
              list11.sort((intersectionA: Intersection, intersectionB: Intersection) => {
                if (unit.in) {
                  return intersectionB.zn - intersectionA.zn;
                }
                return intersectionA.zn - intersectionB.zn;
              });
              const intersection = ensureNonNullable(list11.shift());
              if (intersection.segment.shape && !ensureNonNullable(shape.owner).unit.death) {
                ensureNonNullable(shape.owner).handleIntersect(intersection, unit, segment);
              }
            }
          }
        });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- unit.death may be set to true by kill() via handleIntersect above; TS control-flow narrowing from the top-of-function guard is stale.
        if (unit.death) {
          return;
        }
        const {
          end
        } = segment;
        if (unit.in !== unit.base) {
          unit.track.add(end);
        }
        unit.position = end;
        if (this.visible && !list4.length && unit.in && unit.in !== unit.base) {
          const particle = Particle.nom(unit, segment, this.config.trackWidth);
          this.particles.push(particle);
        }
      }
    });
  }

  public isPlayer(unit?: Unit): boolean {
    return unit === this.player;
  }

  public kill(unit?: Unit, unit2?: Unit, reason?: number): void {
    assertNonNullable(unit);
    if (unit.death) {
      return;
    }
    this.events.kills++;
    unit.death = true;
    this.skinManager.release(unit.skin);
    this.units.forEach((otherUnit: Unit) => {
      if (otherUnit !== unit && otherUnit.in === unit.base) {
        otherUnit.in = null;
      }
    });
    if (reason !== KILL_REASON_SYSTEM) {
      spawnScoreParticles(unit, null, unit.track.polyline.segments);
      spawnScoreParticles(unit, null, unit.base.polygon.segments);
    }
    unit.track.remove();
    unit.base.remove();
    const index = this.units.findIndex((candidate: Unit) => candidate === unit);
    this.units.splice(index, 1);
    unit.killer = unit2 ?? null;
    if (unit2) {
      unit2.scores.kills = unit.scores.kills + unit.scores.accumulator;
      if (unit2.schemes) {
        unit2.schemes.kill(unit, reason);
      }
      if (unit2.achievements) {
        unit2.achievements.onKill(unit);
      }
      unit2.statistics.kills++;
    }
    unit.onScoreChanged();
    if (unit2) {
      unit2.onScoreChanged();
    }
    if (reason !== KILL_REASON_WIN && unit === this.player) {
      this.gameOver(reason);
    }
  }

  public loop(): void {
    const currentTime = now();
    if (this.stopped) {
      return;
    }
    if (!this.debugView && (this.visible || this.cycle < this.config.prepareCounter)) {
      this.looped = true;
      if (this.last === 0) {
        this.last = currentTime;
      }
      let deltaMilliseconds = currentTime - this.last;
      if (deltaMilliseconds < 1) {
        deltaMilliseconds = 1;
      }
      this.updateMetrics(deltaMilliseconds);
      if (deltaMilliseconds > MAX_DELTA_MILLISECONDS) {
        deltaMilliseconds = MAX_DELTA_MILLISECONDS;
      }
      this.timings.updateStartTime = now();
      this.stepSimulation(deltaMilliseconds);
      this.timings.updateEndTime = now();
    }
    this.timings.renderStartTime = now();
    if (this.visible) {
      this.render();
    }
    this.timings.renderEndTime = now();
    this.last = currentTime;
    requestAnimationFrame(() => {
      this.loop();
    });
  }

  public post(): void {
    const paper2Results = window.paper2_results;
    const scores = paper2Results.scores;
    const payload = {
      best: (paper2Results.bestPercent && Math.round(paper2Results.bestPercent * BEST_PERCENT_SCALE)) ?? 0,
      build: paper2Results.build ?? 0,
      kills: paper2Results.kills,
      lng: getLanguageCode(),
      name: ensureNonNullable(this.player).name,
      persent: Math.round(paper2Results.score * PERCENT_MAX),
      player: window.playerId ?? 0,
      reason: paper2Results.reason ?? 0,
      scores: {
        accumulator: scores?.accumulator ?? 0,
        kills: scores?.kills ?? 0
      },
      time: Math.round(paper2Results.time / MILLISECONDS_IN_SECOND),
      top: paper2Results.top ?? 0
    };
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- fire-and-forget POST matching the original engine; the offline build has no results endpoint, so the promise is intentionally unobserved.
    fetch('/newpaperio/ajax/results.php', {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- escape() is the exact legacy encoding the original server protocol expects; a modern replacement would change the transmitted bytes.
      body: xorEncode(escape(JSON.stringify(payload))),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST'
    });
    function getLanguageCode(): string {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty-string language code must fall through to the next candidate, so `||` (falsy fallback) is intentional here.
      return (navigator.languages[0] || navigator.userLanguage || navigator.language || navigator.browserLanguage || 'en').slice(0, LANGUAGE_CODE_LENGTH).toUpperCase();
    }
    function xorEncode(text: string): string {
      let encoded = '';
      for (let i2 = 0; i2 < text.length; i2++) {
        const charCode = text.charCodeAt(i2);
        // eslint-disable-next-line no-bitwise -- XOR cipher is the intended encoding; bitwise is required.
        const encodedCharCode = charCode ^ XOR_ENCODE_KEY;
        encoded += String.fromCharCode(encodedCharCode);
      }
      return encoded;
    }
  }

  public prepareAndUpdate(deltaMilliseconds?: number): void {
    if (this.preparing()) {
      let prepareAcceleration = this.config.prepareAcceleration;
      while (this.preparing() && prepareAcceleration > 0) {
        this.update(TWO_FRAME_DURATION_MILLISECONDS);
        prepareAcceleration--;
      }
    } else {
      this.update(deltaMilliseconds);
    }
  }

  public preparing(): boolean {
    return this.cycle < this.config.prepareCounter;
  }

  public readInput(deltaMilliseconds?: number): void {
    if (this.controller.pressed()) {
      this.keyboard = { ...this.controller.mouse };
      const maxTurnThisFrame = TURN_SPEED_RADIANS_PER_SECOND * ensureNonNullable(deltaMilliseconds) / MILLISECONDS_IN_SECOND;
      if (ensureNonNullable(this.controller.keyboardModeSwitch).mode2) {
        let horizontalInput = 0;
        if (this.controller.left) {
          horizontalInput = -1;
        }
        if (this.controller.right) {
          horizontalInput = 1;
        }
        if (horizontalInput) {
          this.direction.rotate(horizontalInput * maxTurnThisFrame);
        }
      } else {
        const vector = new Vector();
        if (this.controller.up) {
          vector.add(new Vector(0, -1));
        }
        if (this.controller.down) {
          vector.add(new Vector(0, 1));
        }
        if (this.controller.left) {
          vector.add(new Vector(-1, 0));
        }
        if (this.controller.right) {
          vector.add(new Vector(1, 0));
        }
        if (vector.magnitude()) {
          let turnAngle = Math.atan2(this.direction.x * vector.y - vector.x * this.direction.y, this.direction.x * vector.x + this.direction.y * vector.y);
          if (Math.abs(turnAngle) > maxTurnThisFrame) {
            turnAngle = Math.sign(turnAngle) * maxTurnThisFrame;
          }
          this.direction.rotate(turnAngle);
        }
      }
    } else if (this.controller.mouse) {
      if (!this.keyboard || (this.keyboard.x !== this.controller.mouse.x && this.keyboard.y !== this.controller.mouse.y)) {
        this.keyboard = null;
        this.direction = new Vector(this.controller.mouse.x, this.controller.mouse.y).sub(new Vector(this.view.clientWidth / HALF_DIVISOR, this.view.clientHeight / HALF_DIVISOR)).normalize();
      }
    } else if (!this.keyboard && this.controller.lastMouse) {
      this.direction = new Vector(this.controller.lastMouse.x, this.controller.lastMouse.y).sub(new Vector(this.view.clientWidth / HALF_DIVISOR, this.view.clientHeight / HALF_DIVISOR)).normalize();
    }
  }

  public recoverTail(): void {
    const player = this.player;
    if (player && player.in === player.base && !player.base.polygon.inside(player.position)) {
      if (!player.moveTo) {
        return;
      }
      const nearestSegment = player.base.polygon.segments.reduce((closest: Segment, segment: Segment) => closest.start.distance2(player.position) < segment.start.distance2(player.position) ? closest : segment);
      const vector = nearestSegment.start.clone().sub(player.position);
      const distance = vector.magnitude();
      player.position = vector.mulScalar(1 + 1 / distance).add(player.position);
      player.track.remove();
      if (this.debug) {
        player.game.alert('Tail is recovered');
        this.tailRecovered = true;
      } else if (window.ga) {
        window.ga('send', 'event', 'error', 'tailRecovered');
      }
    }
  }

  public render(): void {
    if (this.renderer) {
      this.renderer(this);
    }
  }

  public setLeaderboard(leaderboard?: Leaderboard): void {
    if (leaderboard) {
      this.leaderboard = leaderboard;
      this.changeShields();
    }
  }

  public spawnBot(spawnMode?: 'bounds' | 'center' | 'player' | 'random'): void {
    const {
      baseCount,
      baseRadius,
      botsCount,
      spawnTimeout
    } = this.config;
    if (this.botSpawnLimited) {
      if (this.spawnSuspend > 0) {
        return;
      }
      this.spawnSuspend = spawnTimeout * (1 + this.rng());
    }
    if (this.units.length - (this.player ? 1 : 0) >= botsCount) {
      return;
    }
    if (!this.nameManager.aviable()) {
      return;
    }
    if (!this.skinManager.available()) {
      return;
    }
    const spawnPosition = this.getSpawnPosition(spawnMode);
    if (!spawnPosition) {
      return;
    }
    const botTypeCounts: number[] = [0, 0, 0, 0];
    // eslint-disable-next-line no-magic-numbers -- bot-type distribution weight tables: each row is a fixed weighted bag of bot-type ids selected by game level; the individual cells are not separately nameable.
    const list4: number[][] = [[1, 2, 2, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 2, 2, 2, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0], [1, 1, 2, 2, 2, 2, 3, 3, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 2, 2, 2, 2, 2, 3, 0, 0, 0, 0, 0, 0]];
    this.units.forEach((unit: Unit) => {
      if (unit !== this.player) {
        botTypeCounts[unit.type] = ensureNonNullable(botTypeCounts[unit.type]) + 1;
      }
    });
    this.bots = [...botTypeCounts];
    const typeDistribution = ensureNonNullable(list4[Math.round(this.level * (list4.length - 1))]);
    let distributionIndex = -1;
    while (ensureNonNullable(botTypeCounts[ensureNonNullable(typeDistribution[++distributionIndex])]) > 0) {
      const decrementType = ensureNonNullable(typeDistribution[distributionIndex]);
      botTypeCounts[decrementType] = ensureNonNullable(botTypeCounts[decrementType]) - 1;
    }
    const botType = ensureNonNullable(typeDistribution[distributionIndex]);
    const botName = ensureNonNullable(this.nameManager.get());
    const bot = new Bot(this, botType, botName, spawnPosition, createCirclePoints(spawnPosition, baseCount, baseRadius), undefined, this.schemesManager);
    const botSkin = this.skinManager.get();
    bot.setSkin(botSkin);
    this.addUnit(bot);
    this.bots[botType] = ensureNonNullable(this.bots[botType]) + 1;
  }

  public spawnPlayer(playerName?: string, skinName?: string, areaPercent?: number): void {
    const {
      baseCount,
      baseRadius,
      botsCount,
      maxScale,
      minScale
    } = this.config;
    const killUnitToMakeRoom = (): void => {
      if (this.units.length) {
        this.kill(this.units[Math.trunc(this.units.length / HALF_DIVISOR)], undefined, KILL_REASON_SYSTEM);
      }
    };
    if (this.units.length && this.units.length >= botsCount) {
      killUnitToMakeRoom();
    }
    let spawnPosition: undefined | Vector;
    let i2 = 0;
    const spawnRadius = areaPercent ? Math.sqrt(this.square * areaPercent / Math.PI) : baseRadius;
    while (!spawnPosition) {
      if (i2++ > MAX_SPAWN_ATTEMPTS) {
        i2 = 0;
        killUnitToMakeRoom();
      }
      spawnPosition = this.getSpawnPosition('random', spawnRadius);
    }
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty player name must fall through to the default name, so the falsy `||` fallback is intentional.
    const player = new Player(this, playerName || this.language.defaultPlayerName, spawnPosition, createCirclePoints(spawnPosition, baseCount, spawnRadius), undefined, this.schemesManager);
    const playerSkin = this.skinManager.getPlayerSkin(skinName);
    player.setSkin(playerSkin);
    this.addPlayer(player);
    this.scale = maxScale - Math.trunc(player.base.square / this.square * SCALE_QUANTIZATION_STEPS) / SCALE_QUANTIZATION_STEPS * (maxScale - minScale);
    this.startTime = now();
  }

  public stepSimulation(deltaMilliseconds: number): void {
    if (this.replaying || this.recording) {
      if (this.cycle < this.config.prepareCounter + REPLAY_PREPARE_EXTRA_FRAMES && deltaMilliseconds > REPLAY_MAX_DELTA_MILLISECONDS) {
        deltaMilliseconds = REPLAY_MAX_DELTA_MILLISECONDS;
      }
      if (deltaMilliseconds > FRAME_DURATION_MILLISECONDS * FRAME_SNAP_LOWER_FACTOR && deltaMilliseconds < FRAME_DURATION_MILLISECONDS * FRAME_SNAP_UPPER_FACTOR) {
        deltaMilliseconds = FRAME_DURATION_MILLISECONDS;
      }
      this.timeAccumulated += deltaMilliseconds;
      if (this.preparing()) {
        this.prepareAndUpdate(FRAME_DURATION_MILLISECONDS);
        this.timeAccumulated = 0;
      } else if (this.replaying && this.replaying.skip && this.replaying.skipping()) {
        let prepareAcceleration = this.config.prepareAcceleration;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- this.replaying may be cleared by update() during the loop; TS narrowing from the enclosing guard is stale.
        while (this.replaying && this.replaying.skipping() && prepareAcceleration-- > 0) {
          this.update(FRAME_DURATION_MILLISECONDS);
        }
        this.timeAccumulated = 0;
      } else {
        if (this.timeAccumulated > FRAME_DURATION_MILLISECONDS * MAX_ACCUMULATED_FRAMES) {
          this.timeAccumulated = FRAME_DURATION_MILLISECONDS * MAX_ACCUMULATED_FRAMES;
        }
        while (this.timeAccumulated >= FRAME_DURATION_MILLISECONDS) {
          this.timeAccumulated -= FRAME_DURATION_MILLISECONDS;
          this.update(FRAME_DURATION_MILLISECONDS);
        }
      }
    } else if (this.visible) {
      const maxStepMilliseconds = FRAME_DURATION_MILLISECONDS * DOUBLE_FACTOR;
      while (deltaMilliseconds > 0) {
        let stepMilliseconds: number;
        if (deltaMilliseconds <= maxStepMilliseconds) {
          stepMilliseconds = deltaMilliseconds;
        } else if (deltaMilliseconds < maxStepMilliseconds * DOUBLE_FACTOR) {
          stepMilliseconds = deltaMilliseconds / HALF_DIVISOR + Math.random();
        } else {
          stepMilliseconds = maxStepMilliseconds + Math.random();
        }
        this.update(stepMilliseconds);
        deltaMilliseconds -= stepMilliseconds;
      }
    } else {
      this.prepareAndUpdate(deltaMilliseconds);
    }
  }

  public stop(): void {
    this.stopped = true;
    clearInterval(this.updateParticlesId);
    for (const unit of this.units) {
      this.skinManager.release(unit.skin);
    }
  }

  public update(deltaMilliseconds?: number): boolean {
    const {
      maxScale,
      minScale,
      observerScale
    } = this.config;
    if (this.stopped) {
      return false;
    }
    Vector.space = this.space;
    deltaMilliseconds ??= FRAME_DURATION_MILLISECONDS;
    deltaMilliseconds += this.rng() * UPDATE_JITTER_FACTOR;
    this.spawnSuspend -= deltaMilliseconds;
    if (!this.isTest) {
      this.readInput(deltaMilliseconds);
    }
    this.angle = Math.round(Math.atan2(this.direction.y, this.direction.x) / Math.PI * ANGLE_QUANTIZATION_SCALE + ANGLE_QUANTIZATION_OFFSET) % ANGLE_QUANTIZATION_OFFSET;
    if (this.replaying) {
      if (!this.replaying.read()) {
        delete this.replaying;
        this.alert('End of replay', '#ff0000');
        return false;
      }
    }
    if (this.recording) {
      this.recording.write();
    }
    this.recoverTail();
    const {
      player
    } = this;
    this.timings.aiStartTime = now();
    this.units.forEach((unit: Unit) => {
      unit.update(deltaMilliseconds);
    });
    this.timings.aiEndTime = now();
    this.handleUnitMovements(deltaMilliseconds);
    this.units.forEach((unit: Unit) => {
      unit.lastSquare = unit.base.square;
    });
    this.units.forEach((unit: Unit) => {
      const percent = unit.base.square / this.square;
      unit.percent = percent;
      unit.bestPercent = Math.max(unit.bestPercent, percent);
      unit.scale = lerp(maxScale, minScale, easeOutCubic(Math.trunc(percent * SCALE_QUANTIZATION_STEPS) / SCALE_QUANTIZATION_STEPS));
      unit.vrange = Math.sqrt(REFERENCE_DIAGONAL_SQUARED) / HALF_DIVISOR / unit.scale * VRANGE_FACTOR;
      if (unit.schemes) {
        unit.schemes.update(deltaMilliseconds);
      }
      if (unit.labels.length) {
        let vector = new Vector(0, LABEL_STACK_OFFSET_Y);
        const vector2 = new Vector(0, LABEL_SPACING_Y);
        const vector3 = new Vector(0, LABEL_SPACING_Y);
        unit.labels.forEach((textParticle: Label) => {
          this.labels.push(new TextParticle(textParticle.text, textParticle.color, ensureNonNullable(textParticle.unit), vector, vector2, textParticle.time, textParticle.fading));
          vector = vector.clone().add(vector3);
        });
        unit.labels = [];
      }
    });
    this.units.sort((unitA: Unit, unitB: Unit) => unitB.schemes && unitA.schemes ? unitB.schemes.scores() - unitA.schemes.scores() : 0);
    this.units.forEach((unit: Unit, index: number) => {
      unit.top = index + 1;
    });
    this.labels = this.labels.filter((particle: TextParticle) => {
      particle.update(deltaMilliseconds);
      return particle.time > 0;
    });
    this.updateNotifications(deltaMilliseconds);
    this.particles.forEach((particle: Particle) => {
      particle.update(deltaMilliseconds);
    });
    if (player) {
      this.level = lerp(this.config.startBotLevel, 1, player.percent);
    } else {
      this.level = this.config.noPlayerBotLevel;
    }
    if (this.config.botLevel !== -1) {
      this.level = this.config.botLevel;
    }
    this.units.forEach((bot: Unit) => {
      if (bot instanceof Bot) {
        const clampedLevel = Math.min(1, Math.max(0, this.level + bot.jitter));
        let {
          botAggroMax,
          botAggroMin,
          botDefMax,
          botDefMin,
          botGreedMax,
          botGreedMin,
          botSafetyMax,
          botSafetyMin
        } = this.config;
        switch (bot.type) {
          case 1:
            botAggroMin *= BOT1_AGGRO_MULT;
            botAggroMax *= BOT1_AGGRO_MULT;
            break;
          case BOT_TYPE_2:
            botGreedMin *= BOT2_GREED_MIN_MULT;
            botGreedMax *= BOT_GREED_MAX_MULT;
            botSafetyMin *= BOT2_SAFETY_MULT;
            botSafetyMax *= BOT2_SAFETY_MULT;
            break;
          case BOT_TYPE_3:
            botAggroMin *= BOT3_AGGRO_MULT;
            botAggroMax *= BOT3_AGGRO_MULT;
            botGreedMin *= BOT3_GREED_MIN_MULT;
            botGreedMax *= BOT_GREED_MAX_MULT;
            botSafetyMin *= BOT3_SAFETY_MULT;
            botSafetyMax *= BOT3_SAFETY_MULT;
            botDefMin *= BOT3_DEF_MULT;
            botDefMax *= BOT3_DEF_MULT;
            break;
          default:
            break;
        }
        bot.aggro = lerp(botAggroMin, botAggroMax, clampedLevel);
        bot.greed = lerp(botGreedMin, botGreedMax, clampedLevel);
        bot.safety = lerp(botSafetyMin, botSafetyMax, clampedLevel);
        bot.def = lerp(botDefMin, botDefMax, clampedLevel);
      }
    });
    if (this.player?.achievements) {
      this.player.achievements.update(this.player, deltaMilliseconds, this);
    }
    this.updateClosestBotAttack(player);
    const targetScale = player ? player.scale : observerScale;
    const scaleDelta = targetScale - this.scale;
    this.scale += scaleDelta * deltaMilliseconds / SCALE_LERP_DIVISOR;
    if (player && player.percent > WIN_PERCENT_THRESHOLD) {
      player.percent = 1;
      this.gameOver(KILL_REASON_WIN);
    }
    this.timings.spawnStartTime = now();
    for (let i2 = 0; i2 < this.config.nearPlayerBotSpawnCount; i2++) {
      this.spawnBot('player');
    }
    this.spawnBot('center');
    this.spawnBot(this.rng() > BOUNDS_SPAWN_CHANCE ? 'bounds' : 'random');
    this.timings.spawnEndTime = now();
    this.cycle++;
    return true;
  }

  public updateClosestBotAttack(player: null | Player): void {
    if (!player || player.track.length <= this.config.botAttackTrackLength) {
      return;
    }
    let closestBot: Bot | null = null;
    let closestDistance = Infinity;
    for (const unit of this.units) {
      if (unit instanceof Bot) {
        let minDistance = Infinity;
        player.track.simplyline.forEach((trackPoint: Vector) => {
          const distanceSquared = trackPoint.distance2(unit.position);
          if (distanceSquared < minDistance) {
            minDistance = distanceSquared;
          }
        });
        minDistance = Math.sqrt(minDistance);
        if (minDistance < closestDistance) {
          closestBot = unit;
          closestDistance = minDistance;
        }
      }
    }
    if (closestBot) {
      ensureNonNullable(closestBot.fsm).change('attack');
    }
  }

  public updateMetrics(frameTime: number): void {
    const {
      stats,
      timings
    } = this;
    const metric: Metric = {
      events: this.events,
      frameTime,
      renderTime: timings.renderEndTime - timings.renderStartTime,
      updateTime: timings.updateEndTime - timings.updateStartTime
    };
    this.metrics.push(metric);
    if (this.metrics.length > MAX_METRICS_SAMPLES) {
      this.metrics.shift();
    }
    const smoothingFactor = 0.05;
    stats.fps = lerp(stats.fps, MILLISECONDS_IN_SECOND / frameTime, smoothingFactor);
    stats.ut = lerp(stats.ut, timings.updateEndTime - timings.updateStartTime, smoothingFactor);
    stats.ait = lerp(stats.ait, timings.aiEndTime - timings.aiStartTime, smoothingFactor);
    stats.st = lerp(stats.st, timings.spawnEndTime - timings.spawnStartTime, smoothingFactor);
    stats.rt = lerp(stats.rt, timings.renderEndTime - timings.renderStartTime, smoothingFactor);
    this.fpsSequence.push(stats.fps);
    const lowFpsThreshold = 25;
    const highFpsThreshold = 35;
    const criticalFpsThreshold = 10;
    const fpsSampleSize = 120;
    const minQuality = 0.5;
    if (this.fpsSequence.length > fpsSampleSize) {
      this.fpsSequence.sort();
      const medianFps = ensureNonNullable(this.fpsSequence[Math.trunc(fpsSampleSize / HALF_DIVISOR)]);
      if (medianFps < lowFpsThreshold) {
        this.quality -= QUALITY_STEP;
      }
      if (medianFps < criticalFpsThreshold) {
        this.quality -= QUALITY_STEP;
      }
      if (this.quality < minQuality) {
        this.quality = minQuality;
      }
      if (medianFps > highFpsThreshold) {
        this.quality += QUALITY_STEP;
      }
      if (this.quality > 1) {
        this.quality = 1;
      }
      const qualityLevel = Math.round(this.quality * QUALITY_QUANTIZATION_STEPS);
      this.quality = qualityLevel / QUALITY_QUANTIZATION_STEPS;
      if (qualityLevel < QUALITY_QUANTIZATION_STEPS) {
        const qualityKey = `q${String(qualityLevel)}`;
        if (this.qas[qualityKey]) {
          this.qas[qualityKey] = false;
          if (window.ga) {
            window.ga('send', 'event', 'fps', qualityKey);
          }
        }
      }
      this.fpsSequence = [];
    }
    this.events = {
      kills: 0,
      returns: 0
    };
  }

  public updateNotifications(deltaMilliseconds: number): void {
    if (this.notifications.length) {
      const quest = ensureNonNullable(this.notifications[0]);
      if (quest.ready) {
        quest.update(deltaMilliseconds);
        if (quest.state > QUEST_STATE_COMPLETE) {
          this.notifications.shift();
        }
      }
    }
  }
}
// eslint-disable-next-line perfectionist/sort-modules, import-x/export -- engine declarations kept in dependency order; `Config` is a valid TypeScript declaration merge (adds the config-form index signature) that import-x false-positives as a duplicate export.
export interface Config {
  // Every field is a `string | number | boolean`; the index signature lets the
  // Config-editing form write fields back by their dynamic string key (its
  // Named fields keep their specific types since those take precedence).
  [configKey: string]: boolean | number | string;
  arenaColor: string;
  arenaSize: number;
  backgroundBottomColor: string;
  backgroundTopColor: string;
  baseCount: number;
  baseHeight: number;
  baseRadius: number;
  borderColor: string;
  borderPoints: number;
  botAggroMax: number;
  botAggroMin: number;
  botAttackTrackLength: number;
  botDefMax: number;
  botDefMin: number;
  botGreedMax: number;
  botGreedMin: number;
  botLevel: number;
  botSafetyMax: number;
  botSafetyMin: number;
  botsCount: number;
  enemyKillDelay: number;
  followKiller: boolean;
  font: string;
  maxPreparingTime: number;
  maxScale: number;
  minScale: number;
  nearPlayerBotSpawnCount: number;
  noPlayerBotLevel: number;
  observerScale: number;
  platesStrokeWidth: number;
  prepareAcceleration: number;
  prepareBatchCount: number;
  prepareCounter: number;
  prepareMult: number;
  quadSize: number;
  selfKillDelay: number;
  spawnTimeout: number;
  startBotLevel: number;
  trackWidth: number;
  unitSpeed: number;
}
export const KEY_ARROW_LEFT = 37;
export const KEY_ARROW_UP = 38;
export const KEY_ARROW_RIGHT = 39;
export const KEY_ARROW_DOWN = 40;
export const KEY_A = 65;
export const KEY_C = 67;
export const KEY_D = 68;
export const KEY_S = 83;
export const KEY_W = 87;
export const MOUSE_BUTTON_RIGHT = 2;
export const MOUSE_BUTTONS_RIGHT_FLAG = 2;
export const MOUSE_BUTTONS_MIDDLE_FLAG = 4;
export function preventEventDefault(event: Event): void {
  event.preventDefault();
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class KeyboardModeSwitch {
  public mode2: boolean;
  public constructor() {
    this.mode2 = false;
  }

  public get(): boolean {
    return this.mode2;
  }

  public switch(): void {
    noop();
  }
}
export interface PointerState {
  x: number;
  y: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface MouseButtonsState {
  left: boolean;
  middle: boolean;
  right: boolean;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface ModifiersState {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface KeyCodeHandler {
  code: number;
  handler: () => void;
}
export interface KeyCodeSetHandler {
  codes: number[];
  handler: () => void;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class Controller {
  public buttons: MouseButtonsState;
  public codes: KeyCodeHandler[];
  public dispose: () => void;
  public down: boolean;
  public keyboardModeSwitch: KeyboardModeSwitch | undefined;
  public lastMouse: null | PointerState;
  public left: boolean;
  public modifiers: ModifiersState;
  public mouse: null | PointerState;
  public pressedButtons: number[];
  public right: boolean;
  public sets: KeyCodeSetHandler[];
  public up: boolean;
  public constructor(element: HTMLElement, keyboardModeSwitch?: KeyboardModeSwitch) {
    this.up = false;
    this.down = false;
    this.left = false;
    this.right = false;
    this.modifiers = {
      alt: false,
      ctrl: false,
      meta: false,
      shift: false
    };
    this.mouse = null;
    this.lastMouse = null;
    this.buttons = {
      left: false,
      middle: false,
      right: false
    };
    this.codes = [];
    this.sets = [];
    this.keyboardModeSwitch = keyboardModeSwitch;
    this.pressedButtons = [];
    const onKeyDown = (event: KeyboardEvent): void => {
      this.onKeyChange(event, true);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      this.onKeyChange(event, false);
    };
    if (keyboardModeSwitch) {
      keyboardModeSwitch.get();
      window.addEventListener('keydown', onKeyDown, false);
      window.addEventListener('keyup', onKeyUp, false);
    }
    element.addEventListener('contextmenu', preventEventDefault, false);
    const onMouseDown = (event: MouseEvent): void => {
      this.onMouseChange(event, true);
    };
    const onMouseUp = (event: MouseEvent): void => {
      this.onMouseChange(event, false);
    };
    const onMouseLeave = (event: MouseEvent): void => {
      this.lastMouse = this.mouse;
      this.mouse = null;
      event.preventDefault();
    };
    const onMouseMove = (event: MouseEvent): void => {
      this.mouse = {
        x: event.pageX,
        y: event.pageY
      };
      event.preventDefault();
    };
    const onMouseEnter = (event: MouseEvent): void => {
      onMouseMove(event);
      const {
        buttons
      } = event;
      this.buttons = {
        // eslint-disable-next-line no-bitwise -- MouseEvent.buttons is a bitmask (bit 0 = left).
        left: !!(buttons & 1),
        // eslint-disable-next-line no-bitwise -- MouseEvent.buttons bitmask (middle button bit).
        middle: !!(buttons & MOUSE_BUTTONS_MIDDLE_FLAG),
        // eslint-disable-next-line no-bitwise -- MouseEvent.buttons bitmask (right button bit).
        right: !!(buttons & MOUSE_BUTTONS_RIGHT_FLAG)
      };
      event.preventDefault();
    };
    element.addEventListener('mouseenter', onMouseEnter, false);
    element.addEventListener('mousemove', onMouseMove, false);
    element.addEventListener('mouseleave', onMouseLeave, false);
    element.addEventListener('mousedown', onMouseDown, false);
    element.addEventListener('mouseup', onMouseUp, false);
    const onTouchEnd = (event: TouchEvent): void => {
      this.lastMouse = this.mouse;
      this.mouse = null;
      event.preventDefault();
    };
    const onTouchMove = (event: TouchEvent): void => {
      const event2 = ensureNonNullable(event.changedTouches[0]);
      this.mouse = {
        x: event2.clientX,
        y: event2.clientY
      };
      event.preventDefault();
    };
    element.addEventListener('touchstart', onTouchMove, false);
    element.addEventListener('touchmove', onTouchMove, false);
    element.addEventListener('touchend', onTouchEnd, false);
    element.addEventListener('touchcancel', onTouchEnd, false);
    this.dispose = (): void => {
      element.removeEventListener('contextmenu', preventEventDefault, false);
      if (keyboardModeSwitch) {
        window.removeEventListener('keydown', onKeyDown, false);
        window.removeEventListener('keyup', onKeyUp, false);
      }
      element.removeEventListener('mouseenter', onMouseEnter, false);
      element.removeEventListener('mousemove', onMouseMove, false);
      element.removeEventListener('mouseleave', onMouseLeave, false);
      element.removeEventListener('mousedown', onMouseDown, false);
      element.removeEventListener('mouseup', onMouseUp, false);
    };
  }

  public addButton(code: number, handler: () => void): void {
    this.codes.push({
      code,
      handler
    });
  }

  public addSet(codes: number[], handler: () => void): void {
    this.sets.push({
      codes: codes.sort(),
      handler
    });
  }

  public onKeyChange(event: KeyboardEvent, isPressed: boolean): void {
    if (event.target === document.body) {
      let isHandled = true;
      const {
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- the engine's key handling is keyed by keyCode (documented input contract).
        keyCode
      } = event;
      const pressedIndex = this.pressedButtons.indexOf(keyCode);
      if (isPressed) {
        if (pressedIndex < 0) {
          this.pressedButtons.push(keyCode);
        }
        const matchedSet = this.sets.find((set: KeyCodeSetHandler) => set.codes.every((code: number) => !!this.pressedButtons.find((pressedCode: number) => pressedCode === code)));
        if (matchedSet) {
          matchedSet.handler();
        }
      } else {
        if (pressedIndex >= 0) {
          this.pressedButtons.splice(pressedIndex, 1);
        }
        const matchedCode = this.codes.find((codeHandler: KeyCodeHandler) => codeHandler.code === keyCode);
        if (matchedCode) {
          matchedCode.handler();
        }
      }
      switch (keyCode) {
        case KEY_A:
        case KEY_ARROW_LEFT:
          this.left = isPressed;
          break;
        case KEY_ARROW_DOWN:
        case KEY_S:
          this.down = isPressed;
          break;
        case KEY_ARROW_RIGHT:
        case KEY_D:
          this.right = isPressed;
          break;
        case KEY_ARROW_UP:
        case KEY_W:
          this.up = isPressed;
          break;
        case KEY_C:
          if (!isPressed && this.keyboardModeSwitch) {
            this.keyboardModeSwitch.switch();
          }
          break;
        default:
          isHandled = false;
          break;
      }
      this.modifiers.shift = event.shiftKey;
      this.modifiers.ctrl = event.ctrlKey;
      this.modifiers.alt = event.altKey;
      this.modifiers.meta = event.metaKey;
      if (isHandled) {
        event.preventDefault();
      }
    }
  }

  public onMouseChange(event: MouseEvent, isPressed: boolean): void {
    switch (event.button) {
      case 0:
        this.buttons.left = isPressed;
        break;
      case 1:
        this.buttons.middle = isPressed;
        break;
      case MOUSE_BUTTON_RIGHT:
        this.buttons.right = isPressed;
        break;
      default:
        break;
    }
  }

  public pressed(): boolean {
    return this.up || this.down || this.left || this.right;
  }
}
export interface SkinLayerPivot {
  x?: number;
  y?: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface SkinLayerDescriptor {
  direction?: string;
  level?: number;
  pivot?: SkinLayerPivot;
  rotation?: number;
  scale?: number;
  src?: HTMLCanvasElement | HTMLImageElement;
  url?: string;
  x?: number;
  y?: number;
}
export const PIVOT_DEFAULT = 0.5;
export const UNIT_NAME_FONT_SIZE = 24;
export const UNIT_NAME_OUTLINE_WIDTH = 4;
export const UNIT_NAME_ZOOM_NUDGE = 1.001;
export const RECORDING_LABEL_BLINK_MODULO = 2;
export const UNIT_NAME_OFFSET_Y = -12;
export const UNIT_NAME_LINE_WIDTH_DIVISOR = 4;
export const UNIT_NAME_NICK_SHADOW_DIVISOR = 3;
export const UNIT_NAME_SHADOW_OFFSET = 2;
export const CROWN_BASE_OFFSET = 24;
export const CROWN_ZOOM_OFFSET = -10;
export const CROWN_OFFSET_A = -4;
export const CROWN_OFFSET_B = -12;
export const DEGREES_TO_RADIANS = 0.0174533;
export const TRAIL_UNDERLAY_WIDTH_EXTRA = 2;
export const AVATAR_VIEW_PADDING_FACTOR = 4;
export const UNIT_NAME_VIEW_PADDING_FACTOR = 20;
export const TRAIL_ALPHA = 0.6;
export const ARENA_BORDER_OFFSET_FACTOR = 3;
export const MINIMAP_CALC_MULT_A = 8;
export const MINIMAP_CALC_MULT_B = 3;
export const MINIMAP_STROKE_WIDTH_FACTOR = 3;
export const LEADERBOARD_ROW_HEIGHT_FACTOR = 1.3;
export const LEADERBOARD_ROW_COUNT = 8;
export const LEADERBOARD_BAR_GAP_FACTOR = 0.05;
export const LEADERBOARD_SHADOW_OFFSET_FACTOR = 3;
export const LEADERBOARD_FLAG_HEIGHT_FACTOR = 0.8;
export const LEADERBOARD_FLAG_OFFSET_DIVISOR = 4;
export const TEXT_BASELINE_NUDGE_FACTOR = 1.1;
export const LEADERBOARD_PLAYER_ROW_INDEX = 6;
export const SCORE_BAR_MIN_FILL = 0.25;
export const SCORE_BAR_FILL_RANGE = 0.75;
export const KILL_COUNT_Y_OFFSET = 4;
export const KILL_COUNT_BG_WIDTH_FACTOR = 1.5;
export const KILL_COUNT_ICON_X_FACTOR = 1.4;
export const KILL_COUNT_TEXT_X_FACTOR = 1.25;
export const KILL_COUNT_TEXT_Y_FACTOR = 0.03;
export const QUEST_NOTIFICATION_PADDING_FACTOR = 5;
export const QUEST_NOTIFICATION_SHADOW_BLUR = 10;
export const DEBUG_VIEW_SCALE = 0.5;
export const DEBUG_OVERLAY_START_Y = 160;
export const DEBUG_OVERLAY_INDENT_X = 10;
export const DEBUG_OVERLAY_INDENT_STEP = 20;
export const DEBUG_OVERLAY_LINE_HEIGHT = 20;
export const DEBUG_LEVEL_DECIMAL_DIGITS = 3;
export const DEBUG_GRAPH_WIDTH_DIVISOR = 3;
export const DEBUG_GRAPH_HEIGHT = 100;
export const TARGET_FRAME_TIME_MILLISECONDS = 16.67;
export const DEBUG_GRAPH_HEADROOM_FACTOR = 1.1;
export const DEBUG_GRAPH_EVENT_LINE_WIDTH = 0.5;
export interface Pivot {
  x: number;
  y: number;
}
export class SkinLayer {
  public config: Config;
  public direction: string;
  public image: HTMLCanvasElement | null;
  public level: number;
  public pivot: Pivot;

  public rotation: number;
  public scale: number;
  public src: HTMLCanvasElement | HTMLImageElement | null;
  public url: string;
  public x: number;
  public y: number;
  public constructor(config: Config, descriptor: SkinLayerDescriptor, onReady?: (skinLayer: SkinLayer) => void) {
    this.level = 0;
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.direction = '';
    this.rotation = 0;
    this.url = '';
    this.src = null;
    this.image = null;
    this.config = config;
    Object.assign(this, descriptor);
    this.pivot = { x: PIVOT_DEFAULT, y: PIVOT_DEFAULT, ...descriptor.pivot };
    let imagePromise: null | Promise<HTMLImageElement>;
    if (this.url) {
      imagePromise = loadImage(this.url);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- this.src is populated by Object.assign above, which the type system does not track.
    } else if (this.src) {
      imagePromise = Promise.resolve(this.src);
    } else {
      imagePromise = null;
    }
    if (imagePromise) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises -- fire-and-forget image load matching the original engine; the source is applied when it resolves.
      imagePromise.then((image: HTMLImageElement) => {
        this.src = image;
        this.rescale(1);
        if (onReady) {
          onReady(this);
        }
      });
    }
  }

  public rescale(scale: number): void {
    const {
      maxScale,
      trackWidth
    } = this.config;
    const baseSize = trackWidth * maxScale;
    const src = this.src;
    if (!src) {
      return;
    }
    const sourceWidth = 'naturalWidth' in src ? src.naturalWidth || src.width : src.width;
    const sourceHeight = 'naturalHeight' in src ? src.naturalHeight || src.height : src.height;
    const scaleRatio = baseSize * scale * this.scale / sourceWidth;
    const targetWidth = Math.trunc(sourceWidth * scaleRatio);
    const targetHeight = Math.trunc(sourceHeight * scaleRatio);
    const scaleX = targetWidth / sourceWidth;
    const scaleY = targetHeight / sourceHeight;
    const element = document.createElement('canvas');
    element.width = targetWidth;
    element.height = targetHeight;
    const context = element.getContext('2d');
    if (!context) {
      return;
    }
    context.scale(scaleX, scaleY);
    context.drawImage(src, 0, 0);
    this.image = element;
  }
}
let svgElement: SVGSVGElement | undefined;
export interface PatternSource {
  scale?: number;
  url?: string;
}
export class PatternAsset {
  public pattern: CanvasPattern | null;
  public ready: boolean;
  public scale: number;
  public src: HTMLImageElement | null;
  public url: string;
  public constructor(config: Config, canvas: HTMLCanvasElement, baseUrl: string, source: PatternSource = {}, onReady?: () => void) {
    this.url = baseUrl + String(source.url);
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- a source scale of 0 is degenerate and must fall back to 1, so the falsy-triggering || is intentional.
    this.scale = source.scale || 1;
    this.src = null;
    this.ready = false;
    this.pattern = null;
    const {
      maxScale
    } = config;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- fire-and-forget image load matching the original engine; the pattern is built when it resolves.
    loadImage(this.url).then((spatialGrid2: HTMLImageElement) => {
      this.src = spatialGrid2;
      const sourceWidth = Math.trunc(spatialGrid2.naturalWidth || spatialGrid2.width);
      const sourceHeight = Math.trunc(spatialGrid2.naturalHeight || spatialGrid2.height);
      const scaleRatio = maxScale * PERCENT_MAX * this.scale / sourceWidth;
      if (sourceWidth === 0) {
        console.warn(`${this.url} has no width`);
      }
      if (sourceHeight === 0) {
        console.warn(`${this.url} has no heigth`);
      }
      const targetWidth = Math.floor(sourceWidth * scaleRatio) || 1;
      const targetHeight = Math.floor(sourceHeight * scaleRatio) || 1;
      const element = document.createElement('canvas');
      element.width = targetWidth;
      element.height = targetHeight;
      const elementContext = element.getContext('2d');
      if (!elementContext) {
        return;
      }
      elementContext.drawImage(spatialGrid2, 0, 0, targetWidth + 1, targetHeight + 1);
      const canvasContext = canvas.getContext('2d');
      if (!canvasContext) {
        return;
      }
      this.pattern = canvasContext.createPattern(element, 'repeat');
      const inverseScale = 1 / maxScale;
      svgElement ??= document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const transformMatrix = svgElement.createSVGMatrix().scale(inverseScale, inverseScale);
      if (this.pattern?.setTransform) {
        this.pattern.setTransform(transformMatrix);
      }
      this.ready = true;
      if (onReady) {
        onReady();
      }
    });
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface AvatarDescriptor {
  layers?: SkinLayerDescriptor[];
  scale?: number;
  x?: number;
  y?: number;
}
export class Avatar {
  public backLayers: SkinLayer[];
  public frontLayers: SkinLayer[];
  public layers: SkinLayer[];
  public ready: boolean;
  public scale: number;
  public x: number;
  public y: number;
  public constructor(config: Config, baseUrl: string, descriptor: AvatarDescriptor, onReady?: () => void) {
    this.layers = [];
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.ready = false;
    Object.assign(this, descriptor);
    let i2 = 0;
    const onLayerReady = (layer: SkinLayer): void => {
      layer.rescale(this.scale);
      if (this.layers.length === ++i2) {
        this.ready = true;
        if (onReady) {
          onReady();
        }
      }
    };
    const layerDescriptors: SkinLayerDescriptor[] = descriptor.layers ?? [];
    this.layers = layerDescriptors.map((layerDescriptor: SkinLayerDescriptor) => {
      const resolvedDescriptor: SkinLayerDescriptor = { ...layerDescriptor };
      const resolvedUrl = layerDescriptor.url && `${baseUrl}${layerDescriptor.url}`;
      if (resolvedUrl) {
        resolvedDescriptor.url = resolvedUrl;
      }
      return new SkinLayer(config, resolvedDescriptor, onLayerReady);
    });
    this.frontLayers = this.layers.filter((layer: SkinLayer) => layer.level >= 1).sort((layerA: SkinLayer, layerB: SkinLayer) => layerA.level - layerB.level);
    this.backLayers = this.layers.filter((layer: SkinLayer) => layer.level < 1).sort((layerA: SkinLayer, layerB: SkinLayer) => layerB.level - layerA.level);
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface DisplayLayerEntry {
  display: Avatar;
  layer: SkinLayer;
}
export class DisplayList {
  public backLayers: DisplayLayerEntry[];
  public displays: Avatar[];
  public frontLayers: DisplayLayerEntry[];
  public maxScale: number;
  public get ready(): boolean {
    return this.displays.every((display: Avatar) => display.ready);
  }

  public constructor() {
    this.displays = [];
    this.frontLayers = [];
    this.backLayers = [];
    this.maxScale = 0;
  }

  public add(display: Avatar): void {
    this.displays.push(display);
    this.sort();
  }

  public remove(display: Avatar): void {
    this.displays = this.displays.filter((other: Avatar) => other !== display);
    this.sort();
  }

  public sort(): void {
    this.frontLayers = ([] as DisplayLayerEntry[]).concat(...this.displays.map((display: Avatar) =>
      display.frontLayers.map((layer: SkinLayer) => ({
        display,
        layer
      }))
    )).sort((entryA: DisplayLayerEntry, entryB: DisplayLayerEntry) => entryA.layer.level - entryB.layer.level);
    this.backLayers = ([] as DisplayLayerEntry[]).concat(...this.displays.map((display: Avatar) =>
      display.backLayers.map((layer: SkinLayer) => ({
        display,
        layer
      }))
    )).sort((entryA: DisplayLayerEntry, entryB: DisplayLayerEntry) => entryB.layer.level - entryA.layer.level);
    this.maxScale = Math.max(...this.frontLayers.map((entry: DisplayLayerEntry) => entry.display.scale * entry.layer.scale));
  }
}
let cachedGradient: CanvasGradient | undefined;
export interface SizedGridLike {
  height: number;
  width: number;
}
export function getVerticalGradient(context: CanvasRenderingContext2D, spatialGrid2: SizedGridLike, topColor: string, bottomColor: string): CanvasGradient | undefined {
  cachedGradient = context.createLinearGradient(spatialGrid2.width / HALF_DIVISOR, 0, spatialGrid2.width / HALF_DIVISOR, spatialGrid2.height);
  cachedGradient.addColorStop(0, topColor);
  cachedGradient.addColorStop(1, bottomColor);
  return cachedGradient;
}
export function strokePath(context: CanvasRenderingContext2D, path: Path2D, strokeColor: string, lineWidth: number): void {
  context.strokeStyle = strokeColor;
  context.lineWidth = lineWidth;
  context.stroke(path);
}
export function strokeTrail(context: CanvasRenderingContext2D, strokeStyle: CanvasPattern | string, trail: Trail, _unused: Vector, lineWidth: number): void {
  if (trail.polyline.segments.length) {
    context.lineWidth = lineWidth;
    context.strokeStyle = strokeStyle;
    context.stroke(trail.polyline.path);
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function drawUnitName(context: CanvasRenderingContext2D, unit: Unit, zoom: number, scale: number, fontFamily: string): void {
  const {
    devicePixelRatio
  } = window;
  const fontSize = scale * UNIT_NAME_FONT_SIZE / devicePixelRatio;
  const outlineWidth = scale * UNIT_NAME_OUTLINE_WIDTH / devicePixelRatio;
  context.save();
  context.translate(unit.position.x, unit.position.y);
  context.scale(UNIT_NAME_ZOOM_NUDGE / zoom, UNIT_NAME_ZOOM_NUDGE / zoom);
  context.font = `${String(fontSize)}px ${fontFamily}`;
  context.textAlign = 'center';
  context.textBaseline = 'bottom';
  let name = unit.name;
  if (unit === unit.game.player) {
    if (new Date().getSeconds() % RECORDING_LABEL_BLINK_MODULO === 0) {
      if (unit.game.recording) {
        name = 'Recording';
      } else if (unit.game.replaying) {
        name = 'Replaying';
      }
    }
  }
  const textOffsetY = Math.trunc(zoom * UNIT_NAME_OFFSET_Y);
  const outlineColor = '#363331';
  context.lineWidth = outlineWidth / UNIT_NAME_LINE_WIDTH_DIVISOR;
  context.strokeStyle = outlineColor;
  context.shadowColor = outlineColor;
  context.shadowBlur = outlineWidth / HALF_DIVISOR;
  context.strokeText(name, 0, textOffsetY);
  context.fillStyle = outlineColor;
  context.fillText(name, UNIT_NAME_SHADOW_OFFSET, textOffsetY + UNIT_NAME_SHADOW_OFFSET);
  let nameColor = '#dddddd';
  const shieldAsset = unit.skin.assets.find((asset: Asset) => asset.pool.name === 'shields');
  if (shieldAsset) {
    nameColor = ensureNonNullable(shieldAsset.content.color);
  }
  context.fillStyle = nameColor;
  context.shadowColor = nameColor;
  context.shadowBlur = outlineWidth / UNIT_NAME_NICK_SHADOW_DIVISOR;
  context.fillText(name, 0, textOffsetY);
  context.restore();
}
/* eslint-disable no-magic-numbers, no-implicit-coercion -- crown glyph path geometry: unnameable coordinate data. */
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function createCrownPath(): Path2D {
  const path2D = new Path2D();
  const size = 5;
  path2D.moveTo(size * -3, size * -3);
  path2D.lineTo(size * -1, size * -1);
  path2D.lineTo(size * 0, size * -3);
  path2D.lineTo(size * 1, size * -1);
  path2D.lineTo(size * 3, size * -3);
  path2D.lineTo(size * 2, size * 1);
  path2D.lineTo(size * -2, size * 1);
  path2D.closePath();
  return path2D;
}
/* eslint-enable no-magic-numbers, no-implicit-coercion -- crown glyph path geometry: unnameable coordinate data. */
export const crownPath = createCrownPath();
export function drawCrown(context: CanvasRenderingContext2D, unit: Unit, zoom: number, scale: number): void {
  const {
    devicePixelRatio
  } = window;
  const verticalOffset = scale * CROWN_BASE_OFFSET / devicePixelRatio;
  context.save();
  context.translate(unit.position.x, unit.position.y);
  context.scale(1 / (zoom * devicePixelRatio), 1 / (zoom * devicePixelRatio));
  context.fillStyle = '#ffff00';
  context.strokeStyle = '#ff8800';
  context.lineJoin = 'round';
  context.lineWidth = 1;
  context.translate(0, zoom * CROWN_ZOOM_OFFSET * devicePixelRatio);
  context.translate(0, -verticalOffset * devicePixelRatio);
  context.scale(scale, scale);
  context.translate(0, CROWN_OFFSET_A);
  context.translate(0, CROWN_OFFSET_B);
  context.fill(crownPath);
  context.stroke(crownPath);
  context.restore();
}
/* eslint-disable no-magic-numbers, no-implicit-coercion -- face glyph path geometry: unnameable coordinate data. */
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function createFacePath(): Path2D {
  const path2D = new Path2D();
  const size = 1.6;
  path2D.moveTo(size * 0, size * -7);
  path2D.lineTo(size * 5, size * -6);
  path2D.lineTo(size * 7, size * -3);
  path2D.lineTo(size * 6, size * 2);
  path2D.lineTo(size * 4, size * 3);
  path2D.lineTo(size * 3, size * 6);
  path2D.lineTo(size * 0, size * 7);
  path2D.lineTo(size * -3, size * 6);
  path2D.lineTo(size * -4, size * 3);
  path2D.lineTo(size * -6, size * 2);
  path2D.lineTo(size * -7, size * -3);
  path2D.lineTo(size * -5, size * -6);
  path2D.closePath();
  path2D.arc(size * -3, size * -1, size * 2, 0, Math.PI * 2, true);
  path2D.closePath();
  path2D.arc(size * 3, size * -1, size * 2, 0, Math.PI * 2, true);
  path2D.closePath();
  path2D.moveTo(size * 0, size * 1);
  path2D.lineTo(size * -2, size * 3);
  path2D.lineTo(size * 0, size * 4);
  path2D.lineTo(size * 2, size * 3);
  path2D.closePath();
  return path2D;
}
/* eslint-enable no-magic-numbers, no-implicit-coercion -- face glyph path geometry: unnameable coordinate data. */
export const facePath = createFacePath();
export function drawFaceIcon(context: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  context.save();
  context.fillStyle = '#ffffffcc';
  context.translate(x, y);
  context.scale(scale, scale);
  context.fill(facePath);
  context.restore();
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface AvatarBearer {
  direction?: number;
  position: Vector;
  skin: Skin;
  target?: null | Vector;
}
export function drawSkinLayer(config: Config, context: CanvasRenderingContext2D, unit: AvatarBearer, skinLayer: Avatar, skinLayer2: SkinLayer): void {
  const {
    trackWidth
  } = config;
  if (skinLayer2.image) {
    const imageWidth = skinLayer2.image.width;
    const imageHeight = skinLayer2.image.height;
    const imageScale = trackWidth * skinLayer.scale * skinLayer2.scale / imageWidth;
    context.save();
    context.translate(unit.position.x, unit.position.y - config.baseHeight * skinLayer2.level);
    context.rotate(ensureNonNullable(unit.direction) + QUARTER_TURN);
    context.translate((skinLayer.x + skinLayer2.x) * trackWidth, (skinLayer.y + skinLayer2.y) * trackWidth);
    let rotation = 0;
    if (skinLayer2.direction === 'target') {
      const point = (unit.target ?? new Vector(0, 0)).clone().sub(unit.position);
      const targetAngle = Math.atan2(point.y, point.x);
      rotation += targetAngle - ensureNonNullable(unit.direction);
    }
    if (skinLayer2.direction === 'billboard') {
      rotation += -ensureNonNullable(unit.direction) - QUARTER_TURN;
    }
    if (skinLayer2.rotation) {
      rotation += skinLayer2.rotation * DEGREES_TO_RADIANS;
    }
    if (rotation) {
      context.rotate(rotation);
    }
    context.scale(imageScale, imageScale);
    context.translate(imageWidth * -skinLayer2.pivot.x, imageHeight * -skinLayer2.pivot.y);
    context.drawImage(skinLayer2.image, 0, 0);
    context.restore();
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function drawAvatarLayers(config: Config, context: CanvasRenderingContext2D, unit: AvatarBearer, avatar: DisplayList, isFront: boolean): void {
  const list4 = isFront ? avatar.frontLayers : avatar.backLayers;
  list4.forEach((layerEntry: DisplayLayerEntry) => {
    drawSkinLayer(config, context, unit, layerEntry.display, layerEntry.layer);
  });
}
export function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, cornerRadii: [number, number, number, number], strokeWidth?: number): void {
  const [topLeftRadius, topRightRadius, bottomRightRadius, bottomLeftRadius] = cornerRadii;
  context.beginPath();
  context.moveTo(x + topLeftRadius, y);
  context.lineTo(x + width - topRightRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + topRightRadius);
  context.lineTo(x + width, y + height - bottomRightRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - bottomRightRadius, y + height);
  context.lineTo(x + bottomLeftRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - bottomLeftRadius);
  context.lineTo(x, y + topLeftRadius);
  context.quadraticCurveTo(x, y, x + topLeftRadius, y);
  context.closePath();
  context.fill();
  if (strokeWidth) {
    context.strokeStyle = '#00000099';
    context.lineWidth = strokeWidth;
    context.stroke();
  }
}
export function fillPath(context: CanvasRenderingContext2D, path: Path2D, fillStyle: CanvasPattern | string): void {
  context.fillStyle = fillStyle;
  context.fill(path);
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
interface Bounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface HasBounds {
  bounds: Bounds;
}
interface RenderContext {
  backHeight: number;
  barHeight: number;
  barWidth: number;
  boundsInView: (target: HasBounds, padding?: number) => boolean;
  calcMult: (a: number, b: number) => number;
  ctx: CanvasRenderingContext2D | null;
  devicePixelRatio: number;
  fontSize: number;
  game: Game;
  halfBarHeight: number;
  halfBarWidth: number;
  origin: Vector;
  padding: number;
  pointInView: (point: Vector, padding?: number) => boolean;
  scale: number;
  scaler: number;
  strokeWidth: number;
  uiFont: string;
  view: HTMLCanvasElement;
  viewHeight: number;
  viewScreenHeight: number;
  viewScreenWidth: number;
  viewWidth: number;
}
export function drawBaseFills(renderContext: RenderContext): void {
  const {
    boundsInView,
    game
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    trackWidth
  } = game.config;
  game.units.forEach((unit: Unit) => {
    if (boundsInView({ bounds: ensureNonNullable(unit.base.polygon.bounds) }, trackWidth) || game.debugView) {
      fillPath(ctx, unit.base.polygon.path, unit.skin.pattern?.pattern ?? unit.skin.colors.main);
    }
  });
}
export function drawTrailUnderlays(renderContext: RenderContext): void {
  const {
    boundsInView,
    game
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    trackWidth
  } = game.config;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'destination-out';
  game.units.forEach((unit: Unit) => {
    const {
      start
    } = unit.track.polyline;
    if (start) {
      if (boundsInView(unit.track.polyline, trackWidth)) {
        strokeTrail(ctx, unit.skin.colors.main, unit.track, unit.position, trackWidth);
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.clip(unit.base.polygon.path);
        strokeTrail(ctx, unit.skin.pattern?.pattern ?? unit.skin.colors.main, unit.track, unit.position, trackWidth + TRAIL_UNDERLAY_WIDTH_EXTRA);
        ctx.restore();
      }
    }
  });
  ctx.restore();
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function drawAvatarFrontLayers(renderContext: RenderContext): void {
  const {
    game,
    pointInView
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    trackWidth
  } = game.config;
  game.units.forEach((city: Unit) => {
    if (pointInView(city.position, trackWidth * AVATAR_VIEW_PADDING_FACTOR)) {
      drawAvatarLayers(game.config, ctx, city, city.skin.container, true);
    }
  });
}
export function drawUnitNames(renderContext: RenderContext): void {
  const {
    game,
    pointInView,
    scale,
    scaler
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    font,
    trackWidth
  } = game.config;
  game.units.forEach((unit: Unit) => {
    if (pointInView(unit.position, trackWidth * UNIT_NAME_VIEW_PADDING_FACTOR) || game.debugView) {
      drawUnitName(ctx, unit, scale, scaler, font);
    }
  });
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function drawAvatarBackLayers(renderContext: RenderContext): void {
  const {
    game,
    pointInView
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    trackWidth
  } = game.config;
  game.units.forEach((city: Unit) => {
    if (pointInView(city.position, trackWidth * AVATAR_VIEW_PADDING_FACTOR)) {
      drawAvatarLayers(game.config, ctx, city, city.skin.container, false);
    }
  });
}
export function drawTrails(renderContext: RenderContext): void {
  const {
    boundsInView,
    game
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    trackWidth
  } = game.config;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = TRAIL_ALPHA;
  game.units.forEach((unit: Unit) => {
    if (unit.in !== unit.base) {
      if (boundsInView(unit.track.polyline, trackWidth)) {
        strokeTrail(ctx, game.tailRecovered && unit === game.player ? '#f00' : unit.skin.colors.main, unit.track, unit.position, trackWidth);
      }
    }
  });
  ctx.restore();
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function drawBaseBacks(renderContext: RenderContext): void {
  const {
    boundsInView,
    game
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    trackWidth
  } = game.config;
  game.units.forEach((unit: Unit) => {
    if (boundsInView({ bounds: ensureNonNullable(unit.base.polygon.bounds) }, trackWidth)) {
      fillPath(ctx, unit.base.polygon.path, unit.skin.colors.back);
    }
  });
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function drawArenaBackground(renderContext: RenderContext): void {
  const {
    game,
    viewScreenHeight,
    viewScreenWidth
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    arenaColor,
    backgroundBottomColor,
    backgroundTopColor,
    baseHeight,
    borderColor
  } = game.config;
  fillPath(ctx, game.border.polygon.path, arenaColor);
  ctx.translate(0, baseHeight * ARENA_BORDER_OFFSET_FACTOR);
  fillPath(ctx, game.border.polygon.path, borderColor);
  ctx.translate(0, baseHeight * -ARENA_BORDER_OFFSET_FACTOR);
  const backgroundGradient = getVerticalGradient(ctx, game.space, backgroundTopColor, backgroundBottomColor);
  if (backgroundGradient) {
    ctx.fillStyle = backgroundGradient;
  }
  ctx.fillRect(viewScreenWidth / -HALF_DIVISOR, viewScreenHeight / -HALF_DIVISOR, game.space.width + viewScreenWidth, game.space.height + viewScreenHeight);
}
export function drawParticles(renderContext: RenderContext): void {
  const {
    game,
    pointInView
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    trackWidth
  } = game.config;
  ctx.save();
  game.particles.forEach((particle: Particle) => {
    if (particle.time > 0 && pointInView(particle.position, trackWidth)) {
      particle.draw(ctx);
    }
  });
  ctx.restore();
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function drawLabels(renderContext: RenderContext): void {
  const {
    game,
    scale,
    scaler
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    font
  } = game.config;
  ctx.scale(1 / scale, 1 / scale);
  game.labels.forEach((label: TextParticle) => {
    label.draw(ctx, font, scale, scaler);
  });
  ctx.scale(scale, scale);
}
export function drawLeaderMarker(renderContext: RenderContext): void {
  const {
    game,
    scale,
    scaler
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const topUnit = game.units[0];
  if (topUnit) {
    drawCrown(ctx, topUnit, scale, scaler);
  }
}
export function drawMinimap(renderContext: RenderContext): void {
  const {
    calcMult,
    game,
    padding,
    scaler,
    viewScreenHeight,
    viewScreenWidth
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  assertNonNullable(game.player);
  const minimapSize = viewScreenWidth / calcMult(MINIMAP_CALC_MULT_A, MINIMAP_CALC_MULT_B);
  const minimapStrokeWidth = game.space.width / minimapSize * scaler * MINIMAP_STROKE_WIDTH_FACTOR;
  ctx.save();
  ctx.translate(viewScreenWidth - padding - minimapSize, viewScreenHeight - padding - minimapSize);
  ctx.scale(minimapSize / game.space.width, minimapSize / game.space.height);
  fillPath(ctx, game.border.polygon.path, '#c2d6cdaa');
  fillPath(ctx, game.player.base.polygon.path, game.player.skin.colors.main);
  strokePath(ctx, game.player.base.polygon.path, game.player.skin.colors.back, minimapStrokeWidth / HALF_DIVISOR);
  strokeTrail(ctx, game.player.skin.colors.back, game.player.track, game.player.position, minimapStrokeWidth / HALF_DIVISOR);
  const borderColor = game.units.some((unit: Unit) => !game.isPlayer(unit) && unit.in === ensureNonNullable(game.player).base) ? '#ff0000' : '#00000099';
  strokePath(ctx, game.border.polygon.path, borderColor, minimapStrokeWidth);
  ctx.beginPath();
  ctx.arc(game.player.position.x, game.player.position.y, minimapStrokeWidth, 0, FULL_TURN);
  ctx.fillStyle = game.player.skin.colors.nick;
  ctx.fill();
  const flagAsset = game.player.skin.assets.find((asset: Asset) => asset.pool.name === 'flags');
  const spatialGrid2 = flagAsset?.content.roundedFlag;
  if (spatialGrid2) {
    game.player.cities.forEach((city: City) => {
      ctx.save();
      ctx.translate(city.position.x, city.position.y);
      ctx.scale(DOUBLE_FACTOR, DOUBLE_FACTOR);
      ctx.drawImage(spatialGrid2, -spatialGrid2.width / IMAGE_CENTER_DIVISOR, -spatialGrid2.height / IMAGE_CENTER_DIVISOR);
      ctx.restore();
    });
  }
  ctx.restore();
}
let spatialGrid: HTMLCanvasElement | null = null;
window.addEventListener('resize', () => {
  spatialGrid = null;
}, false);
export function drawLeaderboard(renderContext: RenderContext): void {
  const {
    devicePixelRatio
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  if (!spatialGrid) {
    spatialGrid = document.createElement('canvas');
    spatialGrid.width = Math.trunc(renderContext.barWidth);
    spatialGrid.height = Math.trunc(renderContext.barHeight * LEADERBOARD_ROW_HEIGHT_FACTOR * LEADERBOARD_ROW_COUNT);
  }
  if (renderContext.game.topListChanged) {
    renderContext.game.topListChanged = false;
    const context = spatialGrid.getContext('2d');
    if (context) {
      context.save();
      context.clearRect(0, 0, spatialGrid.width, spatialGrid.height);
      context.translate(-ctx.canvas.width + spatialGrid.width, 0);
      context.scale(1 / devicePixelRatio, 1 / devicePixelRatio);
      drawLeaderboardRows(context, renderContext);
      context.restore();
    }
  }
  ctx.save();
  ctx.resetTransform();
  ctx.drawImage(spatialGrid, ctx.canvas.width - spatialGrid.width, 0);
  ctx.restore();
}
export function drawLeaderboardRows(context: CanvasRenderingContext2D, renderContext: RenderContext): void {
  const {
    backHeight,
    barHeight,
    barWidth,
    game,
    halfBarHeight,
    halfBarWidth,
    padding,
    strokeWidth,
    uiFont,
    viewScreenWidth
  } = renderContext;
  let previousBarWidth: number | undefined;
  const topUnit = game.units[0];
  const topScore = topUnit && ensureNonNullable(topUnit.schemes).scores();
  let isPlayerListed = false;
  for (let i2 = 0; i2 < TOP_LIST_RANK_LIMIT; i2++) {
    const unit = game.units[i2];
    if (unit) {
      if (game.isPlayer(unit)) {
        isPlayerListed = true;
      }
      drawLeaderboardRow(unit, i2 + 1, i2, ensureNonNullable(topScore));
    }
  }
  if (!isPlayerListed && game.player && !game.player.death) {
    const playerIndex = game.units.findIndex((unit: Unit) => game.isPlayer(unit));
    drawLeaderboardRow(game.player, playerIndex + 1, LEADERBOARD_PLAYER_ROW_INDEX, ensureNonNullable(topScore));
  }
  function drawLeaderboardRow(unit: Unit, rank: number, rowIndex: number, maxScore: number): void {
    const rowY = padding + rowIndex * (barHeight * LEADERBOARD_ROW_HEIGHT_FACTOR);
    const score = ensureNonNullable(unit.schemes).scores();
    let scoreBarWidth = halfBarWidth * (score / maxScore);
    if (previousBarWidth && scoreBarWidth > previousBarWidth - halfBarWidth * LEADERBOARD_BAR_GAP_FACTOR) {
      scoreBarWidth = previousBarWidth - halfBarWidth * LEADERBOARD_BAR_GAP_FACTOR;
    }
    previousBarWidth = scoreBarWidth;
    const barRightOffset = halfBarWidth + scoreBarWidth;
    let barX = viewScreenWidth - barRightOffset;
    const cornerRadii: [number, number, number, number] = [halfBarHeight, 0, 0, halfBarHeight];
    context.fillStyle = '#00000022';
    drawRoundedRect(context, barX + backHeight, rowY + backHeight * LEADERBOARD_SHADOW_OFFSET_FACTOR, barWidth, barHeight, cornerRadii);
    context.fillStyle = unit.skin.colors.back;
    drawRoundedRect(context, barX, rowY + backHeight, barWidth, barHeight, cornerRadii, strokeWidth);
    context.fillStyle = unit.skin.colors.main;
    drawRoundedRect(context, barX, rowY, barWidth, barHeight, cornerRadii, strokeWidth);
    const flagAsset = unit.skin.assets.find((asset: Asset) => asset.pool.name === 'flags');
    const flagImage = flagAsset?.content.roundedFlag;
    if (flagImage) {
      const flagHeight = barHeight * LEADERBOARD_FLAG_HEIGHT_FACTOR;
      const flagOffsetX = barHeight / LEADERBOARD_FLAG_OFFSET_DIVISOR;
      const flagScale = flagHeight / flagImage.height;
      context.save();
      context.translate(barX + flagOffsetX, rowY + barHeight / HALF_DIVISOR);
      context.scale(flagScale, flagScale);
      context.drawImage(flagImage, 0, -flagImage.height / HALF_DIVISOR);
      context.restore();
      barX += flagHeight;
    }
    context.fillStyle = unit.skin.colors.plate;
    context.font = uiFont;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(`${String(rank)} – ${ensureNonNullable(unit.schemes).print()} ${unit.name}`, barX + halfBarHeight, rowY + halfBarHeight * TEXT_BASELINE_NUDGE_FACTOR);
  }
}
export function renderScoreBar(renderContext: RenderContext): void {
  const {
    backHeight,
    barHeight,
    barWidth,
    game,
    halfBarHeight,
    padding,
    strokeWidth,
    uiFont
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    player
  } = game;
  assertNonNullable(player);
  ctx.fillStyle = '#00000022';
  drawRoundedRect(ctx, 0, padding, barWidth, barHeight + backHeight, [0, (barHeight + backHeight) / HALF_DIVISOR, (barHeight + backHeight) / HALF_DIVISOR, 0]);
  const scoreRatio = game.best ? Math.min(1, ensureNonNullable(player.schemes).scores() / game.best) : 1;
  const fillWidth = barWidth * (SCORE_BAR_MIN_FILL + scoreRatio * SCORE_BAR_FILL_RANGE);
  ctx.fillStyle = player.skin.colors.back;
  drawRoundedRect(ctx, 0, padding + backHeight, fillWidth, barHeight, [0, halfBarHeight, halfBarHeight, 0], strokeWidth);
  ctx.fillStyle = player.skin.colors.main;
  drawRoundedRect(ctx, 0, padding, fillWidth, barHeight, [0, halfBarHeight, halfBarHeight, 0], strokeWidth);
  ctx.fillStyle = player.skin.colors.plate;
  ctx.font = uiFont;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(ensureNonNullable(player.schemes).print(), halfBarHeight, padding + halfBarHeight * TEXT_BASELINE_NUDGE_FACTOR);
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function renderBestScore(renderContext: RenderContext): void {
  const {
    backHeight,
    barHeight,
    game,
    padding,
    uiFont
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  ctx.font = uiFont;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const bestText = `${game.language.bestTxt} ${ensureNonNullable(ensureNonNullable(game.player).schemes).print(game.best ?? undefined)}`;
  ctx.fillStyle = '#00000066';
  ctx.fillText(bestText, padding / HALF_DIVISOR, padding + barHeight + backHeight + padding / HALF_DIVISOR);
}
export function renderKillCount(renderContext: RenderContext): void {
  const {
    backHeight,
    barHeight,
    fontSize,
    game,
    halfBarHeight,
    padding,
    scaler,
    uiFont
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const killsY = padding + barHeight + backHeight + fontSize + padding / HALF_DIVISOR + KILL_COUNT_Y_OFFSET;
  ctx.font = uiFont;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const killsText = `x${String(ensureNonNullable(game.player).statistics.kills)}`;
  ctx.fillStyle = '#00000088';
  drawRoundedRect(ctx, 0, killsY, barHeight * KILL_COUNT_BG_WIDTH_FACTOR + ctx.measureText(killsText).width, barHeight, [0, halfBarHeight, halfBarHeight, 0]);
  drawFaceIcon(ctx, barHeight * KILL_COUNT_ICON_X_FACTOR / HALF_DIVISOR, killsY + barHeight / HALF_DIVISOR, scaler);
  ctx.fillStyle = '#ffffffcc';
  ctx.fillText(killsText, barHeight * KILL_COUNT_TEXT_X_FACTOR, killsY + halfBarHeight + barHeight * KILL_COUNT_TEXT_Y_FACTOR);
}
export function renderQuestNotification(renderContext: RenderContext): void {
  const {
    backHeight,
    barHeight,
    fontSize,
    game,
    padding,
    uiFont,
    viewScreenWidth
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  if (game.notifications.length) {
    const quest = ensureNonNullable(game.notifications[0]);
    if (quest.ready) {
      ctx.save();
      ctx.font = uiFont;
      const notificationHeight = fontSize * DOUBLE_FACTOR + padding;
      const notificationY = quest.position() * (notificationHeight + padding) - notificationHeight;
      const textWidth = Math.max(ctx.measureText(quest.title).width, ctx.measureText(quest.description).width);
      const iconSize = fontSize * DOUBLE_FACTOR;
      const notificationWidth = textWidth + padding * QUEST_NOTIFICATION_PADDING_FACTOR + iconSize;
      const inset = padding / HALF_DIVISOR;
      ctx.fillStyle = '#00000088';
      drawRoundedRect(ctx, (viewScreenWidth - notificationWidth) / HALF_DIVISOR, notificationY, notificationWidth, notificationHeight, [(barHeight + backHeight) / HALF_DIVISOR, (barHeight + backHeight) / HALF_DIVISOR, (barHeight + backHeight) / HALF_DIVISOR, (barHeight + backHeight) / HALF_DIVISOR]);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(quest.title, (viewScreenWidth - notificationWidth) / HALF_DIVISOR + notificationWidth / HALF_DIVISOR + iconSize / HALF_DIVISOR, notificationY + inset);
      ctx.fillStyle = '#ffffff88';
      ctx.shadowColor = '#ffffff88';
      ctx.shadowBlur = 1;
      ctx.font = uiFont;
      ctx.fillText(quest.description, (viewScreenWidth - notificationWidth) / HALF_DIVISOR + notificationWidth / HALF_DIVISOR + iconSize / HALF_DIVISOR, notificationY + inset + fontSize);
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = QUEST_NOTIFICATION_SHADOW_BLUR;
      if (quest.image) {
        ctx.drawImage(quest.image, (viewScreenWidth - notificationWidth) / HALF_DIVISOR + inset, notificationY + inset, iconSize, iconSize);
      }
      ctx.restore();
    }
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function renderGame(game: Game): void {
  const renderContext = game.getRenderContext();
  if (!renderContext) {
    return;
  }
  const {
    baseHeight
  } = game.config;
  let {
    origin,
    scale
  } = renderContext;
  const {
    devicePixelRatio,
    viewHeight,
    viewWidth
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  if (game.debugView) {
    scale = DEBUG_VIEW_SCALE;
    origin = game.space.center;
  }
  ctx.resetTransform();
  ctx.clearRect(0, 0, viewWidth, viewHeight);
  const offsetX = origin.x * scale - viewWidth / HALF_DIVISOR;
  const offsetY = origin.y * scale - viewHeight / HALF_DIVISOR;
  ctx.translate(-offsetX, -offsetY);
  ctx.scale(scale, scale);
  ctx.translate(0, -baseHeight);
  drawBaseFills(renderContext);
  drawTrailUnderlays(renderContext);
  ctx.translate(0, baseHeight);
  ctx.globalCompositeOperation = 'destination-over';
  drawAvatarBackLayers(renderContext);
  drawTrails(renderContext);
  drawBaseBacks(renderContext);
  drawArenaBackground(renderContext);
  ctx.globalCompositeOperation = 'source-over';
  drawAvatarFrontLayers(renderContext);
  drawUnitNames(renderContext);
  drawParticles(renderContext);
  drawLabels(renderContext);
  drawLeaderMarker(renderContext);
  ctx.resetTransform();
  ctx.scale(1 / devicePixelRatio, 1 / devicePixelRatio);
  if (game.player) {
    drawLeaderboard(renderContext);
    renderScoreBar(renderContext);
    renderBestScore(renderContext);
    renderKillCount(renderContext);
    drawMinimap(renderContext);
    renderQuestNotification(renderContext);
  }
  if (game.debug || game.recording || game.replaying) {
    renderDebugOverlay(game);
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
interface Metric {
  events: MetricEvents;
  frameTime: number;
  renderTime: number;
  updateTime: number;
}
export function renderDebugOverlay(game: Game): void {
  const {
    view
  } = game;
  const context = view.getContext('2d');
  if (!context) {
    return;
  }
  const overlayContext = context;
  context.fillStyle = '#000000';
  context.strokeStyle = '#ffffff';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  let lineY = game.quality * DEBUG_OVERLAY_START_Y;
  drawStatLine(`Update time: ${game.stats.ut.toFixed(1)}`);
  drawStatLine(`AI time: ${game.stats.ait.toFixed(1)}`, 1);
  drawStatLine(`Spawn time: ${game.stats.st.toFixed(1)}`, 1);
  drawStatLine(`Render time: ${game.stats.rt.toFixed(1)}`);
  drawStatLine(`FPS: ${String(Math.round(game.stats.fps))}`);
  drawStatLine(`Quality: ${String(game.quality)}`);
  drawStatLine();
  drawStatLine(`Units: ${String(game.units.length)}`);
  drawStatLine(`Level: ${game.level.toFixed(DEBUG_LEVEL_DECIMAL_DIGITS)}`);
  drawStatLine();
  drawStatLine(`Particles: ${String(game.particles.length)}`);
  drawStatLine();
  if (game.recording) {
    drawStatLine(`Recording: ${game.recording.duration().toFixed(1)} s`);
  }
  if (game.replaying) {
    drawStatLine(`Replaying: ${game.replaying.currentlyPlaying().toFixed(1)}/${game.replaying.duration().toFixed(1)} s`);
  }
  if (game.debugGraph) {
    const graphWidth = view.width / DEBUG_GRAPH_WIDTH_DIVISOR;
    const graphHeight = DEBUG_GRAPH_HEIGHT;
    const path2D = new Path2D();
    const path2D2 = new Path2D();
    const path2D3 = new Path2D();
    const path2D4 = new Path2D();
    path2D4.moveTo(0, 0);
    let maxFrameTime = TARGET_FRAME_TIME_MILLISECONDS;
    game.metrics.forEach((metric: Metric) => {
      maxFrameTime = Math.max(maxFrameTime, metric.frameTime);
    });
    maxFrameTime *= DEBUG_GRAPH_HEADROOM_FACTOR;
    const xStep = graphWidth / (MAX_METRICS_SAMPLES - 1);
    const yScale = graphHeight / maxFrameTime;
    context.save();
    context.translate((view.width - graphWidth) / HALF_DIVISOR, graphHeight);
    context.fillStyle = '#00000033';
    context.fillRect(0, -graphHeight, graphWidth, graphHeight);
    game.metrics.forEach((metric: Metric, index: number) => {
      path2D.lineTo(xStep * index, -metric.updateTime * yScale);
      path2D2.lineTo(xStep * index, -metric.renderTime * yScale);
      path2D4.lineTo(xStep * index, -(metric.updateTime + metric.renderTime) * yScale);
      path2D3.lineTo(xStep * index, -metric.frameTime * yScale);
    });
    path2D4.lineTo(xStep * (game.metrics.length - 1), 0);
    context.lineWidth = 1;
    const targetFrameTimeY = yScale * TARGET_FRAME_TIME_MILLISECONDS;
    context.strokeStyle = 'red';
    context.beginPath();
    context.moveTo(0, -targetFrameTimeY);
    context.lineTo(graphWidth, -targetFrameTimeY);
    context.stroke();
    context.fillStyle = '#ffff00a0';
    context.fill(path2D4);
    context.strokeStyle = '#990099cc';
    context.stroke(path2D);
    context.strokeStyle = '#009900cc';
    context.stroke(path2D2);
    context.strokeStyle = '#0000ffcc';
    context.stroke(path2D3);
    context.lineWidth = DEBUG_GRAPH_EVENT_LINE_WIDTH;
    game.metrics.forEach((metric: Metric, index: number) => {
      const {
        kills,
        returns
      } = metric.events;
      if (returns || kills) {
        if (kills) {
          context.strokeStyle = '#99000040';
        } else {
          context.strokeStyle = '#00000040';
        }
        context.beginPath();
        context.moveTo(xStep * index, 0);
        context.lineTo(xStep * index, -graphHeight);
        context.stroke();
      }
    });
    context.restore();
  }
  function drawStatLine(text = '', indentLevel = 0): void {
    if (text) {
      overlayContext.strokeText(text, DEBUG_OVERLAY_INDENT_X + indentLevel * DEBUG_OVERLAY_INDENT_STEP, lineY);
      overlayContext.fillText(text, DEBUG_OVERLAY_INDENT_X + indentLevel * DEBUG_OVERLAY_INDENT_STEP, lineY);
    }
    lineY += game.quality * DEBUG_OVERLAY_LINE_HEIGHT;
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface GameResults {
  kills: number;
  newBest: boolean;
  score: number;
  time: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface GameApi {
  create: (view: HTMLCanvasElement) => void;
  game: Game;
  prepare: (onPrepared?: () => void) => void;
  preparing: boolean;
  start: (playerName?: string, skinName?: string, bestScore?: number, onGameOver?: (results: GameResults) => void, extraLives?: number) => void;
  startGame?: () => void;
}
export const BORDER_RADIUS_FACTOR = 0.95;
export const EXTRA_LIFE_LABEL_DURATION_MS = 5000;
export function createGameApi(config: Config, language: Language, createSkinManager: (config: Config, view: HTMLCanvasElement) => GameSkinManager, namePool: NamePool, schemeCycler: SchemeCycler, achievementStore: AchievementStore): GameApi | null {
  const gameApi = {} as GameApi;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Path2D feature-detection for old browsers; lib.dom types it as always-defined but it may be absent at runtime.
  if (Path2D) {
    gameApi.create = (view: HTMLCanvasElement): void => {
      const {
        arenaSize,
        borderPoints,
        quadSize
      } = config;
      const spatialGrid2 = new SpatialGrid(arenaSize, arenaSize, quadSize);
      Vector.space = spatialGrid2;
      const vector = new Vector(arenaSize / HALF_DIVISOR, arenaSize / HALF_DIVISOR);
      const radius = Math.min(vector.x, vector.y) * BORDER_RADIUS_FACTOR;
      const border = Border.circular(vector, borderPoints, radius);
      const skinManager = createSkinManager(config, view);
      const game = new Game(config, view, spatialGrid2, border, skinManager, null, namePool, new Controller(view, new KeyboardModeSwitch()), language.lng, schemeCycler, achievementStore, Math.random());
      skinManager.game = game;
      game.renderer = renderGame;
      gameApi.game = game;
      /* eslint-disable no-magic-numbers -- keyboard keyCodes for the debug toggle combos (Shift/Alt/Q/B/M and G). */
      game.controller.addSet([16, 18, 81, 66, 77], () => {
        game.debug = !game.debug;
      });
      game.controller.addButton(71, () => {
        game.debugGraph = !game.debugGraph;
      });
      /* eslint-enable no-magic-numbers -- end of the debug-combo keyCode literals. */
    };
    gameApi.preparing = true;
    let i2 = 0;
    let prepareIntervalId: number | undefined;
    function runPrepareBatch(): void {
      const {
        prepareMult
      } = config;
      let {
        prepareBatchCount
      } = config;
      while (prepareBatchCount--) {
        gameApi.game.update(FRAME_DURATION_MILLISECONDS * prepareMult + Math.random());
        i2++;
      }
    }
    gameApi.prepare = (onPrepared?: () => void): void => {
      const {
        game: gameApi2
      } = gameApi;
      prepareIntervalId = setInterval(() => {
        if (namePool.aviable()) {
          runPrepareBatch();
          if (i2 > config.prepareCounter) {
            clearInterval(prepareIntervalId);
            gameApi.preparing = false;
            gameApi2.visible = true;
            if (!gameApi2.looped) {
              gameApi2.loop();
            }
            if (onPrepared) {
              onPrepared();
            }
          }
        }
      }, 0);
    };
    gameApi.start = (playerName?: string, skinName?: string, bestScore?: number, onGameOver?: (results: GameResults) => void, extraLives?: number): void => {
      const game = gameApi.game;
      if (gameApi.preparing) {
        clearInterval(prepareIntervalId);
        const startTime = now();
        while (i2 < config.prepareCounter) {
          runPrepareBatch();
          if (now() - startTime > config.maxPreparingTime) {
            break;
          }
        }
      }
      game.best = bestScore ?? null;
      game.spawnPlayer(playerName, skinName, extraLives);
      if (extraLives) {
        ensureNonNullable(game.player).addLabel({
          color: '#7fed4c',
          text: russianLanguage.lng.extraLife,
          time: EXTRA_LIFE_LABEL_DURATION_MS
        });
      }
      if (onGameOver) {
        game.gameOverCallback = onGameOver;
      }
      gameApi.preparing = false;
      game.visible = true;
      if (!game.looped) {
        game.loop();
      }
      window.focus();
    };
    return gameApi;
  }
  return null;
}

// Declaration-merged onto the core `Component` (rather than kept as a
// Parallel `PreactComponent` type): the bundled preact/hooks addon patches
// The shared `preactOptions` object and touches the same live
// Component/vnode instances the core reconciler already types, so both
// Sides need to agree on one shape.

// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface SkinColors {
  back: string;
  main: string;
  nick: string;
  particles: ParticleColor[];
  plate: string;
}
export interface SkinSource {
  avatar?: AvatarDescriptor;
  colors?: Partial<SkinColors>;
  name: string;
  pattern?: PatternSource;
}
/* eslint-disable no-magic-numbers -- default game-config data table; each value is already named by its config key. */
export const defaultConfig = {
  arenaColor: '#e7fff4',
  arenaSize: 2000,
  backgroundBottomColor: '#81faff',
  backgroundTopColor: '#2d6998',
  baseCount: 50,
  baseHeight: 2,
  baseRadius: 30,
  borderColor: '#88a799',
  borderPoints: 300,
  botAggroMax: 1,
  botAggroMin: 0.2,
  botAttackTrackLength: 1500,
  botDefMax: 0.6,
  botDefMin: 1.2,
  botGreedMax: 0.6,
  botGreedMin: 0.1,
  botLevel: -1,
  botSafetyMax: 1,
  botSafetyMin: 0.5,
  botsCount: 15,
  enemyKillDelay: 2000,
  followKiller: true,
  font: 'PT Sans Caption',
  maxPreparingTime: 500,
  maxScale: 4.5,
  minScale: 3,
  nearPlayerBotSpawnCount: 1,
  noPlayerBotLevel: 0.5,
  observerScale: 2.5,
  platesStrokeWidth: 0,
  prepareAcceleration: 30,
  prepareBatchCount: 5,
  prepareCounter: 6000,
  prepareMult: 3,
  quadSize: 20,
  selfKillDelay: 1000,
  spawnTimeout: 3000,
  startBotLevel: 0.1,
  trackWidth: 8,
  unitSpeed: 90
};
/* eslint-enable no-magic-numbers -- end of the default game-config data table. */
export const COLOR_PALETTE: string[] = ['#3b5998', '#8b9dc3', '#2a4d69', '#4b86b4', '#8dbdff', '#64a1f4', '#3b7dd8', '#843b62', '#8874a3', '#8d5524', '#c68642', '#f1c27d', '#f77f00', '#fcbf49', '#ffe066', '#65737e', '#a7adba', '#4a7c59', '#1a936f', '#88d498', '#2a9d8f', '#68b0ab', '#99e550', '#6abe30', '#4b692f', '#8f974a', '#8a6f30', '#524b24', '#d62828', '#fe4a49', '#ed6a5a', '#ff3377', '#ff77aa', '#ff99cc', '#b23a48', '#fcb9b2'];
export interface AssetContent {
  color?: string;
  colors?: SkinColors;
  display?: Avatar;
  pattern?: PatternAsset;
  roundedFlag?: HTMLCanvasElement | HTMLImageElement;
}
export class Skin {
  public assets: Asset[];
  public colors: SkinColors;
  public config: Config | undefined;
  public container: DisplayList;
  public name: string | undefined;
  public pattern: null | PatternAsset;
  public user: undefined | Unit;
  public constructor() {
    this.config = undefined;
    this.user = undefined;
    this.name = undefined;
    this.assets = [];
    this.colors = {
      back: 'black',
      main: 'black',
      nick: 'black',
      particles: ['black'],
      plate: 'black'
    };
    this.pattern = null;
    this.container = new DisplayList();
  }

  public addAsset(asset: Asset): void {
    if (asset.content.colors) {
      this.colors = asset.content.colors;
    }
    if (asset.content.pattern) {
      this.pattern = asset.content.pattern;
    }
    if (asset.content.display) {
      this.container.add(asset.content.display);
    }
    this.assets.push(asset);
  }

  public removeAsset(asset: Asset): void {
    if (asset.content.display) {
      this.container.remove(asset.content.display);
    }
    const index = this.assets.indexOf(asset);
    if (index !== -1) {
      this.assets.splice(index, 1);
    }
  }
}
// `pool` is an abstract field: the base Asset never sets it (each concrete
// Subclass assigns its own narrower pool in its constructor), so the abstract
// Declaration keeps the type non-null for every reader without a base
// Class-field initializer that strict init would reject. Asset is never
// Instantiated directly (only SvgAsset / ImageAsset are), so `abstract` is
// Runtime-neutral.
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export abstract class Asset {
  public content: AssetContent;
  public loadingStarted: boolean;
  public name: string;
  public abstract pool: AssetSet;
  public ready: boolean;
  public constructor(name: string) {
    this.loadingStarted = false;
    this.name = name;
    this.content = {};
    this.ready = false;
  }

  public load(): void {
    noop();
  }
}
export class SvgAsset extends Asset {
  public override pool: ImageAssetSet;
  public source: SkinColors;
  public constructor(pool: ImageAssetSet, name: string, source: SkinColors) {
    super(name);
    this.pool = pool;
    this.source = source;
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class ImageAsset extends Asset {
  public override pool: SvgAssetSet;
  public source: SkinSource;
  public constructor(pool: SvgAssetSet, name: string, source: SkinSource) {
    super(name);
    this.pool = pool;
    this.source = source;
  }

  public override load(): void {
    if (this.loadingStarted) {
      return;
    }
    this.loadingStarted = true;
    const updateReady = (): void => {
      this.ready = !!this.content.display && this.content.display.ready && (this.content.pattern ? this.content.pattern.ready : true);
    };
    const {
      source
    } = this;
    if (source.colors) {
      this.content.colors = { back: '#000000', main: '#000000', nick: '#000000', particles: ['#000000'], plate: '#000000', ...source.colors };
    }
    if (source.pattern) {
      this.content.pattern = new PatternAsset(ensureNonNullable(this.pool.config), this.pool.view, this.pool.path, source.pattern, updateReady);
    }
    if (source.avatar) {
      this.content.display = new Avatar(ensureNonNullable(this.pool.config), this.pool.path, source.avatar, updateReady);
    }
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class AssetSet {
  public assets: Asset[];
  public config: Config | undefined;
  public name: string;
  public constructor(name: string) {
    this.config = undefined;
    this.name = name;
    this.assets = [];
  }

  public get(name?: string, requireReady?: boolean): Asset | null {
    const asset = this.assets.find((candidate: Asset) => candidate.name === name && (requireReady ? candidate.ready : true));
    if (!asset) {
      return null;
    }
    asset.load();
    return asset;
  }
}
export const BACK_VALUE_SCALE = 0.75;
export const NICK_VALUE_SCALE = 0.5;
export const DARK_PLATE_BRIGHTEN_FACTOR = 2;
export const PLATE_VALUE_THRESHOLD = 50;
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class ImageAssetSet extends AssetSet {
  public constructor(config: Config) {
    super('colors');
    this.config = config;
    this.add(COLOR_PALETTE);
  }

  public add(colors: string[]): void {
    const {
      config
    } = this;
    this.assets.push(...colors.map((color: string) => {
      const rgb = hexToRgb(color);
      const hsv = rgbToHsv(rgb);
      const backHsv = scaleValue(hsv, BACK_VALUE_SCALE);
      const back = hsvToHex(backHsv);
      const nickHsv = scaleValue(hsv, NICK_VALUE_SCALE);
      const nick = hsvToHex(nickHsv);
      const darkPlateHsv = brighten(hsv, DARK_PLATE_BRIGHTEN_FACTOR);
      const darkPlate = hsvToHex(darkPlateHsv);
      const skinColors = {
        back,
        main: color,
        nick,
        /* eslint-disable no-magic-numbers -- HSV value levels (100..20) for the particle color ramp. */
        particles: [hsvToHex(setValue(hsv, 100)), hsvToHex(setValue(hsv, 90)), hsvToHex(setValue(hsv, 80)), hsvToHex(setValue(hsv, 70)), hsvToHex(setValue(hsv, 60)), hsvToHex(setValue(hsv, 50)), hsvToHex(setValue(hsv, 40)), hsvToHex(setValue(hsv, 30)), hsvToHex(setValue(hsv, 20))],
        /* eslint-enable no-magic-numbers -- end of the particle color-ramp value levels. */
        plate: hsv.v > PLATE_VALUE_THRESHOLD ? nick : darkPlate
      };
      const svgAsset = new SvgAsset(this, color, skinColors);
      svgAsset.content.colors = skinColors;
      if (config) {
        svgAsset.content.display = new Avatar(config, '', {
          layers: [{
            src: createColorTile(skinColors.nick, skinColors.nick)
          }, {
            level: 1,
            src: createColorTile(skinColors.main, skinColors.back)
          }]
        });
      }
      svgAsset.ready = true;
      svgAsset.name = color;
      return svgAsset;
    }));
  }

  public loadAsset<T>(asset: T): T {
    return asset;
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class SvgAssetSet extends AssetSet {
  public path: string;
  public view: HTMLCanvasElement;
  public constructor(config: Config, canvas: HTMLCanvasElement, path: string, sources: SkinSource[], shouldPreload = false) {
    super('classic');
    this.config = config;
    this.view = canvas;
    this.path = path;
    this.add(sources);
    if (shouldPreload) {
      for (const asset of this.assets) {
        asset.load();
      }
    }
  }

  public add(sources: SkinSource[]): void {
    this.assets.push(...sources.map((source: SkinSource) => new ImageAsset(this, source.name, source)));
  }
}
export const COLOR_TILE_SIZE = 100;
export const COLOR_TILE_INSET = 10;
export const COLOR_TILE_INNER_SIZE = 80;
export function createColorTile(mainColor: string, backColor: string): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = COLOR_TILE_SIZE;
  element.height = COLOR_TILE_SIZE;
  const context = element.getContext('2d');
  assertNonNullable(context);
  context.fillStyle = backColor;
  context.fillRect(0, 0, COLOR_TILE_SIZE, COLOR_TILE_SIZE);
  context.fillStyle = mainColor;
  context.fillRect(COLOR_TILE_INSET, COLOR_TILE_INSET, COLOR_TILE_INNER_SIZE, COLOR_TILE_INNER_SIZE);
  return element;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface SkinManagerAssetEntry {
  asset: Asset;
  tag: string;
}
export type SkinManagerAssetMap = Record<string, SkinManagerAssetEntry>;
export type SkinManagerUsageMap = Record<string, Skin[]>;
// `isFlagSkinManager` / `shieldSkinAssets` are kept as a type-only interface
// Merge rather than class fields: they are never assigned, and the
// `'shieldSkinAssets' in skinManager` guard relies on them being absent at
// Runtime. A real class field is emitted (as `undefined` via esbuild's
// `__publicField`), which would make that guard always true and crash; the
// Project bans `declare` class properties, so an interface merge is the only
// Way to keep these two members type-only.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, perfectionist/sort-modules -- see the comment above: these two members must stay type-only, unachievable as class fields under this build; declaration order is kept dependency-ordered.
export interface SkinManager {
  isFlagSkinManager?: boolean;
  shieldSkinAssets?: ShieldSkinAssets;
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- coupled half of the type-only interface merge above (see that comment).
export abstract class SkinManager {
  public assets: SkinManagerAssetMap;
  public game?: Game;
  public rng: (n?: number) => number;
  public unusedAssets: SkinManagerAssetMap;
  public usedBy: SkinManagerUsageMap;
  public constructor(seed?: number) {
    this.usedBy = {};
    this.assets = {};
    this.unusedAssets = {};
    this.rng = createRandomGenerator(ensureNonNullable(seed));
  }

  public available(tag?: string): number {
    const list4 = Object.values(this.unusedAssets);
    if (tag) {
      return list4.filter((entry: SkinManagerAssetEntry) => entry.tag === tag).length;
    }
    return list4.length;
  }

  public get(name?: string, tag?: string): Skin {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- name may be an empty string, which must trigger the fallback; `??=` would not.
    if (!name) {
      name = this.randomAssetName(tag);
    }
    assertNonNullable(name);
    const asset = ensureNonNullable(this.assets[name]).asset;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing an entry from a string-keyed Record; setting undefined would leave a stale key that available()/randomAssetName would still enumerate.
    delete this.unusedAssets[name];
    asset.load();
    const skin = new Skin();
    skin.addAsset(asset);
    skin.name = name;
    this.usedBy[name] = (this.usedBy[name] ?? []).concat(skin);
    return skin;
  }

  public getCitySkin(_name?: string): Skin | undefined {
    return undefined;
  }

  public abstract getPlayerSkin(name?: string): Skin;

  public has(name: string): boolean {
    return name in this.unusedAssets;
  }

  public randomAssetName(tag?: string, unusedOnly = true): string | undefined {
    const assetMap = unusedOnly ? this.unusedAssets : this.assets;
    let list4 = Object.keys(assetMap);
    if (tag) {
      list4 = list4.filter((name: string) => ensureNonNullable(assetMap[name]).tag === tag);
    }
    const index = this.rng(list4.length);
    const name = list4[index];
    return name;
  }

  public registerAsset(asset: Asset, tag: string): void {
    const entry: SkinManagerAssetEntry = {
      asset,
      tag
    };
    this.assets[asset.name] = entry;
    this.unusedAssets[asset.name] = entry;
  }

  public registerAssets(assetSet: AssetSet, tag: string): void {
    for (const asset of assetSet.assets) {
      this.registerAsset(asset, tag);
    }
  }

  public release(skin: Skin): void {
    const name = ensureNonNullable(skin.name);
    const remaining = ensureNonNullable(this.usedBy[name]).filter((usedSkin: Skin) => usedSkin !== skin);
    this.usedBy[name] = remaining;
    if (remaining.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing the usage entry for a string-keyed Record.
      delete this.usedBy[name];
      this.unusedAssets[name] = ensureNonNullable(this.assets[name]);
    }
  }

  public reskin(name: string): void {
    const skins = this.usedBy[name];
    if (skins) {
      for (const skin of skins) {
        ensureNonNullable(skin.user).setSkin(this.get());
      }
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing the usage entry for a string-keyed Record.
      delete this.usedBy[name];
    }
  }
}
export const BOT_COLORED_SKIN_CHANCE = 0.25;
export class GameSkinManager extends SkinManager {
  public constructor(imageAssetSet: ImageAssetSet, svgAssetSet: SvgAssetSet, seed?: number) {
    super(seed);
    this.registerAssets(imageAssetSet, 'colored');
    this.registerAssets(svgAssetSet, 'classic');
  }

  public getBotSkin(): Skin {
    const tagOrder = this.rng() < BOT_COLORED_SKIN_CHANCE ? ['colored', 'classic'] : ['classic', 'colored'];
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- randomAssetName returns `string | undefined`; the `||` intentionally falls through on any falsy result (including an empty asset name) to try the second tag.
    const name = this.randomAssetName(tagOrder[0], true) || this.randomAssetName(tagOrder[1]);
    return this.get(name);
  }

  public override getPlayerSkin(name?: string): Skin {
    if (!name) {
      return this.get(undefined, 'colored');
    }
    this.reskin(name);
    return this.get(name);
  }
}
