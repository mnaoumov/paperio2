import type {
  Intersection,
  Segment
} from './shapes.ts';

import {
  BORDER_FAST_REJECT_FACTOR,
  Polygon
} from './shapes.ts';
import {
  createCirclePoints,
  Vector
} from './vector.ts';

/**
 * How far outside a wall segment a point may lie before {@link Border.pullInside} moves it. The wall slide leaves a unit
 * on the wall's line to about 1e-13; anything past this is a unit that is really outside.
 */
export const WALL_ESCAPE_TOLERANCE = 1e-6;

const MIN_WALL_SEGMENTS = 3;

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

  /**
   * Brings a point that lies outside the wall back inside it. The wall slide in `Game.getMovement` keeps a unit on the
   * wall's line to within rounding, but a unit that starts a move even slightly outside the wall polygon never crosses
   * it again on the way out, so nothing stops it: the original lets the player wander off the arena that way. Not in
   * the original, and it never moves a point the wall slide left on the wall.
   *
   * @param point - The point to check.
   * @returns A new point on the polygon's inscribed circle, along the ray from the centre through `point`, when `point`
   *   lies more than {@link WALL_ESCAPE_TOLERANCE} outside any wall segment; otherwise `null`.
   */
  public pullInside(point: Vector): null | Vector {
    const dx = point.x - this.center.x;
    const dy = point.y - this.center.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const segments = this.polygon.segments;
    const segmentCount = segments.length;
    if (segmentCount < MIN_WALL_SEGMENTS) {
      return null;
    }
    const inscribedRadius = this.radius * Math.cos(Math.PI / segmentCount);
    if (distance <= inscribedRadius) {
      return null;
    }
    let outside = false;
    for (const segment of segments) {
      const centerSide = segment.a * this.center.x + segment.b * this.center.y + segment.c;
      const pointSide = segment.a * point.x + segment.b * point.y + segment.c;
      if (-Math.sign(centerSide) * pointSide > WALL_ESCAPE_TOLERANCE) {
        outside = true;
        break;
      }
    }
    if (!outside) {
      return null;
    }
    const factor = inscribedRadius / distance;
    return new Vector(this.center.x + dx * factor, this.center.y + dy * factor);
  }
}
