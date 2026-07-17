import type {
  Intersection,
  Segment
} from '../geometry/shapes.ts';
import type { Vector } from '../geometry/vector.ts';
import type { Unit } from './units.ts';

import {
  MIN_POINT_DISTANCE_SQUARED,
  Polygon,
  Polyline,
  SIMPLIFY_LOOKBACK_COUNT,
  WALL_PROXIMITY_THRESHOLD
} from '../geometry/shapes.ts';
import {
  KILL_REASON_SELF_INTERSECTION,
  KILL_REASON_TRAIL,
  KILL_REASON_WALL
} from '../shared/constants.ts';
import { ensureNonNullable } from '../type-guards.ts';

export type ShapeOwner = Territory | Trail;
export interface TrailCrossing {
  base: ShapeOwner;
  enter: boolean;
  intersection: Intersection;
}
export interface TrailIntersectionRecord {
  intersections: TrailCrossing[];
  point: Vector;
}

export class Territory {
  public isTrack = false;
  // Never populated by any observed code path; element type is not inferable from usage.
  public merges: Polygon[];
  public path = new Path2D();
  public polygon: Polygon;
  public square = 0;
  public unit: Unit;
  public constructor(unit: Unit, points: Vector[]) {
    this.unit = unit;
    this.merges = [];
    this.polygon = new Polygon(points);
    this.polygon.commit(this);
    this.calcSquare();
    this.polygon.calcPath();
  }

  public calcPath(): Path2D {
    this.path = new Path2D();
    const {
      segments
    } = this.polygon;
    const {
      length
    } = segments;
    const {
      start
    } = ensureNonNullable(segments[0]);
    this.path.moveTo(start.x, start.y);
    for (let segmentIndex = 1; segmentIndex < length; segmentIndex++) {
      const {
        start: point
      } = ensureNonNullable(segments[segmentIndex]);
      this.path.lineTo(point.x, point.y);
    }
    this.path.closePath();
    return this.path;
  }

  public calcSquare(): void {
    this.square = this.polygon.square();
  }

  public handleEnemyIntersect(intersection: Intersection, unit: Unit, segment: Segment): void {
    const {
      point: intersectionPoint,
      segment: intersectionSegment
    } = intersection;
    if (unit.in === this) {
      if (intersection.zn < 0) {
        return;
      }
      this.polygon.insert(intersectionSegment, intersectionPoint);
      unit.track.add(intersectionPoint);
      unit.track.intersect(intersection, this, false);
      unit.in = null;
    } else {
      if (intersection.zn > 0) {
        return;
      }
      if (intersection.overlay) {
        return;
      }
      if (intersectionPoint.equal(segment.end)) {
        return;
      }
      if (unit.in) {
        return;
      }
      this.polygon.insert(intersectionSegment, intersectionPoint);
      unit.track.add(intersectionPoint);
      unit.track.intersect(intersection, this, true);
      unit.in = this;
    }
  }

  public handleIntersect(intersection: Intersection, unit: Unit, segment: Segment): void {
    if (unit === this.unit) {
      this.handleSelfIntersect(intersection, unit, segment);
    } else {
      this.handleEnemyIntersect(intersection, unit, segment);
    }
  }

  public handleSelfIntersect(intersection: Intersection, unit: Unit, segment: Segment): void {
    if (intersection.overlay) {
      return;
    }
    this.unit.onScoreChanged();
    const {
      point: intersectionPoint,
      segment: intersectionSegment
    } = intersection;
    if (unit.in === this) {
      if (intersection.zn < 0) {
        return;
      }
      if (intersectionPoint.equal(segment.end)) {
        return;
      }
      this.polygon.insert(intersectionSegment, intersectionPoint);
      unit.track.add(intersectionPoint);
      unit.in = null;
      if (unit.schemes) {
        unit.schemes.out();
      }
      if (unit.achievements) {
        unit.achievements.onOut();
      }
    } else {
      if (intersection.zn > 0) {
        return;
      }
      if (intersectionPoint.equal(segment.start)) {
        return;
      }
      if (unit.in) {
        return;
      }
      this.polygon.insert(intersectionSegment, intersectionPoint);
      unit.track.add(intersectionPoint);
      if (unit.track.polyline.end) {
        this.unit.game.handleReturn(unit);
      }
      unit.in = this;
      unit.track.remove();
    }
  }

  public remove(): void {
    this.polygon.remove();
  }
}
export class Trail {
  public intersections: TrailIntersectionRecord[];
  public isTrack: boolean;
  public length: number;
  public polyline: Polyline;
  public simplyline: Vector[];
  public unit: Unit;
  public constructor(unit: Unit) {
    this.polyline = new Polyline(this);
    this.simplyline = [];
    this.unit = unit;
    this.length = 0;
    this.intersections = [];
    this.isTrack = true;
  }

  public add(point: Vector): void {
    if (this.polyline.add2(point)) {
      const length2 = this.polyline.segments.length;
      if (length2 > 0) {
        const segment = ensureNonNullable(this.polyline.segments[length2 - 1]);
        this.length += segment.start.distance(segment.end);
      }
      const {
        simplyline
      } = this;
      const {
        length
      } = simplyline;
      if (length > SIMPLIFY_LOOKBACK_COUNT) {
        const previousPoint = ensureNonNullable(simplyline[length - SIMPLIFY_LOOKBACK_COUNT]);
        if (point.distance2(previousPoint) < MIN_POINT_DISTANCE_SQUARED) {
          simplyline[length - 1] = point;
        } else {
          simplyline.push(point);
        }
      } else {
        simplyline.push(point);
      }
    }
  }

  public handleIntersect(intersection: Intersection, unit: Unit, _segment: Segment): void {
    const game = unit.game;
    if (unit === this.unit) {
      if (intersection.overlay || intersection.point !== ensureNonNullable(this.polyline.segments[this.polyline.segments.length - 1]).end) {
        this.unit.position = intersection.point;
        const killReason = game.border.radius - unit.position.distance(game.space.center) < WALL_PROXIMITY_THRESHOLD ? KILL_REASON_WALL : KILL_REASON_SELF_INTERSECTION;
        game.kill(this.unit, undefined, killReason);
      }
    } else {
      game.kill(this.unit, unit, KILL_REASON_TRAIL);
    }
  }

  public intersect(intersection: Intersection, base: ShapeOwner, enter: boolean): void {
    const existingRecord = this.intersections.find((record: TrailIntersectionRecord) => record.point.equal(intersection.point));
    if (existingRecord) {
      existingRecord.intersections.push({
        base,
        enter,
        intersection
      });
    } else {
      this.intersections.push({
        intersections: [{
          base,
          enter,
          intersection
        }],
        point: intersection.point
      });
    }
  }

  public remove(): void {
    this.polyline.remove();
    this.polyline = new Polyline(this);
    this.length = 0;
    this.simplyline = [];
    this.intersections = [];
  }
}
