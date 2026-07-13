import type {
  ShapeOwner,
  Trail
} from './engine.ts';

import { EPSILON } from './shared/constants.ts';
import { generateId } from './shared/ids.ts';
import {
  cross,
  intervalOverlap,
  isBetween,
  isNearlyEqual,
  isNearlyZero,
  pointInPolygon
} from './shared/math-utils.ts';
import { ensureNonNullable } from './type-guards.ts';

export interface Bounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}
export interface Intersection {
  distance: number;
  overlay: boolean;
  point: Vector;
  segment: Segment;
  zn: number;
}

export function firstMatchingPoint(target: Vector, candidates: Vector[]): Vector {
  for (const candidate of candidates) {
    if (candidate.equal(target)) {
      return candidate;
    }
  }
  return target;
}

// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class Segment {
  public a = 0;
  public b = 0;
  public c = 0;
  public end: Vector;
  public id?: number;
  public mark: number;
  public shape: null | Polygon | Polyline;
  public start: Vector;
  public vector: null | Vector = null;
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style -- base `owner` accessor; a Segment has no owner (only its shape does), overridable in spirit.
  public get owner(): null | Polygon | Polyline {
    return null;
  }

  public constructor(start: Vector, end: Vector) {
    this.mark = 0;
    this.shape = null;
    this.start = start;
    this.end = end;
    this.calc();
  }

  public calc(): void {
    const {
      end,
      start
    } = this;
    this.vector = end.clone().sub(start);
    let normalX = start.y - end.y;
    let normalY = end.x - start.x;
    const length = Math.sqrt(normalX * normalX + normalY * normalY);
    normalX /= length;
    normalY /= length;
    this.a = normalX;
    this.b = normalY;
    this.c = -(normalX * start.x + normalY * start.y);
  }

  public clone(): Segment {
    return new Segment(this.start, this.end);
  }

  public commit(shape: Polygon | Polyline): this {
    this.shape = shape;
    this.start.commit(this);
    this.end.commit(this);
    return this;
  }

  public has(point: Vector): boolean {
    return this.start === point || this.end === point;
  }

  public intersect(segment: Segment): Intersection | null {
    const a2 = segment.a;
    const b2 = segment.b;
    const c2 = segment.c;
    const start2 = segment.start;
    const end2 = segment.end;
    const {
      a,
      b,
      c,
      end,
      start
    } = this;
    const determinant = cross(a2, b2, a, b);
    if (!isNearlyZero(determinant)) {
      const intersectionX = -cross(c2, b2, c, b) / determinant;
      const intersectionY = -cross(a2, c2, a, c) / determinant;
      const isWithinBothSegments = isBetween(start2.x, end2.x, intersectionX) && isBetween(start2.y, end2.y, intersectionY) && isBetween(start.x, end.x, intersectionX) && isBetween(start.y, end.y, intersectionY);
      if (!isWithinBothSegments) {
        return null;
      }
      const intersectionPoint = new Vector(intersectionX, intersectionY);
      return {
        distance: intersectionPoint.distance2(start2),
        overlay: false,
        point: firstMatchingPoint(intersectionPoint, [start, end, start2, end2]),
        segment: this,
        zn: Math.sign(determinant)
      };
    }
    const overlapX = intervalOverlap(start2.x, end2.x, start.x, end.x);
    const overlapY = intervalOverlap(start2.y, end2.y, start.y, end.y);
    if (isNearlyZero(cross(a2, c2, a, c)) && isNearlyZero(cross(b2, c2, b, c)) && overlapX >= -EPSILON && overlapY >= -EPSILON) {
      if (overlapX >= EPSILON || overlapY >= EPSILON) {
        let overlapPoint;
        if (isBetween(start.x, end.x, start2.x) && isBetween(start.y, end.y, start2.y)) {
          overlapPoint = firstMatchingPoint(start2, [start, end]);
        } else {
          overlapPoint = start2.distance2(start) >= start2.distance2(end) ? end : start;
        }
        return {
          distance: overlapPoint.distance2(start2),
          overlay: true,
          point: overlapPoint,
          segment: this,
          zn: 0
        };
      }
      const sharedPoint = start.equal(start2) || start.equal(end2) ? start : end;
      return {
        distance: sharedPoint.distance2(start2),
        overlay: false,
        point: sharedPoint,
        segment: this,
        zn: 0
      };
    }
    return null;
  }

  public length(): number {
    return ensureNonNullable(this.vector).magnitude();
  }

  public remove(): void {
    this.shape = null;
    this.start.remove(this);
    this.end.remove(this);
  }

  public reverse(): this {
    const start = this.start;
    this.start = this.end;
    this.end = start;
    this.calc();
    return this;
  }

  public zn(segment: Segment): number {
    const a2 = segment.a;
    const b2 = segment.b;
    const {
      a,
      b
    } = this;
    return cross(a2, b2, a, b);
  }
}
export const CELL_MARGIN = 1;
export class ContourPoints {
  public points: Vector[];
  public x: number;
  public y: number;
  public constructor(x: number, y: number) {
    this.points = [];
    this.x = x;
    this.y = y;
  }

  public commit(point: Vector): void {
    this.points.push(point);
    point.cell = this;
  }

  public remove(point: Vector): void {
    const {
      points
    } = this;
    const index = points.indexOf(point);
    if (index !== -1) {
      points.splice(index, 1);
      point.cell = null;
    }
  }
}
export class SpatialGrid {
  public cells: ContourPoints[];
  public center: Vector;
  public h: number;
  public height: number;
  public size: number;
  public w: number;
  public width: number;
  public constructor(width: number, height: number, cellSize: number) {
    this.width = width;
    this.height = height;
    // eslint-disable-next-line no-magic-numbers -- center is the play-area midpoint (width/2, height/2).
    this.center = new Vector(width / 2, height / 2);
    this.size = cellSize;
    this.w = Math.ceil(width / cellSize);
    this.h = Math.ceil(height / cellSize);
    this.cells = [];
    for (let i2 = 0; i2 < this.h; i2++) {
      for (let i3 = 0; i3 < this.w; i3++) {
        this.cells.push(new ContourPoints(i3, i2));
      }
    }
    Vector.space = this;
  }

  public cell(point: Vector): ContourPoints {
    return this.getCell(Math.floor(point.x / this.size) % this.w, Math.floor(point.y / this.size) % this.h);
  }

  public checkPoint(point: Vector): Vector {
    const cell = this.cell(point);
    return cell.points.find((existingPoint: Vector) => existingPoint.equal(point)) ?? point;
  }

  public clear(): void {
    this.cells = [];
  }

  public count(): number {
    let total = 0;
    this.cells.forEach((cell: ContourPoints) => {
      total += cell.points.length;
    });
    return total;
  }

  public getCell(col: number, row: number): ContourPoints {
    return ensureNonNullable(this.cells[col + row * this.w]);
  }

  public intersections(segment: Segment): Intersection[] {
    const point = this.cell(segment.start);
    const point2 = this.cell(segment.end);
    const minCol = Math.max(0, Math.min(point.x, point2.x) - CELL_MARGIN);
    const maxCol = Math.min(this.w - 1, Math.max(point.x, point2.x) + CELL_MARGIN);
    const minRow = Math.max(0, Math.min(point.y, point2.y) - CELL_MARGIN);
    const maxRow = Math.min(this.h - 1, Math.max(point.y, point2.y) + CELL_MARGIN);
    const mark = generateId();
    const list4: Intersection[] = [];
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        this.getCell(col, row).points.forEach((cellPoint: Vector) => {
          cellPoint.segments.forEach((segment2: Segment) => {
            if (segment2.mark !== mark) {
              const intersection = segment2.intersect(segment);
              if (intersection) {
                list4.push(intersection);
              }
              segment2.mark = mark;
            }
          });
        });
      }
    }
    return list4;
  }

  public segmentsCount(): Record<number, Segment> {
    const segmentsById: Record<number, Segment> = {};
    for (let i2 = 0; i2 < this.h; i2++) {
      for (let i3 = 0; i3 < this.w; i3++) {
        this.getCell(i3, i2).points.forEach((point: Vector) => {
          point.segments.forEach((segment: Segment) => {
            segmentsById[segment.id ?? 0] = segment;
          });
        });
      }
    }
    return segmentsById;
  }
}
export const VECTOR_POOL_SIZE = 30000;
export const vectorPool: Vector[] = Array.from({
  length: VECTOR_POOL_SIZE
});
let i = 0;
export class Vector {
  public static space: null | SpatialGrid;
  public cell: ContourPoints | null;
  public segments: Segment[];
  public x = 0;
  public y = 0;
  public constructor(x?: number, y?: number) {
    this.cell = null;
    this.segments = [];
    this.set(x, y);
  }

  public static alloc(x?: number, y?: number): Vector {
    if (i) {
      const vector = ensureNonNullable(vectorPool[--i]).set(x, y);
      return vector;
    }
    return new Vector(x, y);
  }

  public static clone(point: Vector): Vector {
    return Vector.alloc(point.x, point.y);
  }

  public static poolLength(): number {
    return i;
  }

  public static release(vector: Vector): void {
    if (i < VECTOR_POOL_SIZE) {
      vector.set();
      vectorPool[i++] = vector;
    }
  }

  public add(point: Vector): this {
    this.x += point.x;
    this.y += point.y;
    return this;
  }

  public angle(point: Vector): number {
    return Math.atan2(this.cross(point), this.dot(point));
  }

  public clone(): Vector {
    return new Vector(this.x, this.y);
  }

  public commit(segment: Segment): void {
    if (!this.segments.includes(segment)) {
      this.segments.push(segment);
    }
    if (!this.cell) {
      const cell = ensureNonNullable(Vector.space).cell(this);
      cell.commit(this);
    }
  }

  public copy(point: Vector): this {
    this.x = point.x;
    this.y = point.y;
    return this;
  }

  public cross(point: Vector): number {
    return this.x * point.y - this.y * point.x;
  }

  public distance(point: Vector): number {
    return Math.sqrt(this.distance2(point));
  }

  public distance2(point: Vector): number {
    const dx = this.x - point.x;
    const dy = this.y - point.y;
    return dx * dx + dy * dy;
  }

  public dot(point: Vector): number {
    return this.x * point.x + this.y * point.y;
  }

  public equal(point: Vector): boolean {
    return isNearlyEqual(this.x, point.x) && isNearlyEqual(this.y, point.y);
  }

  public invert(): this {
    return this.mulScalar(-1);
  }

  public magnitude(): number {
    const {
      x,
      y
    } = this;
    return Math.sqrt(x * x + y * y);
  }

  public mul(point: Vector): this {
    this.x *= point.x;
    this.y *= point.y;
    return this;
  }

  public mulScalar(scalar: number): this {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }

  public normalize(): this {
    const magnitude = this.magnitude();
    if (magnitude) {
      this.mulScalar(1 / magnitude);
    }
    return this;
  }

  public release(): void {
    Vector.release(this);
  }

  public remove(segment: Segment): void {
    const index = this.segments.indexOf(segment);
    this.segments.splice(index, 1);
    if (this.cell && !this.segments.length) {
      this.cell.remove(this);
    }
  }

  public rotate(angle: number): this {
    const {
      x,
      y
    } = this;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.x = x * cos - y * sin;
    this.y = x * sin + y * cos;
    return this;
  }

  public set(x?: number, y?: number): this {
    this.x = x ?? 0;
    this.y = y ?? this.x;
    return this;
  }

  public sub(point: Vector): this {
    this.x -= point.x;
    this.y -= point.y;
    return this;
  }

  public toString(): string {
    // eslint-disable-next-line no-magic-numbers -- 4-digit coordinate precision for the debug string.
    return `[${this.x.toFixed(4)},${this.y.toFixed(4)}]`;
  }
}
Vector.space = null;
export const MIN_POINT_DISTANCE = 25;
export const MIN_POINT_DISTANCE_SQUARED = MIN_POINT_DISTANCE * MIN_POINT_DISTANCE;
export const SIMPLIFY_LOOKBACK_COUNT = 2;
export const BORDER_FAST_REJECT_FACTOR = 0.95;
export const WALL_PROXIMITY_THRESHOLD = 5;

export class Polyline {
  public bounds: Bounds;
  public end: null | Vector;
  public owner: null | Trail;
  public path: Path2D;
  public segments: Segment[];
  public start: null | Vector;
  public constructor(owner?: Trail) {
    this.owner = owner ?? null;
    this.start = null;
    this.end = null;
    this.segments = [];
    this.bounds = {
      bottom: -Infinity,
      left: Infinity,
      right: -Infinity,
      top: Infinity
    };
    this.path = new Path2D();
  }

  public add2(point: Vector): boolean {
    const lastPoint = this.end ?? this.start;
    if (lastPoint?.equal(point)) {
      return false;
    }
    const {
      x,
      y
    } = point;
    if (this.end) {
      this.segments.push(new Segment(this.end, point).commit(this));
      this.end = point;
      this.updateBounds(point);
      this.path.lineTo(x, y);
      return true;
    }
    if (this.start) {
      this.segments.push(new Segment(this.start, point).commit(this));
      this.end = point;
      this.updateBounds(point);
      this.path.lineTo(x, y);
      return true;
    }
    this.start = point;
    this.updateBounds(point);
    this.path.moveTo(x, y);
    return true;
  }

  public clone(): Polyline {
    const polyline = new Polyline();
    polyline.segments = this.segments.map((segment: Segment) => segment.clone());
    polyline.start = this.start;
    polyline.end = this.end;
    Object.assign(polyline.bounds, this.bounds);
    return polyline;
  }

  public commit(polygon: Polygon): void {
    this.segments.forEach((segment: Segment) => segment.commit(polygon));
  }

  public points(): Vector[] {
    const list4 = this.segments.map((segment: Segment) => segment.start);
    if (this.end) {
      list4.push(this.end);
    }
    return list4;
  }

  public remove(): void {
    this.segments.forEach((segment: Segment) => {
      segment.remove();
    });
  }

  public reverse(): this {
    this.segments.reverse().forEach((segment: Segment) => segment.reverse());
    if (this.end) {
      [this.start, this.end] = [this.end, this.start];
    }
    return this;
  }

  public toString(): string {
    return this.segments.map((segment: Segment) => segment.start.toString()).join('');
  }

  public updateBounds(point: Vector): void {
    const {
      x,
      y
    } = point;
    this.bounds.left = Math.min(this.bounds.left, x);
    this.bounds.right = Math.max(this.bounds.right, x);
    this.bounds.top = Math.min(this.bounds.top, y);
    this.bounds.bottom = Math.max(this.bounds.bottom, y);
  }
}
export function computeCrossing(point: Vector, point2: Vector, point3: Vector): number {
  const deltaStartX = point.x - point3.x;
  const deltaStartY = point.y - point3.y;
  const deltaEndX = point2.x - point3.x;
  const deltaEndY = point2.y - point3.y;
  if (deltaStartY * deltaEndY > 0) {
    return 1;
  }
  const crossProduct = deltaStartX * deltaEndY - deltaStartY * deltaEndX;
  const sign = isNearlyZero(crossProduct) ? 0 : Math.sign(crossProduct);
  if (sign === 0) {
    if (deltaStartX * deltaEndX <= 0) {
      return 0;
    }
    return 1;
  }
  if (deltaStartY < 0) {
    return -sign;
  }
  if (deltaEndY < 0) {
    return sign;
  }
  return 1;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class Polygon {
  public bounds: Bounds | null;
  public owner: null | ShapeOwner;
  public path = new Path2D();
  public segments: Segment[];
  public simplify: Vector[];
  public constructor(points: Vector[]) {
    this.segments = [];
    this.simplify = [];
    this.owner = null;
    this.bounds = null;
    const {
      length
    } = points;
    for (let i2 = 0; i2 < length;) {
      this.segments.push(new Segment(ensureNonNullable(points[i2++]), ensureNonNullable(points[i2 < length ? i2 : 0])));
    }
    this.updateBounds();
  }

  public calcPath(): void {
    const path2D = new Path2D();
    const {
      segments
    } = this;
    const {
      length
    } = segments;
    const {
      start
    } = ensureNonNullable(segments[0]);
    path2D.moveTo(start.x, start.y);
    for (let segmentIndex = 1; segmentIndex < length; segmentIndex++) {
      const {
        start: point
      } = ensureNonNullable(segments[segmentIndex]);
      path2D.lineTo(point.x, point.y);
    }
    path2D.closePath();
    this.path = path2D;
    this.updateBounds();
  }

  public calcSimplify(): void {
    this.simplify = [];
    let i2 = 0;
    this.segments.forEach((segment: Segment) => {
      const {
        start
      } = segment;
      if (i2 < SIMPLIFY_LOOKBACK_COUNT) {
        this.simplify.push(start);
        i2++;
      } else {
        const previousPoint = ensureNonNullable(this.simplify[i2 - SIMPLIFY_LOOKBACK_COUNT]);
        if (start.distance2(previousPoint) < MIN_POINT_DISTANCE_SQUARED) {
          this.simplify[i2 - 1] = start;
        } else {
          this.simplify.push(start);
          i2++;
        }
      }
    });
  }

  public commit(owner?: ShapeOwner): void {
    if (owner) {
      this.owner = owner;
    }
    this.segments.forEach((segment: Segment) => segment.commit(this));
  }

  public findSegment(point: Vector): number {
    const index = this.segments.findIndex((segment: Segment) => segment.start === point);
    return index;
  }

  public hasPoint(point: Vector): boolean {
    return this.segments.some((segment: Segment) => segment.has(point));
  }

  public insert(segment: Segment, point: Vector): void {
    if (!segment.has(point)) {
      const index = this.segments.findIndex((candidateSegment: Segment) => candidateSegment === segment);
      const firstSegment = new Segment(segment.start, point).commit(this);
      const secondSegment = new Segment(point, segment.end).commit(this);
      segment.remove();
      this.segments.splice(index, 1, firstSegment, secondSegment);
    }
  }

  public inside(point: Vector): boolean {
    const {
      length
    } = this.segments;
    let product = 1;
    for (let i2 = 0; i2 < length; i2++) {
      const {
        end,
        start
      } = ensureNonNullable(this.segments[i2]);
      const crossing = computeCrossing(start, end, point);
      if (crossing === 0) {
        return true;
      }
      product *= crossing;
    }
    return product !== 1;
  }

  public insideNew(point: Vector): boolean {
    return !!pointInPolygon(this.segments.map((segment: Segment) => [segment.start.x, segment.start.y]), point.x, point.y);
  }

  public intersections(segment: Segment): Intersection[] {
    let list4: Intersection[] = [];
    if (this.segments.length > 1) {
      this.segments.forEach((ownSegment: Segment) => {
        const intersection = ownSegment.intersect(segment);
        if (intersection) {
          list4.push(intersection);
        }
      });
    }
    if (list4.length > 1) {
      list4.sort((intersectionA: Intersection, intersectionB: Intersection) => intersectionA.distance - intersectionB.distance);
      list4 = list4.filter((intersection: Intersection, index: number) => {
        return list4.findIndex((otherIntersection: Intersection) => otherIntersection.point === intersection.point) === index;
      });
    }
    return list4;
  }

  public left(list4: Vector[], startIndex: number, endIndex: number): void {
    const list5: Segment[] = [];
    for (let i2 = 0; i2 < list4.length - 1; i2++) {
      list5.push(new Segment(ensureNonNullable(list4[i2]), ensureNonNullable(list4[i2 + 1])));
    }
    const list6 = this.segments.splice(startIndex, endIndex - startIndex, ...list5);
    list5.forEach((segment: Segment) => segment.commit(this));
    list6.forEach((segment: Segment) => {
      segment.remove();
    });
  }

  public points(): Vector[] {
    return this.segments.map((segment: Segment) => segment.start);
  }

  public rawSquare(): number {
    let area = 0;
    this.segments.forEach((segment: Segment) => {
      const {
        end,
        start
      } = segment;
      area += (start.x + end.x) * (end.y - start.y);
    });
    // eslint-disable-next-line no-magic-numbers -- the shoelace formula halves the summed edge cross-products.
    return area / 2;
  }

  public remove(): void {
    this.segments.forEach((segment: Segment) => {
      segment.remove();
    });
  }

  public reverse(): this {
    this.segments.reverse();
    this.segments.forEach((segment: Segment) => segment.reverse());
    return this;
  }

  public right(list4: Vector[], startIndex: number, endIndex: number): void {
    const list5: Segment[] = [];
    for (let i2 = 0; i2 < list4.length - 1; i2++) {
      list5.push(new Segment(ensureNonNullable(list4[i2]), ensureNonNullable(list4[i2 + 1])));
    }
    const removedSegments = this.segments.splice(startIndex, endIndex - startIndex);
    this.remove();
    list5.reverse().forEach((segment: Segment) => segment.reverse().commit(this));
    this.segments = removedSegments.concat(list5);
  }

  public splice(polyline: Polyline, startIndex: number, endIndex: number): void {
    const list4 = this.segments.splice(startIndex, endIndex - startIndex, ...polyline.segments);
    list4.forEach((segment: Segment) => {
      segment.remove();
    });
    polyline.commit(this);
  }

  public square(): number {
    let area = this.rawSquare();
    if (area < 0) {
      area *= -1;
    }
    return area;
  }

  public unsplice(polyline: Polyline, startIndex: number, endIndex: number): void {
    const removedSegments = this.segments.splice(startIndex, endIndex - startIndex);
    this.remove();
    this.segments = removedSegments.concat(polyline.reverse().segments);
    polyline.commit(this);
  }

  public updateBounds(): void {
    this.calcSimplify();
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    this.simplify.forEach((point: Vector) => {
      const {
        x,
        y
      } = point;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    });
    left -= MIN_POINT_DISTANCE;
    right += MIN_POINT_DISTANCE;
    top -= MIN_POINT_DISTANCE;
    bottom += MIN_POINT_DISTANCE;
    this.bounds = {
      bottom,
      left,
      right,
      top
    };
  }
}
export function createCirclePoints(point: Vector, segmentCount: number, radius: number): Vector[] {
  if (typeof point.x !== 'number') {
    throw Error('circle');
  }
  // eslint-disable-next-line no-magic-numbers -- a full circle spans 2π radians.
  const fullCircleAngle = Math.PI * 2;
  const angleStep = fullCircleAngle / segmentCount;
  const list4: Vector[] = [];
  for (let angle = 0; angle < fullCircleAngle - EPSILON; angle += angleStep) {
    list4.push(new Vector(point.x + Math.cos(angle) * radius, point.y + Math.sin(angle) * radius));
  }
  return list4;
}

// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class Border {
  public center: Vector;
  public polygon: Polygon;
  public radius: number;
  public constructor(polygon: Polygon, center: Vector, radius: number) {
    this.polygon = polygon;
    this.radius = radius;
    this.center = center;
  }

  public static circular(center: Vector, segments: number, radius: number): Border {
    return new Border(new Polygon(createCirclePoints(center, segments, radius)), center, radius);
  }

  public intersections(segment: Segment): Intersection[] {
    // eslint-disable-next-line no-magic-numbers -- squared radius, compared against squared point distances.
    const fastRejectThresholdSquared = this.radius ** 2 * BORDER_FAST_REJECT_FACTOR;
    if (segment.start.distance2(this.center) < fastRejectThresholdSquared && segment.end.distance2(this.center) < fastRejectThresholdSquared) {
      return [];
    }
    return this.polygon.intersections(segment).filter((intersection: Intersection) => !intersection.overlay);
  }
}
