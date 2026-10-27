import type { Point } from './plane.ts';

import { distanceToSegment } from './plane.ts';

const MIN_REDUCIBLE_POINTS = 3;

interface HasOutlineClearanceParams {
  readonly clearance: number;
  readonly outline: readonly Point[];
  readonly point: Point;
}

interface OutlineEdge {
  readonly bottom: number;
  readonly end: Point;
  readonly left: number;
  readonly right: number;
  readonly start: Point;
  readonly top: number;
}

const outlineEdges = new WeakMap<readonly Point[], readonly OutlineEdge[]>();

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
 * Tests edge clearance, rejecting far segments by bounds before measuring their distance. The outline must be immutable.
 *
 * @param params - The point, polygon edges and required distance.
 * @returns Whether every edge is at least the requested distance away; this does not test polygon containment.
 */
export function hasOutlineClearance(params: HasOutlineClearanceParams): boolean {
  const { clearance, outline, point } = params;
  for (const edge of edgesOf(outline)) {
    if (point.x < edge.left - clearance || point.x > edge.right + clearance || point.y < edge.top - clearance || point.y > edge.bottom + clearance) {
      continue;
    }
    if (distanceToSegment(point, edge.start, edge.end) < clearance) {
      return false;
    }
  }
  return true;
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

function edgesOf(outline: readonly Point[]): readonly OutlineEdge[] {
  const cached = outlineEdges.get(outline);
  if (cached) {
    return cached;
  }
  const edges: OutlineEdge[] = [];
  for (let index = 0; index < outline.length; index++) {
    const start = outline[index];
    const end = outline[(index + 1) % outline.length];
    if (start && end) {
      edges.push({ bottom: Math.max(start.y, end.y), end, left: Math.min(start.x, end.x), right: Math.max(start.x, end.x), start, top: Math.min(start.y, end.y) });
    }
  }
  outlineEdges.set(outline, edges);
  return edges;
}
