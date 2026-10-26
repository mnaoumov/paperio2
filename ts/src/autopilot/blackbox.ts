/**
 * @file
 *
 * The blackbox pilot: it sees only the pixels a player sees, the canvas as rendered, scaled down, and steers from that.
 * It imports nothing of the engine (a unit test holds it to that); it gets an `ImageData` and returns a direction.
 *
 * How it reads a frame. The player is always at the centre of the view. Its own color is the score bar's, top left; the
 * floor is the color that fills most of the first frame; its trail is its color laid over the floor, lighter. The
 * score bar, the leaderboard, the minimap and its own avatar and name are masked out. Everything else is "other":
 * enemy territory (large connected areas) or enemies and their trails (small ones), which are the danger.
 *
 * How it keeps its bearings. The ground slides under the player by the player's own motion, so an odometer
 * (`odometry.ts`) matches each frame's edges against an older frame's and knows where the player is and how fast it
 * goes. From that the pilot remembers the way it came, its own trail, as a person would, rather than recognizing it by
 * color: the trail is drawn in a blend that changes with the ground under it, and over a foreign territory it looked
 * foreign. Where the remembered trail lies, a foreign pixel is the trail, not a danger.
 *
 * How it plays. Like a cautious player: from its territory it heads out where the floor is free and close, flies a
 * rectangle (out, sideways, back) sized in frames, and turns for home early when anything small and foreign comes
 * near or a leg would run into its own trail. The way back is flown in simulation first, at the speed the odometer
 * measured and the turn rate the player obeys, toward each stretch of its territory in view, and the quickest way that
 * reaches the territory without touching the remembered trail or the wall is the one it steers. With no territory in
 * view it flies back to where it left, which it remembers too.
 */

import type { Point } from './plane.ts';

import { Odometer } from './odometry.ts';
import {
  FULL_TURN,
  HALF,
  normalize,
  rotate,
  segmentDistance,
  SIXTEENTH_TURN,
  THREE_EIGHTHS_TURN
} from './plane.ts';

/** Pixel classes. */
const FLOOR = 0;
const OWN = 1;
const TRAIL = 2;
const OTHER = 3;
const OUTSIDE = 4;
const MASKED = 5;

/** What the debug overlay draws: the class of every pixel the pilot saw, and what it decided. */
export interface BlackboxDebug {
  /** Where the way back aims, in pixels of the scaled-down frame, and whether its simulated flight got home. */
  readonly aim: null | Point;
  readonly aimReached: boolean;
  readonly classes: null | Uint8Array;
  readonly height: number;
  readonly phase: BlackboxPhase;
  /** The nearest danger, in pixels of the scaled-down frame, or `null`. */
  readonly threat: null | Point;
  /** The remembered trail drawn over the frame (see `paintTrack`), or `null`. */
  readonly track: null | Uint8Array;
  /** The distance from the player to the wall, in pixels of the scaled-down frame; `Infinity` with no wall in view. */
  readonly wallAtCenter: number;
  readonly width: number;
}

/** What the pilot is doing. */
export type BlackboxPhase = 'back' | 'home' | 'out' | 'side';

interface Color {
  readonly b: number;
  readonly g: number;
  readonly r: number;
}

/** A bucket of similar colors: their channel sums and how many there were. */
interface ColorBucket {
  b: number;
  count: number;
  g: number;
  r: number;
}

/** A pixel of a foreign trail across the player's ground, and how far it is from the player. */
interface CutCandidate {
  readonly away: number;
  readonly point: Point;
}

/** A simulated way back: whether it reached the territory, and after how many frames it ended. */
interface Flight {
  readonly frames: number;
  readonly reached: boolean;
}

/** A danger seen: where, in frame pixels from where the odometer started, and in which frame. */
interface RememberedThreat {
  readonly at: Point;
  readonly frame: number;
}

/** The way out of the territory, and whether it keeps clear of every unit in view. */
interface WayOut {
  readonly clear: boolean;
  readonly direction: Point;
}

/* eslint-disable no-magic-numbers -- the tuning constants: each is named by its declaration and its comment. */
/** The share of a color laid over the floor that the player's trail is drawn with. */
const TRAIL_ALPHA = 0.6;
/** Squared RGB distances within which a pixel matches a learned color. */
const MATCH_DISTANCE_SQUARED = 30 * 30;
const TRAIL_MATCH_DISTANCE_SQUARED = 22 * 22;
/**
 * Beyond the arena the sky is far bluer and greener than red, and the arena's edge is a grey green. A cyan skin is too,
 * so a thin line of those colors away from the sky is a unit's trail (see {@link reclassifyThinOutside}).
 */
const OUTSIDE_BLUE_MARGIN = 60;
const OUTSIDE_GREEN_MARGIN = 40;
/** A color whose channels lie within this spread is a grey. */
const GREY_SPREAD = 40;
/** A trail or foreign pixel needs this many of its eight neighbors in its class to count. */
const MIN_SAME_NEIGHBORS = 5;
const ARENA_EDGE: Color = { b: 153, g: 167, r: 136 };
/** The HUD, as shares of the frame: the score bar block, the leaderboard and the minimap. */
const SCORE_BAR_WIDTH = 0.26;
const SCORE_BAR_HEIGHT = 0.14;
const LEADERBOARD_LEFT = 0.74;
const LEADERBOARD_HEIGHT = 0.36;
const MINIMAP_LEFT = 0.85;
const MINIMAP_TOP = 0.74;
/** The player's own avatar and name around the centre, as shares of the frame's height. */
const AVATAR_RADIUS = 0.075;
const AVATAR_DIAMETER = AVATAR_RADIUS * 2;
const NAME_TOP = 0.11;
const NAME_BOTTOM = 0.06;
const NAME_HALF_WIDTH = 0.06;
/** The widest the player's name runs either side of the centre, as a share of the frame's height. */
const NAME_STRIP_HALF_WIDTH = 0.25;
/** The player's own score labels ("+0.05%") float up above its name, riding with it; colored, they read as a unit. */
const LABEL_TOP = 0.3;
const LABEL_HALF_WIDTH = 0.12;
/** Where the score bar's color is read, as shares of the frame. */
const SCORE_SAMPLE_LEFT = 0.002;
const SCORE_SAMPLE_RIGHT = 0.04;
const SCORE_SAMPLE_TOP = 0.025;
const SCORE_SAMPLE_BOTTOM = 0.05;
/** Colors are bucketed by this many levels per channel to find the most common one. */
const QUANTUM = 8;
/** Foreign pixels this far inside foreign ground are territory, and all within as far of them; the rest is units and trails. */
const TERRITORY_THICKNESS = 5;
/** Within this many pixels of the HUD, foreign ground is not told apart from units by thickness. */
const HUD_MARGIN = 2 * TERRITORY_THICKNESS;
/** At home, the pilot waits this many frames at most for a nearby unit to go before it leaves away from it. */
const MAX_HOME_WAIT_FRAMES = 1200;
/** Waiting, the pilot heads for ground this many pixels inside its territory, each worth this many pixels of distance. */
const SAFE_DEPTH = 16;
const SAFE_DEPTH_WEIGHT = 3;
/** A foreign trail is across the territory when its ground lies within this many pixels on both sides along an axis. */
const CUT_REACH = 5;
const CUT_AXES: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [1, 1], [1, -1]];
/** Cuts are tried nearest first, this many at most, each this many pixels from the last; one this close is reached. */
const CUT_CANDIDATES = 8;
const CUT_SPACING = 4;
const CUT_ARRIVAL = 2;
/** Once out, a unit within this share of the frame's height of the remembered trail is a danger too. */
const TRACK_DANGER_RADIUS = 0.2;
/** A way out keeps this share of the frame's height from every unit in view along its out leg, or the pilot waits. */
const LEAVE_CLEARANCE = 0.3;
/** A small foreign component this close to the trail or the player, as a share of the frame's height, sends it home. */
const DANGER_RADIUS = 0.5;
/** A danger seen is heeded this many frames after it is last seen. */
const THREAT_MEMORY_FRAMES = 120;
/** The trail is looked for this many pixels out from the avatar, and this many of its pixels there say it is drawn. */
const HEAD_TRAIL_REACH = 6;
const MIN_HEAD_TRAIL = 3;
/** Home is forgotten as a loop's start only after this many frames at home, so a moment's misreading loses nothing. */
const HOME_CONFIRM_FRAMES = 10;
/** The sideways leg follows the territory when one side holds this share more of it than the other. */
const SIDE_OWN_MARGIN = 0.1;
/** The loop, in frames: out and sideways. */
const OUT_FRAMES = 35;
const SIDE_FRAMES = 50;/** A leg runs at least this many frames before foreign ground ahead can end it. */
const MIN_LEG_FRAMES = 8;
/** How far ahead a leg looks for foreign ground, as a share of the frame's height. */
const FLOOR_LOOKAHEAD = 0.25;
/** Turn rate per frame the pilot assumes, as a player sees it: a full turn a second at 60 frames a second. */
const TURN_PER_FRAME = FULL_TURN / 60;
/** Rays cast from the centre to choose the way out, and how far they look, as a share of the frame's height. */
const RAY_COUNT = 24;
const RAY_LENGTH = 0.5;
/** A way out needs free floor past the territory's edge for at least this share of a ray. */
const MIN_FREE_SHARE = 0.4;
/** A way out needs this share of the frame's height of its first stretch past the territory clear of the wall's lookahead. */
const WALL_ROOM = 0.1;
/** The remembered trail, drawn this many pixels either side of its line, is what the way back must not touch. */
const TRACK_CLEARANCE = 3;
/** Within this many pixels of the remembered trail a foreign pixel is the trail itself, drawn over foreign ground. */
const TRACK_PAINT_RADIUS = 5;
/** The newest stretch of the trail, this many pixels long, is under and right behind the head, and cannot be hit. */
const RECENT_TRACK_LENGTH = 10;
/** While at home the pilot keeps this much of its way, so the trail it starts on leaving is remembered whole. */
const HOME_TRACK_LENGTH = 12;
/** The player's speed in frame pixels per frame, until the odometer has measured it. */
const DEFAULT_SPEED = 1.6;
/** Slower than this, the odometer's heading is noise, and the heading the pilot steered stands in. */
const MIN_MEASURED_SPEED = 0.4;
/** A simulated way back gives up after this many frames. */
const MAX_SIMULATION_FRAMES = 300;
/** With no safe way home, escape headings aim this many frame heights away. */
const ESCAPE_REACH = 2;
/** An escape heading costs this many frames of flight per radian it turns away from the current heading. */
const ESCAPE_TURN_COST = 10;
/** An escape heading that flies clear scores this many frames, less its flight home from where it ends. */
const CLEAR_ESCAPE_FRAMES = 1e6;
/** The way back keeps its last aim while that aim's flight takes at most this share of the best one's, plus these frames. */
const AIM_KEEP_SHARE = 1.25;
const AIM_KEEP_FRAMES = 10;
/**
 * Within this many pixels of the wall the player is pressed against it, and turns there are guarded. The wall is
 * measured from the outside beyond the avatar, which hides the edge: pressed, the player reads 10 (measured).
 */
const WALL_CONTACT = 12;
/** Pressed against the wall, a slide that must not reverse keeps the heading this far from the outward normal. */
const WALL_HOLD_ANGLE = 0.3;
/** A simulated way back keeps this many pixels from the outside of the arena. */
const WALL_MARGIN = 5;
/** Outside pixels this deep in the outside are the wall; thinner ones are blends. */
const WALL_THICKNESS = 4;
/** The territory in view is searched for a way back in this many directions, and each aim is this far inside it. */
const RETURN_DIRECTIONS = 32;
const RETURN_AIM_DEPTH = 4;
/** A leg that would touch the remembered trail within this share of the frame's height turns for home. */
const LEG_TRAIL_LOOKAHEAD = 0.15;
/** This many pixels turned the player's own ground in a frame mean a loop closed; the frame's border is left out. */
const CAPTURE_PIXELS = 30;
const CAPTURE_MARGIN = 4;
/** Once out, the ring around the avatar must read as home for this many frames running to stand in for a capture. */
const HOME_STREAK_FRAMES = 45;
/** The remembered trail has closed when this many of its pixels in view, and this share of its drawn ones, are own ground. */
const CLOSED_TRAIL_PIXELS = 20;
const CLOSED_TRAIL_SHARE = 0.9;
/** A trail shorter than this many pixels ends when the ring around the avatar reads as home. */
const SHORT_TRAIL_LENGTH = 2 * RECENT_TRACK_LENGTH;
/** Each measured frame moves the speed this share of the way to the odometer's, and the heading this share. */
const SPEED_SMOOTHING = 0.2;
const HEADING_CORRECTION = 0.15;
/** The remembered trail's raster: near any of it, and too near its older part to pass. */
const TRACK_NEAR = 1;
const TRACK_SOLID = 2;
/** A darker shade keeps every channel between these shares of the color, all within this spread of each other. */
const SHADE_MIN = 0.55;
const SHADE_MAX = 0.92;
const SHADE_SPREAD = 0.12;
/** RGBA channel offsets, and the bucket key's radix, which is 256 / QUANTUM. */
const RED = 0;
const GREEN = 1;
const BLUE = 2;
const CHANNELS = 4;
const BUCKETS_PER_CHANNEL = 32;
/* eslint-enable no-magic-numbers -- end of the tuning constants. */

export class BlackboxPilot {
  public get debug(): BlackboxDebug {
    return { aim: this.aim, aimReached: this.aimReached, classes: this.classes, height: this.height, phase: this.phase, threat: this.threat, track: this.raster, wallAtCenter: this.wall[Math.floor(this.height * HALF) * this.width + Math.floor(this.width * HALF)] ?? Infinity, width: this.width };
  }

  private aim: null | Point = null;
  private aimReached = false;
  private classes: null | Uint8Array = null;
  /** Where the pilot left its territory, in frame pixels from where the odometer started. */
  private exitPoint: null | Point = null;
  private floor: Color | null = null;
  /** Frames decided so far. */
  private frameIndex = 0;
  private framesInPhase = 0;
  /** The heading the pilot believes the player has: the directions it gave, corrected by what the odometer saw. */
  private heading = 0;
  private height = 0;
  /** The territory the player last left from, as a mask of the frame then, and where the player was. */
  private homeMask: null | Uint8Array = null;
  private homeMaskPosition: Point = { x: 0, y: 0 };
  /** Frames running that the ring around the avatar has read as home. */
  private homeStreak = 0;
  /** The way back's last aim, in frame pixels from where the odometer started, or `null`. */
  private lastAim: null | Point = null;
  private readonly odometer = new Odometer(MASKED);
  /** The direction of the loop's way out and of its sideways leg. */
  private outward: Point = { x: 1, y: 0 };
  private own: Color | null = null;
  private phase: BlackboxPhase = 'home';
  /** The last frame's classes and the odometer's position then, to see the territory grow. */
  private previousClasses: null | Uint8Array = null;
  private previousPosition: Point = { x: 0, y: 0 };
  private raster: null | Uint8Array = null;
  private sideFrames = SIDE_FRAMES;
  private sideward: Point = { x: 0, y: 1 };
  /** The player's speed in frame pixels per frame, as the odometer measured it. */
  private speed = DEFAULT_SPEED;
  /** This frame's foreign units and trails (see {@link thinForeign}). */
  private thin: Uint8Array = new Uint8Array(0);
  private threat: null | Point = null;
  /** The dangers seen lately, in frame pixels from where the odometer started, with the frame each was seen in. */
  private threatMemory: RememberedThreat[] = [];
  /** The way the player came since it left its territory, in frame pixels from where the odometer started, oldest first. */
  private track: Point[] = [];
  /** The index in {@link BlackboxPilot.track} where the player last left its territory, or `null` while it is home. */
  private trailStart: null | number = null;
  /** Each pixel's distance to the outside of the arena, this frame (see {@link wallDistance}). */
  private wall: Float32Array = new Float32Array(0);
  private width = 0;

  /**
   * Reads a frame and returns the direction to steer.
   *
   * @param frame - The canvas's pixels, scaled down.
   * @returns The direction in screen axes, or `null` to keep the last one.
   */
  public decide(frame: ImageData): null | Point {
    this.width = frame.width;
    this.height = frame.height;
    this.calibrate(frame);
    const raw = this.classify(frame);
    reclassifyThinOutside(raw, frame.width, frame.height);
    const classes = erodeThin(raw, frame.width, frame.height);
    this.classes = classes;
    this.measureMotion(classes);
    this.recordTrack();
    const raster = this.paintTrack(classes);
    this.raster = raster;
    this.wall = wallDistance(classes, frame.width, frame.height);
    this.aim = null;
    this.thin = thinForeign(classes, frame.width, frame.height);
    const atHome = this.isHome(classes);
    this.previousClasses = classes;
    this.previousPosition = this.odometer.position;
    this.frameIndex++;
    this.threat = this.recallThreat(this.findThreat(raster));
    const wanted = atHome ? this.stepHome(classes) : this.stepAway(classes, raster);
    this.framesInPhase++;
    // An aim right under the player has no direction: the last one stands, and so does the heading.
    if (Math.hypot(wanted.x, wanted.y) < HALF) {
      return null;
    }
    const steered = this.guardWallTurn(wanted);
    this.turnToward(steered);
    return steered;
  }

  /** Forgets the loop in flight and its bearings, as after a respawn or a takeover. */
  public reset(): void {
    this.phase = 'home';
    this.framesInPhase = 0;
    this.exitPoint = null;
    this.lastAim = null;
    this.track = [];
    this.trailStart = null;
    this.homeMask = null;
    this.homeStreak = 0;
    this.previousClasses = null;
    this.threatMemory = [];
    this.odometer.reset();
  }

  /**
   * Toward the inside of the territory in view farthest from a danger, or circling when already there.
   *
   * @param classes - The classified frame.
   * @param threat - The danger, in frame pixels.
   * @returns The direction.
   */
  private awayFromThreat(classes: Uint8Array, threat: Point): Point {
    const { height, width } = this;
    // An aim on the territory's edge would carry the player over it while it turns: depth counts too, up to a turn's width.
    const depth = chamferDistance(classes.map((pixelClass) => pixelClass === OWN || pixelClass === MASKED ? 0 : 1), width, height);
    let best: null | Point = null;
    let bestScore = -Infinity;
    for (let row = 1; row < height - 1; row++) {
      for (let column = 1; column < width - 1; column++) {
        const index = row * width + column;
        const score = Math.hypot(column - threat.x, row - threat.y) + Math.min(depth[index] ?? 0, SAFE_DEPTH) * SAFE_DEPTH_WEIGHT;
        if (score > bestScore && isOwnInside(classes, width, index)) {
          best = { x: column - width * HALF, y: row - height * HALF };
          bestScore = score;
        }
      }
    }
    if (!best || Math.hypot(best.x, best.y) < height * AVATAR_RADIUS) {
      return this.stayHome(classes);
    }
    return normalize(best);
  }

  /**
   * Learns the floor's color (what covers most of the frame) and the player's own color (the score bar's) once.
   *
   * @param frame - The frame.
   */
  private calibrate(frame: ImageData): void {
    this.floor ??= modeColor(frame, 0, 0, frame.width, frame.height);
    this.own ??= modeColor(frame, frame.width * SCORE_SAMPLE_LEFT, frame.height * SCORE_SAMPLE_TOP, frame.width * SCORE_SAMPLE_RIGHT, frame.height * SCORE_SAMPLE_BOTTOM);
  }

  /**
   * How many pixels became the player's own ground since the last frame, away from any edge it had: the ground a closed
   * loop takes. The last frame is lined up with this one by the odometer, and a pixel counts only when nothing around
   * where it was was own ground, so an edge that shifts by a pixel, or the view scrolling, counts nothing.
   *
   * @param classes - The classified frame.
   * @param ground - The ground joined to the territory the trail left from, 0 elsewhere.
   * @returns The count; 0 with no last frame.
   */
  private capturedPixels(classes: Uint8Array, ground: Uint8Array): number {
    const previous = this.previousClasses;
    if (previous?.length !== classes.length) {
      return 0;
    }
    const { height, width } = this;
    const shiftX = Math.round(this.odometer.position.x - this.previousPosition.x);
    const shiftY = Math.round(this.odometer.position.y - this.previousPosition.y);
    let captured = 0;
    for (let row = CAPTURE_MARGIN; row < height - CAPTURE_MARGIN; row++) {
      for (let column = CAPTURE_MARGIN; column < width - CAPTURE_MARGIN; column++) {
        // Only the inside of own ground counts: the wall's dotted stroke blends into specks of the player's color.
        // A closed loop joins the ground it left from; a bot in the player's skin closing its own does not.
        if (ground[row * width + column] !== 0 && isOwnInside(classes, width, row * width + column) && wasForeignAround(previous, width, height, column + shiftX, row + shiftY)) {
          captured++;
        }
      }
    }
    return captured;
  }

  /**
   * The sideways leg turns toward the side where more of the territory lies, so the way back lands on it rather than
   * across the way out; with as much on either side, toward the freer floor.
   *
   * @param classes - The classified frame.
   * @param outward - The way out.
   * @returns The sideways direction.
   */
  private chooseSide(classes: Uint8Array, outward: Point): Point {
    const left = rotate(outward, -Math.PI * HALF);
    const right = rotate(outward, Math.PI * HALF);
    let balance = 0;
    let total = 0;
    for (let index = 0; index < classes.length; index++) {
      if (classes[index] === OWN) {
        const side = (index % this.width - this.width * HALF) * left.x + (Math.floor(index / this.width) - this.height * HALF) * left.y;
        balance += Math.sign(side);
        total++;
      }
    }
    if (total > 0 && Math.abs(balance) > total * SIDE_OWN_MARGIN) {
      return balance > 0 ? left : right;
    }
    return this.countAlong(classes, left, FLOOR) >= this.countAlong(classes, right, FLOOR) ? left : right;
  }

  /**
   * The way out of the territory: of the rays from the centre, the one that leaves the player's color soonest and then
   * runs longest over free floor, with no danger near it.
   *
   * @param classes - The classified frame.
   * @returns The direction.
   */
  private chooseWayOut(classes: Uint8Array): WayOut {
    const reach = this.height * RAY_LENGTH;
    const unitDistance = this.unitDistance();
    const clearance = this.height * LEAVE_CLEARANCE;
    const legLength = OUT_FRAMES * this.speed;
    let best: Point = this.outward;
    let bestScore = -Infinity;
    let bestClear = false;
    for (let ray = 0; ray < RAY_COUNT; ray++) {
      const angle = ray / RAY_COUNT * FULL_TURN;
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      let edge = -1;
      let free = 0;
      let wallAhead = false;
      for (let along = 1; along < reach; along++) {
        const x = this.width * HALF + direction.x * along;
        const y = this.height * HALF + direction.y * along;
        const pixelClass = this.classAt(classes, x, y);
        if (edge < 0) {
          if (pixelClass !== OWN && pixelClass !== MASKED) {
            edge = along;
          } else {
            continue;
          }
        }
        if (pixelClass !== FLOOR) {
          break;
        }
        // The leg stops where its wall lookahead meets the wall: a way out the wall ends that soon has no room to turn.
        if (along - edge < this.height * WALL_ROOM && (this.wall[Math.floor(y) * this.width + Math.floor(x)] ?? Infinity) < this.height * FLOOR_LOOKAHEAD) {
          wallAhead = true;
        }
        free++;
      }
      // A ray that never leaves the territory inside the frame still points somewhere: score it on its length alone. One
      // with too little free floor past the edge, as toward the nearby wall, is worse than that: crossing the territory
      // to another edge beats leaving into a strip too narrow to turn in. A ray toward a threat the pilot has waited out
      // at home loses half its reach.
      const towardThreat = this.threat && (this.threat.x - this.width * HALF) * direction.x + (this.threat.y - this.height * HALF) * direction.y > 0;
      let score = free - edge * HALF;
      if (edge < 0) {
        score = -reach;
      } else if (wallAhead || free < reach * MIN_FREE_SHARE) {
        score = free - reach - reach;
      }
      if (towardThreat) {
        score -= reach * HALF;
      }
      // A unit near the way out, even one beyond the danger radius, can close its own loop round the exit point while
      // the player is out: such a way scores below every clear one.
      const clear = edge >= 0 && this.rayClearance(unitDistance, direction, edge + legLength) >= clearance;
      if (!clear) {
        score -= reach * CHANNELS;
      }
      if (score > bestScore) {
        bestScore = score;
        best = direction;
        bestClear = clear;
      }
    }
    return { clear: bestClear, direction: best };
  }

  private classAt(classes: Uint8Array, x: number, y: number): number {
    const column = Math.floor(x);
    const row = Math.floor(y);
    if (column < 0 || row < 0 || column >= this.width || row >= this.height) {
      return OUTSIDE;
    }
    return classes[row * this.width + column] ?? OUTSIDE;
  }

  private classify(frame: ImageData): Uint8Array {
    const { data, height, width } = frame;
    const classes = new Uint8Array(width * height);
    const own = this.own ?? { b: 0, g: 0, r: 0 };
    const floor = this.floor ?? { b: 0, g: 0, r: 0 };
    const trail = {
      b: own.b * TRAIL_ALPHA + floor.b * (1 - TRAIL_ALPHA),
      g: own.g * TRAIL_ALPHA + floor.g * (1 - TRAIL_ALPHA),
      r: own.r * TRAIL_ALPHA + floor.r * (1 - TRAIL_ALPHA)
    };
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const index = row * width + column;
        if (this.isMasked(column, row)) {
          classes[index] = MASKED;
          continue;
        }
        const offset = index * CHANNELS;
        const color = { b: data[offset + BLUE] ?? 0, g: data[offset + GREEN] ?? 0, r: data[offset + RED] ?? 0 };
        // A pale skin's trail lies close to its own color: each pixel goes to whichever of the two it is nearer.
        const toOwn = distanceSquared(color, own);
        const toTrail = distanceSquared(color, trail);
        if (distanceSquared(color, floor) < MATCH_DISTANCE_SQUARED) {
          classes[index] = FLOOR;
        } else if (toTrail < TRAIL_MATCH_DISTANCE_SQUARED && toTrail < toOwn) {
          classes[index] = TRAIL;
        } else if (toOwn < MATCH_DISTANCE_SQUARED || isDarkerShade(color, own)) {
          classes[index] = OWN;
        } else if ((color.b - color.r > OUTSIDE_BLUE_MARGIN && color.g - color.r > OUTSIDE_GREEN_MARGIN) || distanceSquared(color, ARENA_EDGE) < MATCH_DISTANCE_SQUARED) {
          classes[index] = OUTSIDE;
        } else if (Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b) < GREY_SPREAD) {
          // A grey is a unit's skin as often as text: a dark grey bot is a bot. The player's own name is told apart by
          // place; other units' names are thin strokes, which the erosion drops, and float right by their units anyway.
          classes[index] = this.isOwnNameStrip(column, row) ? MASKED : OTHER;
        } else {
          classes[index] = OTHER;
        }
      }
    }
    return classes;
  }

  private countAlong(classes: Uint8Array, direction: Point, pixelClass: number): number {
    const reach = this.height * RAY_LENGTH;
    let count = 0;
    for (let along = 1; along < reach; along++) {
      if (this.classAt(classes, this.width * HALF + direction.x * along, this.height * HALF + direction.y * along) === pixelClass) {
        count++;
      }
    }
    return count;
  }

  /**
   * Whether the player reaches a cut on a foreign trail without leaving its own ground: flown in simulation at the
   * measured speed and the turn rate, every pixel on the way is its ground, hidden, or the thin unit or trail it cuts.
   *
   * @param classes - The classified frame.
   * @param target - The cut, in frame pixels.
   * @returns Whether it does.
   */
  private cutStaysHome(classes: Uint8Array, target: Point): boolean {
    let x = this.width * HALF;
    let y = this.height * HALF;
    let heading = this.heading;
    for (let frame = 1; frame <= MAX_SIMULATION_FRAMES; frame++) {
      heading += Math.max(-TURN_PER_FRAME, Math.min(TURN_PER_FRAME, wrapAngle(Math.atan2(target.y - y, target.x - x) - heading)));
      x += Math.cos(heading) * this.speed;
      y += Math.sin(heading) * this.speed;
      if (Math.hypot(target.x - x, target.y - y) < CUT_ARRIVAL) {
        return true;
      }
      const pixelClass = this.classAt(classes, x, y);
      const thin = this.thin[Math.floor(y) * this.width + Math.floor(x)] === 1;
      if (pixelClass === FLOOR || pixelClass === OUTSIDE || (pixelClass === OTHER && !thin)) {
        return false;
      }
    }
    return false;
  }

  /**
   * With no safe way home in view, the heading that flies longest before the trail or the wall, out into open floor,
   * where a way home opens up; a heading that reaches the territory on the way counts as flying the whole way.
   *
   * @param home - Nonzero on the territory's pixels.
   * @param raster - The remembered trail.
   * @param wall - Each pixel's distance to the outside of the arena.
   * @returns The aim, in frame pixels.
   */
  private escape(home: Uint8Array, raster: Uint8Array, wall: Float32Array): Point {
    let best: Point = { x: this.width * HALF - this.outward.x, y: this.height * HALF - this.outward.y };
    let bestFrames = -Infinity;
    const position = this.odometer.position;
    const left = this.exitPoint ?? this.track[0];
    const homeAim = left ? { x: left.x - position.x + this.width * HALF, y: left.y - position.y + this.height * HALF } : null;
    for (let ray = 0; ray < RAY_COUNT; ray++) {
      const angle = ray / RAY_COUNT * FULL_TURN;
      const aim = { x: this.width * HALF + Math.cos(angle) * this.height * ESCAPE_REACH, y: this.height * HALF + Math.sin(angle) * this.height * ESCAPE_REACH };
      const flight = this.simulateReturn(home, raster, aim, wall);
      // Of the headings that fly clear, the one that ends nearest where the player left, so the escape works its way
      // home round the trail rather than away; then the one nearest the current heading, so it does not weave.
      const toHome = homeAim ? Math.hypot(aim.x - homeAim.x, aim.y - homeAim.y) / Math.max(MIN_MEASURED_SPEED, this.speed) : 0;
      // A heading that flies clear always beats one that does not, however far from home it ends.
      const frames = (flight.reached ? CLEAR_ESCAPE_FRAMES - toHome : flight.frames) - Math.abs(wrapAngle(angle - this.heading)) * ESCAPE_TURN_COST;
      if (frames > bestFrames) {
        best = aim;
        bestFrames = frames;
      }
    }
    return best;
  }

  /**
   * The nearest foreign unit or trail (thin foreign pixels, not territory) within the danger radius of the player or,
   * once out, near its remembered trail, in frame pixels. A unit leaving its territory is joined to it, so territory is
   * told apart by thickness rather than by the size of what is connected.
   *
   * @param raster - The remembered trail.
   * @returns The danger, or `null`.
   */
  private findThreat(raster: Uint8Array): null | Point {
    const { height, thin, width } = this;
    const nearTrack = this.phase === 'home' ? null : chamferDistance(raster.map((value) => value === 0 ? 0 : 1), width, height);
    const radius = height * DANGER_RADIUS;
    const trackRadius = height * TRACK_DANGER_RADIUS;
    const centerX = width * HALF;
    const centerY = height * HALF;
    let nearest: null | Point = null;
    let nearestDistance = Infinity;
    for (let index = 0; index < thin.length; index++) {
      if (thin[index] === 0) {
        continue;
      }
      const point = { x: index % width, y: Math.floor(index / width) };
      // The HUD cuts territory into slivers as thin as a trail: beside it, thinness says nothing.
      if (isHud(point.x / width, point.y / height, HUD_MARGIN / width, HUD_MARGIN / height)) {
        continue;
      }
      const away = Math.hypot(point.x - centerX, point.y - centerY);
      if (away < nearestDistance && (away < radius || (nearTrack?.[index] ?? Infinity) < trackRadius)) {
        nearest = point;
        nearestDistance = away;
      }
    }
    return nearest;
  }

  /** Forgets the way the player came but its last stretch, where a trail would start if it left now. */
  private forgetTrack(): void {
    const position = this.odometer.position;
    let covered = 0;
    for (let index = this.track.length - 1; index > 0; index--) {
      const end = this.track[index] ?? position;
      const start = this.track[index - 1] ?? end;
      covered += Math.hypot(end.x - start.x, end.y - start.y);
      if (covered > HOME_TRACK_LENGTH) {
        this.track.splice(0, index - 1);
        break;
      }
    }
    this.trailStart = null;
  }

  /**
   * The direction to steer instead of `wanted`, so that against the wall the heading never swings through the wall's
   * outward normal. The engine turns the shortest way, and pressed against the wall a heading that crosses the outward
   * normal reverses the slide, back over the trail just laid: the player dies by the wall. Such a turn goes the long way
   * round, through the inward side, at most three eighths of a turn from the heading at a time; a target back along the
   * wall keeps the slide going forward.
   *
   * @param wanted - The direction the pilot wants.
   * @returns The direction to steer.
   */
  private guardWallTurn(wanted: Point): Point {
    const centerX = this.width * HALF;
    const centerY = this.height * HALF;
    if ((this.wall[Math.floor(centerY) * this.width + Math.floor(centerX)] ?? Infinity) >= WALL_CONTACT) {
      return wanted;
    }
    const inward = wallGradient(this.wall, this.width, this.height, centerX, centerY);
    if (inward.x === 0 && inward.y === 0) {
      return wanted;
    }
    const outward = Math.atan2(-inward.y, -inward.x);
    const from = wrapAngle(this.heading - outward);
    const turn = wrapAngle(Math.atan2(wanted.y, wanted.x) - this.heading);
    const to = from + turn;
    if (from === 0 || Math.sign(from) === Math.sign(to) || Math.abs(to) >= Math.PI) {
      return wanted;
    }
    let angle: number;
    if (Math.abs(to) <= Math.PI * HALF) {
      angle = outward + Math.sign(from) * WALL_HOLD_ANGLE;
    } else {
      const longWay = turn - Math.sign(turn) * FULL_TURN;
      angle = this.heading + Math.sign(longWay) * Math.min(Math.abs(longWay), THREE_EIGHTHS_TURN);
    }
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  /**
   * The player's own ground in view: the pixels of its color joined to the ground it left from. A unit's skin can share
   * the player's color, so a patch of that color the player did not leave from is not taken for home.
   *
   * @param classes - The classified frame.
   * @returns Nonzero on the territory's pixels; every pixel of the player's color before the first loop.
   */
  private homeGround(classes: Uint8Array): Uint8Array {
    const { homeMask, width } = this;
    if (!homeMask) {
      return classes.map((pixelClass) => pixelClass === OWN ? 1 : 0);
    }
    const shiftX = Math.round(this.odometer.position.x - this.homeMaskPosition.x);
    const shiftY = Math.round(this.odometer.position.y - this.homeMaskPosition.y);
    const seeds: number[] = [];
    for (let index = 0; index < classes.length; index++) {
      if (classes[index] !== OWN) {
        continue;
      }
      // The ground at this pixel was at this pixel plus the shift when the player left.
      const column = index % width + shiftX;
      const row = Math.floor(index / width) + shiftY;
      if (column >= 0 && row >= 0 && column < width && row < this.height && homeMask[row * width + column] !== 0) {
        seeds.push(index);
      }
    }
    return floodClass(classes, width, seeds, OWN);
  }

  /**
   * Whether the way ahead is free floor: a leg stops early at foreign territory or the wall rather than run into it.
   *
   * @param classes - The classified frame.
   * @param direction - The leg's direction.
   * @param blocker - The class that blocks it: foreign ground or the outside.
   * @returns Whether it is free.
   */
  private isFloorAhead(classes: Uint8Array, direction: Point, blocker: number): boolean {
    // The wall is looked for from the avatar's edge: one closer than a turn's width is the one that kills.
    const start = this.height * (blocker === OUTSIDE ? AVATAR_RADIUS : AVATAR_DIAMETER);
    const reach = this.height * FLOOR_LOOKAHEAD;
    for (let along = start; along < reach; along++) {
      const x = this.width * HALF + direction.x * along;
      const y = this.height * HALF + direction.y * along;
      const atWall = blocker === OUTSIDE && (this.wall[Math.floor(y) * this.width + Math.floor(x)] ?? Infinity) < 1;
      if (atWall || (blocker !== OUTSIDE && this.classAt(classes, x, y) === blocker)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Whether the player is home. Before it leaves, the ring around the avatar decides, with no trail drawn at the head.
   * Once it has left, only its territory growing says the loop closed: running just outside a concave edge, the
   * territory can fill most of the ring, and a pale skin's trail is not told from the floor by color. A ring of its
   * ground held for long enough stands in, should a capture be missed.
   *
   * @param classes - The classified frame.
   * @returns Whether it is.
   */
  private isHome(classes: Uint8Array): boolean {
    if (this.trailStart === null) {
      const ringHome = this.ownNearCenter(classes, null) && !this.trailAtHead(classes);
      this.homeStreak = ringHome ? this.homeStreak + 1 : 0;
      return ringHome;
    }
    // Once out, only the ground joined to the territory it left counts: a bot can wear the player's skin, and its
    // territory then reads as the player's color all round.
    const ground = this.homeGround(classes);
    const ringHome = this.ownNearCenter(classes, ground) && !this.trailAtHead(classes);
    this.homeStreak = ringHome ? this.homeStreak + 1 : 0;
    // A trail no longer than the stretch under the head was never drawn clear of the avatar: back on the ground at once.
    return this.capturedPixels(classes, ground) >= CAPTURE_PIXELS || this.homeStreak >= HOME_STREAK_FRAMES || (ringHome && (this.trailClosed(classes) || this.trailLength() < SHORT_TRAIL_LENGTH));
  }

  private isMasked(column: number, row: number): boolean {
    const { height, width } = this;
    const x = column / width;
    const y = row / height;
    if (isHud(x, y, 0, 0)) {
      return true;
    }
    const dx = (column - width * HALF) / height;
    const dy = (row - height * HALF) / height;
    return Math.hypot(dx, dy) < AVATAR_RADIUS || (Math.abs(dx) < NAME_HALF_WIDTH && dy > -NAME_TOP && dy < -NAME_BOTTOM) || (Math.abs(dx) < LABEL_HALF_WIDTH && dy > -LABEL_TOP && dy <= -NAME_TOP);
  }

  /**
   * Whether a pixel lies in the strip the player's own name is drawn in, at its widest. A name is as long as the
   * player made it, so its grey letters are told from a grey unit by place, not color.
   *
   * @param column - The pixel's column.
   * @param row - Its row.
   * @returns Whether it does.
   */
  private isOwnNameStrip(column: number, row: number): boolean {
    const dx = (column - this.width * HALF) / this.height;
    const dy = (row - this.height * HALF) / this.height;
    return Math.abs(dx) < NAME_STRIP_HALF_WIDTH && dy > -NAME_TOP && dy < -NAME_BOTTOM;
  }

  /**
   * Moves the odometer on by this frame and takes the speed and heading it measured.
   *
   * @param classes - The classified frame.
   */
  private measureMotion(classes: Uint8Array): void {
    const predicted = { x: Math.cos(this.heading) * this.speed, y: Math.sin(this.heading) * this.speed };
    this.odometer.update(classes, this.width, this.height, predicted);
    const { velocity } = this.odometer;
    const measuredSpeed = Math.hypot(velocity.x, velocity.y);
    if (!this.odometer.measured || measuredSpeed < MIN_MEASURED_SPEED) {
      return;
    }
    this.speed += (measuredSpeed - this.speed) * SPEED_SMOOTHING;
    // The averaged velocity lags a turn, so it corrects the steered heading only part of the way, every frame.
    const difference = wrapAngle(Math.atan2(velocity.y, velocity.x) - this.heading);
    this.heading += difference * HEADING_CORRECTION;
  }

  /**
   * The nearest pixel of a foreign unit or trail in view, beside the HUD or not.
   *
   * @returns It, in frame pixels, or `null`.
   */
  private nearestUnit(): null | Point {
    const { height, thin, width } = this;
    let nearest: null | Point = null;
    let nearestDistance = Infinity;
    for (let index = 0; index < thin.length; index++) {
      const x = index % width;
      const y = Math.floor(index / width);
      if (thin[index] === 0 || isHud(x / width, y / height, HUD_MARGIN / width, HUD_MARGIN / height)) {
        continue;
      }
      const away = Math.hypot(x - width * HALF, y - height * HALF);
      if (away < nearestDistance) {
        nearest = { x, y };
        nearestDistance = away;
      }
    }
    return nearest;
  }

  private ownNearCenter(classes: Uint8Array, ground: null | Uint8Array): boolean {
    // The avatar hides the pixel under the player; the territory around it decides. A unit beside the player hides the
    // ground under it as the avatar does, and does not make home read as away.
    const radius = this.height * AVATAR_RADIUS * (1 + HALF);
    let own = 0;
    let seen = 0;
    for (let angle = 0; angle < FULL_TURN; angle += SIXTEENTH_TURN) {
      const x = this.width * HALF + Math.cos(angle) * radius;
      const y = this.height * HALF + Math.sin(angle) * radius;
      const pixelClass = this.classAt(classes, x, y);
      if (pixelClass !== MASKED && this.thin[Math.floor(y) * this.width + Math.floor(x)] !== 1) {
        seen++;
        if (pixelClass === OWN && (ground?.[Math.floor(y) * this.width + Math.floor(x)] ?? 1) !== 0) {
          own++;
        }
      }
    }
    return seen > 0 && own / seen > HALF + HALF * HALF;
  }

  /**
   * Whether the player's own ground lies within {@link CUT_REACH} pixels of a pixel in one direction, past whatever
   * foreign pixels lie between.
   *
   * @param classes - The classified frame.
   * @param x - The pixel's column.
   * @param y - Its row.
   * @param dx - The direction across.
   * @param dy - The direction down.
   * @returns Whether it does.
   */
  private ownWithin(classes: Uint8Array, x: number, y: number, dx: number, dy: number): boolean {
    for (let step = 1; step <= CUT_REACH; step++) {
      const pixelClass = this.classAt(classes, x + dx * step + HALF, y + dy * step + HALF);
      if (pixelClass === OWN) {
        return true;
      }
      if (pixelClass !== OTHER) {
        return false;
      }
    }
    return false;
  }

  /**
   * Draws the remembered trail into a raster of the frame: {@link TRACK_NEAR} around all of it, and
   * {@link TRACK_SOLID} around its older part, which the way back must not touch. Foreign pixels near it are relabelled
   * as the trail, since the trail over foreign ground is not a danger.
   *
   * @param classes - The classified frame, relabelled in place.
   * @returns The raster.
   */
  private paintTrack(classes: Uint8Array): Uint8Array {
    const { height, width } = this;
    const raster = new Uint8Array(width * height);
    const position = this.odometer.position;
    const offsetX = width * HALF - position.x;
    const offsetY = height * HALF - position.y;
    let covered = 0;
    for (let index = this.track.length - 1; index > 0; index--) {
      const end = this.track[index] ?? position;
      const start = this.track[index - 1] ?? end;
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      const steps = Math.max(1, Math.ceil(length));
      for (let step = 0; step < steps; step++) {
        const t = step / steps;
        const x = end.x + (start.x - end.x) * t + offsetX;
        const y = end.y + (start.y - end.y) * t + offsetY;
        stampDisk(raster, width, height, x, y, TRACK_PAINT_RADIUS, TRACK_NEAR);
        // Only the way since the player left is a trail; the stretch before it lay inside the territory.
        if (this.trailStart !== null && index > this.trailStart && covered + length * t > RECENT_TRACK_LENGTH) {
          stampDisk(raster, width, height, x, y, TRACK_CLEARANCE, TRACK_SOLID);
        }
      }
      covered += length;
    }
    for (let index = 0; index < raster.length; index++) {
      // A trail over foreign ground reads as foreign, and a greyish trail as grey text: where the pilot remembers its
      // trail, both are the trail. The HUD and the avatar stay masked.
      const pixelClass = classes[index];
      if (raster[index] !== 0 && (pixelClass === OTHER || (pixelClass === MASKED && !this.isMasked(index % width, Math.floor(index / width))))) {
        classes[index] = TRAIL;
      }
    }
    return raster;
  }

  /**
   * The way back: each stretch of the territory in view is flown to in simulation, at the measured speed and the turn
   * rate, and the quickest flight that reaches it without touching the remembered trail or the wall is taken. With no
   * territory in view, it flies to where the player left.
   *
   * @param classes - The classified frame.
   * @param raster - The remembered trail.
   * @returns The direction.
   */
  private planReturn(classes: Uint8Array, raster: Uint8Array): Point {
    const { height, width } = this;
    const centerX = width * HALF;
    const centerY = height * HALF;
    const home = this.homeGround(classes);
    const { wall } = this;
    const nearest = new Array<null | Point>(RETURN_DIRECTIONS).fill(null);
    const nearestDistance = new Array<number>(RETURN_DIRECTIONS).fill(Infinity);
    for (let index = width + 1; index < classes.length - width - 1; index++) {
      // Only the inside of the territory is aimed at: specks of the player's color line other edges.
      if (home[index] === 0 || !isOwnInside(classes, width, index)) {
        continue;
      }
      const dx = index % width - centerX;
      const dy = Math.floor(index / width) - centerY;
      const away = Math.hypot(dx, dy);
      const bin = Math.floor((Math.atan2(dy, dx) + Math.PI) / FULL_TURN * RETURN_DIRECTIONS) % RETURN_DIRECTIONS;
      if (away < (nearestDistance[bin] ?? Infinity)) {
        nearestDistance[bin] = away;
        nearest[bin] = { x: dx, y: dy };
      }
    }
    const aims: Point[] = [];
    for (const offset of nearest) {
      if (offset) {
        const deeper = normalize(offset);
        aims.push({ x: centerX + offset.x + deeper.x * RETURN_AIM_DEPTH, y: centerY + offset.y + deeper.y * RETURN_AIM_DEPTH });
      }
    }
    aims.push(...this.rememberedAims(aims.length === 0));
    const position = this.odometer.position;
    const best = this.quickestAim(home, raster, aims);
    const aim = best ?? this.escape(home, raster, wall);
    this.lastAim = best ? { x: aim.x - centerX + position.x, y: aim.y - centerY + position.y } : null;
    this.aim = aim;
    this.aimReached = best !== null;
    return normalize({ x: aim.x - centerX, y: aim.y - centerY });
  }

  /**
   * Of the aims, the one whose simulated flight reaches home soonest. The last aim stands while it is still reached and
   * not much slower: an aim that jumps from frame to frame turns the player one way and then the other, into a curl over
   * its own trail.
   *
   * @param home - Nonzero on the territory's pixels.
   * @param raster - The remembered trail.
   * @param aims - The aims, in frame pixels.
   * @returns The aim, or `null` when none is reached.
   */
  private quickestAim(home: Uint8Array, raster: Uint8Array, aims: readonly Point[]): null | Point {
    let best: null | Point = null;
    let bestFrames = Infinity;
    for (const aim of aims) {
      const flight = this.simulateReturn(home, raster, aim, this.wall);
      if (flight.reached && flight.frames < bestFrames) {
        best = aim;
        bestFrames = flight.frames;
      }
    }
    if (this.lastAim && best) {
      const position = this.odometer.position;
      const kept = { x: this.lastAim.x - position.x + this.width * HALF, y: this.lastAim.y - position.y + this.height * HALF };
      const flight = this.simulateReturn(home, raster, kept, this.wall);
      if (flight.reached && flight.frames <= bestFrames * AIM_KEEP_SHARE + AIM_KEEP_FRAMES) {
        return kept;
      }
    }
    return best;
  }

  /**
   * How near a ray from the centre comes to a foreign unit or trail.
   *
   * @param unitDistance - Each pixel's distance to the nearest unit (see {@link unitDistance}).
   * @param direction - The ray's direction.
   * @param length - How far it runs, in pixels.
   * @returns The least distance along it; `Infinity` with no unit in view.
   */
  private rayClearance(unitDistance: Float32Array, direction: Point, length: number): number {
    let least = Infinity;
    for (let along = 1; along < length; along++) {
      const column = Math.floor(this.width * HALF + direction.x * along);
      const row = Math.floor(this.height * HALF + direction.y * along);
      if (column < 0 || row < 0 || column >= this.width || row >= this.height) {
        break;
      }
      least = Math.min(least, unitDistance[row * this.width + column] ?? Infinity);
    }
    return least;
  }

  /**
   * Remembers the danger seen this frame, and with none in view, recalls the nearest one seen in the last
   * {@link THREAT_MEMORY_FRAMES} frames that was within the danger radius: a unit that just left the view, or slipped
   * out of the radius, has not gone, and the original bots turn on a trail from there.
   *
   * @param seen - The danger in view, in frame pixels, or `null`.
   * @returns The danger to heed, in frame pixels (possibly outside the frame), or `null`.
   */
  private recallThreat(seen: null | Point): null | Point {
    const position = this.odometer.position;
    const centerX = this.width * HALF;
    const centerY = this.height * HALF;
    if (seen) {
      this.threatMemory.push({ at: { x: seen.x - centerX + position.x, y: seen.y - centerY + position.y }, frame: this.frameIndex });
    }
    this.threatMemory = this.threatMemory.filter((memory) => this.frameIndex - memory.frame <= THREAT_MEMORY_FRAMES);
    if (seen) {
      return seen;
    }
    let nearest: null | Point = null;
    let nearestDistance = this.height * DANGER_RADIUS;
    for (const { at } of this.threatMemory) {
      const away = Math.hypot(at.x - position.x, at.y - position.y);
      if (away < nearestDistance) {
        nearest = { x: at.x - position.x + centerX, y: at.y - position.y + centerY };
        nearestDistance = away;
      }
    }
    return nearest;
  }

  /** Remembers where the player is, keeping only the last stretch while it is at home. */
  private recordTrack(): void {
    const position = this.odometer.position;
    const last = this.track.at(-1);
    if (!last || Math.hypot(position.x - last.x, position.y - last.y) >= 1) {
      this.track.push(position);
    }
    if (this.phase === 'home' && this.framesInPhase >= HOME_CONFIRM_FRAMES) {
      this.forgetTrack();
    }
  }

  /**
   * Where the player left, as aims: home too, in view or not. When every stretch in view is cut off by the trail, the
   * way round to it may still be open.
   *
   * @param inView - Whether to aim at it even inside the view, as when no territory is in view.
   * @returns The aims, in frame pixels.
   */
  private rememberedAims(inView: boolean): Point[] {
    const position = this.odometer.position;
    const aims: Point[] = [];
    for (const remembered of [this.exitPoint, this.track[0]]) {
      if (remembered) {
        const aim = { x: remembered.x - position.x + this.width * HALF, y: remembered.y - position.y + this.height * HALF };
        if (inView || aim.x < 0 || aim.y < 0 || aim.x >= this.width || aim.y >= this.height) {
          aims.push(aim);
        }
      }
    }
    return aims;
  }

  /**
   * Remembers the territory the player is leaving: the ground of its color joined to the ring around the avatar.
   *
   * @param classes - The classified frame.
   */
  private rememberHome(classes: Uint8Array): void {
    const radius = this.height * AVATAR_RADIUS * (1 + HALF);
    const seeds: number[] = [];
    for (let angle = 0; angle < FULL_TURN; angle += SIXTEENTH_TURN * HALF) {
      const column = Math.floor(this.width * HALF + Math.cos(angle) * radius);
      const row = Math.floor(this.height * HALF + Math.sin(angle) * radius);
      const index = row * this.width + column;
      if (classes[index] === OWN) {
        seeds.push(index);
      }
    }
    if (seeds.length > 0) {
      this.homeMask = floodClass(classes, this.width, seeds, OWN);
      this.homeMaskPosition = this.odometer.position;
    }
  }

  private setPhase(phase: BlackboxPhase): void {
    this.phase = phase;
    this.framesInPhase = 0;
  }

  /**
   * Flies the player toward an aim the way the engine would, at the measured speed and the turn rate, re-aiming every
   * frame as the pilot will.
   *
   * @param home - Nonzero on the territory's pixels (see {@link BlackboxPilot.homeGround}).
   * @param raster - The remembered trail.
   * @param aim - The aim, in frame pixels.
   * @param wall - Each pixel's distance to the outside of the arena.
   * @returns Whether the flight reached the territory (or an aim beyond the view), and how many frames it flew.
   */
  private simulateReturn(home: Uint8Array, raster: Uint8Array, aim: Point, wall: Float32Array): Flight {
    const { height, width } = this;
    let x = width * HALF;
    let y = height * HALF;
    let heading = this.heading;
    // A player already pressed against the wall is held only to not going nearer it, or no way would leave the wall.
    const wallLimit = Math.min(WALL_MARGIN, (wall[Math.floor(y) * width + Math.floor(x)] ?? Infinity) - 1);
    for (let frame = 1; frame <= MAX_SIMULATION_FRAMES; frame++) {
      heading += Math.max(-TURN_PER_FRAME, Math.min(TURN_PER_FRAME, wrapAngle(Math.atan2(aim.y - y, aim.x - x) - heading)));
      let stepX = Math.cos(heading) * this.speed;
      let stepY = Math.sin(heading) * this.speed;
      // Pressed against the wall, the engine slides the player along it: the step's part into the wall is dropped.
      const ahead = wall[Math.floor(y + stepY) * width + Math.floor(x + stepX)] ?? Infinity;
      if (ahead < wallLimit) {
        const inward = wallGradient(wall, width, height, x, y);
        const into = stepX * inward.x + stepY * inward.y;
        if (into < 0) {
          stepX -= into * inward.x;
          stepY -= into * inward.y;
        }
      }
      x += stepX;
      y += stepY;
      const column = Math.floor(x);
      const row = Math.floor(y);
      if (column < 0 || row < 0 || column >= width || row >= height) {
        // Out of view the raster says nothing: the rest of the way is a straight line, checked against the remembered
        // trail itself. An aim inside the view that the flight overshot is not reached.
        if (aim.x >= 0 && aim.y >= 0 && aim.x < width && aim.y < height) {
          continue;
        }
        const rest = Math.hypot(aim.x - x, aim.y - y);
        if (this.trackCrosses({ x, y }, aim)) {
          return { frames: frame, reached: false };
        }
        return { frames: frame + rest / Math.max(MIN_MEASURED_SPEED, this.speed), reached: true };
      }
      // The trail starts on the territory's edge, so entering beside its start crosses it: the trail comes first.
      const index = row * width + column;
      // Pressed against the wall, a turn folds the engine's slide back onto the trail: the wall is kept at a margin.
      // A slide stays a pixel's rounding off the limit; nearer than that, the flight runs into the wall.
      if (raster[index] === TRACK_SOLID || (wall[index] ?? Infinity) < wallLimit - 1) {
        return { frames: frame, reached: false };
      }
      if (home[index] !== 0) {
        return { frames: frame, reached: true };
      }
    }
    return { frames: MAX_SIMULATION_FRAMES, reached: false };
  }

  /**
   * Keeps inside the territory: toward the middle of what is in view of it, or circling when already there.
   *
   * @param classes - The classified frame.
   * @returns The direction.
   */
  private stayHome(classes: Uint8Array): Point {
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (let index = 0; index < classes.length; index++) {
      if (classes[index] === OWN) {
        sumX += index % this.width - this.width * HALF;
        sumY += Math.floor(index / this.width) - this.height * HALF;
        count++;
      }
    }
    const toMiddle = { x: sumX / Math.max(1, count), y: sumY / Math.max(1, count) };
    if (Math.hypot(toMiddle.x, toMiddle.y) > this.height * AVATAR_RADIUS) {
      return normalize(toMiddle);
    }
    return { x: Math.cos(this.heading + Math.PI * HALF), y: Math.sin(this.heading + Math.PI * HALF) };
  }

  /**
   * One frame away from home: the loop's legs, ended by the clock, by what lies ahead or by a threat, then the way back.
   *
   * @param classes - The classified frame.
   * @param raster - The remembered trail.
   * @returns The direction.
   */
  private stepAway(classes: Uint8Array, raster: Uint8Array): Point {
    if (this.phase === 'home') {
      this.setPhase('out');
      this.exitPoint = this.odometer.position;
      // After a misread home the trail goes on from where it really started.
      this.trailStart ??= this.track.length - 1;
      this.rememberHome(classes);
      this.sideward = this.chooseSide(classes, this.outward);
      this.sideFrames = SIDE_FRAMES;
    }
    if (this.phase === 'back') {
      // Back inside but for a capture too small to see: deeper in, not along a stale aim back out over the edge.
      if (this.homeStreak === 0) {
        return this.planReturn(classes, raster);
      }
      // With a unit near, the far side from it, as at home.
      return this.threat ? this.awayFromThreat(classes, this.threat) : this.stayHome(classes);
    }
    const leg = this.phase === 'out' ? this.outward : this.sideward;
    // Foreign ground ahead ends a leg only once it is under way, so it can leave across a neighbor; the wall at once.
    const blocked = (this.framesInPhase > MIN_LEG_FRAMES && !this.isFloorAhead(classes, leg, OTHER)) || !this.isFloorAhead(classes, leg, OUTSIDE);
    if (this.threat || this.trackAhead(classes, raster, leg)) {
      this.setPhase('back');
    } else if (this.phase === 'out' && (this.framesInPhase >= OUT_FRAMES || blocked)) {
      this.setPhase('side');
    } else if (this.phase === 'side' && (this.framesInPhase >= this.sideFrames || blocked)) {
      this.setPhase('back');
    }
    switch (this.phase) {
      case 'out':
        return this.outward;
      case 'side':
        return this.sideward;
      default:
        return this.planReturn(classes, raster);
    }
  }

  /**
   * One frame at home: wait inside while a unit is near, else pick the way out.
   *
   * @param classes - The classified frame.
   * @returns The direction.
   */
  private stepHome(classes: Uint8Array): Point {
    if (this.phase !== 'home') {
      this.setPhase('home');
      this.lastAim = null;
      // The loop's trail is the territory's edge now: forget it at once, or its memory walls the territory off.
      this.forgetTrack();
    }
    // A unit's trail across the territory is cut from inside it, where the player lays no trail: crossing a trail kills
    // its owner, and that trail is the start of a capture that would take the player's ground, the player with it.
    const cut = this.trailInTerritory(classes);
    if (cut) {
      this.aim = cut;
      return normalize({ x: cut.x - this.width * HALF, y: cut.y - this.height * HALF });
    }
    if (this.threat && this.framesInPhase < MAX_HOME_WAIT_FRAMES) {
      // A unit near: stay inside, where it cannot cut anything, until it goes; on the far side of the territory from
      // it, where a capture of its that bites into the territory does not enclose the player.
      return this.awayFromThreat(classes, this.threat);
    }
    const wayOut = this.chooseWayOut(classes);
    if (!wayOut.clear && this.framesInPhase < MAX_HOME_WAIT_FRAMES) {
      // Every way out passes a unit: wait inside, as for a unit near, until one clears.
      const unit = this.nearestUnit();
      return unit ? this.awayFromThreat(classes, unit) : this.stayHome(classes);
    }
    this.outward = wayOut.direction;
    return this.outward;
  }

  /**
   * Whether a leg runs into the remembered trail within its lookahead. A remembered trail under the player's own ground
   * is one a loop closed, and no longer there.
   *
   * @param classes - The classified frame.
   * @param raster - The remembered trail.
   * @param direction - The leg's direction.
   * @returns Whether it does.
   */
  private trackAhead(classes: Uint8Array, raster: Uint8Array, direction: Point): boolean {
    const reach = this.height * LEG_TRAIL_LOOKAHEAD;
    for (let along = 1; along < reach; along++) {
      const column = Math.floor(this.width * HALF + direction.x * along);
      const row = Math.floor(this.height * HALF + direction.y * along);
      const index = row * this.width + column;
      if (column >= 0 && row >= 0 && column < this.width && row < this.height && raster[index] === TRACK_SOLID && classes[index] !== OWN) {
        return true;
      }
    }
    return false;
  }

  /**
   * Whether a straight line passes within the clearance of the remembered trail's older part, the part the raster marks
   * {@link TRACK_SOLID}, wherever it lies, in view or not.
   *
   * @param from - The line's start, in frame pixels.
   * @param to - Its end, in frame pixels.
   * @returns Whether it does.
   */
  private trackCrosses(from: Point, to: Point): boolean {
    if (this.trailStart === null) {
      return false;
    }
    const position = this.odometer.position;
    const offsetX = position.x - this.width * HALF;
    const offsetY = position.y - this.height * HALF;
    const start = { x: from.x + offsetX, y: from.y + offsetY };
    const end = { x: to.x + offsetX, y: to.y + offsetY };
    let covered = 0;
    for (let index = this.track.length - 1; index > this.trailStart; index--) {
      const segmentEnd = this.track[index] ?? position;
      const segmentStart = this.track[index - 1] ?? segmentEnd;
      covered += Math.hypot(segmentEnd.x - segmentStart.x, segmentEnd.y - segmentStart.y);
      if (covered > RECENT_TRACK_LENGTH && segmentDistance(start, end, segmentStart, segmentEnd) < TRACK_CLEARANCE) {
        return true;
      }
    }
    return false;
  }

  /**
   * Whether the trail is drawn just outside the avatar, where it leaves the head.
   *
   * @param classes - The classified frame.
   * @returns Whether it is.
   */
  private trailAtHead(classes: Uint8Array): boolean {
    const inner = this.height * AVATAR_RADIUS + 1;
    let count = 0;
    for (let radius = inner; radius < inner + HEAD_TRAIL_REACH; radius++) {
      for (let angle = 0; angle < FULL_TURN; angle += SIXTEENTH_TURN * HALF) {
        if (this.classAt(classes, this.width * HALF + Math.cos(angle) * radius, this.height * HALF + Math.sin(angle) * radius) === TRAIL) {
          count++;
        }
      }
    }
    return count >= MIN_HEAD_TRAIL;
  }

  /**
   * Whether the remembered trail has turned into the player's ground: a closed loop takes its trail into the
   * territory, while a trail still open stays drawn as a trail (or, for a pale skin, as the floor). A capture too thin to
   * count by {@link capturedPixels} still turns its trail.
   *
   * @param classes - The classified frame.
   * @returns Whether it has.
   */
  private trailClosed(classes: Uint8Array): boolean {
    const { raster } = this;
    if (!raster) {
      return false;
    }
    let own = 0;
    let other = 0;
    for (let index = 0; index < raster.length; index++) {
      if (raster[index] !== TRACK_SOLID) {
        continue;
      }
      const pixelClass = classes[index];
      if (pixelClass === OWN) {
        own++;
      } else if (pixelClass === TRAIL || pixelClass === OTHER) {
        other++;
      }
    }
    return own >= CLOSED_TRAIL_PIXELS && own > (own + other) * CLOSED_TRAIL_SHARE;
  }

  /**
   * The nearest pixel of a foreign unit or trail lying across the player's own ground: one with the player's ground on
   * both sides of it, close, along some line through it.
   *
   * @param classes - The classified frame.
   * @returns It, in frame pixels, or `null`.
   */
  private trailInTerritory(classes: Uint8Array): null | Point {
    const { height, thin, width } = this;
    const centerX = width * HALF;
    const centerY = height * HALF;
    const candidates: CutCandidate[] = [];
    for (let index = 0; index < thin.length; index++) {
      if (thin[index] === 0) {
        continue;
      }
      const x = index % width;
      const y = Math.floor(index / width);
      if (isHud(x / width, y / height, HUD_MARGIN / width, HUD_MARGIN / height)) {
        continue;
      }
      for (const [dx, dy] of CUT_AXES) {
        if (this.ownWithin(classes, x, y, dx, dy) && this.ownWithin(classes, x, y, -dx, -dy)) {
          candidates.push({ away: Math.hypot(x - centerX, y - centerY), point: { x, y } });
          break;
        }
      }
    }
    candidates.sort((a, b) => a.away - b.away);
    // The nearest cut whose way there stays on the player's ground: one reached across the floor lays a trail, and the
    // unit closing its loop round the player's edge then takes the trail's start, the player with it.
    const tried: Point[] = [];
    for (const { point } of candidates) {
      if (tried.length >= CUT_CANDIDATES) {
        break;
      }
      if (tried.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < CUT_SPACING)) {
        continue;
      }
      tried.push(point);
      if (this.cutStaysHome(classes, point)) {
        return point;
      }
    }
    return null;
  }

  /**
   * How far the player has come since it left its territory.
   *
   * @returns The length, in frame pixels; 0 while it is home.
   */
  private trailLength(): number {
    if (this.trailStart === null) {
      return 0;
    }
    let length = 0;
    for (let index = this.trailStart + 1; index < this.track.length; index++) {
      const end = this.track[index] ?? this.odometer.position;
      const start = this.track[index - 1] ?? end;
      length += Math.hypot(end.x - start.x, end.y - start.y);
    }
    return length;
  }

  private turnToward(wanted: Point): void {
    const difference = wrapAngle(Math.atan2(wanted.y, wanted.x) - this.heading);
    this.heading = wrapAngle(this.heading + Math.max(-TURN_PER_FRAME, Math.min(TURN_PER_FRAME, difference)));
  }

  /**
   * Each pixel's distance to the nearest foreign unit or trail in view, those beside the HUD left out.
   *
   * @returns The distances; `Infinity` everywhere with none in view.
   */
  private unitDistance(): Float32Array {
    const { height, thin, width } = this;
    return chamferDistance(thin.map((value, index) => value !== 0 && !isHud(index % width / width, Math.floor(index / width) / height, HUD_MARGIN / width, HUD_MARGIN / height) ? 1 : 0), width, height);
  }
}

/**
 * The distance of every pixel to the nearest marked one, by a two-pass chamfer transform, in pixels within a few
 * percent.
 *
 * @param marked - Nonzero where a pixel is marked.
 * @param width - The frame's width.
 * @param height - The frame's height.
 * @returns The distances; `Infinity` everywhere when nothing is marked.
 */
export function chamferDistance(marked: ArrayLike<number>, width: number, height: number): Float32Array {
  const distances = new Float32Array(marked.length);
  for (let index = 0; index < marked.length; index++) {
    distances[index] = marked[index] ? 0 : Infinity;
  }
  function relax(index: number, neighbor: number, step: number): void {
    const through = (distances[neighbor] ?? Infinity) + step;
    if (through < (distances[index] ?? Infinity)) {
      distances[index] = through;
    }
  }
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const index = row * width + column;
      if (column > 0) {
        relax(index, index - 1, 1);
      }
      if (row > 0) {
        relax(index, index - width, 1);
        if (column > 0) {
          relax(index, index - width - 1, Math.SQRT2);
        }
        if (column < width - 1) {
          relax(index, index - width + 1, Math.SQRT2);
        }
      }
    }
  }
  for (let row = height - 1; row >= 0; row--) {
    for (let column = width - 1; column >= 0; column--) {
      const index = row * width + column;
      if (column < width - 1) {
        relax(index, index + 1, 1);
      }
      if (row < height - 1) {
        relax(index, index + width, 1);
        if (column < width - 1) {
          relax(index, index + width + 1, Math.SQRT2);
        }
        if (column > 0) {
          relax(index, index + width - 1, Math.SQRT2);
        }
      }
    }
  }
  return distances;
}

/**
 * Drops the thin lines of the trail and foreign classes, keeping a pixel only when most of its neighbors share its
 * class. Scaling the frame down blends the colors at every edge, and some of those blends look like a trail or like a
 * foreign color; a real trail or unit is several pixels thick.
 *
 * @param classes - The classes.
 * @param width - The frame's width.
 * @param height - The frame's height.
 * @returns The cleaned classes.
 */
export function erodeThin(classes: Uint8Array, width: number, height: number): Uint8Array {
  const cleaned = classes.slice();
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const index = row * width + column;
      const pixelClass = classes[index];
      if (pixelClass !== TRAIL && pixelClass !== OTHER) {
        continue;
      }
      // The frame's border has no full neighborhood, and scaling blends it with what lies beyond: it says nothing.
      if (row === 0 || column === 0 || row === height - 1 || column === width - 1) {
        cleaned[index] = MASKED;
        continue;
      }
      let same = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx !== 0 || dy !== 0) && classes[index + dy * width + dx] === pixelClass) {
            same++;
          }
        }
      }
      if (same < MIN_SAME_NEIGHBORS) {
        cleaned[index] = MASKED;
      }
    }
  }
  return cleaned;
}

/**
 * The 4-connected region of one class around some seed pixels.
 *
 * @param classes - The classes.
 * @param width - The frame's width.
 * @param seeds - The seed pixels' indices; those not of the class are skipped.
 * @param pixelClass - The class.
 * @returns Nonzero on the region's pixels.
 */
export function floodClass(classes: Uint8Array, width: number, seeds: readonly number[], pixelClass: number): Uint8Array {
  const region = new Uint8Array(classes.length);
  const queue = seeds.filter((seed) => classes[seed] === pixelClass);
  for (const seed of queue) {
    region[seed] = 1;
  }
  while (queue.length > 0) {
    const index = queue.pop() ?? 0;
    const column = index % width;
    const neighbors = [index - width, index + width, column > 0 ? index - 1 : -1, column < width - 1 ? index + 1 : -1];
    for (const neighbor of neighbors) {
      if (neighbor >= 0 && neighbor < classes.length && region[neighbor] === 0 && classes[neighbor] === pixelClass) {
        region[neighbor] = 1;
        queue.push(neighbor);
      }
    }
  }
  return region;
}

/**
 * The most common color in a rectangle of a frame, bucketed so that antialiasing does not split it.
 *
 * @param frame - The frame.
 * @param left - The rectangle's left edge.
 * @param top - Its top edge.
 * @param right - Its right edge.
 * @param bottom - Its bottom edge.
 * @returns The color, the average of its bucket.
 */
export function modeColor(frame: ImageData, left: number, top: number, right: number, bottom: number): Color {
  const buckets = new Map<number, ColorBucket>();
  for (let row = Math.floor(top); row < Math.ceil(bottom); row++) {
    for (let column = Math.floor(left); column < Math.ceil(right); column++) {
      const offset = (row * frame.width + column) * CHANNELS;
      const r = frame.data[offset + RED] ?? 0;
      const g = frame.data[offset + GREEN] ?? 0;
      const b = frame.data[offset + BLUE] ?? 0;
      const key = (Math.floor(r / QUANTUM) * BUCKETS_PER_CHANNEL + Math.floor(g / QUANTUM)) * BUCKETS_PER_CHANNEL + Math.floor(b / QUANTUM);
      const bucket = buckets.get(key) ?? { b: 0, count: 0, g: 0, r: 0 };
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count++;
      buckets.set(key, bucket);
    }
  }
  let best = { b: 0, count: 0, g: 0, r: 0 };
  for (const bucket of buckets.values()) {
    if (bucket.count > best.count) {
      best = bucket;
    }
  }
  const count = Math.max(1, best.count);
  return { b: best.b / count, g: best.g / count, r: best.r / count };
}

/**
 * The foreign pixels that are not territory: territory is thick, so a pixel is territory when it lies within
 * {@link TERRITORY_THICKNESS} of a foreign pixel that deep inside foreign ground (a morphological opening). What is
 * left is heads and trails, even where they are joined to their territory.
 *
 * @param classes - The classes.
 * @param width - The frame's width.
 * @param height - The frame's height.
 * @returns Nonzero for each foreign pixel that is not territory.
 */
export function thinForeign(classes: Uint8Array, width: number, height: number): Uint8Array {
  // Masked pixels hide what is under them, so they do not thin a territory the HUD cuts across.
  const depth = chamferDistance(classes.map((pixelClass) => pixelClass === OTHER || pixelClass === MASKED ? 0 : 1), width, height);
  const core = chamferDistance(depth.map((distance, index) => distance >= TERRITORY_THICKNESS && classes[index] === OTHER ? 1 : 0), width, height);
  return classes.map((pixelClass, index) => pixelClass === OTHER && (core[index] ?? Infinity) > TERRITORY_THICKNESS ? 1 : 0);
}

/**
 * The direction away from the wall at a point: the wall distance's gradient, by central differences, normalized.
 *
 * @param wall - Each pixel's distance to the outside of the arena.
 * @param width - The frame's width.
 * @param height - The frame's height.
 * @param x - The point's column.
 * @param y - Its row.
 * @returns The unit direction; the origin where the distance is flat or unknown.
 */
export function wallGradient(wall: Float32Array, width: number, height: number, x: number, y: number): Point {
  const column = Math.floor(x);
  const row = Math.floor(y);
  // Central differences need a pixel on every side.
  if (column < 1 || row < 1 || column >= width - 1 || row >= height - 1) {
    return { x: 0, y: 0 };
  }
  const index = row * width + column;
  const dx = (wall[index + 1] ?? 0) - (wall[index - 1] ?? 0);
  const dy = (wall[index + width] ?? 0) - (wall[index - width] ?? 0);
  const size = Math.hypot(dx, dy);
  return Number.isFinite(size) && size > 0 ? { x: dx / size, y: dy / size } : { x: 0, y: 0 };
}

function distanceSquared(a: Color, b: Color): number {
  return (a.r - b.r) * (a.r - b.r) + (a.g - b.g) * (a.g - b.g) + (a.b - b.b) * (a.b - b.b);
}

/**
 * Whether a color is a darker shade of another, like the edge the game draws under a territory.
 *
 * @param color - The color seen.
 * @param base - The color it might shade.
 * @returns Whether it does.
 */
function isDarkerShade(color: Color, base: Color): boolean {
  const ratios = [color.r / Math.max(1, base.r), color.g / Math.max(1, base.g), color.b / Math.max(1, base.b)];
  const low = Math.min(...ratios);
  const high = Math.max(...ratios);
  return high < SHADE_MAX && low > SHADE_MIN && high - low < SHADE_SPREAD;
}

/**
 * Whether a point lies on the HUD, or within a margin of it: the score bar block, the leaderboard and the minimap.
 *
 * @param x - The point's column, as a share of the frame's width.
 * @param y - Its row, as a share of the frame's height.
 * @param marginX - The margin across, as a share of the frame's width.
 * @param marginY - The margin down, as a share of the frame's height.
 * @returns Whether it does.
 */
function isHud(x: number, y: number, marginX: number, marginY: number): boolean {
  return (x < SCORE_BAR_WIDTH + marginX && y < SCORE_BAR_HEIGHT + marginY) || (x > LEADERBOARD_LEFT - marginX && y < LEADERBOARD_HEIGHT + marginY) || (x > MINIMAP_LEFT - marginX && y > MINIMAP_TOP - marginY);
}

/**
 * Whether a pixel and all eight around it are the player's own ground.
 *
 * @param classes - The frame's classes.
 * @param width - Its width.
 * @param index - The pixel; it must not be on the frame's border.
 * @returns Whether they are.
 */
function isOwnInside(classes: Uint8Array, width: number, index: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (classes[index + dy * width + dx] !== OWN) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Relabels as foreign, in place, the outside pixels that lie farther than {@link WALL_THICKNESS} from any outside pixel
 * that deep in the outside: the sky is never that thin, but a cyan unit's trail across the floor or the territory is.
 * The blends at the sky's own edge lie within that distance of it and stay outside.
 *
 * @param classes - The classes.
 * @param width - The frame's width.
 * @param height - The frame's height.
 */
function reclassifyThinOutside(classes: Uint8Array, width: number, height: number): void {
  const depth = chamferDistance(classes.map((pixelClass) => pixelClass === OUTSIDE || pixelClass === MASKED ? 0 : 1), width, height);
  const core = chamferDistance(depth.map((distance, index) => distance >= WALL_THICKNESS && classes[index] === OUTSIDE ? 1 : 0), width, height);
  for (let index = 0; index < classes.length; index++) {
    if (classes[index] === OUTSIDE && (core[index] ?? Infinity) > WALL_THICKNESS) {
      classes[index] = OTHER;
    }
  }
}

/**
 * Raises every raster pixel within a radius of a point to at least a value.
 *
 * @param raster - The raster.
 * @param width - Its width.
 * @param height - Its height.
 * @param x - The point's column.
 * @param y - Its row.
 * @param radius - The radius.
 * @param value - The value.
 */
function stampDisk(raster: Uint8Array, width: number, height: number, x: number, y: number, radius: number, value: number): void {
  const top = Math.max(0, Math.ceil(y - radius));
  const bottom = Math.min(height - 1, Math.floor(y + radius));
  const left = Math.max(0, Math.ceil(x - radius));
  const right = Math.min(width - 1, Math.floor(x + radius));
  for (let row = top; row <= bottom; row++) {
    for (let column = left; column <= right; column++) {
      const index = row * width + column;
      if (Math.hypot(column - x, row - y) <= radius && (raster[index] ?? 0) < value) {
        raster[index] = value;
      }
    }
  }
}

/**
 * Each pixel's distance to the outside of the arena: to outside pixels at least {@link WALL_THICKNESS} deep in the
 * outside, less that depth. Blends at the edges of things can take the outside's colors, a pixel here and there, and
 * the outside itself is never that thin.
 *
 * @param classes - The classes.
 * @param width - The frame's width.
 * @param height - The frame's height.
 * @returns The distances; `Infinity` everywhere with no outside in view.
 */
function wallDistance(classes: Uint8Array, width: number, height: number): Float32Array {
  const depth = chamferDistance(classes.map((pixelClass) => pixelClass === OUTSIDE || pixelClass === MASKED ? 0 : 1), width, height);
  const core = chamferDistance(depth.map((distance, index) => distance >= WALL_THICKNESS && classes[index] === OUTSIDE ? 1 : 0), width, height);
  return core.map((distance) => Math.max(0, distance - WALL_THICKNESS));
}

/**
 * Whether a pixel of a frame, and every pixel around it, was neither the player's ground nor hidden.
 *
 * @param classes - The frame's classes.
 * @param width - Its width.
 * @param height - Its height.
 * @param column - The pixel's column.
 * @param row - Its row.
 * @returns Whether it was; `false` off the frame.
 */
function wasForeignAround(classes: Uint8Array, width: number, height: number, column: number, row: number): boolean {
  if (column < 1 || row < 1 || column >= width - 1 || row >= height - 1) {
    return false;
  }
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const pixelClass = classes[(row + dy) * width + column + dx];
      if (pixelClass === OWN || pixelClass === MASKED) {
        return false;
      }
    }
  }
  return true;
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
