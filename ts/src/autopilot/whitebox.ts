/**
 * @file
 *
 * The whitebox pilot: it reads the engine directly (its own base and trail, every unit's position, trail and way home,
 * the border) and flies loops out of its base sized so that no enemy can reach the trail before the loop closes. It
 * heads home the moment one could, choosing a way home whose turn, simulated at the player's own speed and turn rate,
 * keeps clear of its own trail, and it cuts an enemy's trail whenever it can get there before that enemy gets home. It
 * reads the game and changes nothing: no engine vector is allocated, and no engine random number is drawn.
 */

import type { Game } from '../engine.ts';
import type { Unit } from '../entities/units.ts';
import type { Point } from './plane.ts';

import { AGGRO_RANGE_FACTOR } from '../entities/bot-ai.ts';
import { Bot } from '../entities/units.ts';
import { TURN_SPEED_RADIANS_PER_SECOND } from '../shared/constants.ts';
import {
  add,
  cross,
  distance,
  distanceToSegment,
  EIGHTH_TURN,
  FULL_TURN,
  HALF,
  length,
  normalize,
  ORIGIN,
  pathLength,
  pointInPolygon,
  QUARTER_TURN,
  scale,
  segmentDistance,
  segmentsIntersect,
  signedArea,
  subtract,
  THREE_EIGHTHS_TURN
} from './plane.ts';

/** Plans a loop from its input and calls back with it, now or later. */
export type LoopPlanner = (input: PlanInput, answer: (plan: null | PlannedLoop) => void) => void;

/** Everything a loop plan reads, as plain data, so it can be planned in a worker. */
export interface PlanInput {
  /** The arena's centre. */
  readonly center: Point;
  readonly enemies: readonly EnemyModel[];
  readonly heading: number;
  /** The longest trail a loop may lay. */
  readonly maxTrail: number;
  /** The player's base. */
  readonly outline: readonly Point[];
  readonly position: Point;
  /** The arena's radius. */
  readonly radius: number;
  readonly spaceHeight: number;
  readonly spaceWidth: number;
  readonly speed: number;
}

/** A planned loop: its waypoints, and what it is checked against the units with until it leaves the base. */
export interface PlannedLoop {
  readonly check: LoopCheck;
  readonly waypoints: readonly Point[];
}

export interface Threat {
  readonly distance: number;
  readonly position: Point;
  /** The bot's state, such as `attack`, or `unit` for a unit that is not a bot. */
  readonly state: string;
}

/** What the debug overlay draws, in world coordinates. */
export interface WhiteboxDebug {
  /** The loop being flown, or `null` between loops. */
  readonly loop: null | readonly Point[];
  readonly phase: WhiteboxPhase;
  /** Where the pilot is heading. */
  readonly target: null | Point;
  /** The unit closest to the trail, and how far it is from it. */
  readonly threat: null | Threat;
}

/** What the pilot is doing, for the readout and the debug overlay. */
export type WhiteboxPhase = 'attack' | 'home' | 'out' | 'return' | 'sweep';

interface Candidate {
  /** What the loop is checked against the units with, again on every update until it leaves the base. */
  readonly check: LoopCheck;
  /** The cells the loop would take. */
  readonly gain: number;
  readonly score: number;
  readonly waypoints: readonly Point[];
}

/** The planner's answer, and which request it answers. */
interface PlanAnswer {
  readonly id: number;
  readonly plan: null | PlannedLoop;
}

interface Raster {
  readonly cellSize: number;
  readonly columns: number;
  readonly own: Uint8Array;
  readonly rows: number;
}

/** What one update knows about the player. */
interface Situation {
  readonly game: Game;
  readonly heading: number;
  readonly inBase: boolean;
  readonly outline: readonly Point[];
  readonly player: Unit;
  readonly position: Point;
  /** The trail's points, ending at the player. */
  readonly trail: readonly Point[];
}

/* eslint-disable no-magic-numbers -- the tuning constants: each is named by its declaration and its comment. */
/** The loop depths and widths tried, in world units. */
const DEPTHS: readonly number[] = [60, 110, 180, 260, 360, 480];
const WIDTHS: readonly number[] = [70, 140, 240, 360, 500, 700];
/** How many points of the base's outline are tried as the exit. */
const EXIT_SAMPLES = 72;
/** The raster cell sizes: a coarse one first, a fine one once the coarse one sees nothing left to take. */
const CELL_SIZES: readonly number[] = [20, 6];
/** A plan that would take fewer cells than this switches to the finer raster. */
const MIN_COARSE_GAIN_CELLS = 3;
/** Fixed cost of a loop in seconds: the turns and the time to get going. */
const LOOP_OVERHEAD_SECONDS = 0.6;
/**
 * The way across the base to the exit weighs this much more than the loop itself: the units move while the player crosses,
 * so a far exit is often dropped on the way, and an exit near the player is planned again less often.
 */
const TRANSIT_WEIGHT = 4;
/** A loop's trail stays this far under the length at which the nearest bot starts hunting the trail. */
const TRAIL_LENGTH_SHARE = 0.85;
/** At planning, every unit must be at least this share of the loop's length away from it, plus the margin. */
const PLAN_THREAT_SHARE = 0.6;
const PLAN_THREAT_MARGIN = 40;
/** A hunting unit must be farther from each point of a loop than this share of the trail still to lay from there; a passive bot than the second. */
const HUNTER_REACH_SHARE = 1;
const PASSIVE_REACH_SHARE_PLAN = 0.5;
/** However small the loop, no hunting unit may be closer to it than this. */
const HUNTER_MIN_DISTANCE = 200;
/** A bot that would lose the race home must still be this share of the loop's length away, against a stray crossing. */
const PLAN_STRAY_SHARE = 0.15;
/** A bot that is not hunting must be beyond its trigger distance plus this share of the loop's length. */
const PLAN_PASSIVE_SHARE = 0.2;
/** ...plus this share again for a bot heading straight at it. */
const PLAN_CLOSING_SHARE = 0.5;
/** World units added to a bounding-circle test, far more than its rounding can be off by. */
const BOUND_SLACK = 1;
/** A bot this close to its trigger distance is treated as hunting already. */
const TRIGGER_MARGIN = 30;
/** A bot whose heading passes this close to the trail is treated as hunting. */
const HEADING_CLEARANCE = 12;
/** In flight, the pilot heads home once a unit is closer to the trail than this factor of the way home, plus the margin. */
const FLIGHT_THREAT_FACTOR = 1.8;
const FLIGHT_THREAT_MARGIN = 40;
/** A waypoint closer than this share of the turning radius to the centre of the unit's turn counts as passed. */
const TURN_CIRCLE_SHARE = 0.95;
/** A waypoint is reached within this distance. */
const WAYPOINT_REACHED = 10;
/** A waypoint beyond the wall is reached once the unit is this close to it and pressed against the wall. */
const WALL_WAYPOINT_REACHED = 45;
const WALL_CONTACT = 1.5;
/**
 * Where a loop meets the wall, its waypoint sits this far inside the wall; a negative margin puts it past the wall, so the
 * player is pressed against it and the loop takes the ring along the wall too. Pressed against the wall, a turn through
 * the outward normal would fold the slide back onto the trail's last segment, a death by the wall, so every steer goes
 * through {@link guardWallTurn}.
 */
const WALL_MARGIN = -20;
/** Pressed against the wall, a slide that must not reverse keeps the heading this far from the outward normal. */
const WALL_HOLD_ANGLE = 0.3;
/** Spacing of the waypoints that follow the wall's arc. */
const WALL_ARC_STEP = 40;
/** The return aims this far past the base's edge, so it crosses into the base. */
const RETURN_OVERSHOOT = 15;
/** How many of the nearest base points are tried as the way home. */
const RETURN_CANDIDATES = 40;
/** The way home is chosen again every this many updates. */
const RETURN_REPLAN_UPDATES = 12;
/** A jump of this many units between two updates is a respawn or a restored checkpoint: the plan is dropped. */
const TELEPORT_DISTANCE = 30;
/** The exit is taken from a point this far inside the base. */
const EXIT_INSET = 3;
/** The simulated way home: its step, how close it must get, how long it may take and how far from the trail it keeps. */
const SIMULATION_STEP_SECONDS = 1 / 60;
const SIMULATION_ARRIVAL = 4;
const SIMULATION_MAX_STEPS = 900;
const SIMULATION_CLEARANCE = 5;
/** With no straight way home, the escape swings out this far, at these angles from the heading, first. */
const SWING_DISTANCE = 45;
const SWING_ANGLES: readonly number[] = [Math.PI * HALF, -Math.PI * HALF, EIGHTH_TURN, -EIGHTH_TURN, THREE_EIGHTHS_TURN, -THREE_EIGHTHS_TURN];
const SWING_CANDIDATES = 12;
/** The swing follows the wall when the player is within this many wall-contact distances of it. */
const WALL_SWING_CONTACT_FACTOR = 4;
/** A passive bot moving toward the trail at least this fast (cosine) is treated as hunting... */
const APPROACH_COSINE = 0.3;
/**
 * ...but only within this share of a hunter's reach: it is not aiming at the trail, and a bot drawing its own loop turns
 * often. At the full reach this rule made every second loop turn home early (2026-10-22).
 */
const APPROACH_REACH_SHARE = 0.75;
/** A passive bot moving away is a danger only within this share of the reach, or near its trigger distance. */
const PASSIVE_REACH_SHARE = 0.5;
/** Near its start the simulated way ignores the trail segments next to the player, which it is still on. */
const SIMULATION_GRACE_RADIUS = 6;
/** A simulated loop may fly this many steps, out and home. */
const LOOP_SIMULATION_MAX_STEPS = 1500;
/** A simulated loop records its own trail every this many steps, and the latest few points are not obstacles yet. */
const SELF_SAMPLE_STEPS = 4;
const SELF_GRACE_SAMPLES = 5;
/** After a plan finds no safe loop, the next one waits this many updates. */
const PLAN_RETRY_UPDATES = 15;
/** How far ahead the hold circle aims. */
const HOLD_RADIUS = 20;
/** The outline is resampled at this spacing for exits and peel loops. */
const RING_SPACING = 25;
/** Peel loops: their depths, their spans along the outline, and every how many ring points they place a waypoint. */
const PEEL_DEPTHS: readonly number[] = [35, 60, 90, 130, 180];
const PEEL_SPANS: readonly number[] = [150, 300, 500, 750, 1000];
const PEEL_WAYPOINT_STRIDE = 2;
/** Where across its band a peel loop's gain is sampled. */
const PEEL_ESTIMATE_SHARES: readonly number[] = [0.25, 0.75];
/** A loop is checked against the units at points this far apart. */
const ROUTE_SAMPLE_SPACING = 20;
/** How many of the best estimated loops get their gain counted exactly. */
const EXACT_CANDIDATES = 40;
/** How many of the best loops are flown in simulation before one is taken. */
const VERIFIED_CANDIDATES = 12;
/** An enemy's trail is cut only within this distance. */
const ATTACK_RANGE = 320;
/** The wall sweep starts once the player holds this share of the arena, with no other unit this close. */
const SWEEP_PERCENT = 0.99;
const SWEEP_CLEARANCE = 300;
/** It aims this far ahead along the wall and this far past it, so the player stays pressed against it. */
const SWEEP_LEAD = 60;
const SWEEP_PUSH = 20;
/** A sweep whose trail grows longer than this ends, and the player goes home. */
const SWEEP_MAX_TRAIL = 400;
/** After a lap, the loops get this many updates before the next sweep. */
const SWEEP_COOLDOWN_UPDATES = 1800;
/** A trail through the player's own base is cut only at points at least this far inside it, so the turn there stays inside. */
const HOME_CUT_DEPTH = 30;
/** A trail through the player's own base is cut within this distance. */
const ATTACK_RANGE_AT_HOME = 700;
/** The pilot must reach the trail in this share of the time its owner needs to get home, less the margin. */
const ATTACK_TIME_SHARE = 0.8;
const ATTACK_MARGIN_SECONDS = 0.25;
/** The cut aims this far past the trail point, so the player crosses the trail. */
const ATTACK_OVERSHOOT = 15;
/** Other units must be this much farther from the way to the cut than the cut is, plus the margin. */
const ATTACK_THREAT_FACTOR = 1;
const ATTACK_THREAT_MARGIN = 40;
/** The quadratic formula's 2 and 4, and the scanline crossings that bound each span inside a polygon. */
const QUADRATIC_TWO = 2;
const QUADRATIC_FOUR = 4;
const CROSSINGS_PER_SPAN = 2;
/** Both ways along a tangent. */
const SIDES: readonly number[] = [1, -1];
/* eslint-enable no-magic-numbers -- end of the tuning constants. */

interface ApproachParams {
  readonly center: Point;
  readonly heading: number;
  /** How many steps the flight may take. */
  readonly maxSteps?: number;
  /** The points to fly through, in order. */
  readonly path: readonly Point[];
  readonly position: Point;
  readonly radius: number;
  readonly speed: number;
  /** The base the flight must stay inside until it reaches its first point, the exit; none for a way home. */
  readonly staysInside?: readonly Point[];
  /** Whether the flight lays a trail of its own that it must not cross either. */
  readonly trackSelf?: boolean;
  readonly trail: readonly Point[];
}

interface EnemyModel {
  /** Where it is heading, in radians. */
  readonly direction: number;
  readonly hunting: boolean;
  readonly position: Point;
  readonly trigger: number;
}

interface Estimate {
  readonly check: LoopCheck;
  /** Whether {@link Estimate.gain} is exact rather than estimated. */
  readonly exact: boolean;
  readonly gain: number;
  readonly seconds: number;
  readonly shape: readonly Point[];
  readonly waypoints: readonly Point[];
}

/** A trail point the player can cut from its base, how far it is and how soon it is reached. */
interface HomeVictim {
  readonly point: Point;
  readonly reach: number;
  readonly seconds: number;
}

/** A planned loop's points, how far from home it gets and its trail length, which its safety is judged by. */
interface LoopCheck {
  /** The centre of the samples' bounding circle, so a unit far from the whole loop is ruled out without a pass. */
  readonly center: Point;
  readonly exposure: number;
  /** The largest of {@link LoopCheck.remaining}. */
  readonly maxRemaining: number;
  /** For each sample, the length of trail still to lay from there until the player is home. */
  readonly remaining: readonly number[];
  readonly samples: readonly Point[];
  /** The radius of the samples' bounding circle around {@link LoopCheck.center}. */
  readonly spread: number;
  readonly trailLength: number;
}

/** A unit as the planner weighs it. */
/** A loop: where it leaves the base, its route past there, and the shape it encloses. */
interface LoopShape {
  readonly exit: Point;
  readonly route: readonly Point[];
  readonly shape: readonly Point[];
}

/** A peel loop's route past the exit and the shape it encloses. */
interface PeelLoop {
  readonly route: Point[];
  readonly shape: Point[];
}

/** What a plan weighs every loop with. */
interface PlanContext {
  readonly center: Point;
  readonly enemies: readonly EnemyModel[];
  readonly field: Float32Array;
  readonly maxTrail: number;
  readonly orientation: number;
  readonly outline: readonly Point[];
  readonly position: Point;
  readonly radius: number;
  readonly raster: Raster;
  readonly ring: readonly RingPoint[];
  readonly speed: number;
}

interface RingPoint {
  /** The outward normal. */
  readonly normal: Point;
  readonly point: Point;
}

/** A wall sweep under way. */
interface SweepState {
  /** The player's angle around the arena's centre at the last update. */
  lastAngle: number;
  /** How far round the arena the sweep has gone, in radians. */
  turned: number;
}

/** A unit whose trail the pilot can cut, and how soon. */
interface VictimChoice {
  /** Whether its trail runs through or right along the player's base, which outranks any other victim. */
  readonly home: boolean;
  readonly seconds: number;
  readonly unit: Unit;
}

/** Why the pilot cuts its victim's trail, which decides where it may follow it. */
type VictimMode = 'chase' | 'home' | 'surround';

/** A way home that the simulation approved, and how long it is. */
interface WayHome {
  readonly length: number;
  readonly path: Point[];
}

/**
 * The whitebox pilot. Call {@link WhiteboxPilot.steer} before every update; it returns the direction to steer, or
 * `null` when there is no player to fly.
 */
export class WhiteboxPilot {
  /**
   * Plans loops somewhere else, a worker in a live game, so a plan never holds up a frame; `null` plans them right here,
   * in the update that needs one, as the benchmark does.
   */
  public planner: LoopPlanner | null = null;
  /** Counts of what the pilot decided, for the benchmark's report. */
  public readonly stats = { aborts: 0, attacks: 0, attackUpdates: 0, holdUpdates: 0, homeUpdates: 0, loops: 0, outUpdates: 0, replans: 0, returnUpdates: 0, surrounds: 0, sweepUpdates: 0, victimsInRange: 0, victimsTooFar: 0, victimsUnsafe: 0 };

  public get debug(): WhiteboxDebug {
    return { loop: this.loop, phase: this.phase, target: this.target, threat: this.threat };
  }

  private lastPosition: null | Point = null;
  private loop: null | readonly Point[] = null;
  private loopCheck: LoopCheck | null = null;
  private phase: WhiteboxPhase = 'home';
  /** The planner's last answer, and which request it answers. */
  private planAnswer: null | PlanAnswer = null;
  /** Updates to wait before planning again after a plan found no safe loop. */
  private planCooldown = 0;
  /** The update that last waited for a plan. */
  private planLastAskedUpdate = -1;
  /** The request the pilot waits for, or `null`. */
  private planPending: null | number = null;
  private planRequests = 0;
  private returnPath: Point[] = [];
  private returnUpdates = 0;
  /** The wall sweep under way: the player's last angle around the centre and how far round it has gone. */
  private sweep: null | SweepState = null;
  /** Updates to wait before the next wall sweep. */
  private sweepCooldown = 0;
  private target: null | Point = null;
  private threat: null | Threat = null;
  /** How many times {@link WhiteboxPilot.steer} ran. */
  private updates = 0;
  private victim: null | Unit = null;
  /**
   * Why the victim was chosen: `home` for a trail through the base, which is then cut only inside the base;
   * `surround` for a unit whose capture is about to close around the player in its base, cut wherever is nearest.
   */
  private victimMode: VictimMode = 'chase';
  private waypointIndex = 0;

  /** Drops the plan, so the next update plans again from wherever the player is. */
  public reset(): void {
    this.phase = 'home';
    this.loop = null;
    this.waypointIndex = 0;
    this.target = null;
    this.victim = null;
    this.returnPath = [];
    this.planPending = null;
    this.planAnswer = null;
  }

  public steer(game: Game): null | Point {
    this.updates++;
    const player = game.player;
    if (!player || player.death) {
      this.reset();
      this.lastPosition = null;
      return null;
    }
    const position = toPoint(player.position);
    if (this.lastPosition && distance(this.lastPosition, position) > TELEPORT_DISTANCE) {
      this.reset();
    }
    this.lastPosition = position;
    const trail = player.track.simplyline.map(toPoint);
    trail.push(position);
    const situation: Situation = {
      game,
      heading: player.direction,
      inBase: player.in === player.base,
      outline: player.base.polygon.simplify.map(toPoint),
      player,
      position,
      trail
    };
    if (situation.inBase && (this.phase === 'out' || this.phase === 'return')) {
      this.reset();
    }
    // A cut from home never follows its trail out of the base: out there the player has a trail of its own to lose.
    if (this.phase === 'attack' && (!this.isVictimValid() || (this.victimMode === 'home' && !situation.inBase))) {
      this.victim = null;
      this.phase = situation.inBase ? 'home' : 'return';
      this.loop = null;
    }
    if (this.phase === 'home' || this.phase === 'out') {
      this.lookForVictim(situation);
    }
    if (!situation.inBase) {
      this.checkThreats(situation);
    }
    if (situation.inBase) {
      this.lookForCaptureAroundPlayer(situation);
    }
    this.target = this.sweepOrChooseTarget(situation);
    this.stats[`${this.phase}Updates`]++;
    if (this.phase === 'home' && !this.loop) {
      this.stats.holdUpdates++;
    }
    if (!this.target) {
      return null;
    }
    const wanted = Math.atan2(this.target.y - position.y, this.target.x - position.x);
    const steered = guardWallTurn(position, situation.heading, wanted, toPoint(game.border.center), game.border.radius);
    return { x: Math.cos(steered), y: Math.sin(steered) };
  }

  private attackTarget(situation: Situation, victim: Unit): null | Point {
    const { inBase, position } = situation;
    const trailPoints = victim.track.simplyline.map(toPoint);
    if (this.victimMode === 'surround') {
      // Every moment counts: the nearest point of the trail, inside the base or not.
      const point = nearestPoint(position, samplePath(trailPoints, ROUTE_SAMPLE_SPACING));
      return point ? add(point, scale(normalize(subtract(point, position)), ATTACK_OVERSHOOT)) : null;
    }
    const home = inBase ? homeVictimPoint(situation, samplePath(trailPoints, ROUTE_SAMPLE_SPACING))?.point ?? null : null;
    // A cut chosen from home is never chased outside: out there its victim, which is no threat while it is the victim, can cut the player.
    const point = this.victimMode === 'home' ? home : home ?? nearestPoint(position, trailPoints);
    if (!point) {
      return null;
    }
    const past = add(point, scale(normalize(subtract(point, position)), ATTACK_OVERSHOOT));
    // A cut from home aims past the trail only as far as the base reaches, so the player does not slip out of it there.
    return this.victimMode === 'home' && !pointInPolygon(past, situation.outline) ? point : past;
  }

  /**
   * How soon the player can cut a unit's trail out in the open: in range, before the unit is home, and with no other
   * unit near the way there.
   *
   * @param situation - What the update knows.
   * @param unit - The trail's owner.
   * @param trailPoints - The trail's points.
   * @returns The seconds to the trail, or `null` when it is not worth the chase.
   */
  private chaseSeconds(situation: Situation, unit: Unit, trailPoints: readonly Point[]): null | number {
    const { game, heading, inBase, outline, player, position } = situation;
    const speed = game.config.unitSpeed;
    const point = nearestPoint(position, trailPoints);
    if (!point) {
      return null;
    }
    const reach = distance(position, point);
    if (reach > ATTACK_RANGE) {
      return null;
    }
    this.stats.victimsInRange++;
    const turn = Math.abs(angleDifference(Math.atan2(point.y - position.y, point.x - position.x), heading));
    const seconds = reach / speed + turn / TURN_SPEED_RADIANS_PER_SECOND;
    if (!reachesInTime(seconds, unit, speed)) {
      this.stats.victimsTooFar++;
      return null;
    }
    const safe = (inBase && pointInPolygon(point, outline))
      || game.units.every((other) => other === player || other === unit || other.death || distanceToSegment(toPoint(other.position), position, point) > reach * ATTACK_THREAT_FACTOR + ATTACK_THREAT_MARGIN);
    if (!safe) {
      this.stats.victimsUnsafe++;
      return null;
    }
    return seconds;
  }

  private checkThreats(situation: Situation): void {
    const { game, player, trail } = situation;
    const homePoint = nearestPoint(situation.position, situation.outline);
    const home = homePoint ? distance(homePoint, situation.position) : 0;
    const turn = homePoint ? Math.abs(angleDifference(Math.atan2(homePoint.y - situation.position.y, homePoint.x - situation.position.x), situation.heading)) : 0;
    const reach = (home + turn / TURN_SPEED_RADIANS_PER_SECOND * game.config.unitSpeed) * FLIGHT_THREAT_FACTOR + FLIGHT_THREAT_MARGIN;
    let closest: null | Threat = null;
    let danger = false;
    for (const unit of game.units) {
      // Only a victim chased out in the open is busy getting home; one cut from the base can turn on the player's trail.
      if (unit === player || (unit === this.victim && this.victimMode === 'chase') || unit.death) {
        continue;
      }
      const unitPosition = toPoint(unit.position);
      let nearest = Infinity;
      for (const point of trail) {
        nearest = Math.min(nearest, distance(unitPosition, point));
      }
      if (!closest || nearest < closest.distance) {
        closest = { distance: nearest, position: unitPosition, state: unit.fsm?.state ?? 'unit' };
      }
      danger ||= isDangerous(unit, player, nearest, reach, trail);
    }
    this.threat = closest;
    if (this.phase === 'return' || !closest) {
      return;
    }
    if (danger) {
      this.phase = 'return';
      this.victim = null;
      this.returnPath = [];
      this.stats.aborts++;
    }
  }

  private chooseTarget(situation: Situation): null | Point {
    const { inBase } = situation;
    if (this.phase === 'attack' && this.victim) {
      const target = this.attackTarget(situation, this.victim);
      if (target) {
        return target;
      }
      this.victim = null;
      this.phase = inBase ? 'home' : 'return';
      this.loop = null;
    }
    if (this.phase === 'home' || this.phase === 'out') {
      const target = this.loopTarget(situation);
      if (target || inBase) {
        return target;
      }
      this.phase = 'return';
    }
    return this.phase === 'return' ? this.returnTarget(situation) : null;
  }

  private isLoopStillSafe(situation: Situation, check: LoopCheck): boolean {
    const { game, player } = situation;
    return !game.units.some((unit) => unit !== player && !unit.death && threatens(describeEnemy(unit, player), check));
  }

  private isVictimValid(): boolean {
    const victim = this.victim;
    return victim !== null && !victim.death && victim.in !== victim.base && victim.track.simplyline.length > 0;
  }

  /**
   * When the player, in its base, stands in ground a unit's trail is about to close around, which would kill it there,
   * that unit becomes the victim, whatever the player was doing: getting out of that ground means crossing the trail
   * anyway, so the nearest point of the trail is the quickest way out and ends the capture too.
   *
   * @param situation - What the update knows.
   */
  private lookForCaptureAroundPlayer(situation: Situation): void {
    const { game, player, position } = situation;
    if (this.phase === 'attack' && this.victimMode === 'surround') {
      return;
    }
    let best: null | Unit = null;
    let bestReach = Infinity;
    for (const unit of game.units) {
      const capture = unit === player ? null : pendingCapture(unit);
      if (!capture || !pointInPolygon(position, capture)) {
        continue;
      }
      const reach = nearestDistance(position, unit.track.simplyline.map(toPoint));
      if (reach < bestReach) {
        best = unit;
        bestReach = reach;
      }
    }
    if (best) {
      this.victim = best;
      this.victimMode = 'surround';
      this.phase = 'attack';
      this.loop = null;
      this.stats.surrounds++;
    }
  }

  private lookForVictim(situation: Situation): void {
    const { game, inBase, player } = situation;
    let best: null | VictimChoice = null;
    for (const unit of game.units) {
      if (unit === player || unit.death || unit.in === unit.base) {
        continue;
      }
      const trailPoints = unit.track.simplyline.map(toPoint);
      if (inBase) {
        // A trail run through the player's own base is about to take ground from it, and cutting it costs the player no
        // time outside: the nearest such trail is cut first.
        const home = homeVictimPoint(situation, samplePath(trailPoints, ROUTE_SAMPLE_SPACING));
        if (home && (!best || !best.home || home.seconds < best.seconds)) {
          best = { home: true, seconds: home.seconds, unit };
        }
        if (best?.home) {
          continue;
        }
      }
      const seconds = this.chaseSeconds(situation, unit, trailPoints);
      if (seconds !== null && (!best || seconds < best.seconds)) {
        best = { home: false, seconds, unit };
      }
    }
    if (best) {
      this.victim = best.unit;
      this.victimMode = best.home ? 'home' : 'chase';
      this.phase = 'attack';
      this.stats.attacks++;
    }
  }

  /**
   * The next point of the loop, planning one first when there is none, or a point to wait at inside the base when no
   * loop is safe. `null` outside the base means the loop is flown: the way home is next.
   *
   * @param situation - What the update knows.
   * @returns The point to steer at.
   */
  private loopTarget(situation: Situation): null | Point {
    const { inBase } = situation;
    if (this.phase === 'home' && inBase && this.loop && this.loopCheck && !this.isLoopStillSafe(situation, this.loopCheck)) {
      // The units moved while the player crossed its base: the loop is planned again from here.
      this.loop = null;
      this.planCooldown = 0;
      this.stats.replans++;
    }
    if (this.phase === 'home' && !this.loop && --this.planCooldown <= 0) {
      // A plan still out (`null`) is looked for again on the next update.
      this.planCooldown = this.planLoop(situation) === false ? PLAN_RETRY_UPDATES : 0;
    }
    if (!this.loop) {
      return inBase ? holdTarget(situation) : null;
    }
    const waypoint = this.nextWaypoint(situation, this.loop);
    if (waypoint && !inBase) {
      this.phase = 'out';
    }
    if (!waypoint && inBase) {
      this.loop = null;
    }
    return waypoint;
  }

  private nextWaypoint(situation: Situation, loop: readonly Point[]): null | Point {
    const { game, position } = situation;
    const center = toPoint(game.border.center);
    const radius = game.border.radius;
    while (this.waypointIndex < loop.length) {
      const waypoint = loop[this.waypointIndex] ?? position;
      if (isReached(position, situation.heading, waypoint, false, center, radius, game.config.unitSpeed)) {
        this.waypointIndex++;
        continue;
      }
      return waypoint;
    }
    return null;
  }

  /**
   * Plans the next loop, or asks {@link WhiteboxPilot.planner} for one and holds until it answers.
   *
   * @param situation - What the update knows.
   * @returns Whether a loop was found; `null` while an asked plan is still out.
   */
  private planLoop(situation: Situation): boolean | null {
    if (!this.planner) {
      return this.takePlan(findLoop(describePlan(situation)));
    }
    // An answer counts only while the pilot kept waiting for it, update after update; anything else in between (an
    // attack, a reset) makes the plan stale, and a fresh one is asked for.
    if (this.planLastAskedUpdate !== this.updates - 1) {
      this.planPending = null;
    }
    this.planLastAskedUpdate = this.updates;
    const answer = this.planAnswer;
    if (answer?.id === this.planPending) {
      this.planPending = null;
      this.planAnswer = null;
      return this.takePlan(answer.plan);
    }
    if (this.planPending === null) {
      const id = ++this.planRequests;
      this.planPending = id;
      this.planner(describePlan(situation), (plan) => {
        this.planAnswer = { id, plan };
      });
    }
    return null;
  }

  private returnTarget(situation: Situation): null | Point {
    const { game, position } = situation;
    if (this.returnPath.length === 0 || --this.returnUpdates <= 0) {
      this.returnPath = findWayHome(situation);
      this.returnUpdates = RETURN_REPLAN_UPDATES;
    }
    const center = toPoint(game.border.center);
    while (this.returnPath.length > 1 && isReached(position, situation.heading, this.returnPath[0] ?? position, false, center, game.border.radius, game.config.unitSpeed)) {
      this.returnPath.shift();
    }
    return this.returnPath[0] ?? null;
  }

  /**
   * The wall sweep's target when one is due, otherwise whatever the phase calls for.
   *
   * @param situation - What the update knows.
   * @returns The point to steer at.
   */
  private sweepOrChooseTarget(situation: Situation): null | Point {
    const sweep = this.phase === 'attack' || this.phase === 'return' ? null : this.sweepTarget(situation);
    if (sweep) {
      this.phase = 'sweep';
      this.loop = null;
      return sweep;
    }
    if (this.phase === 'sweep') {
      this.phase = situation.inBase ? 'home' : 'return';
    }
    return this.chooseTarget(situation);
  }

  /**
   * The endgame's wall sweep. Once nearly all of the arena is the player's, what is left is mostly slivers against the
   * wall, and a loop that turns into the wall leaves a new wedge between its arc and the wall wherever it does. So with
   * no other unit near, the player slides along the wall all the way round, pressed against it, and each sliver it
   * passes closes along the wall itself. A sweep lasts a lap; the loops then get their turn again for a while.
   *
   * @param situation - What the update knows.
   * @returns The point to steer at, past the wall ahead, or `null` when no sweep is due.
   */
  private sweepTarget(situation: Situation): null | Point {
    const { game, player, position } = situation;
    if (this.sweepCooldown > 0) {
      this.sweepCooldown--;
      return null;
    }
    if (player.percent < SWEEP_PERCENT || game.units.some((unit) => unit !== player && !unit.death && distance(toPoint(unit.position), position) < SWEEP_CLEARANCE)) {
      this.sweep = null;
      return null;
    }
    const center = toPoint(game.border.center);
    const radius = game.border.radius;
    const angle = Math.atan2(position.y - center.y, position.x - center.x);
    if (this.sweep) {
      this.sweep.turned += Math.abs(angleDifference(angle, this.sweep.lastAngle));
      this.sweep.lastAngle = angle;
    } else {
      this.sweep = { lastAngle: angle, turned: 0 };
    }
    // Sliding over ground that is not the player's yet lays a trail along the wall; a long one is cut short and taken home.
    if (this.sweep.turned > FULL_TURN || (!situation.inBase && player.track.length > SWEEP_MAX_TRAIL)) {
      this.sweep = null;
      this.sweepCooldown = SWEEP_COOLDOWN_UPDATES;
      return null;
    }
    const ahead = angle + SWEEP_LEAD / radius;
    return add(center, scale({ x: Math.cos(ahead), y: Math.sin(ahead) }, radius + SWEEP_PUSH));
  }

  private takePlan(plan: null | PlannedLoop): boolean {
    this.loop = plan?.waypoints ?? null;
    this.loopCheck = plan?.check ?? null;
    this.waypointIndex = 0;
    if (plan) {
      this.stats.loops++;
    }
    return plan !== null;
  }
}

/**
 * Plans the next loop: every loop out of the base is weighed, coarsely first, and the best few are flown in simulation.
 * It reads only its input, so a worker can run it.
 *
 * @param input - What the plan reads.
 * @returns The loop, or `null` when none is safe.
 */
export function findLoop(input: PlanInput): null | PlannedLoop {
  const { outline, position } = input;
  const orientation = Math.sign(signedArea(outline)) || 1;
  const base = {
    center: input.center,
    enemies: input.enemies,
    maxTrail: input.maxTrail,
    orientation,
    outline,
    position,
    radius: input.radius,
    ring: resampleRing(outline, RING_SPACING, orientation),
    speed: input.speed
  };
  let best: Candidate | null = null;
  for (const cellSize of CELL_SIZES) {
    const raster = rasterize(outline, input.spaceWidth, input.spaceHeight, cellSize);
    const context: PlanContext = { ...base, field: distanceField(raster), raster };
    const candidates = rankCandidates(context, collectEstimates(context));
    // The best few are flown in simulation, out and home, and the first that never touches its own trail is taken.
    best = candidates.slice(0, VERIFIED_CANDIDATES).find((candidate) => candidate.gain > 0 && isFlyable(position, input.heading, candidate.waypoints, outline, base.center, base.radius, base.speed)) ?? null;
    if (best && best.gain >= MIN_COARSE_GAIN_CELLS) {
      break;
    }
  }
  return best ? { check: best.check, waypoints: best.waypoints } : null;
}

/**
 * The direction to steer at instead of `wanted`, so that near the wall the heading never swings through the wall's
 * outward normal. The engine turns the shortest way, and pressed against the wall a heading that crosses the outward
 * normal reverses the slide, straight back over the trail just laid: the unit dies by the wall. Such a turn is made the
 * long way round instead, through the inward side, by steering at most three eighths of a turn from the heading.
 *
 * @param position - The unit.
 * @param heading - Its heading, in radians.
 * @param wanted - The direction it should turn to, in radians.
 * @param center - The arena's centre.
 * @param radius - The arena's radius.
 * @returns The direction to steer at, in radians.
 */
export function guardWallTurn(position: Point, heading: number, wanted: number, center: Point, radius: number): number {
  if (distance(position, center) < radius - WALL_CONTACT) {
    return wanted;
  }
  const outward = Math.atan2(position.y - center.y, position.x - center.x);
  const from = angleDifference(heading, outward);
  const turn = angleDifference(wanted, heading);
  const to = from + turn;
  if (from === 0 || Math.sign(from) === Math.sign(to) || Math.abs(to) >= Math.PI) {
    return wanted;
  }
  if (Math.abs(to) <= QUARTER_TURN) {
    // The target lies back along the wall: the slide carries on forward instead, still pressed against the wall.
    return outward + Math.sign(from) * WALL_HOLD_ANGLE;
  }
  const longWay = turn - Math.sign(turn) * FULL_TURN;
  return heading + Math.sign(longWay) * Math.min(Math.abs(longWay), THREE_EIGHTHS_TURN);
}

/**
 * How close a bot must get to the player's trail before it starts hunting it, as the engine's `isPlayerTrailInRange`
 * measures it.
 *
 * @param unit - The bot.
 * @param player - The player.
 * @returns The distance; 0 for a unit that is not a bot.
 */
function aggroRange(unit: Unit, player: Unit): number {
  return unit instanceof Bot ? Math.max(unit.vrange, player.vrange) * unit.aggro * AGGRO_RANGE_FACTOR : 0;
}

function angleDifference(a: number, b: number): number {
  let difference = (a - b) % FULL_TURN;
  if (difference > Math.PI) {
    difference -= FULL_TURN;
  } else if (difference < -Math.PI) {
    difference += FULL_TURN;
  }
  return difference;
}

/**
 * Where the way from `from` to `to` meets the wall, pushed just past it, so the unit is pressed against the wall there;
 * `to` itself when the way stays inside.
 *
 * @param from - A point inside the arena.
 * @param to - Where the way heads.
 * @param center - The arena's centre.
 * @param radius - The arena's radius.
 * @returns The point.
 */
function clampToWall(from: Point, to: Point, center: Point, radius: number): Point {
  if (distance(to, center) <= radius - WALL_MARGIN) {
    return to;
  }
  const direction = subtract(to, from);
  const offset = subtract(from, center);
  const a = direction.x * direction.x + direction.y * direction.y;
  const b = QUADRATIC_TWO * (offset.x * direction.x + offset.y * direction.y);
  const c = offset.x * offset.x + offset.y * offset.y - radius * radius;
  const root = Math.sqrt(Math.max(0, b * b - QUADRATIC_FOUR * a * c));
  const t = a > 0 ? Math.max(0, Math.min(1, (-b + root) / (QUADRATIC_TWO * a))) : 0;
  const hit = add(from, scale(direction, t));
  return add(center, scale(normalize(subtract(hit, center)), radius - WALL_MARGIN));
}

/**
 * Every loop worth weighing: a rectangle and a peel loop of each size from each sampled exit, each kept only when no unit
 * makes it unsafe, with its gain counted exactly (rectangles) or estimated (peel loops).
 *
 * @param context - The plan's inputs.
 * @returns The loops, unranked.
 */
function collectEstimates(context: PlanContext): Estimate[] {
  const { center, orientation, outline, position, radius, ring } = context;
  const estimates: Estimate[] = [];
  const step = Math.max(1, Math.floor(ring.length / EXIT_SAMPLES));
  for (let index = 0; index < ring.length; index += step) {
    const { normal, point: exit } = ring[index] ?? { normal: ORIGIN, point: position };
    if (!isClearOfPolygon(position, subtract(exit, scale(normal, EXIT_INSET)), outline)) {
      continue;
    }
    const tangent = { x: -normal.y * orientation, y: normal.x * orientation };
    for (const depth of DEPTHS) {
      for (const width of WIDTHS) {
        for (const side of SIDES) {
          const lateral = scale(tangent, side * width);
          const corner = add(exit, scale(normal, depth));
          const far = add(corner, lateral);
          considerLoop(context, estimates, { exit, route: wallPath(exit, corner, far, center, radius), shape: [exit, corner, far, add(exit, lateral)] }, null);
        }
      }
    }
    for (const depth of PEEL_DEPTHS) {
      for (const span of PEEL_SPANS) {
        for (const direction of SIDES) {
          const steps = Math.round(span / RING_SPACING);
          const peel = peelLoop(ring, index, direction, depth, steps, center, radius);
          if (peel) {
            considerLoop(context, estimates, { exit, route: peel.route, shape: peel.shape }, estimatePeelGain(ring, index, direction, depth, steps, context.raster, center, radius));
          }
        }
      }
    }
  }
  return estimates;
}

/**
 * Weighs one loop: too long a trail or a unit that makes it unsafe drops it; otherwise it joins the estimates with what
 * it takes and how long it lasts.
 *
 * @param context - The plan's inputs.
 * @param estimates - Where a loop worth keeping goes.
 * @param loop - The loop.
 * @param estimatedGain - Its estimated gain, or `null` to count it exactly.
 */
function considerLoop(context: PlanContext, estimates: Estimate[], loop: LoopShape, estimatedGain: null | number): void {
  const { center, enemies, field, maxTrail, position, radius, raster, speed } = context;
  const { exit, route, shape } = loop;
  const last = route[route.length - 1];
  if (!last) {
    return;
  }
  const trailLength = pathLength([exit, ...route]) + fieldAt(field, raster, last);
  if (trailLength > maxTrail) {
    return;
  }
  const exposure = farthestHome(route, field, raster) * FLIGHT_THREAT_FACTOR + FLIGHT_THREAT_MARGIN;
  const samples = samplePath([exit, ...route], ROUTE_SAMPLE_SPACING);
  const check = createLoopCheck(exposure, samples, remainingAlong(samples, trailLength), trailLength);
  if (enemies.some((enemy) => threatens(enemy, check))) {
    return;
  }
  // Crossing the base takes time and lets the units move under the plan, so it counts double.
  const seconds = (distance(position, exit) * TRANSIT_WEIGHT + trailLength) / speed + LOOP_OVERHEAD_SECONDS;
  const gain = estimatedGain ?? gainCells(shape, raster, center, radius);
  if (gain > 0) {
    estimates.push({ check, exact: estimatedGain === null, gain, seconds, shape, waypoints: [exit, ...route] });
  }
}

/**
 * A loop's check, with the bounding circle of its samples that lets {@link threatens} rule out a far unit at once.
 *
 * @param exposure - How close a hunter may get before the player cannot get home first.
 * @param samples - The loop's points.
 * @param remaining - For each sample, the trail still to lay from there.
 * @param trailLength - The loop's trail length.
 * @returns The check.
 */
function createLoopCheck(exposure: number, samples: readonly Point[], remaining: readonly number[], trailLength: number): LoopCheck {
  let sumX = 0;
  let sumY = 0;
  for (const sample of samples) {
    sumX += sample.x;
    sumY += sample.y;
  }
  const count = Math.max(1, samples.length);
  const center = { x: sumX / count, y: sumY / count };
  let spread = 0;
  for (const sample of samples) {
    spread = Math.max(spread, distance(center, sample));
  }
  let maxRemaining = 0;
  for (const value of remaining) {
    maxRemaining = Math.max(maxRemaining, value);
  }
  return { center, exposure, maxRemaining, remaining, samples, spread, trailLength };
}

function depthInside(point: Point, polygon: readonly Point[]): number {
  let depth = Infinity;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if (a && b) {
      depth = Math.min(depth, distanceToSegment(point, a, b));
    }
  }
  return depth;
}

/**
 * How the planner sees a unit: where it is, whether it hunts the trail already, and how close it must get before it
 * starts to.
 *
 * @param unit - The unit.
 * @param player - The player.
 * @returns The model.
 */
function describeEnemy(unit: Unit, player: Unit): EnemyModel {
  return { direction: unit.direction, hunting: isHunting(unit), position: toPoint(unit.position), trigger: aggroRange(unit, player) };
}

/**
 * How far a point is from a polygon's nearest edge.
 *
 * @param point - The point.
 * @param polygon - The polygon.
 * @returns The distance.
 */
/**
 * What a loop plan from this update reads.
 *
 * @param situation - What the update knows.
 * @returns The plan's input.
 */
function describePlan(situation: Situation): PlanInput {
  const { game, heading, outline, player, position } = situation;
  return {
    center: toPoint(game.border.center),
    enemies: game.units.filter((unit) => unit !== player && !unit.death).map((unit) => describeEnemy(unit, player)),
    heading,
    maxTrail: game.config.botAttackTrackLength * TRAIL_LENGTH_SHARE,
    outline,
    position,
    radius: game.border.radius,
    spaceHeight: game.space.height,
    spaceWidth: game.space.width,
    speed: game.config.unitSpeed
  };
}

/**
 * The distance from every cell to the nearest owned cell, by a two-pass chamfer transform.
 *
 * @param raster - The raster.
 * @returns The distances in world units, row by row.
 */
function distanceField(raster: Raster): Float32Array {
  const { cellSize, columns, own, rows } = raster;
  const field = new Float32Array(columns * rows);
  const diagonal = cellSize * Math.SQRT2;
  for (let index = 0; index < field.length; index++) {
    field[index] = own[index] ? 0 : Infinity;
  }
  function relax(row: number, column: number, neighbors: readonly (readonly [number, number, number])[]): void {
    const index = row * columns + column;
    let value = field[index] ?? Infinity;
    for (const [rowOffset, columnOffset, cost] of neighbors) {
      const neighborRow = row + rowOffset;
      const neighborColumn = column + columnOffset;
      if (neighborRow >= 0 && neighborRow < rows && neighborColumn >= 0 && neighborColumn < columns) {
        value = Math.min(value, (field[neighborRow * columns + neighborColumn] ?? Infinity) + cost);
      }
    }
    field[index] = value;
  }
  const forward: readonly (readonly [number, number, number])[] = [[0, -1, cellSize], [-1, -1, diagonal], [-1, 0, cellSize], [-1, 1, diagonal]];
  const backward: readonly (readonly [number, number, number])[] = [[0, 1, cellSize], [1, 1, diagonal], [1, 0, cellSize], [1, -1, diagonal]];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      relax(row, column, forward);
    }
  }
  for (let row = rows - 1; row >= 0; row--) {
    for (let column = columns - 1; column >= 0; column--) {
      relax(row, column, backward);
    }
  }
  return field;
}

/**
 * The cells a peel loop would take, estimated along the middle of the band it encloses.
 *
 * @param ring - The resampled outline.
 * @param start - The exit's index.
 * @param direction - Which way along the outline.
 * @param depth - The band's depth.
 * @param steps - How many ring points the band spans.
 * @param raster - The raster.
 * @param center - The arena's centre.
 * @param radius - The arena's radius.
 * @returns The estimated gain, in cells.
 */
function estimatePeelGain(ring: readonly RingPoint[], start: number, direction: number, depth: number, steps: number, raster: Raster, center: Point, radius: number): number {
  const { cellSize, columns, own, rows } = raster;
  let area = 0;
  for (let offset = 0; offset <= steps; offset++) {
    const ringPoint = ring[wrapIndex(start + direction * offset, ring.length)];
    if (!ringPoint) {
      continue;
    }
    for (const share of PEEL_ESTIMATE_SHARES) {
      const sample = add(ringPoint.point, scale(ringPoint.normal, depth * share));
      const column = Math.floor(sample.x / cellSize);
      const row = Math.floor(sample.y / cellSize);
      if (column < 0 || row < 0 || column >= columns || row >= rows || own[row * columns + column] || distance(sample, center) >= radius) {
        continue;
      }
      area += RING_SPACING * depth / PEEL_ESTIMATE_SHARES.length;
    }
  }
  return area / (cellSize * cellSize);
}

/**
 * The farthest the loop gets from the base, along its route.
 *
 * @param route - The loop's waypoints past the exit.
 * @param field - The distance field.
 * @param raster - The raster the field was taken on.
 * @returns The distance.
 */
function farthestHome(route: readonly Point[], field: Float32Array, raster: Raster): number {
  const { cellSize, columns, rows } = raster;
  let farthest = 0;
  for (let leg = 1; leg < route.length; leg++) {
    const from = route[leg - 1] ?? ORIGIN;
    const to = route[leg] ?? ORIGIN;
    const samples = Math.max(1, Math.ceil(distance(from, to) / cellSize));
    for (let index = 0; index <= samples; index++) {
      const point = add(from, scale(subtract(to, from), index / samples));
      const column = Math.min(columns - 1, Math.max(0, Math.floor(point.x / cellSize)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(point.y / cellSize)));
      farthest = Math.max(farthest, field[row * columns + column] ?? 0);
    }
  }
  return farthest;
}

function fieldAt(field: Float32Array, raster: Raster, point: Point): number {
  const { cellSize, columns, rows } = raster;
  const column = Math.min(columns - 1, Math.max(0, Math.floor(point.x / cellSize)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(point.y / cellSize)));
  return field[row * columns + column] ?? 0;
}

/**
 * The way home: of the base's nearest points, the one whose simulated approach (the player's speed and turn rate, the
 * wall's slide) reaches the base soonest without touching the trail.
 *
 * @param situation - What the update knows.
 * @returns The point to steer at.
 */
function findWayHome(situation: Situation): Point[] {
  const { game, heading, outline, position, trail } = situation;
  const center = toPoint(game.border.center);
  const radius = game.border.radius;
  const speed = game.config.unitSpeed;
  const sorted = outline.map((point) => ({ away: distance(point, position), point })).sort((a, b) => a.away - b.away).slice(0, RETURN_CANDIDATES);
  function aimPast(from: Point, point: Point): Point {
    const away = distance(from, point);
    return away < 1 ? point : add(from, scale(subtract(point, from), 1 + RETURN_OVERSHOOT / away));
  }
  // Ground another unit's capture is about to enclose is no home: the capture kills the player there.
  const captures = game.units.filter((unit) => unit !== situation.player).map(pendingCapture).filter((capture) => capture !== null);
  const free = sorted.filter(({ point }) => !captures.some((capture) => pointInPolygon(point, capture)));
  let best: null | WayHome = null;
  for (const { away, point } of free.length > 0 ? free : sorted) {
    if (best && away > best.length) {
      break;
    }
    const path = [aimPast(position, point)];
    const flown = simulateApproach({ center, heading, path, position, radius, speed, trail });
    if (flown !== null && (!best || flown < best.length)) {
      best = { length: flown, path };
    }
  }
  if (best) {
    return best.path;
  }
  // No straight way is clear: swing out to one side first, then home. Against the wall the swing follows the wall.
  const fromCenter = normalize(subtract(position, center));
  const vias = SWING_ANGLES.map((swing) => ({ x: position.x + Math.cos(heading + swing) * SWING_DISTANCE, y: position.y + Math.sin(heading + swing) * SWING_DISTANCE }));
  if (distance(position, center) > radius - WALL_CONTACT * WALL_SWING_CONTACT_FACTOR) {
    for (const side of [1, -1]) {
      vias.push(add(position, scale({ x: -fromCenter.y * side, y: fromCenter.x * side }, SWING_DISTANCE)));
    }
  }
  for (const via of vias) {
    for (const { point } of sorted.slice(0, SWING_CANDIDATES)) {
      const path = [via, aimPast(via, point)];
      const flown = simulateApproach({ center, heading, path, position, radius, speed, trail });
      if (flown !== null && (!best || flown < best.length)) {
        best = { length: flown, path };
      }
    }
  }
  const nearest = sorted[0]?.point;
  return best?.path ?? (nearest ? [nearest] : []);
}

function gainCells(shape: readonly Point[], raster: Raster, center: Point, radius: number): number {
  const { cellSize, columns, own, rows } = raster;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of shape) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const firstColumn = Math.max(0, Math.floor(minX / cellSize));
  const lastColumn = Math.min(columns - 1, Math.floor(maxX / cellSize));
  const firstRow = Math.max(0, Math.floor(minY / cellSize));
  const lastRow = Math.min(rows - 1, Math.floor(maxY / cellSize));
  let gain = 0;
  for (let row = firstRow; row <= lastRow; row++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      if (own[row * columns + column]) {
        continue;
      }
      const cell = { x: (column + HALF) * cellSize, y: (row + HALF) * cellSize };
      if (distance(cell, center) < radius && pointInPolygon(cell, shape)) {
        gain++;
      }
    }
  }
  return gain;
}

/**
 * Where to wait while no loop is safe: the base's centroid when it lies inside the base, otherwise a tight circle.
 *
 * @param situation - What the update knows.
 * @returns The point to steer at.
 */
function holdTarget(situation: Situation): Point {
  const { heading, outline, position } = situation;
  let sumX = 0;
  let sumY = 0;
  for (const point of outline) {
    sumX += point.x;
    sumY += point.y;
  }
  const centroid = { x: sumX / Math.max(1, outline.length), y: sumY / Math.max(1, outline.length) };
  if (pointInPolygon(centroid, outline) && distance(centroid, position) > WAYPOINT_REACHED) {
    return centroid;
  }
  return { x: position.x + Math.cos(heading + Math.PI * HALF) * HOLD_RADIUS, y: position.y + Math.sin(heading + Math.PI * HALF) * HOLD_RADIUS };
}

/**
 * The nearest point of a unit's trail that the player, in its base, can cut with no risk at all: one inside the base
 * with a straight way to it that stays inside. Trails that only hug the base from outside are left alone: the way to
 * them leaves the base right in front of their owner, which is excluded from the threats while it is the victim.
 *
 * @param situation - What the update knows.
 * @param trailPoints - The trail's points.
 * @returns The point and the seconds to reach it, or `null` when there is none.
 */
function homeVictimPoint(situation: Situation, trailPoints: readonly Point[]): HomeVictim | null {
  const { game, heading, outline, position } = situation;
  const speed = game.config.unitSpeed;
  let best: HomeVictim | null = null;
  for (const point of trailPoints) {
    const reach = distance(position, point);
    if (reach > ATTACK_RANGE_AT_HOME || (best && reach >= best.reach)) {
      continue;
    }
    if (!pointInPolygon(point, outline) || depthInside(point, outline) < HOME_CUT_DEPTH || !isClearOfPolygon(position, point, outline)) {
      continue;
    }
    const turn = Math.abs(angleDifference(Math.atan2(point.y - position.y, point.x - position.x), heading));
    best = { point, reach, seconds: reach / speed + turn / TURN_SPEED_RADIANS_PER_SECOND };
  }
  return best;
}

function isClearOfPolygon(from: Point, to: Point, polygon: readonly Point[]): boolean {
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if (a && b && segmentsIntersect(from, to, a, b)) {
      return false;
    }
  }
  return true;
}

/**
 * Whether a unit could cut the trail before the player is home: a hunting bot (or any other unit) within reach, a bot
 * about to start hunting, or a bot heading straight at the trail.
 *
 * @param unit - The unit.
 * @param player - The player.
 * @param toTrail - The unit's distance to the trail.
 * @param reach - How close a unit may come before the player cannot get home first.
 * @param trail - The trail.
 * @returns Whether it is a danger.
 */
function isDangerous(unit: Unit, player: Unit, toTrail: number, reach: number, trail: readonly Point[]): boolean {
  if (isHunting(unit)) {
    return toTrail < reach;
  }
  const position = toPoint(unit.position);
  const nearest = nearestPoint(position, trail);
  if (nearest) {
    const toward = normalize(subtract(nearest, position));
    if (Math.cos(unit.direction) * toward.x + Math.sin(unit.direction) * toward.y > APPROACH_COSINE) {
      return toTrail < reach * APPROACH_REACH_SHARE;
    }
  }
  const trigger = aggroRange(unit, player);
  if (toTrail < (toTrail < trigger + TRIGGER_MARGIN ? reach : reach * PASSIVE_REACH_SHARE)) {
    return true;
  }
  const ahead = { x: position.x + Math.cos(unit.direction) * reach, y: position.y + Math.sin(unit.direction) * reach };
  for (let index = 0; index + 1 < trail.length; index++) {
    const a = trail[index];
    const b = trail[index + 1];
    if (a && b && segmentDistance(position, ahead, a, b) < HEADING_CLEARANCE) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a planned loop can be flown without touching its own trail: it is flown in simulation from where the player is,
 * across the base to the exit without leaving the base early, through its waypoints and home to the nearest point of
 * the base.
 *
 * @param start - The player's position.
 * @param heading - The player's heading.
 * @param waypoints - The loop, starting at its exit.
 * @param outline - The base's outline.
 * @param center - The arena's centre.
 * @param radius - The arena's radius.
 * @param speed - The unit speed.
 * @returns Whether it is flyable.
 */
function isFlyable(start: Point, heading: number, waypoints: readonly Point[], outline: readonly Point[], center: Point, radius: number, speed: number): boolean {
  const [exit, first] = waypoints;
  const last = waypoints[waypoints.length - 1];
  if (!exit || !first || !last) {
    return false;
  }
  const home = nearestPoint(last, outline);
  if (!home) {
    return false;
  }
  const away = distance(last, home);
  const aim = away < 1 ? home : add(last, scale(subtract(home, last), 1 + RETURN_OVERSHOOT / away));
  return simulateApproach({
    center,
    heading,
    maxSteps: LOOP_SIMULATION_MAX_STEPS,
    path: [...waypoints, aim],
    position: start,
    radius,
    speed,
    staysInside: outline,
    trackSelf: true,
    trail: []
  }) !== null;
}

/**
 * Whether a unit heads straight for the trail: a bot in its `attack` state, or a unit that is no bot at all.
 *
 * @param unit - The unit.
 * @returns Whether it hunts.
 */
function isHunting(unit: Unit): boolean {
  return !(unit instanceof Bot) || unit.fsm?.state === 'attack';
}

/**
 * Whether a point lies inside the circle the unit turns on at its full turn rate, toward the point's side: the unit can
 * only orbit such a point, never reach it, so it counts as passed.
 *
 * @param position - The unit.
 * @param heading - Its heading, in radians.
 * @param target - The point.
 * @param speed - The unit speed.
 * @returns Whether it does.
 */
function isInsideTurn(position: Point, heading: number, target: Point, speed: number): boolean {
  const turnRadius = speed / TURN_SPEED_RADIANS_PER_SECOND;
  const forward = { x: Math.cos(heading), y: Math.sin(heading) };
  const side = Math.sign(cross(forward, subtract(target, position))) || 1;
  const turnCenter = add(position, scale({ x: -forward.y * side, y: forward.x * side }, turnRadius));
  return distance(turnCenter, target) < turnRadius * TURN_CIRCLE_SHARE;
}

/**
 * Whether the straight way from `from` to `to` crosses none of a polygon's edges.
 *
 * @param from - The start.
 * @param to - The end.
 * @param polygon - The polygon.
 * @returns Whether it is clear.
 */
/**
 * Whether a waypoint counts as reached: within reach of it, or, for one past the wall, pressed against the wall near it.
 * The simulation and the live flight share this rule, so the way the simulation approves is the way that is flown.
 *
 * @param position - The player.
 * @param heading - The player's heading, in radians.
 * @param target - The waypoint.
 * @param final - Whether it is the last one, which must be reached closely.
 * @param center - The arena's centre.
 * @param radius - The arena's radius.
 * @param speed - The unit speed.
 * @returns Whether it is reached.
 */
function isReached(position: Point, heading: number, target: Point, final: boolean, center: Point, radius: number, speed: number): boolean {
  const away = distance(position, target);
  if (away < (final ? SIMULATION_ARRIVAL : WAYPOINT_REACHED)) {
    return true;
  }
  if (!final && isInsideTurn(position, heading, target, speed)) {
    return true;
  }
  return !final && away < WALL_WAYPOINT_REACHED && distance(target, center) > radius && distance(position, center) > radius - WALL_CONTACT;
}

/**
 * A point beyond the wall moved back onto it, as the wall's slide leaves the unit there.
 *
 * @param point - The point.
 * @param center - The arena's centre.
 * @param radius - The arena's radius.
 * @returns The point, inside.
 */
function keepInside(point: Point, center: Point, radius: number): Point {
  return distance(point, center) > radius ? add(center, scale(normalize(subtract(point, center)), radius)) : point;
}

function nearestDistance(position: Point, points: readonly Point[]): number {
  let nearest = Infinity;
  for (const point of points) {
    nearest = Math.min(nearest, distance(point, position));
  }
  return nearest;
}

function nearestPoint(position: Point, points: readonly Point[]): null | Point {
  let nearest: null | Point = null;
  let nearestAway = Infinity;
  for (const point of points) {
    const away = distance(point, position);
    if (away < nearestAway) {
      nearestAway = away;
      nearest = point;
    }
  }
  return nearest;
}

/**
 * A loop that follows the base's outline at a fixed depth: out along the normal, along the offset outline, and home.
 *
 * @param ring - The resampled outline.
 * @param start - The exit's index.
 * @param direction - Which way along the outline.
 * @param depth - The depth.
 * @param steps - How many ring points it spans.
 * @param center - The arena's centre.
 * @param radius - The arena's radius.
 * @returns Its route past the exit and the shape it encloses, or `null` when it wraps around the whole outline.
 */
function peelLoop(ring: readonly RingPoint[], start: number, direction: number, depth: number, steps: number, center: Point, radius: number): null | PeelLoop {
  if (steps < 1 || steps >= ring.length - 1) {
    return null;
  }
  const route: Point[] = [];
  const base: Point[] = [];
  for (let offset = 0; offset <= steps; offset++) {
    const ringPoint = ring[wrapIndex(start + direction * offset, ring.length)];
    if (!ringPoint) {
      return null;
    }
    base.push(ringPoint.point);
    if (offset % PEEL_WAYPOINT_STRIDE === 0 || offset === steps) {
      const waypoint = clampToWall(ringPoint.point, add(ringPoint.point, scale(ringPoint.normal, depth)), center, radius);
      const previous = route[route.length - 1];
      if (!previous || distance(previous, waypoint) >= WAYPOINT_REACHED) {
        route.push(waypoint);
      }
    }
  }
  return { route, shape: [...route, ...base.reverse()] };
}

/**
 * The ground a unit outside its base would take if it went straight home now, roughly: its trail, its head, and the
 * nearest point of its base, closed back to the trail's start. A unit in its own base that such a capture encloses
 * dies, so the player stays out of it.
 *
 * @param unit - The unit.
 * @returns The polygon, or `null` for a unit with no trail out.
 */
function pendingCapture(unit: Unit): null | Point[] {
  const home = unit.baseNearestPoint;
  if (unit.death || unit.in === unit.base || !home || unit.track.simplyline.length === 0) {
    return null;
  }
  return [...unit.track.simplyline.map(toPoint), toPoint(unit.position), toPoint(home)];
}

/**
 * Ranks the loops by ground taken per second, counting the best estimated ones exactly before the final ranking.
 *
 * @param context - The plan's inputs.
 * @param estimates - The loops.
 * @returns The best loops, best first.
 */
function rankCandidates(context: PlanContext, estimates: Estimate[]): Candidate[] {
  const { center, radius, raster } = context;
  const cellArea = raster.cellSize * raster.cellSize;
  const ranked = estimates.map((estimate) => ({ estimate, score: estimate.gain * cellArea / estimate.seconds })).sort((a, b) => b.score - a.score);
  return ranked.slice(0, EXACT_CANDIDATES).map(({ estimate }) => {
    const gain = estimate.exact ? estimate.gain : gainCells(estimate.shape, raster, center, radius);
    return { check: estimate.check, gain, score: gain * cellArea / estimate.seconds, waypoints: estimate.waypoints };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Marks the cells whose centres lie inside a polygon, by scanlines.
 *
 * @param outline - The polygon.
 * @param width - The arena's width.
 * @param height - The arena's height.
 * @param cellSize - The cell size.
 * @returns The raster.
 */
function rasterize(outline: readonly Point[], width: number, height: number, cellSize: number): Raster {
  const columns = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const own = new Uint8Array(columns * rows);
  const crossings: number[] = [];
  for (let row = 0; row < rows; row++) {
    const y = (row + HALF) * cellSize;
    crossings.length = 0;
    for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index++) {
      const a = outline[index];
      const b = outline[previous];
      if (a && b && (a.y > y) !== (b.y > y)) {
        crossings.push((b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x);
      }
    }
    crossings.sort((left, right) => left - right);
    for (let pair = 0; pair + 1 < crossings.length; pair += CROSSINGS_PER_SPAN) {
      const first = Math.max(0, Math.ceil((crossings[pair] ?? 0) / cellSize - HALF));
      const last = Math.min(columns - 1, Math.floor((crossings[pair + 1] ?? 0) / cellSize - HALF));
      for (let column = first; column <= last; column++) {
        own[row * columns + column] = 1;
      }
    }
  }
  return { cellSize, columns, own, rows };
}

/**
 * Whether the player, `seconds` from a unit's trail, gets there in good time before the unit is home.
 *
 * @param seconds - The player's time to the trail.
 * @param unit - The trail's owner.
 * @param speed - The unit speed.
 * @returns Whether it does.
 */
function reachesInTime(seconds: number, unit: Unit, speed: number): boolean {
  return seconds <= unit.baseDistance / speed * ATTACK_TIME_SHARE - ATTACK_MARGIN_SECONDS;
}

/**
 * For each point along a sampled path, the length still to go from there, given the whole length.
 *
 * @param samples - The points, in order.
 * @param total - The whole length, the way home included.
 * @returns The lengths still to go.
 */
function remainingAlong(samples: readonly Point[], total: number): number[] {
  let along = 0;
  return samples.map((sample, index) => {
    along += index > 0 ? distance(samples[index - 1] ?? sample, sample) : 0;
    return Math.max(0, total - along);
  });
}

/**
 * The outline resampled at an even spacing, each point with its outward normal.
 *
 * @param outline - The outline.
 * @param spacing - The spacing.
 * @param orientation - The outline's winding sign.
 * @returns The ring.
 */
function resampleRing(outline: readonly Point[], spacing: number, orientation: number): RingPoint[] {
  const points: Point[] = [];
  let carried = 0;
  for (let index = 0; index < outline.length; index++) {
    const a = outline[index] ?? ORIGIN;
    const b = outline[(index + 1) % outline.length] ?? ORIGIN;
    const segment = distance(a, b);
    let along = carried;
    while (along < segment) {
      points.push(add(a, scale(subtract(b, a), along / segment)));
      along += spacing;
    }
    carried = along - segment;
  }
  return points.map((point, index) => {
    const tangent = normalize(subtract(points[wrapIndex(index + 1, points.length)] ?? point, points[wrapIndex(index - 1, points.length)] ?? point));
    return { normal: { x: tangent.y * orientation, y: -tangent.x * orientation }, point };
  });
}

function samplePath(points: readonly Point[], spacing: number): Point[] {
  const samples: Point[] = [];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1] ?? ORIGIN;
    const to = points[index] ?? ORIGIN;
    const count = Math.max(1, Math.ceil(distance(from, to) / spacing));
    for (let sample = 0; sample < count; sample++) {
      samples.push(add(from, scale(subtract(to, from), sample / count)));
    }
  }
  const last = points[points.length - 1];
  if (last) {
    samples.push(last);
  }
  return samples;
}

/**
 * Flies the player at a target the way the engine would (full speed, the turn rate, sliding along the wall) and
 * reports how far it went before arriving, or `null` when it touched a trail, slid backwards or never arrived.
 *
 * @param params - The start, the waypoints and the trail.
 * @returns The length flown, or `null`.
 */
function simulateApproach(params: ApproachParams): null | number {
  const { center, path, radius, speed, staysInside, trackSelf = false, trail } = params;
  const stepLength = speed * SIMULATION_STEP_SECONDS;
  const maxTurn = TURN_SPEED_RADIANS_PER_SECOND * SIMULATION_STEP_SECONDS;
  let position = params.position;
  let heading = params.heading;
  let flown = 0;
  let leg = 0;
  let previousMove = { x: Math.cos(heading), y: Math.sin(heading) };
  const laid: Point[] = [];
  for (let step = 0; step < (params.maxSteps ?? SIMULATION_MAX_STEPS); step++) {
    let target = path[leg];
    if (!target) {
      return null;
    }
    if (isReached(position, heading, target, leg === path.length - 1, center, radius, speed)) {
      leg++;
      target = path[leg];
      if (!target) {
        return flown;
      }
    }
    const wanted = guardWallTurn(position, heading, Math.atan2(target.y - position.y, target.x - position.x), center, radius);
    heading += Math.max(-maxTurn, Math.min(maxTurn, angleDifference(wanted, heading)));
    const next = keepInside({ x: position.x + Math.cos(heading) * stepLength, y: position.y + Math.sin(heading) * stepLength }, center, radius);
    if (staysInside && leg === 0 && distance(next, target) > WAYPOINT_REACHED && !pointInPolygon(next, staysInside)) {
      return null;
    }
    const moved = subtract(next, position);
    // A turn into the wall makes the slide run backwards, straight over the trail just laid.
    if (moved.x * previousMove.x + moved.y * previousMove.y < 0) {
      return null;
    }
    const grace = distance(next, params.position) < SIMULATION_GRACE_RADIUS ? params.position : null;
    if (touchesPolyline(position, next, trail, trail.length, grace)) {
      return null;
    }
    if (trackSelf && (!staysInside || leg > 0)) {
      if (touchesPolyline(position, next, laid, laid.length - SELF_GRACE_SAMPLES, null)) {
        return null;
      }
      if (step % SELF_SAMPLE_STEPS === 0) {
        laid.push(next);
      }
    }
    if (length(moved) > 0) {
      previousMove = moved;
    }
    flown += distance(position, next);
    position = next;
  }
  return null;
}

/**
 * Whether a unit makes a planned loop unsafe. A hunting unit must be farther from the loop than the player will ever be
 * from home, and than the share of the loop a chase would cover. A bot that is not hunting yet must stay beyond its
 * trigger distance for most of the loop, unless the loop is so shallow that the player wins any race home it starts.
 *
 * @param enemy - The unit.
 * @param check - The loop's points, the trail still to lay from each, how close a hunter may get before the player
 *   cannot get home first, and the loop's trail length.
 * @returns Whether it is unsafe.
 */
function threatens(enemy: EnemyModel, check: LoopCheck): boolean {
  const { exposure, maxRemaining, remaining, samples, trailLength } = check;
  // A unit as fast as the player reaches a point of the trail before the loop closes when it is closer to it than the
  // trail still to lay from there: a hunter must never be, and a bot that is not hunting yet not within half of it.
  const reachShare = enemy.hunting ? HUNTER_REACH_SHARE : PASSIVE_REACH_SHARE_PLAN;
  // The planner weighs thousands of loops against every unit, so a unit farther from the whole loop than any test below
  // reaches is ruled out by the bounding circle alone; the tests give the same answer, only slower.
  const farthestReach = Math.max(
    maxRemaining * reachShare + PLAN_THREAT_MARGIN,
    enemy.hunting
      ? Math.max(exposure, trailLength * PLAN_THREAT_SHARE + PLAN_THREAT_MARGIN, HUNTER_MIN_DISTANCE)
      : enemy.trigger + trailLength * (PLAN_PASSIVE_SHARE + PLAN_CLOSING_SHARE + PLAN_STRAY_SHARE) + PLAN_THREAT_MARGIN
  );
  if (distance(enemy.position, check.center) - check.spread > farthestReach + BOUND_SLACK) {
    return false;
  }
  // One pass gives all three: the reach test, the nearest distance and the nearest sample, each distance taken once.
  let near = Infinity;
  let closest: null | Point = null;
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index] ?? enemy.position;
    const away = distance(enemy.position, sample);
    if (away < (remaining[index] ?? 0) * reachShare + PLAN_THREAT_MARGIN) {
      return true;
    }
    if (away < near) {
      near = away;
      closest = sample;
    }
  }
  if (enemy.hunting) {
    return near < Math.max(exposure, trailLength * PLAN_THREAT_SHARE + PLAN_THREAT_MARGIN, HUNTER_MIN_DISTANCE);
  }
  if (exposure <= enemy.trigger) {
    return near < trailLength * PLAN_STRAY_SHARE + PLAN_THREAT_MARGIN;
  }
  // A bot heading away from the loop is unlikely to cover much of the way to it while the loop is out.
  closest ??= enemy.position;
  const toward = normalize(subtract(closest, enemy.position));
  const closing = Math.max(0, Math.cos(enemy.direction) * toward.x + Math.sin(enemy.direction) * toward.y);
  return near < enemy.trigger + trailLength * (PLAN_PASSIVE_SHARE + PLAN_CLOSING_SHARE * closing) + PLAN_THREAT_MARGIN;
}

function toPoint(vector: Point): Point {
  return { x: vector.x, y: vector.y };
}

/**
 * Whether a step comes within the clearance of a polyline's first points. Segments near grace, where the step starts
 * on the polyline it laid, are skipped.
 *
 * @param from - The step's start.
 * @param to - The step's end.
 * @param points - The polyline.
 * @param count - How many of its points count.
 * @param grace - The point whose nearby segments are skipped, or
ull.
 * @returns Whether it touches.
 */
function touchesPolyline(from: Point, to: Point, points: readonly Point[], count: number, grace: null | Point): boolean {
  for (let index = 0; index + 1 < count; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (!a || !b || (grace && distanceToSegment(grace, a, b) < SIMULATION_GRACE_RADIUS)) {
      continue;
    }
    if (segmentDistance(from, to, a, b) < SIMULATION_CLEARANCE) {
      return true;
    }
  }
  return false;
}

/**
 * A rectangle loop's waypoints past the exit: the corner and the far end, with any stretch beyond the wall replaced by
 * waypoints just past the wall's arc, so the unit slides along the wall instead of cutting a chord. The corner is moved
 * to where the way out meets the wall, so the waypoints keep their order along it.
 *
 * @param exit - The loop's exit.
 * @param corner - The loop's outer corner.
 * @param far - The loop's far corner.
 * @param center - The arena's centre.
 * @param radius - The arena's radius.
 * @returns The waypoints.
 */
function wallPath(exit: Point, corner: Point, far: Point, center: Point, radius: number): Point[] {
  const start = clampToWall(exit, corner, center, radius);
  if (start === corner && distance(far, center) <= radius - WALL_MARGIN) {
    return [corner, far];
  }
  const points: Point[] = [];
  const segments = Math.max(1, Math.ceil(distance(start, far) / WALL_ARC_STEP));
  for (let index = 0; index <= segments; index++) {
    const point = add(start, scale(subtract(far, start), index / segments));
    if (distance(point, center) > radius - WALL_MARGIN) {
      points.push(add(center, scale(normalize(subtract(point, center)), radius - WALL_MARGIN)));
    } else {
      points.push(point);
    }
  }
  return points;
}

function wrapIndex(index: number, size: number): number {
  return ((index % size) + size) % size;
}
