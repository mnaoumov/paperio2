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
import type {
  Polygon,
  Polyline
} from '../geometry/shapes.ts';
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
import {
  hasOutlineClearance,
  simplifyGeometry
} from './precision.ts';

interface PreciseOutline {
  readonly points: readonly Point[];
  readonly source: readonly Point[];
}

interface PreciseTrail {
  readonly end: Polyline['end'];
  readonly length: number;
  readonly points: readonly Point[];
  readonly start: Polyline['start'];
}

const preciseOutlines = new WeakMap<Polygon, PreciseOutline>();
const preciseTrails = new WeakMap<Polyline, PreciseTrail>();
const GEOMETRY_TOLERANCE = 1;

interface CachedCaptures {
  readonly generation: number;
  readonly shapes: Point[][];
}

const cachedCaptures = new WeakMap<Unit, CachedCaptures>();
let captureReadGeneration = 0;

/** A schedule being flown, and the game time in seconds its first step starts at. */
export interface ActiveSchedule {
  readonly flight: LoopSchedule;
  readonly start: number;
}

/** Plans a loop from its input and calls back with it, now or later. */
export type LoopPlanner = (input: PlanInput, answer: (plan: null | PlannedLoop) => void) => void;

/** An open-loop flight: one unit direction per fixed step of game time, from the moment the loop is taken. */
export interface LoopSchedule {
  readonly directions: readonly Point[];
  /**
   * Whether the rollout ran from the live `Math.random` state at the live frame length, captured between frames. In a
   * game that steps exactly that length (the benchmark) its forecast is then exact, so the pilot flies the schedule
   * without looking around: a heuristic turn would trade the forecast flight for an unchecked one.
   */
  readonly exact?: boolean | undefined;

  readonly stepSeconds: number;
}

/** Everything a loop plan reads, as plain data, so it can be planned in a worker. */
export interface PlanInput {
  readonly captures: readonly (readonly Point[])[];
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
  /** Whether an engine rollout flew this loop and closed it alive; the pilot then flies it out without heuristic aborts. */
  readonly checked?: boolean;
  /** The directions the rollout steered by, which a checked loop is flown by instead of its waypoints. */
  readonly schedule?: LoopSchedule;
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

/** What {@link WhiteboxPilot.saveState} keeps: everything the pilot carries from one update to the next, as plain data. */
export interface WhiteboxState {
  readonly lastPosition: null | Point;
  readonly loop: null | readonly Point[];
  readonly loopCheck: LoopCheck | null;
  /** Absent in states saved before rollout-checked loops existed. */
  readonly loopChecked?: boolean;
  readonly phase: WhiteboxPhase;
  readonly planCooldown: number;
  readonly returnPath: Point[];
  readonly returnUpdates: number;
  /** The checked loop's schedule and the game time in seconds it started at; absent in older states. */
  readonly schedule?: ActiveSchedule | null;
  readonly sweep: null | SweepState;
  readonly sweepCooldown: number;
  readonly target: null | Point;
  readonly threat: null | Threat;
  /** The victim's index in `game.units`, or `null`. */
  readonly victim: null | number;
  readonly victimMode: VictimMode;
  readonly waypointIndex: number;
}

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
const DEPTHS: readonly number[] = [20, 35, 60, 110, 180, 260, 360, 480];
const WIDTHS: readonly number[] = [35, 40, 70, 140, 240, 360, 500, 700];
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
/** Admission headroom for units moving before the next approach updates, in seconds. */
const PLAN_START_HEADROOM_SECONDS = 0.5;
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
const RETURN_OVERSHOOT = 45;
/** A re-entry needs this much room inside the base, rather than a thin spit that traps the turn after arriving. */
const RETURN_CORE_DEPTH = 30;
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
/** In flight, the next this many simulated steps toward the waypoint must stay clear of the trail. */
const SELF_CHECK_STEPS = 60;
/** ...leaving out this much of the trail behind the head. */
const SELF_CHECK_GRACE = 25;
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
const MILLISECONDS_PER_SECOND = 1000;
/** How far ahead along a scheduled direction the debug target is drawn. */
const SCHEDULE_TARGET_DISTANCE = 60;
/** The grid {@link deepestPoint} searches, cells per side. */
const DEEPEST_POINT_GRID = 16;
/** Absorbs float error in a clock that lands exactly on a step's end. */
const SCHEDULE_STEP_EPSILON = 1e-6;
/** Other units must be this much farther from the way to the cut than the cut is, plus the margin. */
const ATTACK_THREAT_FACTOR = 1;
const ATTACK_THREAT_MARGIN = 40;
/** How far a unit outside its base may stray from the straight way home, heading home or still drawing its loop. */
const REENTRY_SLACK_BACK = 30;
const REENTRY_SLACK = 120;
/** Inside a pending capture, its trail is cut only when the player gets there this much before the unit can be home. */
const SURROUND_CUT_MARGIN_SECONDS = 0.15;
/** Otherwise the player walks out of it: along this many rays, in steps this long up to this far, to a point this deep in its base. */
const ESCAPE_RAYS = 24;
const ESCAPE_STEP = 10;
const ESCAPE_MAX_DISTANCE = 400;
const ESCAPE_DEPTH = 30;
/**
 * In its base, the player does not step out where another unit is closer than this: a trail laid that close is cut before
 * the player is back (2026-10-26, half of the deaths on seeds 1-64). The steer is flown this many simulated steps ahead,
 * a U-turn's worth, and the headings tried instead are this many around the circle.
 */
const EDGE_GUARD_DISTANCE = 130;
const EDGE_GUARD_STEPS = 60;
const EDGE_GUARD_RAYS = 24;
/** Incidental home movement keeps two turning radii of clearance once it has reached that depth. */
const EDGE_GUARD_DEPTH = 30;
/** A unit still drawing its loop is home this much later than its distance says, at the soonest. */
const LOOP_STATE_SLACK_SECONDS = 1;
/** The quadratic formula's 2 and 4, and the scanline crossings that bound each span inside a polygon. */
const QUADRATIC_TWO = 2;
const QUADRATIC_FOUR = 4;
const CROSSINGS_PER_SPAN = 2;
/** Both ways along a tangent. */
const SIDES: readonly number[] = [1, -1];
/* eslint-enable no-magic-numbers -- end of the tuning constants. */

interface BaseExit {
  readonly blocked: boolean;
  readonly point: Point;
  readonly step: number;
}

interface CaptureObstacle {
  readonly bottom: number;
  readonly left: number;
  readonly points: readonly Point[];
  readonly right: number;
  readonly top: number;
}

interface CaptureObstaclesParams {
  readonly captures: readonly (readonly Point[])[];
  readonly position: Point;
}

interface CrossesCaptureParams {
  readonly from: Point;
  readonly obstacles: readonly CaptureObstacle[];
  readonly to: Point;
}

interface EnemyCrossesLoopParams {
  readonly enemy: EnemyModel;
  /**
   * Enemy travel allowed before the loop starts.
   *
   * @default `0`
   */
  readonly reserve?: number;
  readonly samples: readonly Point[];
  readonly trailLength: number;
}

interface EnemyModel {
  /** Where it is heading, in radians. */
  readonly direction: number;
  readonly hunting: boolean;
  readonly position: Point;
  readonly target: null | Point;
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

interface ExposureCostParams {
  readonly leg: number;
  readonly skipFirstLegCost: boolean | undefined;
  readonly stepLength: number;
}

interface GuardBaseExitParams {
  readonly allowExit: boolean;
  readonly captures: readonly (readonly Point[])[];
  readonly center: Point;
  readonly enemies: readonly Point[];
  readonly heading: number;
  readonly outline: readonly Point[];
  readonly position: Point;
  readonly radius: number;
  readonly speed: number;
  readonly target: Point;
  readonly wanted: number;
}

interface HomeCutInTimeParams {
  readonly baseDistance: number;
  readonly flightSeconds: number;
  readonly returning: boolean;
  readonly speed: number;
}

interface HomeFlightLengthParams {
  readonly heading: number;
  readonly outline: readonly Point[];
  readonly position: Point;
  readonly speed: number;
  readonly target: Point;
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
  readonly captures: readonly (readonly Point[])[];
  readonly center: Point;
  readonly enemies: readonly EnemyModel[];
  readonly field: Float32Array;
  readonly maxTrail: number;
  readonly obstacles: readonly CaptureObstacle[];
  readonly orientation: number;
  readonly outline: readonly Point[];
  readonly position: Point;
  readonly radius: number;
  readonly raster: Raster;
  readonly ring: readonly RingPoint[];
  readonly speed: number;
}

interface ReturnCandidate {
  readonly away: number;
  readonly point: Point;
}

interface ReturnCandidatesParams {
  readonly outline: readonly Point[];
  readonly position: Point;
}

interface ReturnEntryPointParams {
  readonly edge: Point;
  readonly outline: readonly Point[];
  readonly position: Point;
}

interface RingPoint {
  /** The outward normal. */
  readonly normal: Point;
  readonly point: Point;
}

interface SafeApproachStepParams {
  readonly flight: SimulateApproachParams;
  readonly from: Point;
  readonly leg: number;
  readonly next: Point;
  readonly target: Point;
}

interface SimulateApproachParams {
  readonly avoids?: readonly CaptureObstacle[];
  readonly center: Point;
  readonly heading: number;
  /** Whether running out of steps before arriving still counts as a clear flight, for a look only so far ahead. */
  readonly horizon?: boolean;
  /** How many steps the flight may take. */
  readonly maxSteps?: number;
  /** The points to fly through, in order. */
  readonly path: readonly Point[];
  readonly position: Point;
  readonly radius: number;
  /** A loop's exposure starts after its first waypoint, the exit from the base. */
  readonly skipFirstLegCost?: boolean;
  readonly speed: number;
  /** The base the flight must stay inside until it reaches its first point, the exit; none for a way home. */
  readonly staysInside?: readonly Point[];
  /** Whether the flight lays a trail of its own that it must not cross either. */
  readonly trackSelf?: boolean;
  readonly trail: readonly Point[];
}

/** A wall sweep under way. */
interface SweepState {
  /** The player's angle around the arena's centre at the last update. */
  lastAngle: number;
  /** How far round the arena the sweep has gone, in radians. */
  turned: number;
}

interface ThreatensParams {
  readonly check: LoopCheck;
  readonly enemy: EnemyModel;
  /**
   * Enemy travel allowed before the loop starts; omitted during flight.
   *
   * @default `0`
   */
  readonly reserve?: number;
}

interface VerifyCandidateParams {
  readonly candidate: Candidate;
  readonly input: PlanInput;
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
  /** Leaves the base only on checked loops: no trail is chased out in the open (set with a rollout-checking planner). */
  public checkedDeparturesOnly = false;
  public planner: LoopPlanner | null = null;
  /** Counts of what the pilot decided, for the benchmark's report. */
  public readonly stats = { aborts: 0, attacks: 0, attackUpdates: 0, corridorReplans: 0, edgeHolds: 0, guardReplans: 0, holdUpdates: 0, homeUpdates: 0, loops: 0, outUpdates: 0, replans: 0, returnUpdates: 0, scheduledUpdates: 0, selfAborts: 0, surroundCuts: 0, surroundEscapes: 0, surrounds: 0, sweepUpdates: 0, trustedThreats: 0, victimsInRange: 0, victimsTooFar: 0, victimsUnsafe: 0 };

  public get debug(): WhiteboxDebug {
    return { loop: this.loop, phase: this.phase, target: this.target, threat: this.threat };
  }

  private lastPosition: null | Point = null;
  private loop: null | readonly Point[] = null;
  private loopCheck: LoopCheck | null = null;
  private loopChecked = false;
  /** The game time in seconds at the current update. */
  private now = 0;
  private phase: WhiteboxPhase = 'home';
  /** The planner's last answer, and which request it answers. */
  private planAnswer: null | PlanAnswer = null;
  /** The game time in seconds the plan still out was asked at, which its schedule starts from. */
  private planAskedAt = 0;
  /** Updates to wait before planning again after a plan found no safe loop. */
  private planCooldown = 0;
  /** The update that last waited for a plan. */
  private planLastAskedUpdate = -1;
  /** The request the pilot waits for, or `null`. */
  private planPending: null | number = null;
  private planRequests = 0;
  private returnPath: Point[] = [];
  private returnUpdates = 0;
  private schedule: ActiveSchedule | null = null;
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
    this.schedule = null;
  }

  /**
   * Puts back what {@link WhiteboxPilot.saveState} kept, so a restored snapshot is flown by a pilot in the middle of
   * what it was doing rather than one starting fresh. A plan the worker was still making is dropped.
   *
   * @param state - The saved state.
   * @param game - The game, restored to the snapshot the state was saved with.
   */
  public restoreState(state: WhiteboxState, game: Game): void {
    const copy = structuredClone(state);
    this.lastPosition = copy.lastPosition;
    this.loop = copy.loop;
    this.loopCheck = copy.loopCheck;
    this.loopChecked = copy.loopChecked ?? false;
    this.phase = copy.phase;
    this.schedule = copy.schedule ?? null;
    this.planCooldown = copy.planCooldown;
    this.planPending = null;
    this.planAnswer = null;
    this.returnPath = copy.returnPath;
    this.returnUpdates = copy.returnUpdates;
    this.sweep = copy.sweep;
    this.sweepCooldown = copy.sweepCooldown;
    this.target = copy.target;
    this.threat = copy.threat;
    this.victim = copy.victim === null ? null : game.units[copy.victim] ?? null;
    this.victimMode = copy.victimMode;
    this.waypointIndex = copy.waypointIndex;
  }

  /**
   * The pilot's state as plain data, to keep beside a snapshot of the game. The victim is kept as its index in
   * `game.units`, which a snapshot's restore keeps in order.
   *
   * @param game - The game the pilot flies.
   * @returns The state.
   */
  public saveState(game: Game): WhiteboxState {
    const victim = this.victim ? game.units.indexOf(this.victim) : -1;
    return structuredClone({
      lastPosition: this.lastPosition,
      loop: this.loop,
      loopCheck: this.loopCheck,
      loopChecked: this.loopChecked,
      phase: this.phase,
      planCooldown: this.planCooldown,
      returnPath: this.returnPath,
      returnUpdates: this.returnUpdates,
      schedule: this.schedule,
      sweep: this.sweep,
      sweepCooldown: this.sweepCooldown,
      target: this.target,
      threat: this.threat,
      victim: victim < 0 ? null : victim,
      victimMode: this.victimMode,
      waypointIndex: this.waypointIndex
    });
  }

  public steer(game: Game): null | Point {
    captureReadGeneration++;
    this.updates++;
    this.now = game.clock.now() / MILLISECONDS_PER_SECOND;
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
    const trail = [...readTrail(player)];
    trail.push(position);
    const situation: Situation = {
      game,
      heading: player.direction,
      inBase: player.in === player.base,
      outline: readOutline(player.base.polygon),
      player,
      position,
      trail
    };
    if (situation.inBase && (this.phase === 'out' || this.phase === 'return') && !this.isFlyingExactSchedule()) {
      this.reset();
    }
    // A cut from home never follows its trail out of the base: out there the player has a trail of its own to lose.
    if (this.phase === 'attack' && (!this.isVictimValid() || (this.victimMode === 'home' && !situation.inBase))) {
      this.victim = null;
      this.phase = situation.inBase ? 'home' : 'return';
      this.loop = null;
    }
    if (!this.isFlyingExactSchedule()) {
      this.lookAround(situation);
    }
    // A checked loop is flown by the directions its rollout steered by, from the plan's own moment, or the flight that
    // was forecast is not the one flown.
    let scheduled = this.scheduledDirection(situation);
    if (!scheduled) {
      this.target = this.sweepOrChooseTarget(situation);
      // A loop taken in this very update starts its schedule at once.
      scheduled = this.scheduledDirection(situation);
    }
    this.stats[`${this.phase}Updates`]++;
    if (this.phase === 'home' && !this.loop) {
      this.stats.holdUpdates++;
    }
    return scheduled ?? this.steerAtTarget(situation);
  }

  private attackTarget(situation: Situation, victim: Unit): null | Point {
    const { game, inBase, position } = situation;
    const trailPoints = readTrail(victim);
    if (this.victimMode === 'surround') {
      return this.surroundTarget(situation, victim);
    }
    const candidate = inBase ? homeVictimPoint(situation, samplePath(trailPoints, ROUTE_SAMPLE_SPACING)) : null;
    const home = candidate && homeCutInTime({ baseDistance: victim.baseDistance, flightSeconds: candidate.seconds, returning: !(victim instanceof Bot) || victim.fsm?.state === 'back', speed: game.config.unitSpeed }) ? candidate.point : null;
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
    const point = this.checkedDeparturesOnly ? null : nearestPoint(position, trailPoints);
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

  private checkThreats(situation: Situation, trusted: boolean): void {
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
    if (danger && trusted) {
      // A rollout is one sample of a chaotic future, so even a checked loop turns home when the heuristic sees danger.
      this.stats.trustedThreats++;
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

  private isFlyingExactSchedule(): boolean {
    const flight = this.schedule?.flight;
    if (!this.schedule || flight?.exact !== true || this.loop === null || (this.phase !== 'home' && this.phase !== 'out')) {
      return false;
    }
    return scheduleStep(this.now - this.schedule.start, flight.stepSeconds) < flight.directions.length;
  }

  private isLoopStillSafe(situation: Situation, check: LoopCheck): boolean {
    const { game, player } = situation;
    for (const unit of game.units) {
      if (unit === player || unit.death) {
        continue;
      }
      const enemy = describeEnemy(unit, player);
      if (threatens({ check, enemy })) {
        if (enemyCrossesLoop({ enemy, samples: check.samples, trailLength: check.trailLength })) {
          this.stats.corridorReplans++;
        }
        return false;
      }
    }
    return true;
  }

  private isVictimValid(): boolean {
    const victim = this.victim;
    return victim !== null && !victim.death && victim.in !== victim.base && victim.track.simplyline.length > 0;
  }

  /**
   * A bot already heading home can take the active exit while the player is elsewhere. Request the quickest return,
   * retaining the remaining loop as one candidate rather than automatically making a U-turn.
   *
   * @param situation - What the update knows.
   */
  /**
   * Looks for victims, threats and captures, any of which can change the phase.
   *
   * @param situation - What the update knows.
   */
  private lookAround(situation: Situation): void {
    // A loop an engine rollout flew to a live close is not left for a chase, which no rollout has checked.
    const flying = this.phase === 'home' || this.phase === 'out';
    const flyingChecked = flying && this.loopChecked && this.loop !== null && !situation.inBase;
    if (flying && !flyingChecked) {
      this.lookForVictim(situation);
    }
    if (situation.inBase) {
      this.lookForCaptureAroundPlayer(situation);
      return;
    }
    this.checkThreats(situation, flyingChecked);
    this.lookForCaptureAroundExit(situation);
  }

  private lookForCaptureAroundExit(situation: Situation): void {
    if (this.phase === 'return') {
      return;
    }
    const { game, player } = situation;
    const exit = player.track.polyline.start;
    if (exit && game.units.some((unit) => unit !== player && !unit.death && unit.fsm?.state === 'back' && isInsideAny(toPoint(exit), pendingCaptures(unit)))) {
      this.phase = 'return';
      this.victim = null;
      this.returnPath = [];
      this.stats.aborts++;
    }
  }

  private lookForCaptureAroundPlayer(situation: Situation): void {
    const { game, player, position } = situation;
    if (this.phase === 'attack' && this.victimMode === 'surround') {
      return;
    }
    let best: null | Unit = null;
    let bestReach = Infinity;
    for (const unit of game.units) {
      if (unit === player || !isInsideAny(position, pendingCaptures(unit))) {
        continue;
      }
      const reach = nearestDistance(position, readTrail(unit));
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
      const trailPoints = readTrail(unit);
      if (inBase) {
        // A trail run through the player's own base is about to take ground from it, and cutting it costs the player no
        // time outside: the nearest such trail is cut first.
        const home = homeVictimPoint(situation, samplePath(trailPoints, ROUTE_SAMPLE_SPACING));
        if (home && homeCutInTime({ baseDistance: unit.baseDistance, flightSeconds: home.seconds, returning: !(unit instanceof Bot) || unit.fsm?.state === 'back', speed: game.config.unitSpeed }) && (!best || !best.home || home.seconds < best.seconds)) {
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
      this.planCooldown = this.planLoop(describePlan(situation)) === false ? PLAN_RETRY_UPDATES : 0;
    }
    if (!this.loop) {
      return inBase ? holdTarget(situation) : null;
    }
    const waypoint = this.nextWaypoint(situation, this.loop);
    if (waypoint && !inBase && this.wouldTouchTrail(situation, waypoint)) {
      // The flight has gone off its plan, which the wall's slide can do: the way home is chosen clear of the trail instead.
      this.loop = null;
      this.stats.selfAborts++;
      return null;
    }
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
   * @param input - What the current update knows.
   * @returns Whether a loop was found; `null` while an asked plan is still out.
   */
  private planLoop(input: PlanInput): boolean | null {
    if (!this.planner) {
      return this.takePlan(findLoop(input));
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
      const plan = answer.plan;
      // Waiting does not freeze the player or the arena. Recheck one route, rather than repeating the worker's search.
      // An exact forecast was made from the moment it was asked, which is the pose and arena this update still flies from.
      if (
        plan && plan.schedule?.exact !== true && (loopFlightLength(input, plan.waypoints) === null
          || input.enemies.some((enemy) => threatens({ check: plan.check, enemy })))
      ) {
        this.stats.replans++;
      } else {
        return this.takePlan(plan, this.planAskedAt);
      }
    }
    if (this.planPending === null) {
      const id = ++this.planRequests;
      this.planPending = id;
      this.planAskedAt = this.now;
      this.planner(input, (plan) => {
        this.planAnswer = { id, plan };
      });
    }
    return null;
  }

  private returnTarget(situation: Situation): null | Point {
    const { game, position } = situation;
    if (this.returnPath.length === 0 || --this.returnUpdates <= 0) {
      this.returnPath = findWayHome(situation, (this.loop ?? []).slice(this.waypointIndex));
      this.returnUpdates = RETURN_REPLAN_UPDATES;
    }
    const center = toPoint(game.border.center);
    while (this.returnPath.length > 1 && isReached(position, situation.heading, this.returnPath[0] ?? position, false, center, game.border.radius, game.config.unitSpeed)) {
      this.returnPath.shift();
    }
    return this.returnPath[0] ?? null;
  }

  /**
   * The checked loop's scheduled direction for now, dropping the schedule once it has run out or the pilot has turned
   * to something else (an attack, a sweep, a reset).
   *
   * @param situation - What the update knows.
   * @returns The direction, or `null` when no schedule is being flown.
   */
  private scheduledDirection(situation: Pick<Situation, 'inBase' | 'position'>): null | Point {
    const schedule = this.schedule;
    if (!schedule) {
      return null;
    }
    const { directions, stepSeconds } = schedule.flight;
    const direction = this.loop && (this.phase === 'home' || this.phase === 'out') ? directions[scheduleStep(this.now - schedule.start, stepSeconds)] : undefined;
    if (!direction) {
      this.schedule = null;
      return null;
    }
    if (!situation.inBase) {
      this.phase = 'out';
    }
    this.stats.scheduledUpdates++;
    this.target = add(situation.position, scale(direction, SCHEDULE_TARGET_DISTANCE));
    return direction;
  }

  private steerAtTarget(situation: Situation): null | Point {
    const { game, position } = situation;
    if (!this.target) {
      return null;
    }
    let wanted = Math.atan2(this.target.y - position.y, this.target.x - position.x);
    if (situation.inBase) {
      const kept = guardBaseExit({ allowExit: (this.phase === 'home' && this.loop !== null) || this.phase === 'sweep', captures: game.units.filter((unit) => unit !== situation.player && !unit.death).flatMap(pendingCaptures), center: toPoint(game.border.center), enemies: game.units.filter((unit) => unit !== situation.player && !unit.death).map((unit) => toPoint(unit.position)), heading: situation.heading, outline: situation.outline, position, radius: game.border.radius, speed: game.config.unitSpeed, target: this.target, wanted });
      if (kept !== wanted) {
        this.stats.edgeHolds++;
        wanted = kept;
        if (this.phase === 'home' && this.loop) {
          this.stats.guardReplans++;
          this.reset();
          this.planCooldown = 0;
        }
      }
    }
    const steered = guardWallTurn(position, situation.heading, wanted, toPoint(game.border.center), game.border.radius);
    return { x: Math.cos(steered), y: Math.sin(steered) };
  }

  /**
   * Escapes a pending capture inside the base when possible, otherwise cuts its trail, preferring a reachable point
   * inside the base. The edge guard also applies to this response.
   *
   * @param situation - What the update knows.
   * @param victim - The unit whose capture closes around the player.
   * @returns The point to steer at, or `null` once the player stands outside every pending capture.
   */
  private surroundTarget(situation: Situation, victim: Unit): null | Point {
    const { game, heading, inBase, player, position } = situation;
    const captures = game.units.filter((unit) => unit !== player).flatMap(pendingCaptures);
    if (inBase && !isInsideAny(position, captures)) {
      return null;
    }
    const escape = inBase ? escapePoint(situation, captures) : null;
    if (escape) {
      this.stats.surroundEscapes++;
      return escape;
    }
    const speed = game.config.unitSpeed;
    const samples = samplePath(readTrail(victim), ROUTE_SAMPLE_SPACING);
    const cut = (inBase ? homeVictimPoint(situation, samples)?.point : null) ?? nearestPoint(position, samples);
    if (cut && travelSeconds(position, heading, cut, speed) + SURROUND_CUT_MARGIN_SECONDS < homeSeconds(victim, speed)) {
      this.stats.surroundCuts++;
      return add(cut, scale(normalize(subtract(cut, position)), ATTACK_OVERSHOOT));
    }
    return cut ? add(cut, scale(normalize(subtract(cut, position)), ATTACK_OVERSHOOT)) : null;
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

  private takePlan(plan: null | PlannedLoop, start = this.now): boolean {
    this.loop = plan?.waypoints ?? null;
    this.loopCheck = plan?.check ?? null;
    this.loopChecked = plan?.checked === true;
    this.schedule = plan?.checked && plan.schedule ? { flight: plan.schedule, start } : null;
    this.waypointIndex = 0;
    if (plan) {
      this.stats.loops++;
    }
    return plan !== null;
  }

  /**
   * Whether steering at the waypoint for the next moment takes the player over its own trail.
   *
   * @param situation - What the update knows.
   * @param waypoint - The waypoint.
   * @returns Whether it does.
   */
  private wouldTouchTrail(situation: Situation, waypoint: Point): boolean {
    const { game, heading, position } = situation;
    // The trail right behind the head is where the player just was, not an obstacle; only a reversal reaches it, which the
    // simulation catches by itself.
    const trail = [...situation.trail];
    let behind = 0;
    while (trail.length > 1 && behind < SELF_CHECK_GRACE) {
      const last = trail.pop() ?? position;
      behind += distance(last, trail[trail.length - 1] ?? last);
    }
    return simulateApproach({
      center: toPoint(game.border.center),
      heading,
      horizon: true,
      maxSteps: SELF_CHECK_STEPS,
      path: [waypoint],
      position,
      radius: game.border.radius,
      speed: game.config.unitSpeed,
      trail
    }) === null;
  }
}

/**
 * Whether an enemy's committed leg crosses a planned trail before the player can close it. This is a conservative
 * straight corridor to the current target, bounded by the available flight time; it does not predict later targets.
 *
 * @param params - The enemy's current target, the loop samples and its exposure length.
 * @returns Whether the committed leg can cross the trail.
 */
export function enemyCrossesLoop(params: EnemyCrossesLoopParams): boolean {
  const { enemy, samples, trailLength } = params;
  const reserve = params.reserve ?? 0;
  const margin = PLAN_THREAT_MARGIN + reserve;
  if (!enemy.target) {
    return false;
  }
  const reach = Math.min(trailLength + reserve, distance(enemy.position, enemy.target));
  const end = add(enemy.position, scale(normalize(subtract(enemy.target, enemy.position)), reach));
  const left = Math.min(enemy.position.x, end.x) - margin;
  const right = Math.max(enemy.position.x, end.x) + margin;
  const top = Math.min(enemy.position.y, end.y) - margin;
  const bottom = Math.max(enemy.position.y, end.y) + margin;
  for (let index = 1; index < samples.length; index++) {
    const from = samples[index - 1] ?? enemy.position;
    const to = samples[index] ?? from;
    if (Math.max(from.x, to.x) < left || Math.min(from.x, to.x) > right || Math.max(from.y, to.y) < top || Math.min(from.y, to.y) > bottom) {
      continue;
    }
    if (segmentDistance(enemy.position, end, from, to) < margin) {
      return true;
    }
  }
  return false;
}

/**
 * Plans the next loop: every loop out of the base is weighed, coarsely first, and the best few are flown in simulation.
 * It reads only its input, so a worker can run it.
 *
 * @param input - What the plan reads.
 * @returns The loop, or `null` when none is safe.
 */
export function findLoop(input: PlanInput): null | PlannedLoop {
  return findLoops(input, 1)[0] ?? null;
}

/**
 * The best few loops that pass {@link findLoop}'s simulation, best first, for a planner that checks them further.
 *
 * @param input - What the plan reads.
 * @param limit - How many to return at most.
 * @returns The loops; the first is {@link findLoop}'s.
 */
export function findLoops(input: PlanInput, limit: number): PlannedLoop[] {
  const { outline, position } = input;
  const orientation = Math.sign(signedArea(outline)) || 1;
  const base = {
    captures: input.captures,
    center: input.center,
    enemies: input.enemies,
    maxTrail: input.maxTrail,
    obstacles: captureObstacles({ captures: input.captures, position }),
    orientation,
    outline,
    position,
    radius: input.radius,
    ring: resampleRing(outline, RING_SPACING, orientation),
    speed: input.speed
  };
  let found: Candidate[] = [];
  for (const cellSize of CELL_SIZES) {
    const raster = rasterize(outline, input.spaceWidth, input.spaceHeight, cellSize);
    const context: PlanContext = { ...base, field: distanceField(raster), raster };
    const candidates = rankCandidates(context, collectEstimates(context));
    found = [];
    // The best few are flown in simulation, out and home, and the first that never touches its own trail is taken.
    for (const candidate of candidates.slice(0, VERIFIED_CANDIDATES)) {
      const verified = verifyCandidate({ candidate, input });
      if (verified) {
        found.push(verified);
        if (found.length >= limit) {
          break;
        }
      }
    }
    if ((found[0]?.gain ?? 0) >= MIN_COARSE_GAIN_CELLS) {
      break;
    }
  }
  return found.map((candidate) => ({ check: candidate.check, waypoints: candidate.waypoints }));
}

/**
 * A point beyond the wall moved back onto it, as the wall's slide leaves the unit there.
 *
 * @param point - The point.
 * @param center - The arena's centre.
 * @param radius - The arena's radius.
 * @returns The point, inside.
 */
/**
 * Keeps incidental movement in the base, looking a second ahead at the player's turn rate. A planned departure is
 * allowed only away from nearby units. Otherwise chooses the nearest heading that stays inside, or leaves latest.
 *
 * @param params - The flight, base, nearby units and whether a loop permits leaving.
 * @returns The direction to steer at, in radians; `wanted` itself when it is safe.
 */
export function guardBaseExit(params: GuardBaseExitParams): number {
  const { allowExit, enemies, heading, outline, position, speed, wanted } = params;
  const reachOfGuard = EDGE_GUARD_DISTANCE + speed * SIMULATION_STEP_SECONDS * EDGE_GUARD_STEPS;
  const near = enemies.filter((unit) => distance(unit, position) < reachOfGuard);
  const obstacles = captureObstacles({ captures: params.captures, position });
  const turnDiameter = speed / TURN_SPEED_RADIANS_PER_SECOND / HALF;
  const availableDepth = Math.max(0, Math.sqrt(Math.abs(signedArea(outline)) / Math.PI) - turnDiameter);
  const minimumDepth = allowExit ? 0 : Math.min(EDGE_GUARD_DEPTH, availableDepth, depthInside(position, outline));
  if (allowExit && near.length === 0 && obstacles.length === 0) {
    return wanted;
  }
  if (isSafe(exitStep(wanted, true))) {
    return wanted;
  }
  let best = wanted;
  let bestStep = -1;
  for (let index = 1; index <= EDGE_GUARD_RAYS * HALF; index++) {
    for (const side of [1, -1]) {
      const direction = wanted + side * index * FULL_TURN / EDGE_GUARD_RAYS;
      const exit = exitStep(direction);
      if (isSafe(exit)) {
        return direction;
      }
      if (exit && exit.step > bestStep) {
        best = direction;
        bestStep = exit.step;
      }
    }
  }
  return best;

  function exitStep(direction: number, followsTarget = false): BaseExit | null {
    const stepLength = speed * SIMULATION_STEP_SECONDS;
    const maxTurn = TURN_SPEED_RADIANS_PER_SECOND * SIMULATION_STEP_SECONDS;
    let simulated = position;
    let simulatedHeading = heading;
    for (let step = 0; step < EDGE_GUARD_STEPS; step++) {
      if (followsTarget && isReached(simulated, simulatedHeading, params.target, false, params.center, params.radius, speed)) {
        return null;
      }
      const desired = followsTarget ? Math.atan2(params.target.y - simulated.y, params.target.x - simulated.x) : direction;
      const steered = guardWallTurn(simulated, simulatedHeading, desired, params.center, params.radius);
      simulatedHeading += Math.max(-maxTurn, Math.min(maxTurn, angleDifference(steered, simulatedHeading)));
      simulated = keepInside({ x: simulated.x + Math.cos(simulatedHeading) * stepLength, y: simulated.y + Math.sin(simulatedHeading) * stepLength }, params.center, params.radius);
      const visited = simulated;
      if (obstacles.some((obstacle) => insideObstacle(visited, obstacle))) {
        return { blocked: true, point: simulated, step };
      }
      if (!pointInPolygon(simulated, outline) || (minimumDepth > 0 && !hasOutlineClearance({ clearance: minimumDepth, outline, point: simulated }))) {
        return { blocked: false, point: simulated, step };
      }
    }
    return null;
  }
  function isSafe(exit: BaseExit | null): boolean {
    return !exit || (!exit.blocked && allowExit && near.every((unit) => distance(unit, exit.point) >= EDGE_GUARD_DISTANCE));
  }
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

export function homeCutInTime(params: HomeCutInTimeParams): boolean {
  return !params.returning || reachesInTime(params.flightSeconds, { baseDistance: params.baseDistance }, params.speed);
}

/**
 * Flies a target at the player's speed and turn rate, rejecting a turn that leaves the base even when the straight
 * line to the target stays inside. This is conservative at the arena wall: an outward step is rejected before a slide.
 *
 * @param params - The start, target, base and speed.
 * @returns The length flown, or `null` when the target cannot be reached inside the base.
 */
export function homeFlightLength(params: HomeFlightLengthParams): null | number {
  const { outline, speed, target } = params;
  const stepLength = speed * SIMULATION_STEP_SECONDS;
  const maxTurn = TURN_SPEED_RADIANS_PER_SECOND * SIMULATION_STEP_SECONDS;
  let { heading, position } = params;
  let flown = 0;
  for (let step = 0; step < SIMULATION_MAX_STEPS; step++) {
    if (distance(position, target) < SIMULATION_ARRIVAL) {
      return flown;
    }
    const wanted = Math.atan2(target.y - position.y, target.x - position.x);
    heading += Math.max(-maxTurn, Math.min(maxTurn, angleDifference(wanted, heading)));
    const next = { x: position.x + Math.cos(heading) * stepLength, y: position.y + Math.sin(heading) * stepLength };
    if (!pointInPolygon(next, outline) || !isClearOfPolygon(position, next, outline)) {
      return null;
    }
    flown += distance(position, next);
    position = next;
  }
  return null;
}

/**
 * Flies a planned loop the way the pilot steers it, out and home, at a fixed step, and gives the direction it would
 * steer at on every step: an open-loop schedule for an engine rollout. It models the turn rate, the wall's slide and the
 * pilot's wall guard, not the engine's exact motion, so the schedule drifts from a real flight over its length.
 *
 * @param input - What the plan read.
 * @param waypoints - The loop, starting at its exit.
 * @param stepSeconds - The rollout's step.
 * @param maxSteps - The most steps to schedule.
 * @param settleSteps - Steps flown after the overshoot towards the deepest point of the base, so a
 *   rollout's margin past the return stays home whatever the base's shape.
 * @returns One unit direction per step, ending when the flight is home past its overshoot and settled.
 */
export function loopSchedule(input: PlanInput, waypoints: readonly Point[], stepSeconds: number, maxSteps: number, settleSteps = 0): Point[] {
  const { center, outline, radius, speed } = input;
  const last = waypoints[waypoints.length - 1];
  const home = last ? nearestPoint(last, outline) : null;
  if (!last || !home) {
    return [];
  }
  const away = distance(last, home);
  const path = [...waypoints, away < 1 ? home : add(last, scale(subtract(home, last), 1 + RETURN_OVERSHOOT / away))];
  const maxTurn = TURN_SPEED_RADIANS_PER_SECOND * stepSeconds;
  let { heading, position } = input;
  let leg = 0;
  let settled = 0;
  let settleTarget: null | Point = null;
  const directions: Point[] = [];
  while (directions.length < maxSteps) {
    let target = path[leg];
    while (target && isReached(position, heading, target, leg === path.length - 1, center, radius, speed)) {
      target = path[++leg];
    }
    if (!target) {
      if (settled >= settleSteps) {
        break;
      }
      settled++;
      settleTarget ??= deepestPoint(outline) ?? input.position;
      target = settleTarget;
    }
    const steered = guardWallTurn(position, heading, Math.atan2(target.y - position.y, target.x - position.x), center, radius);
    directions.push({ x: Math.cos(steered), y: Math.sin(steered) });
    heading += Math.max(-maxTurn, Math.min(maxTurn, angleDifference(steered, heading)));
    position = keepInside({ x: position.x + Math.cos(heading) * speed * stepSeconds, y: position.y + Math.sin(heading) * speed * stepSeconds }, center, radius);
  }
  return directions;
}

/**
 * Whether the player, `seconds` from a unit's trail, gets there in good time before the unit is home.
 *
 * @param seconds - The player's time to the trail.
 * @param unit - The trail's owner.
 * @param speed - The unit speed.
 * @returns Whether it does.
 */
export function reachesInTime(seconds: number, unit: Pick<Unit, 'baseDistance'>, speed: number): boolean {
  return seconds <= unit.baseDistance / speed * ATTACK_TIME_SHARE - ATTACK_MARGIN_SECONDS;
}

export function returnEntryPoint(params: ReturnEntryPointParams): null | Point {
  const { edge, outline, position } = params;
  const away = distance(position, edge);
  const target = away < 1 ? edge : add(position, scale(subtract(edge, position), 1 + RETURN_OVERSHOOT / away));
  return pointInPolygon(target, outline) && depthInside(target, outline) >= RETURN_CORE_DEPTH ? target : null;
}

/**
 * Which step of a schedule an update holds. The engine reads the clock at the end of a frame, so the update `elapsed`
 * after the schedule's start is the end of step `elapsed / step - 1`: the rollout held that step's direction over the
 * same stretch of game time. A plain `floor` reads one step ahead.
 *
 * @param elapsedSeconds - Game time since the schedule started.
 * @param stepSeconds - The schedule's step.
 * @returns The step.
 */
export function scheduleStep(elapsedSeconds: number, stepSeconds: number): number {
  return Math.max(0, Math.ceil(elapsedSeconds / stepSeconds - SCHEDULE_STEP_EPSILON) - 1);
}

/**
 * Flies the player at a target the way the engine would (full speed, the turn rate, sliding along the wall) and
 * reports elapsed flight time multiplied by speed, or `null` when it touched a trail, slid backwards or never arrived.
 * Wall sliding consumes time even when little distance is covered. A loop can exclude its protected first leg.
 *
 * @param params - The start, the waypoints and the trail.
 * @returns The distance an enemy at full speed could cover during the flight, or `null`.
 */
export function simulateApproach(params: SimulateApproachParams): null | number {
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
    if (!safeApproachStep({ flight: params, from: position, leg, next, target })) {
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
    if (trackSelf && (!staysInside || leg > 0) && laysOverItself(laid, position, next, step)) {
      return null;
    }
    if (length(moved) > 0) {
      previousMove = moved;
    }
    flown += exposureCost({ leg, skipFirstLegCost: params.skipFirstLegCost, stepLength });
    position = next;
  }
  return params.horizon ? flown : null;
}

export function threatens(params: ThreatensParams): boolean {
  const { check, enemy, reserve = 0 } = params;
  const { exposure, maxRemaining, remaining, samples, trailLength } = check;
  // A unit as fast as the player reaches a point of the trail before the loop closes when it is closer to it than the
  // trail still to lay from there: a hunter must never be, and a bot that is not hunting yet not within half of it.
  const reachShare = enemy.hunting ? HUNTER_REACH_SHARE : PASSIVE_REACH_SHARE_PLAN;
  // The planner weighs thousands of loops against every unit, so a unit farther from the whole loop than any test below
  // reaches is ruled out by the bounding circle alone; the tests give the same answer, only slower.
  const farthestReach = Math.max(
    enemy.target ? trailLength + reserve + PLAN_THREAT_MARGIN : 0,
    maxRemaining * reachShare + PLAN_THREAT_MARGIN,
    enemy.hunting
      ? Math.max(exposure, trailLength * PLAN_THREAT_SHARE + PLAN_THREAT_MARGIN, HUNTER_MIN_DISTANCE)
      : enemy.trigger + trailLength * (PLAN_PASSIVE_SHARE + PLAN_CLOSING_SHARE + PLAN_STRAY_SHARE) + PLAN_THREAT_MARGIN
  );
  if (distance(enemy.position, check.center) - check.spread - reserve > farthestReach + BOUND_SLACK) {
    return false;
  }
  if (enemyCrossesLoop({ enemy, reserve, samples, trailLength })) {
    return true;
  }
  // One pass gives all three: the reach test, the nearest distance and the nearest sample, each distance taken once.
  let near = Infinity;
  let closest: null | Point = null;
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index] ?? enemy.position;
    const away = distance(enemy.position, sample) - reserve;
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
 * The ground a unit outside its base would take if it went straight home now, closed the way the engine closes a capture:
 * its trail, its head and the nearest point of its base, then along its base's outline back to where the trail left it.
 * Which way round the outline the engine goes depends on the winding, so both are returned; ground in the player's base
 * inside either is ground the capture takes, since the other way only adds the unit's own base.
 *
 * @param unit - The unit.
 * @returns The two polygons, or none for a unit with no trail out.
 */
function buildPendingCaptures(unit: Unit): Point[][] {
  const straight = pendingCapture(unit);
  const home = unit.baseNearestPoint;
  const start = unit.track.simplyline[0];
  if (!straight || !home || !start) {
    return [];
  }
  const head = toPoint(unit.position);
  const trail = readTrail(unit);
  const outline = readOutline(unit.base.polygon);
  const from = nearestIndex(toPoint(home), outline);
  const to = nearestIndex(toPoint(start), outline);
  if (from < 0 || to < 0) {
    return [straight];
  }
  // A unit heading home goes nearly straight; one still drawing its loop can come back anywhere it reaches along its
  // base, so the ends of that stretch of outline bound where it re-enters.
  const reach = distance(head, toPoint(home)) + (unit.fsm?.state === 'back' ? REENTRY_SLACK_BACK : REENTRY_SLACK);
  const ends = SIDES.map((direction) => {
    let index = from;
    for (let step = 0; step < outline.length / CROSSINGS_PER_SPAN; step++) {
      const next = wrapIndex(index + direction, outline.length);
      if (distance(head, outline[next] ?? head) > reach) {
        break;
      }
      index = next;
    }
    return index;
  });
  const captures: Point[][] = [];
  for (const end of new Set([from, ...ends])) {
    for (const direction of SIDES) {
      const arc: Point[] = [];
      for (let index = end; index !== to; index = wrapIndex(index + direction, outline.length)) {
        arc.push(outline[index] ?? home);
      }
      captures.push([...trail, head, ...arc]);
    }
  }
  // And the fan from the head over that stretch, the ground any of those re-entries cuts off on the way in.
  const [forwardEnd = from, backEnd = from] = ends;
  if (forwardEnd !== backEnd) {
    const fan: Point[] = [head];
    for (let index = backEnd; index !== forwardEnd; index = wrapIndex(index + 1, outline.length)) {
      fan.push(outline[index] ?? head);
    }
    fan.push(outline[forwardEnd] ?? head);
    captures.push(fan);
  }
  return captures;
}

function captureObstacles(params: CaptureObstaclesParams): CaptureObstacle[] {
  const obstacles: CaptureObstacle[] = [];
  for (const points of params.captures) {
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const point of points) {
      left = Math.min(left, point.x);
      right = Math.max(right, point.x);
      top = Math.min(top, point.y);
      bottom = Math.max(bottom, point.y);
    }
    const obstacle = { bottom, left, points, right, top };
    if (!insideObstacle(params.position, obstacle)) {
      obstacles.push(obstacle);
    }
  }
  return obstacles;
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
  const { captures, center, obstacles, orientation, outline, position, radius, ring } = context;
  const estimates: Estimate[] = [];
  const step = Math.max(1, Math.floor(ring.length / EXIT_SAMPLES));
  for (let index = 0; index < ring.length; index += step) {
    const { normal, point: exit } = ring[index] ?? { normal: ORIGIN, point: position };
    if (!isClearOfPolygon(position, subtract(exit, scale(normal, EXIT_INSET)), outline) || isInsideAny(exit, captures) || crossesCapture({ from: position, obstacles, to: exit })) {
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
  const exposureLength = trailLength + speed * LOOP_OVERHEAD_SECONDS + RETURN_OVERSHOOT;
  const check = createLoopCheck(exposure, samples, remainingAlong(samples, exposureLength), exposureLength);
  if (enemies.some((enemy) => threatens({ check, enemy, reserve: Math.min(distance(position, exit), speed * PLAN_START_HEADROOM_SECONDS) }))) {
    return;
  }
  // Crossing the base takes time and lets the units move under the plan, so it counts double.
  const seconds = (distance(position, exit) * TRANSIT_WEIGHT + trailLength) / speed + LOOP_OVERHEAD_SECONDS;
  const gain = estimatedGain ?? gainCells(shape, raster, center, radius);
  if (gain > 0) {
    estimates.push({ check, exact: estimatedGain === null, gain, seconds, shape, waypoints: [exit, ...route] });
  }
}

function continuedLoopHome(situation: Situation, route: readonly Point[]): null | WayHome {
  const { game, heading, outline, position, trail } = situation;
  const last = route[route.length - 1];
  const home = last ? nearestPoint(last, outline) : null;
  if (!last || !home || game.units.some((unit) => unit !== situation.player && isInsideAny(home, pendingCaptures(unit)))) {
    return null;
  }
  const away = distance(last, home);
  const aim = away < 1 ? home : add(last, scale(subtract(home, last), 1 + RETURN_OVERSHOOT / away));
  const path = [...route, aim];
  const flown = simulateApproach({ center: toPoint(game.border.center), heading, path, position, radius: game.border.radius, speed: game.config.unitSpeed, trackSelf: true, trail });
  return flown === null ? null : { length: flown, path };
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

function crossesCapture(params: CrossesCaptureParams): boolean {
  const { from, obstacles, to } = params;
  const left = Math.min(from.x, to.x);
  const right = Math.max(from.x, to.x);
  const top = Math.min(from.y, to.y);
  const bottom = Math.max(from.y, to.y);
  return obstacles.some((obstacle) => {
    if (right < obstacle.left || left > obstacle.right || bottom < obstacle.top || top > obstacle.bottom) {
      return false;
    }
    return pointInPolygon(to, obstacle.points) || !isClearOfPolygon(from, to, obstacle.points);
  });
}

/**
 * The point of a polygon farthest from its edges, on a coarse grid over its bounds.
 *
 * @param polygon - The polygon.
 * @returns The point, or `null` when no grid point falls inside.
 */
function deepestPoint(polygon: readonly Point[]): null | Point {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;
  let best: null | Point = null;
  let bestDepth = 0;
  for (let column = 1; column < DEEPEST_POINT_GRID; column++) {
    for (let row = 1; row < DEEPEST_POINT_GRID; row++) {
      const point = { x: left + width * column / DEEPEST_POINT_GRID, y: top + height * row / DEEPEST_POINT_GRID };
      if (!pointInPolygon(point, polygon)) {
        continue;
      }
      const depth = depthInside(point, polygon);
      if (depth > bestDepth) {
        best = point;
        bestDepth = depth;
      }
    }
  }
  return best;
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
  return { direction: unit.direction, hunting: isHunting(unit), position: toPoint(unit.position), target: unit.target ? toPoint(unit.target) : null, trigger: aggroRange(unit, player) };
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
    captures: game.units.filter((unit) => unit !== player && !unit.death).flatMap(pendingCaptures),
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
 * The quickest point out of every pending capture that the player reaches in a straight line without leaving its base,
 * and deep enough inside it that the turn there does not take the player out.
 *
 * @param situation - What the update knows.
 * @param captures - The pending captures.
 * @returns The point, or `null` when no straight way out stays in the base.
 */
function escapePoint(situation: Situation, captures: readonly (readonly Point[])[]): null | Point {
  const { game, heading, outline, position } = situation;
  const speed = game.config.unitSpeed;
  let best: null | Point = null;
  let bestSeconds = Infinity;
  for (let ray = 0; ray < ESCAPE_RAYS; ray++) {
    const angle = heading + ray * FULL_TURN / ESCAPE_RAYS;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    for (let away = ESCAPE_STEP; away <= ESCAPE_MAX_DISTANCE; away += ESCAPE_STEP) {
      const point = add(position, scale(direction, away));
      if (!pointInPolygon(point, outline)) {
        break;
      }
      if (depthInside(point, outline) >= ESCAPE_DEPTH && !isInsideAny(point, captures)) {
        const flown = homeFlightLength({ heading, outline, position, speed, target: point });
        if (flown !== null && flown / speed < bestSeconds) {
          best = point;
          bestSeconds = flown / speed;
        }
        break;
      }
    }
  }
  return best;
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

function exposureCost(params: ExposureCostParams): number {
  return !params.skipFirstLegCost || params.leg > 0 ? params.stepLength : 0;
}

function fallbackReturn(situation: Situation, nearest: Point | undefined): Point[] {
  const { game, heading, position, trail } = situation;
  if (!nearest) {
    return [];
  }
  const wanted = Math.atan2(nearest.y - position.y, nearest.x - position.x);
  for (let index = 0; index <= EDGE_GUARD_RAYS * HALF; index++) {
    for (const side of SIDES) {
      const angle = wanted + side * index * FULL_TURN / EDGE_GUARD_RAYS;
      const target = { x: position.x + Math.cos(angle) * ESCAPE_MAX_DISTANCE, y: position.y + Math.sin(angle) * ESCAPE_MAX_DISTANCE };
      const clear = simulateApproach({ center: toPoint(game.border.center), heading, horizon: true, maxSteps: SELF_CHECK_STEPS, path: [target], position, radius: game.border.radius, speed: game.config.unitSpeed, trackSelf: true, trail });
      if (clear !== null) {
        return [target];
      }
    }
  }
  return [nearest];
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
 * @param route - The remaining planned loop, available as a way home.
 * @returns The point to steer at.
 */
function findWayHome(situation: Situation, route: readonly Point[]): Point[] {
  const { game, heading, outline, position, trail } = situation;
  const center = toPoint(game.border.center);
  const radius = game.border.radius;
  const speed = game.config.unitSpeed;
  const sorted = returnCandidates({ outline, position });
  function aimPast(from: Point, point: Point): Point {
    const away = distance(from, point);
    return away < 1 ? point : add(from, scale(subtract(point, from), 1 + RETURN_OVERSHOOT / away));
  }
  // Ground another unit's capture is about to enclose is no home: the capture kills the player there.
  const captures = game.units.filter((unit) => unit !== situation.player).flatMap(pendingCaptures);
  const free = sorted.filter(({ point }) => !isInsideAny(point, captures));
  let best = continuedLoopHome(situation, route);
  for (const { away, point } of free.length > 0 ? free : sorted) {
    if (best && away > best.length) {
      break;
    }
    const path = [aimPast(position, point)];
    const flown = simulateApproach({ center, heading, path, position, radius, speed, trackSelf: true, trail });
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
      const flown = simulateApproach({ center, heading, path, position, radius, speed, trackSelf: true, trail });
      if (flown !== null && (!best || flown < best.length)) {
        best = { length: flown, path };
      }
    }
  }
  const nearest = sorted[0]?.point;
  return best?.path ?? fallbackReturn(situation, nearest);
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
 * How soon a unit outside its base can be home: straight there when it is heading home, later when it is still drawing
 * its loop, which takes it along its base rather than into it.
 *
 * @param unit - The unit.
 * @param speed - The unit speed.
 * @returns The seconds.
 */
function homeSeconds(unit: Unit, speed: number): number {
  return unit.baseDistance / speed + (unit.fsm?.state === 'back' ? 0 : LOOP_STATE_SLACK_SECONDS);
}

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
    const flown = homeFlightLength({ heading, outline, position, speed, target: point });
    if (flown !== null) {
      best = { point, reach, seconds: flown / speed };
    }
  }
  return best;
}

function insideObstacle(point: Point, obstacle: CaptureObstacle): boolean {
  return point.x >= obstacle.left && point.x <= obstacle.right && point.y >= obstacle.top && point.y <= obstacle.bottom && pointInPolygon(point, obstacle.points);
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
 * Whether a unit heads straight for the trail: a bot in its `attack` state, or a unit that is no bot at all.
 *
 * @param unit - The unit.
 * @returns Whether it hunts.
 */
function isHunting(unit: Unit): boolean {
  return !(unit instanceof Bot) || unit.fsm?.state === 'attack';
}

function isInsideAny(point: Point, polygons: readonly (readonly Point[])[]): boolean {
  return polygons.some((polygon) => pointInPolygon(point, polygon));
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

function keepInside(point: Point, center: Point, radius: number): Point {
  return distance(point, center) > radius ? add(center, scale(normalize(subtract(point, center)), radius)) : point;
}

/**
 * Whether a simulated step touches the trail the simulated flight has laid so far, recording the step's end as part of
 * that trail every few steps.
 *
 * @param laid - The trail laid so far.
 * @param from - Where the step starts.
 * @param to - Where it ends.
 * @param step - The step's index.
 * @returns Whether it touches.
 */
function laysOverItself(laid: Point[], from: Point, to: Point, step: number): boolean {
  if (touchesPolyline(from, to, laid, laid.length - SELF_GRACE_SAMPLES, null)) {
    return true;
  }
  if (step % SELF_SAMPLE_STEPS === 0) {
    laid.push(to);
  }
  return false;
}

/**
 * Flies a loop out and home, measuring its exposure after the exit waypoint.
 *
 * @param input - The player, base, arena and speed.
 * @param waypoints - The loop, starting at its exit.
 * @returns Exposure time multiplied by speed, or `null` when the flight is unsafe.
 */
function loopFlightLength(input: PlanInput, waypoints: readonly Point[]): null | number {
  const { center, heading, outline, position: start, radius, speed } = input;
  const [exit, first] = waypoints;
  const last = waypoints[waypoints.length - 1];
  if (!exit || !first || !last) {
    return null;
  }
  const home = nearestPoint(last, outline);
  if (!home) {
    return null;
  }
  const away = distance(last, home);
  const aim = away < 1 ? home : add(last, scale(subtract(home, last), 1 + RETURN_OVERSHOOT / away));
  return simulateApproach({
    avoids: captureObstacles({ captures: input.captures, position: start }),
    center,
    heading,
    maxSteps: LOOP_SIMULATION_MAX_STEPS,
    path: [...waypoints, aim],
    position: start,
    radius,
    skipFirstLegCost: true,
    speed,
    staysInside: outline,
    trackSelf: true,
    trail: []
  });
}

function nearestDistance(position: Point, points: readonly Point[]): number {
  let nearest = Infinity;
  for (const point of points) {
    nearest = Math.min(nearest, distance(point, position));
  }
  return nearest;
}

function nearestIndex(position: Point, points: readonly Point[]): number {
  let nearest = -1;
  let nearestAway = Infinity;
  for (let index = 0; index < points.length; index++) {
    const away = distance(points[index] ?? position, position);
    if (away < nearestAway) {
      nearestAway = away;
      nearest = index;
    }
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
  return [...readTrail(unit), toPoint(unit.position), toPoint(home)];
}

function pendingCaptures(unit: Unit): Point[][] {
  const cached = cachedCaptures.get(unit);
  if (cached?.generation === captureReadGeneration) {
    return cached.shapes;
  }
  const shapes = buildPendingCaptures(unit);
  cachedCaptures.set(unit, { generation: captureReadGeneration, shapes });
  return shapes;
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

function readOutline(polygon: Polygon): readonly Point[] {
  const cached = preciseOutlines.get(polygon);
  if (cached?.source === polygon.simplify) {
    return cached.points;
  }
  const points = simplifyGeometry({ closed: true, points: polygon.points().map(toPoint), tolerance: GEOMETRY_TOLERANCE });
  preciseOutlines.set(polygon, { points, source: polygon.simplify });
  return points;
}

function readTrail(unit: Unit): readonly Point[] {
  const { polyline } = unit.track;
  const cached = preciseTrails.get(polyline);
  const count = polyline.segments.length;
  if (cached?.length === count && cached.end === polyline.end && cached.start === polyline.start) {
    return cached.points;
  }
  const raw = polyline.points();
  if (raw.length === 0 && polyline.start) {
    raw.push(polyline.start);
  }
  const points = simplifyGeometry({ closed: false, points: raw.map(toPoint), tolerance: GEOMETRY_TOLERANCE });
  preciseTrails.set(polyline, { end: polyline.end, length: count, points, start: polyline.start });
  return points;
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

function returnCandidates(params: ReturnCandidatesParams): ReturnCandidate[] {
  const { outline, position } = params;
  const all = outline.map((point) => ({ away: distance(point, position), point })).sort((a, b) => a.away - b.away);
  const roomy = all.filter(({ point }) => returnEntryPoint({ edge: point, outline, position }) !== null);
  return (roomy.length > 0 ? roomy : all).slice(0, RETURN_CANDIDATES);
}

function safeApproachStep(params: SafeApproachStepParams): boolean {
  const { flight, from, leg, next, target } = params;
  if (leg === 0 && flight.staysInside && distance(next, target) > WAYPOINT_REACHED && (!pointInPolygon(next, flight.staysInside) || !isClearOfPolygon(from, next, flight.staysInside))) {
    return false;
  }
  return !flight.avoids || !crossesCapture({ from, obstacles: flight.avoids, to: next });
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
 * The seconds a unit at full speed takes to turn toward a point and get there.
 *
 * @param position - The unit.
 * @param heading - Its heading, in radians.
 * @param point - The point.
 * @param speed - The unit speed.
 * @returns The seconds.
 */
function travelSeconds(position: Point, heading: number, point: Point, speed: number): number {
  const turn = Math.abs(angleDifference(Math.atan2(point.y - position.y, point.x - position.x), heading));
  return distance(position, point) / speed + turn / TURN_SPEED_RADIANS_PER_SECOND;
}

function verifyCandidate(params: VerifyCandidateParams): Candidate | null {
  const { candidate, input } = params;
  if (candidate.gain <= 0) {
    return null;
  }
  const flown = loopFlightLength(input, candidate.waypoints);
  if (flown === null) {
    return null;
  }
  const extra = Math.max(0, flown - candidate.check.trailLength);
  const check = createLoopCheck(candidate.check.exposure, candidate.check.samples, candidate.check.remaining.map((remaining) => remaining + extra), candidate.check.trailLength + extra);
  const exit = candidate.waypoints[0] ?? input.position;
  return input.enemies.some((enemy) => threatens({ check, enemy, reserve: Math.min(distance(input.position, exit), input.speed * PLAN_START_HEADROOM_SECONDS) })) ? null : { ...candidate, check };
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
