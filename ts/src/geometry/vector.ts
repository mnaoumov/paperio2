import type { ContourPoints } from './contour-points.ts';
import type { Segment } from './shapes.ts';
import type { SpatialGrid } from './spatial-grid.ts';

import { EPSILON } from '../shared/constants.ts';
import { isNearlyEqual } from '../shared/math-utils.ts';
import { ensureNonNullable } from '../type-guards.ts';

export function firstMatchingPoint(target: Vector, candidates: Vector[]): Vector {
  for (const candidate of candidates) {
    if (candidate.equal(target)) {
      return candidate;
    }
  }
  return target;
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

export const baseCos = Math.cos(0);
export const baseSin = Math.sin(0);
export function angleToVector(angle: number): Vector {
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  const x = baseCos * cosAngle - baseSin * sinAngle;
  const y = baseCos * sinAngle + baseSin * cosAngle;
  return Vector.alloc(x, y);
}
