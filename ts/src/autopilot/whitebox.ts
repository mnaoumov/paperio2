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
  scale,
  segmentDistance,
  segmentsIntersect,
  signedArea,
  subtract,
  THREE_EIGHTHS_TURN
} from './plane.ts';

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
export type WhiteboxPhase = 'attack' | 'home' | 'out' | 'return';

interface Candidate {
  /** What the loop is checked against the units with, again on every update until it leaves the base. */
  readonly check: LoopCheck;
  /** The cells the loop would take. */
  readonly gain: number;
  readonly score: number;
  readonly waypoints: readonly Point[];
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
/** The way across the base to the exit weighs this much more than the loop itself. */
const TRANSIT_WEIGHT = 2;
/** A loop's trail stays this far under the length at which the nearest bot starts hunting the trail. */
const TRAIL_LENGTH_SHARE = 0.85;
/** At planning, every unit must be at least this share of the loop's length away from it, plus the margin. */
const PLAN_THREAT_SHARE = 0.6;
const PLAN_THREAT_MARGIN = 40;
/** A bot that would lose the race home must still be this share of the loop's length away, against a stray crossing. */
const PLAN_STRAY_SHARE = 0.15;
/** A bot that is not hunting must be beyond its trigger distance plus this share of the loop's length. */
const PLAN_PASSIVE_SHARE = 0.2;
/** ...plus this share again for a bot heading straight at it. */
const PLAN_CLOSING_SHARE = 0.5;
/** A bot this close to its trigger distance is treated as hunting already. */
const TRIGGER_MARGIN = 30;
/** A bot whose heading passes this close to the trail is treated as hunting. */
const HEADING_CLEARANCE = 12;
/** In flight, the pilot heads home once a unit is closer to the trail than this factor of the way home, plus the margin. */
const FLIGHT_THREAT_FACTOR = 1.3;
const FLIGHT_THREAT_MARGIN = 40;
/** A waypoint is reached within this distance. */
const WAYPOINT_REACHED = 10;
/** A waypoint beyond the wall is reached once the unit is this close to it and pressed against the wall. */
const WALL_WAYPOINT_REACHED = 45;
const WALL_CONTACT = 1.5;
/**
 * Loops keep this far inside the wall, more than the turning radius. Pressed against the wall, a turn makes the engine's slide fold back onto the
 * trail's last segment, which it counts as a death by the wall, so the pilot never touches it; the thin ring this leaves is
 * not taken.
 */
const WALL_MARGIN = 16;
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
/** A passive bot moving toward the trail at least this fast (cosine) is treated as hunting. */
const APPROACH_COSINE = 0.3;
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
/** A trail through the player's own base is cut within this distance. */
const ATTACK_RANGE_AT_HOME = 450;
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

/** A planned loop's points, how far from home it gets and its trail length, which its safety is judged by. */
interface LoopCheck {
  readonly exposure: number;
  readonly samples: readonly Point[];
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

/** A unit whose trail the pilot can cut, and how soon. */
interface VictimChoice {
  readonly seconds: number;
  readonly unit: Unit;
}

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
  /** Counts of what the pilot decided, for the benchmark's report. */
  public readonly stats = { aborts: 0, attacks: 0, attackUpdates: 0, holdUpdates: 0, homeUpdates: 0, loops: 0, outUpdates: 0, replans: 0, returnUpdates: 0, victimsInRange: 0, victimsTooFar: 0, victimsUnsafe: 0 };
  public get debug(): WhiteboxDebug {
    return { loop: this.loop, phase: this.phase, target: this.target, threat: this.threat };
  }

  private lastPosition: null | Point = null;
  private loop: null | readonly Point[] = null;
  private loopCheck: LoopCheck | null = null;
  private phase: WhiteboxPhase = 'home';
  /** Updates to wait before planning again after a plan found no safe loop. */
  private planCooldown = 0;
  private returnPath: Point[] = [];
  private returnUpdates = 0;
  private target: null | Point = null;
  private threat: null | Threat = null;
  private victim: null | Unit = null;
  private waypointIndex = 0;

  /** Drops the plan, so the next update plans again from wherever the player is. */
  public reset(): void {
    this.phase = 'home';
    this.loop = null;
    this.waypointIndex = 0;
    this.target = null;
    this.victim = null;
    this.returnPath = [];
  }

  public steer(game: Game): null | Point {
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
    if (this.phase === 'attack' && !this.isVictimValid()) {
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
    this.target = this.chooseTarget(situation);
    this.stats[`${this.phase}Updates`]++;
    if (this.phase === 'home' && !this.loop) {
      this.stats.holdUpdates++;
    }
    return this.target ? normalize(subtract(this.target, position)) : null;
  }

  private attackTarget(situation: Situation, victim: Unit): null | Point {
    const { inBase, outline, position } = situation;
    const trailPoints = victim.track.simplyline.map(toPoint);
    const point = (inBase ? nearestPoint(position, trailPoints.filter((trailPoint) => pointInPolygon(trailPoint, outline))) : null) ?? nearestPoint(position, trailPoints);
    return point ? add(point, scale(normalize(subtract(point, position)), ATTACK_OVERSHOOT)) : null;
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
      if (unit === player || unit === this.victim || unit.death) {
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
    return !game.units.some((unit) => unit !== player && !unit.death && threatens(describeEnemy(unit, player), check.samples, check.exposure, check.trailLength));
  }

  private isVictimValid(): boolean {
    const victim = this.victim;
    return victim !== null && !victim.death && victim.in !== victim.base && victim.track.simplyline.length > 0;
  }

  private lookForVictim(situation: Situation): void {
    const { game, heading, inBase, outline, player, position } = situation;
    const speed = game.config.unitSpeed;
    let best: null | VictimChoice = null;
    for (const unit of game.units) {
      if (unit === player || unit.death || unit.in === unit.base) {
        continue;
      }
      const trailPoints = unit.track.simplyline.map(toPoint);
      // A trail run through the player's own base is cut with no risk at all: the player never leaves home for it.
      const inside = inBase ? nearestPoint(position, trailPoints.filter((trailPoint) => pointInPolygon(trailPoint, outline))) : null;
      if (inside && distance(position, inside) < ATTACK_RANGE_AT_HOME && isClearOfPolygon(position, inside, outline)) {
        best = { seconds: 0, unit };
        break;
      }
      const point = nearestPoint(position, trailPoints);
      if (!point) {
        continue;
      }
      const reach = distance(position, point);
      if (reach > ATTACK_RANGE) {
        continue;
      }
      this.stats.victimsInRange++;
      const turn = Math.abs(angleDifference(Math.atan2(point.y - position.y, point.x - position.x), heading));
      const seconds = reach / speed + turn / TURN_SPEED_RADIANS_PER_SECOND;
      if (seconds > unit.baseDistance / speed * ATTACK_TIME_SHARE - ATTACK_MARGIN_SECONDS) {
        this.stats.victimsTooFar++;
        continue;
      }
      const safe = (inBase && pointInPolygon(point, outline))
        || game.units.every((other) => other === player || other === unit || other.death || distanceToSegment(toPoint(other.position), position, point) > reach * ATTACK_THREAT_FACTOR + ATTACK_THREAT_MARGIN);
      if (!safe) {
        this.stats.victimsUnsafe++;
      }
      if (safe && (!best || seconds < best.seconds)) {
        best = { seconds, unit };
      }
    }
    if (best) {
      this.victim = best.unit;
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
      this.planCooldown = this.planLoop(situation) ? 0 : PLAN_RETRY_UPDATES;
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
      if (isReached(position, waypoint, false, center, radius)) {
        this.waypointIndex++;
        continue;
      }
      return waypoint;
    }
    return null;
  }

  private planLoop(situation: Situation): boolean {
    const { game, outline, player, position } = situation;
    const orientation = Math.sign(signedArea(outline)) || 1;
    const base = {
      center: toPoint(game.border.center),
      enemies: game.units.filter((unit) => unit !== player && !unit.death).map((unit) => describeEnemy(unit, player)),
      maxTrail: game.config.botAttackTrackLength * TRAIL_LENGTH_SHARE,
      orientation,
      outline,
      position,
      radius: game.border.radius,
      ring: resampleRing(outline, RING_SPACING, orientation),
      speed: game.config.unitSpeed
    };
    let best: Candidate | null = null;
    for (const cellSize of CELL_SIZES) {
      const raster = rasterize(outline, game.space.width, game.space.height, cellSize);
      const context: PlanContext = { ...base, field: distanceField(raster), raster };
      const candidates = rankCandidates(context, collectEstimates(context));
      // The best few are flown in simulation, out and home, and the first that never touches its own trail is taken.
      best = candidates.slice(0, VERIFIED_CANDIDATES).find((candidate) => candidate.gain > 0 && isFlyable(position, situation.heading, candidate.waypoints, outline, base.center, base.radius, base.speed)) ?? null;
      if (best && best.gain >= MIN_COARSE_GAIN_CELLS) {
        break;
      }
    }
    this.loop = best?.waypoints ?? null;
    this.loopCheck = best?.check ?? null;
    this.waypointIndex = 0;
    if (best) {
      this.stats.loops++;
    }
    return best !== null;
  }

  private returnTarget(situation: Situation): null | Point {
    const { game, position } = situation;
    if (this.returnPath.length === 0 || --this.returnUpdates <= 0) {
      this.returnPath = findWayHome(situation);
      this.returnUpdates = RETURN_REPLAN_UPDATES;
    }
    const center = toPoint(game.border.center);
    while (this.returnPath.length > 1 && isReached(position, this.returnPath[0] ?? position, false, center, game.border.radius)) {
      this.returnPath.shift();
    }
    return this.returnPath[0] ?? null;
  }
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
  if (enemies.some((enemy) => threatens(enemy, samples, exposure, trailLength))) {
    return;
  }
  // Crossing the base takes time and lets the units move under the plan, so it counts double.
  const seconds = (distance(position, exit) * TRANSIT_WEIGHT + trailLength) / speed + LOOP_OVERHEAD_SECONDS;
  const gain = estimatedGain ?? gainCells(shape, raster, center, radius);
  if (gain > 0) {
    estimates.push({ check: { exposure, samples, trailLength }, exact: estimatedGain === null, gain, seconds, shape, waypoints: [exit, ...route] });
  }
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
  let best: null | WayHome = null;
  for (const { away, point } of sorted) {
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
      return toTrail < reach;
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
 * @param target - The waypoint.
 * @param final - Whether it is the last one, which must be reached closely.
 * @param center - The arena's centre.
 * @param radius - The arena's radius.
 * @returns Whether it is reached.
 */
function isReached(position: Point, target: Point, final: boolean, center: Point, radius: number): boolean {
  const away = distance(position, target);
  if (away < (final ? SIMULATION_ARRIVAL : WAYPOINT_REACHED)) {
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
    if (isReached(position, target, leg === path.length - 1, center, radius)) {
      leg++;
      target = path[leg];
      if (!target) {
        return flown;
      }
    }
    const wanted = Math.atan2(target.y - position.y, target.x - position.x);
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
 * @param samples - Points along the loop.
 * @param exposure - How close a hunter may get before the player cannot get home first.
 * @param trailLength - The loop's trail length.
 * @returns Whether it is unsafe.
 */
function threatens(enemy: EnemyModel, samples: readonly Point[], exposure: number, trailLength: number): boolean {
  const near = nearestDistance(enemy.position, samples);
  if (enemy.hunting) {
    return near < Math.max(exposure, trailLength * PLAN_THREAT_SHARE + PLAN_THREAT_MARGIN);
  }
  if (exposure <= enemy.trigger) {
    return near < trailLength * PLAN_STRAY_SHARE + PLAN_THREAT_MARGIN;
  }
  // A bot heading away from the loop is unlikely to cover much of the way to it while the loop is out.
  const closest = nearestPoint(enemy.position, samples) ?? enemy.position;
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
