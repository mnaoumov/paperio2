import type { Game } from './engine.ts';
import type { Intersection } from './geometry.ts';
import type {
  AchievementTracker,
  SchemeCycler,
  Scoreboard,
  ScoreLabel
} from './scoring.ts';
import type {
  Asset,
  Skin
} from './skins.ts';

import {
  MIN_POINT_DISTANCE_SQUARED,
  Polygon,
  Polyline,
  Segment,
  SIMPLIFY_LOOKBACK_COUNT,
  Vector,
  WALL_PROXIMITY_THRESHOLD
} from './geometry.ts';
import {
  EIGHTH_TURN,
  FULL_TURN,
  KILL_REASON_SELF_INTERSECTION,
  KILL_REASON_TRAIL,
  KILL_REASON_WALL,
  MILLISECONDS_IN_SECOND,
  PERCENT_MAX,
  QUARTER_TURN,
  SIXTEENTH_TURN
} from './shared/constants.ts';
import {
  lerp,
  now
} from './shared/math-utils.ts';
import { noop } from './shared/noop.ts';
import { createRandomGenerator } from './shared/random.ts';
import { ensureNonNullable } from './type-guards.ts';

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
