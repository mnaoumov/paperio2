import type { Point } from './plane.ts';

import { distanceToSegment } from './plane.ts';

const MIN_REDUCIBLE_POINTS = 3;

interface SimplifyGeometryParams {
  readonly closed: boolean;
  readonly points: readonly Point[];
  readonly tolerance: number;
}

interface Span {
  readonly first: number;
  readonly last: number;
}

/**
 * Reduces raw collision geometry while bounding the distance of every omitted vertex to its replacement segment.
 * The engine's distance-based display simplification can drop a sharp corner even when that corner matters to safety.
 *
 * @param params - The geometry, whether its last point joins its first, and the maximum error.
 * @returns A new array; neither the input array nor its points are changed.
 */
export function simplifyGeometry(params: SimplifyGeometryParams): Point[] {
  const { closed, tolerance } = params;
  const points = [...params.points];
  const first = points[0];
  if (points.length < MIN_REDUCIBLE_POINTS || !first) {
    return points;
  }
  if (closed) {
    points.push(first);
  }
  const kept = new Uint8Array(points.length);
  kept[0] = 1;
  kept[points.length - 1] = 1;
  const spans: Span[] = [{ first: 0, last: points.length - 1 }];
  for (let span = spans.pop(); span; span = spans.pop()) {
    const start = points[span.first];
    const end = points[span.last];
    if (!start || !end) {
      continue;
    }
    let farthest = tolerance;
    let chosen = -1;
    for (let index = span.first + 1; index < span.last; index++) {
      const point = points[index];
      if (point) {
        const away = distanceToSegment(point, start, end);
        if (away > farthest) {
          farthest = away;
          chosen = index;
        }
      }
    }
    if (chosen >= 0) {
      kept[chosen] = 1;
      spans.push({ first: span.first, last: chosen }, { first: chosen, last: span.last });
    }
  }
  if (closed) {
    points.pop();
  }
  return points.filter((_point, index) => kept[index] === 1);
}
