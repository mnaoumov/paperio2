import type { Vector } from '../geometry/vector.ts';
import type { Bot } from './units.ts';

import { Segment } from '../geometry/shapes.ts';
import {
  EIGHTH_TURN,
  FULL_TURN,
  QUARTER_TURN,
  SIXTEENTH_TURN
} from '../shared/constants.ts';
import { lerp } from '../shared/math-utils.ts';
import { ensureNonNullable } from '../type-guards.ts';

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
