/**
 * @file
 *
 * Plain 2D geometry for the autopilots, on `{ x, y }` numbers. It allocates nothing from the engine's vector pool and
 * imports nothing from the engine, so the blackbox pilot can use it too, and the whitebox pilot can read the game
 * without changing it.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** How close two values must be to count as equal in the intersection tests. */
const EPSILON = 1e-9;

/* eslint-disable no-magic-numbers -- the halving factor and the fractions of a turn are what their names say. */
export const HALF = 0.5;
export const FULL_TURN = Math.PI * 2;
export const QUARTER_TURN = Math.PI / 2;
export const EIGHTH_TURN = Math.PI / 4;
export const SIXTEENTH_TURN = Math.PI / 8;
export const TENTH_TURN = Math.PI / 5;
export const THREE_EIGHTHS_TURN = Math.PI * 3 / 4;
/* eslint-enable no-magic-numbers -- end of the turn fractions. */

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The distance from a point to a segment.
 *
 * @param point - The point.
 * @param start - The segment's start.
 * @param end - The segment's end.
 * @returns The shortest distance.
 */
export function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < EPSILON) {
    return distance(point, start);
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

export function length(a: Point): number {
  return Math.hypot(a.x, a.y);
}

export function normalize(a: Point): Point {
  const magnitude = length(a);
  return magnitude < EPSILON ? { x: 0, y: 0 } : { x: a.x / magnitude, y: a.y / magnitude };
}

/**
 * The length of a path through the given points, in order.
 *
 * @param points - The path.
 * @returns Its length.
 */
export function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    total += distance(points[index - 1] ?? ORIGIN, points[index] ?? ORIGIN);
  }
  return total;
}

/**
 * Whether a point is inside a polygon, by the even-odd rule.
 *
 * @param point - The point.
 * @param polygon - The polygon's vertices, in order; the last joins the first.
 * @returns Whether it is inside.
 */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index] ?? ORIGIN;
    const b = polygon[previous] ?? ORIGIN;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function rotate(a: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: a.x * cos - a.y * sin, y: a.x * sin + a.y * cos };
}

export function scale(a: Point, factor: number): Point {
  return { x: a.x * factor, y: a.y * factor };
}

/**
 * The shortest distance between two segments.
 *
 * @param a - The first segment's start.
 * @param b - The first segment's end.
 * @param c - The second segment's start.
 * @param d - The second segment's end.
 * @returns The distance, 0 when they intersect.
 */
export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) {
    return 0;
  }
  return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));
}

/**
 * Whether two segments cross or touch.
 *
 * @param a - The first segment's start.
 * @param b - The first segment's end.
 * @param c - The second segment's start.
 * @param d - The second segment's end.
 * @returns Whether they intersect.
 */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const ab = subtract(b, a);
  const cd = subtract(d, c);
  const denominator = cross(ab, cd);
  const ac = subtract(c, a);
  if (Math.abs(denominator) < EPSILON) {
    return false;
  }
  const t = cross(ac, cd) / denominator;
  const u = cross(ac, ab) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * The signed area of a polygon by the shoelace formula: positive when its vertices run counterclockwise in a y-up
 * frame.
 *
 * @param polygon - The polygon's vertices.
 * @returns The signed area.
 */
export function signedArea(polygon: readonly Point[]): number {
  let total = 0;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[previous] ?? ORIGIN;
    const b = polygon[index] ?? ORIGIN;
    total += a.x * b.y - b.x * a.y;
  }
  return total * HALF;
}

export function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export const ORIGIN: Point = { x: 0, y: 0 };
