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
