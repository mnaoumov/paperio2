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
 * How it plays. Like a cautious player: from its territory it heads out where the floor is free and close, flies a
 * rectangle (out, sideways, back) sized in frames, and turns for home early when anything small and foreign comes
 * near. It keeps its bearings by dead reckoning, from the directions it gave and the turn rate it can see the player
 * obey, as a person remembers where they came from.
 */

import type { Point } from './plane.ts';

import {
  FULL_TURN,
  HALF,
  normalize,
  rotate,
  SIXTEENTH_TURN,
  TENTH_TURN
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
  readonly classes: null | Uint8Array;
  readonly height: number;
  readonly phase: BlackboxPhase;
  /** The nearest danger, in pixels of the scaled-down frame, or `null`. */
  readonly threat: null | Point;
  readonly width: number;
}

/** What the pilot is doing. */
export type BlackboxPhase = 'back' | 'home' | 'out' | 'side';

/** Connected components: each pixel's label and each label's size. */
export interface Components {
  readonly labels: Int32Array;
  readonly sizes: readonly number[];
}

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

/* eslint-disable no-magic-numbers -- the tuning constants: each is named by its declaration and its comment. */
/** The share of a color laid over the floor that the player's trail is drawn with. */
const TRAIL_ALPHA = 0.6;
/** Squared RGB distances within which a pixel matches a learned color. */
const MATCH_DISTANCE_SQUARED = 30 * 30;
const TRAIL_MATCH_DISTANCE_SQUARED = 22 * 22;
/** Beyond the arena the sky is far bluer and greener than red, and the arena's edge is a grey green. */
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
/** The trail is searched around a point on a grid of this many steps per radius. */
const TRAIL_SEARCH_STEPS = 4;
const NAME_TOP = 0.11;
const NAME_BOTTOM = 0.06;
const NAME_HALF_WIDTH = 0.06;
/** Where the score bar's color is read, as shares of the frame. */
const SCORE_SAMPLE_LEFT = 0.002;
const SCORE_SAMPLE_RIGHT = 0.04;
const SCORE_SAMPLE_TOP = 0.025;
const SCORE_SAMPLE_BOTTOM = 0.05;
/** Colors are bucketed by this many levels per channel to find the most common one. */
const QUANTUM = 8;
/** A foreign component at least this many pixels big is territory, which does not move; smaller ones are units and trails. */
const BIG_COMPONENT = 500;
/** A small foreign component this close to the trail or the player, as a share of the frame's height, sends it home. */
const DANGER_RADIUS = 0.5;
/** The loop, in frames: out, sideways, and the shortest sideways leg when an early turn home is forced. */
const OUT_FRAMES = 35;
const SIDE_FRAMES = 50;
const SHORT_SIDE_FRAMES = 18;
/** A leg runs at least this many frames before foreign ground ahead can end it. */
const MIN_LEG_FRAMES = 8;
/** How far ahead a leg looks for foreign ground, as a share of the frame's height. */
const FLOOR_LOOKAHEAD = 0.25;
/** Turn rate per frame the pilot assumes, as a player sees it: a full turn a second at 60 frames a second. */
const TURN_PER_FRAME = FULL_TURN / 60;
/** Rays cast from the centre to choose the way out, and how far they look, as a share of the frame's height. */
const RAY_COUNT = 24;
const RAY_LENGTH = 0.5;
/** Trail ahead within this share of the frame's height makes the pilot veer. */
const TRAIL_LOOKAHEAD = 0.12;
const VEER_ANGLE = TENTH_TURN;
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
    return { classes: this.classes, height: this.height, phase: this.phase, threat: this.threat, width: this.width };
  }

  private classes: null | Uint8Array = null;
  /** Where the pilot left its territory, by dead reckoning, in frames of travel. */
  private exitPoint: null | Point = null;
  private floor: Color | null = null;
  private framesInPhase = 0;
  /** The heading the pilot believes the player has, from the directions it gave. */
  private heading = 0;
  private height = 0;
  /** The direction of the loop's way out and of its sideways leg. */
  private outward: Point = { x: 1, y: 0 };
  private own: Color | null = null;
  private phase: BlackboxPhase = 'home';
  /** The dead-reckoned position, in frames of travel. */
  private position: Point = { x: 0, y: 0 };
  private sideFrames = SIDE_FRAMES;
  private sideward: Point = { x: 0, y: 1 };
  private threat: null | Point = null;
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
    const classes = erodeThin(this.classify(frame), frame.width, frame.height);
    this.classes = classes;
    const centerClass = this.classAt(classes, frame.width * HALF, frame.height * HALF + frame.height * AVATAR_RADIUS * HALF);
    const atHome = centerClass === OWN || this.ownNearCenter(classes);
    this.threat = this.findThreat(classes);
    let wanted: Point;
    if (atHome) {
      if (this.phase !== 'home') {
        this.phase = 'home';
        this.framesInPhase = 0;
      }
      wanted = this.chooseWayOut(classes);
      this.outward = wanted;
    } else {
      if (this.phase === 'home') {
        this.phase = 'out';
        this.framesInPhase = 0;
        this.exitPoint = this.position;
        this.sideward = this.chooseSide(classes, this.outward);
        this.sideFrames = SIDE_FRAMES;
      }
      if (this.threat && this.phase !== 'back') {
        // Head home now: a forced turn keeps the shortest sideways leg, so the way back runs beside the way out.
        if (this.phase === 'out') {
          this.phase = 'side';
          this.framesInPhase = 0;
          this.sideFrames = SHORT_SIDE_FRAMES;
        } else {
          this.phase = 'back';
          this.framesInPhase = 0;
        }
      }
      const blocked = this.phase !== 'back' && this.framesInPhase > MIN_LEG_FRAMES && !this.isFloorAhead(classes, this.phase === 'out' ? this.outward : this.sideward);
      if (this.phase === 'out' && (this.framesInPhase >= OUT_FRAMES || blocked)) {
        this.phase = 'side';
        this.framesInPhase = 0;
      } else if (this.phase === 'side' && (this.framesInPhase >= this.sideFrames || blocked)) {
        this.phase = 'back';
        this.framesInPhase = 0;
      }
      wanted = this.legDirection(classes);
      wanted = this.avoidTrail(classes, wanted);
    }
    this.framesInPhase++;
    this.advance(wanted);
    return wanted;
  }

  /** Forgets the loop in flight and its bearings, as after a respawn or a takeover. */
  public reset(): void {
    this.phase = 'home';
    this.framesInPhase = 0;
    this.exitPoint = null;
    this.position = { x: 0, y: 0 };
  }

  private advance(wanted: Point): void {
    const target = Math.atan2(wanted.y, wanted.x);
    let difference = target - this.heading;
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));
    this.heading += Math.max(-TURN_PER_FRAME, Math.min(TURN_PER_FRAME, difference));
    this.position = { x: this.position.x + Math.cos(this.heading), y: this.position.y + Math.sin(this.heading) };
  }

  private avoidTrail(classes: Uint8Array, wanted: Point): Point {
    const reach = this.height * TRAIL_LOOKAHEAD;
    const centerX = this.width * HALF;
    const centerY = this.height * HALF;
    // Skip the first stretch, where the trail just laid sits right behind the avatar.
    for (let along = reach * HALF; along < reach; along++) {
      if (this.classAt(classes, centerX + wanted.x * along, centerY + wanted.y * along) === TRAIL) {
        const left = rotate(wanted, -VEER_ANGLE);
        const right = rotate(wanted, VEER_ANGLE);
        return this.countAlong(classes, left, TRAIL) <= this.countAlong(classes, right, TRAIL) ? left : right;
      }
    }
    return wanted;
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

  private chooseSide(classes: Uint8Array, outward: Point): Point {
    const left = rotate(outward, -Math.PI * HALF);
    const right = rotate(outward, Math.PI * HALF);
    return this.countAlong(classes, left, FLOOR) >= this.countAlong(classes, right, FLOOR) ? left : right;
  }

  /**
   * The way out of the territory: of the rays from the centre, the one that leaves the player's color soonest and then
   * runs longest over free floor, with no danger near it.
   *
   * @param classes - The classified frame.
   * @returns The direction.
   */
  private chooseWayOut(classes: Uint8Array): Point {
    const reach = this.height * RAY_LENGTH;
    let best: Point = this.outward;
    let bestScore = -Infinity;
    for (let ray = 0; ray < RAY_COUNT; ray++) {
      const angle = ray / RAY_COUNT * FULL_TURN;
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      let edge = -1;
      let free = 0;
      for (let along = 1; along < reach; along++) {
        const pixelClass = this.classAt(classes, this.width * HALF + direction.x * along, this.height * HALF + direction.y * along);
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
        free++;
      }
      // A ray that never leaves the territory inside the frame still points somewhere: score it on its length alone.
      const score = edge < 0 ? -reach : free - edge * HALF;
      if (score > bestScore) {
        bestScore = score;
        best = direction;
      }
    }
    return best;
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
        if (distanceSquared(color, floor) < MATCH_DISTANCE_SQUARED) {
          classes[index] = FLOOR;
        } else if (distanceSquared(color, own) < MATCH_DISTANCE_SQUARED || isDarkerShade(color, own)) {
          classes[index] = OWN;
        } else if (distanceSquared(color, trail) < TRAIL_MATCH_DISTANCE_SQUARED) {
          classes[index] = TRAIL;
        } else if ((color.b - color.r > OUTSIDE_BLUE_MARGIN && color.g - color.r > OUTSIDE_GREEN_MARGIN) || distanceSquared(color, ARENA_EDGE) < MATCH_DISTANCE_SQUARED) {
          classes[index] = OUTSIDE;
        } else if (Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b) < GREY_SPREAD) {
          // Greys are text, outlines and shadows: names, score labels and the HUD, not units.
          classes[index] = MASKED;
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

  private crossesTrail(classes: Uint8Array, x: number, y: number): boolean {
    const centerX = this.width * HALF;
    const centerY = this.height * HALF;
    const away = Math.hypot(x - centerX, y - centerY);
    const skip = this.height * AVATAR_DIAMETER;
    for (let along = skip; along < away; along++) {
      const t = along / away;
      if (this.classAt(classes, centerX + (x - centerX) * t, centerY + (y - centerY) * t) === TRAIL) {
        return true;
      }
    }
    return false;
  }

  /**
   * The nearest small foreign component (a unit or a trail, not territory) within the danger radius of the player or
   * its trail, in frame pixels.
   *
   * @param classes - The classified frame.
   * @returns The danger, or `null`.
   */
  private findThreat(classes: Uint8Array): null | Point {
    const { height, width } = this;
    const { labels, sizes } = labelComponents(classes, width, OTHER);
    const radius = height * DANGER_RADIUS;
    const centerX = width * HALF;
    const centerY = height * HALF;
    let nearest: null | Point = null;
    let nearestDistance = Infinity;
    for (let index = 0; index < classes.length; index++) {
      const label = labels[index] ?? -1;
      if (label < 0 || (sizes[label] ?? 0) >= BIG_COMPONENT) {
        continue;
      }
      const point = { x: index % width, y: Math.floor(index / width) };
      const away = Math.hypot(point.x - centerX, point.y - centerY);
      if (away < radius && away < nearestDistance && (this.phase !== 'home' || this.nearTrail(classes, point, radius * HALF))) {
        nearest = point;
        nearestDistance = away;
      }
    }
    return nearest;
  }

  /**
   * Whether the way ahead is free floor: a leg stops early at foreign territory or the wall rather than run into it.
   *
   * @param classes - The classified frame.
   * @param direction - The leg's direction.
   * @returns Whether it is free.
   */
  private isFloorAhead(classes: Uint8Array, direction: Point): boolean {
    const start = this.height * AVATAR_DIAMETER;
    const reach = this.height * FLOOR_LOOKAHEAD;
    for (let along = start; along < reach; along++) {
      const pixelClass = this.classAt(classes, this.width * HALF + direction.x * along, this.height * HALF + direction.y * along);
      if (pixelClass === OTHER || pixelClass === OUTSIDE) {
        return false;
      }
    }
    return true;
  }

  private isMasked(column: number, row: number): boolean {
    const { height, width } = this;
    const x = column / width;
    const y = row / height;
    if ((x < SCORE_BAR_WIDTH && y < SCORE_BAR_HEIGHT) || (x > LEADERBOARD_LEFT && y < LEADERBOARD_HEIGHT) || (x > MINIMAP_LEFT && y > MINIMAP_TOP)) {
      return true;
    }
    const dx = (column - width * HALF) / height;
    const dy = (row - height * HALF) / height;
    return Math.hypot(dx, dy) < AVATAR_RADIUS || (Math.abs(dx) < NAME_HALF_WIDTH && dy > -NAME_TOP && dy < -NAME_BOTTOM);
  }

  /**
   * The direction of the current leg: out, sideways, or the way back.
   *
   * @param classes - The classified frame.
   * @returns The direction.
   */
  private legDirection(classes: Uint8Array): Point {
    switch (this.phase) {
      case 'out':
        return this.outward;
      case 'side':
        return this.sideward;
      default:
        return this.wayBack(classes);
    }
  }

  private nearTrail(classes: Uint8Array, point: Point, radius: number): boolean {
    const step = Math.max(1, Math.floor(radius / TRAIL_SEARCH_STEPS));
    for (let dy = -radius; dy <= radius; dy += step) {
      for (let dx = -radius; dx <= radius; dx += step) {
        if (this.classAt(classes, point.x + dx, point.y + dy) === TRAIL) {
          return true;
        }
      }
    }
    return false;
  }

  private ownNearCenter(classes: Uint8Array): boolean {
    // The avatar hides the pixel under the player; the territory around it decides.
    const radius = this.height * AVATAR_RADIUS * (1 + HALF);
    let own = 0;
    let seen = 0;
    for (let angle = 0; angle < FULL_TURN; angle += SIXTEENTH_TURN) {
      const pixelClass = this.classAt(classes, this.width * HALF + Math.cos(angle) * radius, this.height * HALF + Math.sin(angle) * radius);
      if (pixelClass !== MASKED) {
        seen++;
        if (pixelClass === OWN) {
          own++;
        }
      }
    }
    return seen > 0 && own / seen > HALF + HALF * HALF;
  }

  /**
   * The way back: toward the nearest of the player's own pixels in view whose straight way crosses no trail, else back
   * along the reverse of the way out, which runs beside the way out at the sideways leg's distance.
   *
   * @param classes - The classified frame.
   * @returns The direction.
   */
  private wayBack(classes: Uint8Array): Point {
    const centerX = this.width * HALF;
    const centerY = this.height * HALF;
    let best: null | Point = null;
    let bestDistance = Infinity;
    for (let index = 0; index < classes.length; index++) {
      if (classes[index] !== OWN) {
        continue;
      }
      const x = index % this.width;
      const y = Math.floor(index / this.width);
      const away = Math.hypot(x - centerX, y - centerY);
      if (away < bestDistance && !this.crossesTrail(classes, x, y)) {
        best = { x: x - centerX, y: y - centerY };
        bestDistance = away;
      }
    }
    if (best) {
      return normalize(best);
    }
    if (this.exitPoint) {
      const home = { x: this.exitPoint.x - this.position.x, y: this.exitPoint.y - this.position.y };
      // Aim beside the exit, on the sideways leg's side, so the way back does not run into the way out.
      const aim = { x: home.x + this.sideward.x * SHORT_SIDE_FRAMES, y: home.y + this.sideward.y * SHORT_SIDE_FRAMES };
      return normalize(aim);
    }
    return { x: -this.outward.x, y: -this.outward.y };
  }
}

export function erodeThin(classes: Uint8Array, width: number, height: number): Uint8Array {
  const cleaned = classes.slice();
  for (let row = 1; row < height - 1; row++) {
    for (let column = 1; column < width - 1; column++) {
      const index = row * width + column;
      const pixelClass = classes[index];
      if (pixelClass !== TRAIL && pixelClass !== OTHER) {
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
 * Drops the thin lines of the trail and foreign classes, keeping a pixel only when most of its neighbors share its
 * class. Scaling the frame down blends the colors at every edge, and some of those blends look like a trail or like a
 * foreign color; a real trail or unit is several pixels thick.
 *
 * @param classes - The classes.
 * @param width - The frame's width.
 * @param height - The frame's height.
 * @returns The cleaned classes.
 */
/**
 * Labels the 4-connected components of one class.
 *
 * @param classes - The classes.
 * @param width - The frame's width.
 * @param pixelClass - The class.
 * @returns Each pixel's component (-1 for other classes) and each component's size.
 */
export function labelComponents(classes: Uint8Array, width: number, pixelClass: number): Components {
  const labels = new Int32Array(classes.length).fill(-1);
  const sizes: number[] = [];
  const queue: number[] = [];
  for (let start = 0; start < classes.length; start++) {
    if (classes[start] !== pixelClass || (labels[start] ?? 0) >= 0) {
      continue;
    }
    const label = sizes.length;
    let size = 0;
    queue.length = 0;
    queue.push(start);
    labels[start] = label;
    while (queue.length > 0) {
      const index = queue.pop() ?? 0;
      size++;
      const column = index % width;
      const neighbors = [index - width, index + width, column > 0 ? index - 1 : -1, column < width - 1 ? index + 1 : -1];
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && neighbor < classes.length && classes[neighbor] === pixelClass && (labels[neighbor] ?? 0) < 0) {
          labels[neighbor] = label;
          queue.push(neighbor);
        }
      }
    }
    sizes.push(size);
  }
  return { labels, sizes };
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
