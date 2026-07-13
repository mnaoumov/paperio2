import { ensureNonNullable } from '../type-guards.ts';
import {
  EPSILON,
  FIXED_DECIMAL_DIGITS
} from './constants.ts';

export const POLYGON_POINT_OUTSIDE = 0;
export const POLYGON_POINT_ON_EDGE = 1;
export const POLYGON_POINT_INSIDE = 2;

const timeSource = typeof performance === 'undefined' ? Date : performance;
export const now = timeSource.now.bind(timeSource);

export function clamp(min: number, max: number, value: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

export function easeOutCubic(t: number): number {
  return --t * t * t + 1;
}

export function formatFixed2(value: number): string {
  return value.toFixed(FIXED_DECIMAL_DIGITS);
}

export function intervalOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  if (aStart > aEnd) {
    [aStart, aEnd] = [aEnd, aStart];
  }
  if (bStart > bEnd) {
    [bStart, bEnd] = [bEnd, bStart];
  }
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
}

export function isBetween(bound1: number, bound2: number, value: number): boolean {
  return Math.min(bound1, bound2) - EPSILON <= value && value <= Math.max(bound1, bound2) + EPSILON;
}

export function isNearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

export function isNearlyZero(value: number): boolean {
  return Math.abs(value) <= EPSILON;
}

export function isPointOnSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): boolean {
  const dx1 = x1 - px;
  const dy1 = y1 - py;
  const dx2 = x2 - px;
  const dy2 = y2 - py;
  const crossProduct = dx1 * dy2 - dy1 * dx2;
  const dot = dx1 * dx2 + dy1 * dy2;
  return crossProduct === 0 && dot <= 0;
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function pointInPolygon(list4: number[][], x: number, y: number): number {
  let isInside = false;
  const length = list4.length;
  for (let i2 = 0, previousIndex = length - 1; i2 < length; previousIndex = i2++) {
    const currentPoint = ensureNonNullable(list4[i2]);
    const previousPoint = ensureNonNullable(list4[previousIndex]);
    const currentX = ensureNonNullable(currentPoint[0]);
    const currentY = ensureNonNullable(currentPoint[1]);
    const previousX = ensureNonNullable(previousPoint[0]);
    const previousY = ensureNonNullable(previousPoint[1]);
    if (isPointOnSegment(x, y, currentX, currentY, previousX, previousY)) {
      return POLYGON_POINT_ON_EDGE;
    }
    const isCrossing = (currentY > y) !== (previousY > y) && x < (previousX - currentX) * (y - currentY) / (previousY - currentY) + currentX;
    if (isCrossing) {
      isInside = !isInside;
    }
  }
  if (isInside) {
    return POLYGON_POINT_INSIDE;
  }
  return POLYGON_POINT_OUTSIDE;
}
