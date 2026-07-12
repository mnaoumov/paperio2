import Cookies from 'js-cookie';
import { Fragment, createContext, createElement, render } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { assertNonNullable, ensureNonNullable } from './type-guards';
// --- ambient augmentations for dynamic globals the engine touches ---
// (js-cookie's own types now come from `@types/js-cookie`; only the engine's
// own payload/window shapes are declared here.)
// Mirrors the achievements/challenges cookie payload (see `AchievementStore`
// below) — named here (rather than only inside the engine IIFE) so the
// `Window.paperio_challenges` augmentation below can reference it.
interface StoredChallenges {
  [key: string]: boolean;
}

// The `gtag`/GTM-style event queue some ad/analytics integrations install.
interface DataLayerEntry {
  event: string;
  publisher: string;
  productKey: string;
}

// The scores payload some other page-level script may leave on `window`
// after posting game results — read-only from this file's perspective.
interface Paper2ResultsScores {
  accumulator?: number;
  kills?: number;
}
interface Paper2Results {
  build?: number;
  top?: number;
  score: number;
  bestPercent?: number;
  time: number;
  kills: number;
  reason?: number;
  scores?: Paper2ResultsScores;
}

declare global {
interface Window {
  // The ad-network integration this offline copy strips out (see the
  // project's `index.html` shim) — every call site guards with `if
  // (window.ads && window.ads.showAds)`, so both members stay optional.
  ads?: {
    showAds?: () => void;
    hideAds?: () => void;
  };
  dataLayer?: DataLayerEntry[];
  // Classic Google Analytics `ga()`; every call site in this file passes
  // exactly `("send", "event", category, action)`.
  ga?: (command: string, hitType: string, eventCategory: string, eventAction: string) => void;
  paper2_results: Paper2Results;
  paperio_challenges?: StoredChallenges;
  // `GameApi`'s own shape lives inside the engine IIFE below (it reaches
  // deep into `Game` and friends) — bridged through `object` here rather
  // than duplicating that whole type graph at this top level, since nothing
  // in this file reads `window.paperio2api` back (only the offline shim in
  // `index.html`, outside this compilation, calls into it at runtime).
  paperio2api?: object;
  playerId?: number;
  // The shop/skins-unlock integration this offline copy strips out.
  shop?: {
    autoCheckUnlock: () => void;
  };
  ShowPreroll?: () => void;
}
interface Navigator {
  userLanguage?: string;
  browserLanguage?: string;
}
// Real `HTMLElement` (unlike its `HTMLInputElement`/`HTMLSelectElement`
// subclasses) has no `.value` in `lib.dom` — needed for the one config-form
// callsite that reads it off a plain `document.getElementById()` result.
interface HTMLElement {
  value: string;
}
// `better-typescript-lib` narrows `getElementById` to `Element | null`, which
// drops the `.style`/`.value` members every call site in this file relies on
// (each id maps to a real `HTMLElement`). Restore lib.dom's `HTMLElement`
// return so those accesses type without a cast.
interface Document {
  getElementById(elementId: string): HTMLElement | null;
}

// `Object.entries(x)` on an `any`/untyped argument resolves TypeScript's
// generic `entries<T>` overload with `T` un-inferable, defaulting the values
// to `unknown`, which then poison the `createElement` prop object literals
// built from the result. Both of this file's two `Object.entries()` call
// sites pass untyped arguments, so a non-generic overload here fixes both.
interface ObjectConstructor {
  entries(source: object): [string, string | number | boolean][];
}
}

(function () {
  "use strict";

  // --- shared structural types inferred from usage across the engine ---
  interface Bounds {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }
  interface Intersection {
    point: Vector;
    segment: Segment;
    distance: number;
    overlay: boolean;
    zn: number;
  }
  type ShapeOwner = Territory | Trail;
  interface TrailCrossing {
    intersection: Intersection;
    base: ShapeOwner;
    enter: boolean;
  }
  interface TrailIntersectionRecord {
    point: Vector;
    intersections: TrailCrossing[];
  }
  interface Rgb {
    r: number;
    g: number;
    b: number;
  }
  interface Hsv {
    h: number;
    s: number;
    v: number;
  }
  interface BotStateContext {
    exitPoint?: Vector;
    minDistance?: number;
    point?: Vector;
  }
  interface BotStateHandlers {
    enter?: (payload: Bot, context: BotStateContext) => BotStateContext | void;
    leave?: (payload: Bot, context: BotStateContext) => BotStateContext | void;
    update: (payload: Bot, context: BotStateContext) => string | void;
  }
  type BotStates = { [name: string]: BotStateHandlers };
  interface UnitScores {
    accumulator: number;
    kills: number;
  }
  interface UnitStatistics {
    kills: number;
  }
  interface UnitTrackDistance {
    unit: Unit;
    trackDistance: number;
    trackPoint: Vector | null;
    danger: number;
  }
  interface Label {
    text: string;
    color: string;
    unit?: Unit | null;
    time: number;
    fading?: boolean;
  }
  type ParticleColor = string | HTMLCanvasElement | HTMLImageElement;

  const EPSILON = Math.pow(2, -26);
  const isNearlyZero = (value: number) => Math.abs(value) <= EPSILON;
  const isNearlyEqual = (a: number, b: number) => Math.abs(a - b) <= EPSILON;
  const lerp = (start: number, end: number, t: number) => start + (end - start) * t;
  const easeOutCubic = (t: number) => --t * t * t + 1;
  const clamp = (min: number, max: number, value: number) => {
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  };
  const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
  const isBetween = (bound1: number, bound2: number, value: number) => Math.min(bound1, bound2) - EPSILON <= value && value <= Math.max(bound1, bound2) + EPSILON;
  const intervalOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => {
    if (aStart > aEnd) {
      [aStart, aEnd] = [aEnd, aStart];
    }
    if (bStart > bEnd) {
      [bStart, bEnd] = [bEnd, bStart];
    }
    return Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
  };
  function pointInPolygon(list4: number[][], x: number, y: number) {
    let isInside = false;
    let length = list4.length;
    for (let i2 = 0, previousIndex = length - 1; i2 < length; previousIndex = i2++) {
      const currentPoint = ensureNonNullable(list4[i2]);
      const previousPoint = ensureNonNullable(list4[previousIndex]);
      let currentX = ensureNonNullable(currentPoint[0]);
      let currentY = ensureNonNullable(currentPoint[1]);
      let previousX = ensureNonNullable(previousPoint[0]);
      let previousY = ensureNonNullable(previousPoint[1]);
      if (isPointOnSegment(x, y, currentX, currentY, previousX, previousY)) {
        return 1;
      }
      var isCrossing = currentY > y != previousY > y && x < (previousX - currentX) * (y - currentY) / (previousY - currentY) + currentX;
      if (isCrossing) {
        isInside = !isInside;
      }
    }
    if (isInside) {
      return 2;
    } else {
      return 0;
    }
  }
  function isPointOnSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    let dx1 = x1 - px;
    let dy1 = y1 - py;
    let dx2 = x2 - px;
    let dy2 = y2 - py;
    let cross = dx1 * dy2 - dy1 * dx2;
    let dot = dx1 * dx2 + dy1 * dy2;
    return cross == 0 && dot <= 0;
  }
  let nextId = 1;
  const generateId = () => nextId++;
  class Segment {
    a = 0;
    b = 0;
    c = 0;
    end: Vector;
    mark: number;
    shape: Polygon | Polyline | null;
    start: Vector;
    vector: Vector | null = null;
    id?: number;
    constructor(start: Vector, end: Vector) {
      if (start.equal(end)) {}
      this.mark = 0;
      this.shape = null;
      this.start = start;
      this.end = end;
      this.calc();
    }
    get owner(): Polygon | Polyline | null {
      return null;
    }
    calc() {
      const {
        start,
        end
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
    clone() {
      return new Segment(this.start, this.end);
    }
    reverse() {
      const start = this.start;
      this.start = this.end;
      this.end = start;
      this.calc();
      return this;
    }
    commit(shape: Polygon | Polyline) {
      this.shape = shape;
      this.start.commit(this);
      this.end.commit(this);
      return this;
    }
    remove() {
      this.shape = null;
      this.start.remove(this);
      this.end.remove(this);
    }
    length() {
      return ensureNonNullable(this.vector).magnitude();
    }
    zn(segment: Segment) {
      const a2 = segment.a;
      const b2 = segment.b;
      const {
        a,
        b
      } = this;
      return cross(a2, b2, a, b);
    }
    intersect(segment: Segment): Intersection | null {
      const a2 = segment.a;
      const b2 = segment.b;
      const c2 = segment.c;
      const start2 = segment.start;
      const end2 = segment.end;
      const {
        a,
        b,
        c,
        start,
        end
      } = this;
      const determinant = cross(a2, b2, a, b);
      if (!isNearlyZero(determinant)) {
        const intersectionX = -cross(c2, b2, c, b) / determinant;
        const intersectionY = -cross(a2, c2, a, c) / determinant;
        const intersectionPoint = isBetween(start2.x, end2.x, intersectionX) && isBetween(start2.y, end2.y, intersectionY) && isBetween(start.x, end.x, intersectionX) && isBetween(start.y, end.y, intersectionY) && new Vector(intersectionX, intersectionY);
        if (!intersectionPoint) {
          return null;
        }
        return {
          point: start.equal(intersectionPoint) && start || end.equal(intersectionPoint) && end || start2.equal(intersectionPoint) && start2 || end2.equal(intersectionPoint) && end2 || intersectionPoint,
          segment: this,
          distance: intersectionPoint.distance2(start2),
          overlay: false,
          zn: Math.sign(determinant)
        };
      }
      const overlapX = intervalOverlap(start2.x, end2.x, start.x, end.x);
      const overlapY = intervalOverlap(start2.y, end2.y, start.y, end.y);
      if (isNearlyZero(cross(a2, c2, a, c)) && isNearlyZero(cross(b2, c2, b, c)) && overlapX >= -EPSILON && overlapY >= -EPSILON) {
        if (overlapX >= EPSILON || overlapY >= EPSILON) {
          let overlapPoint;
          if (isBetween(start.x, end.x, start2.x) && isBetween(start.y, end.y, start2.y)) {
            overlapPoint = start.equal(start2) && start || end.equal(start2) && end || start2;
          } else {
            overlapPoint = start2.distance2(start) >= start2.distance2(end) ? end : start;
          }
          return {
            point: overlapPoint,
            segment: this,
            distance: overlapPoint.distance2(start2),
            overlay: true,
            zn: 0
          };
        }
        const sharedPoint = start.equal(start2) || start.equal(end2) ? start : end;
        return {
          point: sharedPoint,
          segment: this,
          distance: sharedPoint.distance2(start2),
          overlay: false,
          zn: 0
        };
      }
      return null;
    }
    has(point: Vector) {
      return this.start === point || this.end === point;
    }
  }
  const CELL_MARGIN = 1;
  class ContourPoints {
    points: Vector[];
    x: number;
    y: number;
    constructor(x: number, y: number) {
      this.points = [];
      this.x = x;
      this.y = y;
    }
    commit(point: Vector) {
      this.points.push(point);
      point.cell = this;
    }
    remove(point: Vector) {
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
  class SpatialGrid {
    cells: ContourPoints[];
    center: Vector;
    h: number;
    height: number;
    size: number;
    w: number;
    width: number;
    constructor(width: number, height: number, cellSize: number) {
      this.width = width;
      this.height = height;
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
    count() {
      let total = 0;
      this.cells.forEach((cell: ContourPoints) => {
        total += cell.points.length;
      });
      return total;
    }
    cell(point: Vector) {
      return this.getCell(Math.floor(point.x / this.size) % this.w, Math.floor(point.y / this.size) % this.h);
    }
    getCell(col: number, row: number) {
      return ensureNonNullable(this.cells[col + row * this.w]);
    }
    checkPoint(point: Vector) {
      const cell = this.cell(point);
      return cell.points.find((existingPoint: Vector) => existingPoint.equal(point)) || point;
    }
    segmentsCount(): { [id: number]: Segment } {
      const segmentsById: { [id: number]: Segment } = {};
      for (let i2 = 0; i2 < this.h; i2++) {
        for (let i3 = 0; i3 < this.w; i3++) {
          this.getCell(i3, i2).points.forEach((point: Vector) => {
            point.segments.forEach((segment: Segment) => segmentsById[segment.id ?? 0] = segment);
          });
        }
      }
      return segmentsById;
    }
    intersections(segment: Segment): Intersection[] {
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
          this.getCell(col, row).points.forEach((point: Vector) => {
            point.segments.forEach((segment2: Segment) => {
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
    clear() {
      this.cells = [];
    }
  }
  const VECTOR_POOL_SIZE = 30000;
  const vectorPool: Vector[] = Array.from({
    length: VECTOR_POOL_SIZE
  });
  let i = 0;
  class Vector {
    cell: ContourPoints | null;
    segments: Segment[];
    x = 0;
    y = 0;
    static space: SpatialGrid | null;
    constructor(x?: number, y?: number) {
      this.cell = null;
      this.segments = [];
      this.set(x, y);
    }
    set(x?: number, y?: number) {
      this.x = x || 0;
      this.y = y || (y === 0 ? 0 : this.x);
      return this;
    }
    commit(segment: Segment) {
      if (this.segments.indexOf(segment) === -1) {
        this.segments.push(segment);
      }
      if (!this.cell) {
        const cell = ensureNonNullable(Vector.space).cell(this);
        cell.commit(this);
      }
    }
    remove(segment: Segment) {
      const index = this.segments.indexOf(segment);
      this.segments.splice(index, 1);
      if (this.cell && !this.segments.length) {
        this.cell.remove(this);
      }
    }
    release() {
      Vector.release(this);
    }
    add(point: Vector) {
      this.x += point.x;
      this.y += point.y;
      return this;
    }
    sub(point: Vector) {
      this.x -= point.x;
      this.y -= point.y;
      return this;
    }
    mul(point: Vector) {
      this.x *= point.x;
      this.y *= point.y;
      return this;
    }
    mulScalar(scalar: number) {
      this.x *= scalar;
      this.y *= scalar;
      return this;
    }
    magnitude() {
      const {
        x,
        y
      } = this;
      return Math.sqrt(x * x + y * y);
    }
    normalize() {
      const magnitude = this.magnitude();
      if (magnitude) {
        this.mulScalar(1 / magnitude);
      }
      return this;
    }
    copy(point: Vector) {
      this.x = point.x;
      this.y = point.y;
      return this;
    }
    distance(point: Vector) {
      return Math.sqrt(this.distance2(point));
    }
    distance2(point: Vector) {
      const dx = this.x - point.x;
      const dy = this.y - point.y;
      return dx * dx + dy * dy;
    }
    cross(point: Vector) {
      return this.x * point.y - this.y * point.x;
    }
    dot(point: Vector) {
      return this.x * point.x + this.y * point.y;
    }
    rotate(angle: number) {
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
    angle(point: Vector) {
      return Math.atan2(this.cross(point), this.dot(point));
    }
    invert() {
      return this.mulScalar(-1);
    }
    equal(point: Vector) {
      return isNearlyEqual(this.x, point.x) && isNearlyEqual(this.y, point.y);
    }
    clone() {
      return new Vector(this.x, this.y);
    }
    static alloc(x?: number, y?: number) {
      if (i) {
        let vector = ensureNonNullable(vectorPool[--i]).set(x, y);
        return vector;
      }
      return new Vector(x, y);
    }
    static clone(point: Vector) {
      return Vector.alloc(point.x, point.y);
    }
    static poolLength() {
      return i;
    }
    toString() {
      return "[" + this.x.toFixed(4) + "," + this.y.toFixed(4) + "]";
    }
    static release(vector: Vector) {
      if (i < VECTOR_POOL_SIZE) {
        vector.set();
        if (vector.cell || vector.segments.length) {}
        vectorPool[i++] = vector;
      }
    }
  }
  Vector.space = null;
  const MIN_POINT_DISTANCE = 25;
  const MIN_POINT_DISTANCE_SQUARED = MIN_POINT_DISTANCE * MIN_POINT_DISTANCE;
  const KILL_REASON_WIN = 0;
  const KILL_REASON_SELF_INTERSECTION = 1;
  const KILL_REASON_WALL = 2;
  const KILL_REASON_TRAIL = 3;
  const KILL_REASON_EXIT_POINT = 4;
  const KILL_REASON_SURROUNDED = 5;
  const KILL_REASON_SYSTEM = 6;
  const KILL_REASON_CAPITAL_SURROUNDED = 7;
  // deathReasons[8] ("убит разделением со столицей" / separated-from-capital) has
  // no constant here — no code path ever produces reason code 8. Codes 0-7 are all used.
  const FRAME_DURATION_MILLISECONDS = 1000 / 60;
  const TWO_FRAME_DURATION_MILLISECONDS = 1000 / 60 * 2;
  class Polyline {
    bounds: Bounds;
    end: Vector | null;
    owner: Trail | null;
    path: Path2D;
    segments: Segment[];
    start: Vector | null;
    constructor(owner?: Trail) {
      this.owner = owner || null;
      this.start = null;
      this.end = null;
      this.segments = [];
      this.bounds = {
        left: Infinity,
        right: -Infinity,
        top: Infinity,
        bottom: -Infinity
      };
      this.path = new Path2D();
    }
    commit(polygon: Polygon) {
      this.segments.forEach((segment: Segment) => segment.commit(polygon));
    }
    remove() {
      this.segments.forEach((segment: Segment) => segment.remove());
    }
    reverse() {
      this.segments.reverse().forEach((segment: Segment) => segment.reverse());
      if (this.end) {
        [this.start, this.end] = [this.end, this.start];
      }
      return this;
    }
    clone() {
      const polyline = new Polyline();
      polyline.segments = this.segments.map((segment: Segment) => segment.clone());
      polyline.start = this.start;
      polyline.end = this.end;
      Object.assign(polyline.bounds, this.bounds);
      return polyline;
    }
    updateBounds(point: Vector) {
      const {
        x,
        y
      } = point;
      this.bounds.left = Math.min(this.bounds.left, x);
      this.bounds.right = Math.max(this.bounds.right, x);
      this.bounds.top = Math.min(this.bounds.top, y);
      this.bounds.bottom = Math.max(this.bounds.bottom, y);
    }
    add2(point: Vector) {
      const lastPoint = this.end || this.start;
      if (lastPoint && lastPoint.equal(point)) {
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
    points() {
      const list4 = this.segments.map((segment: Segment) => segment.start);
      if (this.end) {
        list4.push(this.end);
      }
      return list4;
    }
    toString() {
      return this.segments.map((segment: Segment) => segment.start.toString()).join("");
    }
  }
  const computeCrossing = (point: Vector, point2: Vector, point3: Vector) => {
    const deltaStartX = point.x - point3.x;
    const deltaStartY = point.y - point3.y;
    const deltaEndX = point2.x - point3.x;
    const deltaEndY = point2.y - point3.y;
    if (deltaStartY * deltaEndY > 0) {
      return 1;
    }
    const cross = deltaStartX * deltaEndY - deltaStartY * deltaEndX;
    const sign = isNearlyZero(cross) ? 0 : Math.sign(cross);
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
  };
  class Polygon {
    bounds: Bounds | null;
    owner: ShapeOwner | null;
    path = new Path2D();
    segments: Segment[];
    simplify: Vector[];
    constructor(points: Vector[]) {
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
    commit(owner?: ShapeOwner) {
      if (owner) {
        this.owner = owner;
      }
      this.segments.forEach((segment: Segment) => segment.commit(this));
    }
    remove() {
      this.segments.forEach((segment: Segment) => segment.remove());
    }
    reverse() {
      this.segments.reverse();
      this.segments.forEach((segment: Segment) => segment.reverse());
      return this;
    }
    insert(segment: Segment, point: Vector) {
      if (!segment.has(point)) {
        const index = this.segments.findIndex((candidateSegment: Segment) => candidateSegment === segment);
        const firstSegment = new Segment(segment.start, point).commit(this);
        const secondSegment = new Segment(point, segment.end).commit(this);
        segment.remove();
        this.segments.splice(index, 1, firstSegment, secondSegment);
      }
    }
    hasPoint(point: Vector) {
      return this.segments.some((segment: Segment) => segment.has(point));
    }
    findSegment(point: Vector) {
      const index = this.segments.findIndex((segment: Segment) => segment.start === point);
      return index;
    }
    splice(polyline: Polyline, startIndex: number, endIndex: number) {
      const list4 = this.segments.splice(startIndex, endIndex - startIndex, ...polyline.segments);
      list4.forEach((segment: Segment) => segment.remove());
      polyline.commit(this);
    }
    unsplice(polyline: Polyline, startIndex: number, endIndex: number) {
      const removedSegments = this.segments.splice(startIndex, endIndex - startIndex);
      this.remove();
      this.segments = removedSegments.concat(polyline.reverse().segments);
      polyline.commit(this);
    }
    left(list4: Vector[], startIndex: number, endIndex: number) {
      const list5: Segment[] = [];
      for (let i2 = 0; i2 < list4.length - 1; i2++) {
        list5.push(new Segment(ensureNonNullable(list4[i2]), ensureNonNullable(list4[i2 + 1])));
      }
      const list6 = this.segments.splice(startIndex, endIndex - startIndex, ...list5);
      list5.forEach((segment: Segment) => segment.commit(this));
      list6.forEach((segment: Segment) => segment.remove());
    }
    right(list4: Vector[], startIndex: number, endIndex: number) {
      const list5: Segment[] = [];
      for (let i2 = 0; i2 < list4.length - 1; i2++) {
        list5.push(new Segment(ensureNonNullable(list4[i2]), ensureNonNullable(list4[i2 + 1])));
      }
      const removedSegments = this.segments.splice(startIndex, endIndex - startIndex);
      this.remove();
      list5.reverse().forEach((segment: Segment) => segment.reverse().commit(this));
      this.segments = removedSegments.concat(list5);
    }
    points() {
      return this.segments.map((segment: Segment) => segment.start);
    }
    intersections(_segment: Segment) {
      let list4: Intersection[] = [];
      if (this.segments.length > 1) {
        this.segments.forEach((segment: Segment) => {
          const intersection = segment.intersect(segment);
          if (intersection) {
            list4.push(intersection);
          }
        });
      }
      if (list4.length > 1) {
        list4.sort((intersectionA: Intersection, intersectionB: Intersection) => intersectionA.distance - intersectionB.distance);
        list4 = list4.filter(function (intersection: Intersection, index: number) {
          return list4.findIndex((otherIntersection: Intersection) => otherIntersection.point === intersection.point) == index;
        });
      }
      return list4;
    }
    inside(point: Vector) {
      const {
        length
      } = this.segments;
      let product = 1;
      for (let i2 = 0; i2 < length; i2++) {
        const {
          start,
          end
        } = ensureNonNullable(this.segments[i2]);
        const crossing = computeCrossing(start, end, point);
        if (crossing === 0) {
          return true;
        }
        product *= crossing;
      }
      return product !== 1;
    }
    insideNew(point: Vector) {
      return !!pointInPolygon(this.segments.map((segment: Segment) => [segment.start.x, segment.start.y]), point.x, point.y);
    }
    rawSquare() {
      let area = 0;
      this.segments.forEach((segment: Segment) => {
        const {
          start,
          end
        } = segment;
        area += (start.x + end.x) * (end.y - start.y);
      });
      return area / 2;
    }
    square() {
      let area = this.rawSquare();
      if (area < 0) {
        {
          area *= -1;
        }
      }
      return area;
    }
    calcPath() {
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
      for (let i = 1; i < length; i++) {
        const {
          start: point
        } = ensureNonNullable(segments[i]);
        path2D.lineTo(point.x, point.y);
      }
      path2D.closePath();
      this.path = path2D;
      this.updateBounds();
    }
    calcSimplify() {
      this.simplify = [];
      let i2 = 0;
      this.segments.forEach((segment: Segment) => {
        const {
          start
        } = segment;
        if (i2 < 2) {
          this.simplify.push(start);
          i2++;
        } else {
          const previousPoint = ensureNonNullable(this.simplify[i2 - 2]);
          if (start.distance2(previousPoint) < MIN_POINT_DISTANCE_SQUARED) {
            this.simplify[i2 - 1] = start;
          } else {
            this.simplify.push(start);
            i2++;
          }
        }
      });
    }
    updateBounds() {
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
        left: left,
        right: right,
        top: top,
        bottom: bottom
      };
    }
  }
  const timeSource = typeof performance !== "undefined" ? performance : Date;
  const now = timeSource.now.bind(timeSource);
  const createCirclePoints = (point: Vector, segmentCount: number, radius: number) => {
    if (typeof point.x !== "number") {
      throw Error("circle");
    }
    const fullCircleAngle = Math.PI * 2;
    const angleStep = fullCircleAngle / segmentCount;
    const list4: Vector[] = [];
    for (let angle = 0; angle < fullCircleAngle - EPSILON; angle += angleStep) {
      list4.push(new Vector(point.x + Math.cos(angle) * radius, point.y + Math.sin(angle) * radius));
    }
    return list4;
  };
  const hexToRgb = (hex: string): Rgb => {
    const red = parseInt(hex.substring(1, 3), 16);
    const green = parseInt(hex.substring(3, 5), 16);
    const blue = parseInt(hex.substring(5, 7), 16);
    return {
      r: red,
      g: green,
      b: blue
    };
  };
  const rgbToHsv = ({
    r,
    g,
    b
  }: Rgb): Hsv => {
    let normRed;
    let normGreen;
    let normBlue;
    let redHueComponent;
    let greenHueComponent;
    let blueHueComponent;
    let hue = 0;
    let saturation;
    let max;
    let delta;
    let computeHueComponent;
    let round2;
    normRed = r / 255;
    normGreen = g / 255;
    normBlue = b / 255;
    max = Math.max(normRed, normGreen, normBlue);
    delta = max - Math.min(normRed, normGreen, normBlue);
    computeHueComponent = (channelValue: number) => (max - channelValue) / 6 / delta + 1 / 2;
    round2 = (value: number) => Math.round(value * 100) / 100;
    if (delta == 0) {
      hue = saturation = 0;
    } else {
      saturation = delta / max;
      redHueComponent = computeHueComponent(normRed);
      greenHueComponent = computeHueComponent(normGreen);
      blueHueComponent = computeHueComponent(normBlue);
      if (normRed === max) {
        hue = blueHueComponent - greenHueComponent;
      } else if (normGreen === max) {
        hue = 1 / 3 + redHueComponent - blueHueComponent;
      } else if (normBlue === max) {
        hue = 2 / 3 + greenHueComponent - redHueComponent;
      }
      if (hue < 0) {
        hue += 1;
      } else if (hue > 1) {
        hue -= 1;
      }
    }
    return {
      h: Math.round(hue * 360),
      s: round2(saturation * 100),
      v: round2(max * 100)
    };
  };
  const rgbToHex = ({
    r,
    g,
    b
  }: Rgb): string => {
    const channelToHex = (channel: number) => {
      const hex = channel.toString(16);
      if (hex.length < 2) {
        return "0" + hex;
      } else {
        return hex;
      }
    };
    return "#" + channelToHex(r) + channelToHex(g) + channelToHex(b);
  };
  const hsvToRgb = ({
    h,
    s,
    v
  }: Hsv): Rgb => {
    var red;
    var green;
    var blue;
    var sector;
    var fraction;
    var p;
    var q;
    var t;
    h = Math.max(0, Math.min(360, h));
    s = Math.max(0, Math.min(100, s));
    v = Math.max(0, Math.min(100, v));
    s /= 100;
    v /= 100;
    if (s == 0) {
      red = green = blue = v;
      return {
        r: Math.round(red * 255),
        g: Math.round(green * 255),
        b: Math.round(blue * 255)
      };
    }
    h /= 60;
    sector = Math.floor(h);
    fraction = h - sector;
    p = v * (1 - s);
    q = v * (1 - s * fraction);
    t = v * (1 - s * (1 - fraction));
    switch (sector) {
      case 0:
        red = v;
        green = t;
        blue = p;
        break;
      case 1:
        red = q;
        green = v;
        blue = p;
        break;
      case 2:
        red = p;
        green = v;
        blue = t;
        break;
      case 3:
        red = p;
        green = q;
        blue = v;
        break;
      case 4:
        red = t;
        green = p;
        blue = v;
        break;
      default:
        red = v;
        green = p;
        blue = q;
    }
    return {
      r: Math.round(red * 255),
      g: Math.round(green * 255),
      b: Math.round(blue * 255)
    };
  };
  const hsvToHex = (hsv: Hsv) => rgbToHex(hsvToRgb(hsv));
  function createRandomGenerator(seed: number) {
    if (seed > 0 && seed < 1) {
      seed = Math.floor(seed * 1000000000);
    }
    let nextInt = (bound: number) => {
      seed = (seed * 69069 + 1) % 2147483648;
      return seed % bound;
    };
    let random = (max?: number) => max == null ? nextInt(1000000000) / 1000000000 : nextInt(max);
    return random;
  }
  function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve: (value: HTMLImageElement) => void) => {
      let element = document.createElement("img");
      element.src = src;
      element.onload = function () {
        resolve(element);
      };
    });
  }
  function scaleValue(hsv: Hsv, factor: number): Hsv {
    let {
      h,
      s,
      v
    } = hsv;
    v *= factor;
    return {
      h: h,
      s: s,
      v: v
    };
  }
  function brighten(hsv: Hsv, factor: number): Hsv {
    let {
      h,
      s,
      v
    } = hsv;
    const headroom = 100 - v;
    v = Math.max(v * factor, v + factor * headroom / 4);
    return {
      h: h,
      s: s,
      v: v
    };
  }
  function setValue(hsv: Hsv, value: number): Hsv {
    let {
      h,
      s,
      v
    } = hsv;
    v = value;
    return {
      h: h,
      s: s,
      v: v
    };
  }
  function formatFixed2(value: number) {
    return value.toFixed(2);
  }
  class Border {
    center: Vector;
    polygon: Polygon;
    radius: number;
    constructor(polygon: Polygon, center: Vector, radius: number) {
      if (!(polygon instanceof Polygon)) {}
      this.polygon = polygon;
      this.radius = radius;
      this.center = center;
    }
    static circular(center: Vector, segments: number, radius: number) {
      return new Border(new Polygon(createCirclePoints(center, segments, radius)), center, radius);
    }
    intersections(segment: Segment): Intersection[] {
      {
        if (segment.start.distance2(this.center) < this.radius ** 2 * 0.95 && segment.end.distance2(this.center) < this.radius ** 2 * 0.95) {
          return [];
        }
      }
      return this.polygon.intersections(segment).filter((intersection: Intersection) => !intersection.overlay);
    }
  }
  class Territory {
    isTrack = false;
    // Never populated by any observed code path; element type is not inferable from usage.
    merges: Polygon[];
    path = new Path2D();
    polygon: Polygon;
    square = 0;
    unit: Unit;
    constructor(unit: Unit, points: Vector[]) {
      this.unit = unit;
      this.merges = [];
      this.polygon = new Polygon(points);
      this.polygon.commit(this);
      this.calcSquare();
      this.polygon.calcPath();
    }
    calcPath() {
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
      for (let i = 1; i < length; i++) {
        const {
          start: point
        } = ensureNonNullable(segments[i]);
        this.path.lineTo(point.x, point.y);
      }
      this.path.closePath();
      return this.path;
    }
    calcSquare() {
      this.square = this.polygon.square();
    }
    remove() {
      this.polygon.remove();
    }
    handleIntersect(intersection: Intersection, unit: Unit, segment: Segment) {
      if (unit === this.unit) {
        this.handleSelfIntersect(intersection, unit, segment);
      } else {
        this.handleEnemyIntersect(intersection, unit, segment);
      }
    }
    handleSelfIntersect(intersection: Intersection, unit: Unit, segment: Segment) {
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
    handleEnemyIntersect(intersection: Intersection, unit: Unit, segment: Segment) {
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
  }
  class Trail {
    intersections: TrailIntersectionRecord[];
    isTrack: boolean;
    length: number;
    polyline: Polyline;
    simplyline: Vector[];
    unit: Unit;
    constructor(unit: Unit) {
      this.polyline = new Polyline(this);
      this.simplyline = [];
      this.unit = unit;
      this.length = 0;
      this.intersections = [];
      this.isTrack = true;
    }
    add(point: Vector) {
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
        if (length > 2) {
          const previousPoint = ensureNonNullable(simplyline[length - 2]);
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
    intersect(intersection: Intersection, base: ShapeOwner, enter: boolean) {
      const existingRecord = this.intersections.find((record: TrailIntersectionRecord) => record.point.equal(intersection.point));
      if (existingRecord) {
        existingRecord.intersections.push({
          intersection: intersection,
          base: base,
          enter: enter
        });
      } else {
        this.intersections.push({
          point: intersection.point,
          intersections: [{
            intersection: intersection,
            base: base,
            enter: enter
          }]
        });
      }
    }
    remove() {
      this.polyline.remove();
      this.polyline = new Polyline(this);
      this.length = 0;
      this.simplyline = [];
      this.intersections = [];
    }
    handleIntersect(intersection: Intersection, unit: Unit, _segment: Segment) {
      let game = unit.game;
      if (unit === this.unit) {
        if (intersection.overlay === true || intersection.point !== ensureNonNullable(this.polyline.segments[this.polyline.segments.length - 1]).end) {
          this.unit.position = intersection.point;
          const killReason = game.border.radius - unit.position.distance(game.space.center) < 5 ? KILL_REASON_WALL : KILL_REASON_SELF_INTERSECTION;
          game.kill(this.unit, undefined, killReason);
        }
      } else {
        game.kill(this.unit, unit, KILL_REASON_TRAIL);
      }
    }
  }
  class StateMachine {
    context: BotStateContext;
    payload: Bot;
    state: string;
    states: BotStates;
    constructor(states: BotStates, initialState: string, payload: Bot) {
      this.states = states;
      this.state = "";
      this.payload = payload;
      this.context = {};
      this.change(initialState);
    }
    change(stateName: string) {
      const currentState = this.states[this.state];
      if (currentState && currentState.leave) {
        this.context = currentState.leave(this.payload, this.context) || this.context;
      }
      const nextState = this.states[stateName];
      if (nextState) {
        this.state = stateName;
        this.context = nextState.enter && nextState.enter(this.payload, this.context) || this.context;
        this.update();
      }
    }
    update() {
      const currentState = this.states[this.state];
      const nextStateName = currentState && currentState.update(this.payload, this.context);
      if (nextStateName) {
        this.change(nextStateName);
      }
    }
  }
  const isPlayerTrailInRange = (unit: Bot) => {
    const {
      player
    } = unit.game;
    if (player) {
      const maxVrange = Math.max(unit.vrange, player.vrange);
      const aggroRange = maxVrange * unit.aggro * 0.75;
      const {
        simplyline
      } = player.track;
      for (let i2 = 0, length = simplyline.length; i2 < length; i2++) {
        if (unit.position.distance2(ensureNonNullable(simplyline[i2])) < aggroRange * aggroRange) {
          return true;
        }
      }
    }
    return;
  };
  const isBotInDanger = (unit: Bot) => {
    if (unit.in === unit.base) {
      return false;
    }
    return unit.maxDanger > unit.def * 0.8;
  };
  var botStates: BotStates = {
    idle: {
      enter: function () {
        return {};
      },
      update: function (unit, _context) {
        if (unit.in === unit.base) {
          if (unit.game.rng() < 0.25) {
            return "cut";
          } else {
            return "exit";
          }
        } else {
          return "back";
        }
      }
    },
    capital: {
      update: function (unit, context) {
        if (unit.in !== unit.base) {
          return "capture";
        }
        unit.target = context.point ?? null;
        return;
      }
    },
    cut: {
      enter: function (unit) {
        const vector = unit.position.clone().sub(unit.game.space.center);
        const segment = new Segment(unit.position, vector.normalize().mulScalar(unit.game.border.radius + 10).add(unit.game.space.center));
        const list4 = unit.base.polygon.intersections(segment);
        const context: BotStateContext = {};
        if (!list4.length) {
          console.log("bot.position", unit.position.x, unit.position.y);
          console.log("intersections", list4);
        }
        list4.sort((intersectionA, intersectionB) => intersectionA.distance - intersectionB.distance);
        const first = list4[0];
        if (first) {
          context.exitPoint = first.point;
        }
        return context;
      },
      update: function (unit, context) {
        if (unit.in !== unit.base) {
          return "capture";
        }
        const distanceToCenter = unit.position.distance(unit.game.space.center);
        const distanceToBorder = unit.game.border.radius - distanceToCenter;
        if (!context.exitPoint || distanceToBorder < 1) {
          return "idle";
        }
        unit.target = context.exitPoint;
        return;
      }
    },
    exit: {
      enter: function (unit) {
        const context: BotStateContext = {};
        let nearestDistance = Infinity;
        let bestIndex;
        const {
          length
        } = unit.base.polygon.segments;
        let unitSpeed = unit.game.config.unitSpeed;
        context.minDistance = unitSpeed;
        while (bestIndex === undefined) {
          for (let i2 = 0; i2 < 1; i2++) {
            const segmentIndex = ~~(unit.game.rng() * length);
            const start = ensureNonNullable(unit.base.polygon.segments[segmentIndex]).start;
            const distance = start.distance(unit.position);
            if (distance < nearestDistance && distance > unitSpeed) {
              nearestDistance = distance;
              bestIndex = segmentIndex;
            }
          }
          unitSpeed *= 0.75;
        }
        context.exitPoint = ensureNonNullable(unit.base.polygon.segments[bestIndex]).start;
        return context;
      },
      update: function (unit, context) {
        if (unit.in !== unit.base) {
          context = {};
          return "capture";
        }
        if (isPlayerTrailInRange(unit)) {
          return "attack";
        }
        const {
          length
        } = unit.base.polygon.segments;
        const minDistance = ensureNonNullable(context.minDistance);
        const segmentIndex = ~~(unit.game.rng() * length);
        const start = ensureNonNullable(unit.base.polygon.segments[segmentIndex]).start;
        const distance = start.distance(unit.position);
        let exitPointDistance = ensureNonNullable(context.exitPoint).distance(unit.position);
        if (distance > minDistance && distance < exitPointDistance) {
          context.exitPoint = start;
        } else {
          if (!Object.values(ensureNonNullable(context.exitPoint).segments).some((segment) => segment && segment.shape === unit.base.polygon)) {
            context.exitPoint = start;
          }
          if (unit.target && unit.target.distance(unit.game.space.center) > unit.game.border.radius - 1) {
            context.exitPoint = start;
          }
        }
        unit.target = context.exitPoint ?? null;
        return;
      }
    },
    capture: {
      update: function (unit, _context) {
        if (unit.in === unit.base) {
          return "idle";
        }
        if (isPlayerTrailInRange(unit)) {
          return "attack";
        }
        const {
          unitSpeed
        } = unit.game.config;
        const {
          center
        } = unit.game.space;
        const {
          radius
        } = unit.game.border;
        const distanceToCenter = unit.position.distance(center);
        const distanceToBorder = radius - distanceToCenter;
        if (unit.baseDistance < unitSpeed / 4 && unit.track.length > unitSpeed * 2 && distanceToBorder > 10) {
          return "back";
        }
        const stepDistance = 25;
        const halfStep = stepDistance / 2;
        const halfStepSquared = halfStep * halfStep;
        if (unit.position.distance2(ensureNonNullable(unit.target)) < halfStepSquared && distanceToBorder > stepDistance) {
          return;
        }
        let signedArea = 0;
        for (let i = 1, length = unit.track.simplyline.length; i < length; i++) {
          const point2 = ensureNonNullable(unit.track.simplyline[i - 1]);
          const point3 = ensureNonNullable(unit.track.simplyline[i]);
          signedArea += (point2.x + point3.x) * (point3.y - point2.y);
        }
        let point = ensureNonNullable(unit.track.simplyline[unit.track.simplyline.length - 1]);
        let baseNearestPoint = ensureNonNullable(unit.baseNearestPoint);
        signedArea += (point.x + baseNearestPoint.x) * (baseNearestPoint.y - point.y);
        point = ensureNonNullable(unit.baseNearestPoint);
        baseNearestPoint = ensureNonNullable(unit.track.simplyline[0]);
        signedArea += (point.x + baseNearestPoint.x) * (baseNearestPoint.y - point.y);
        const windingSign = Math.sign(signedArea);
        signedArea = Math.abs(signedArea / 2);
        unit.capSquare = signedArea;
        const {
          def,
          greed,
          safety
        } = unit;
        const circumference = Math.PI * 2 * unit.vrange * greed;
        const lengthRatio = unit.track.length / circumference;
        const areaThreshold = Math.min(unit.base.square, Math.PI * unit.vrange * unit.vrange) * greed;
        const areaRatio = unit.capSquare / areaThreshold;
        const safeDistance = unit.vrange * lerp(3, 0.7, safety);
        const startDistanceRatio = unit.position.distance(ensureNonNullable(unit.track.polyline.start)) / safeDistance;
        const minTrackDistance = unit.unitToTrackDistances.reduce((minDistance, distanceRecord) => Math.min(distanceRecord.trackDistance, minDistance), Infinity) * 0.8 * def;
        const baseDistanceRatio = unit.baseDistance / minTrackDistance;
        const maxRatio = Math.max(lengthRatio, areaRatio, startDistanceRatio, baseDistanceRatio);
        if (maxRatio > 1) {
          return "back";
        }
        const greedDistance = unit.vrange * greed;
        const approachDistance = greedDistance;
        const retreatDistance = approachDistance * 0.8;
        const toTarget = ensureNonNullable(unit.target).clone().sub(unit.position);
        let steerVector;
        if (unit.baseDistance > approachDistance || maxRatio > 0.75) {
          unit.aspect = "приближение";
          steerVector = ensureNonNullable(unit.baseNearestPointNormal).clone().mulScalar(stepDistance).rotate((Math.PI / 2 + Math.PI / 4) * windingSign);
        } else if (unit.baseDistance < retreatDistance) {
          unit.aspect = "отдаление";
          let angle = Math.PI / 4;
          const trackRatio = unit.track.length / retreatDistance;
          if (trackRatio < 1) {
            unit.aspect = "отстрел";
            angle = lerp(Math.PI / 2 * greed, 0, trackRatio);
          }
          steerVector = ensureNonNullable(unit.baseNearestPointNormal).clone().mulScalar(stepDistance).rotate((Math.PI / 2 - angle) * windingSign);
        } else {
          unit.aspect = "проход";
          steerVector = ensureNonNullable(unit.baseNearestPointNormal).clone().mulScalar(stepDistance).rotate(Math.PI / 2 * windingSign);
          unit.smoothness = 1 + (1 - Math.min(1, unit.maxDanger)) * 3;
        }
        unit.smoothness = 1 + (1 - Math.min(1, unit.maxDanger)) * 1;
        if (distanceToBorder < stepDistance * 2 && distanceToBorder > stepDistance / 4 && distanceToBorder < unit.position.clone().add(steerVector).distance(center)) {
          const fromCenter = unit.position.clone().sub(center);
          const targetAngle = fromCenter.angle(toTarget);
          const targetAngleSign = Math.sign(targetAngle);
          let steerAngle = fromCenter.angle(steerVector);
          let steerAngleSign = Math.sign(steerAngle);
          if (targetAngleSign !== steerAngleSign) {
            steerAngle *= -1;
            steerAngleSign *= -1;
            steerVector.rotate(steerAngle * 2);
          }
          const steerAngleAbs = Math.abs(steerAngle);
          if (steerAngleAbs < Math.PI / 4) {
            steerVector.rotate((Math.PI / 4 - steerAngleAbs) * steerAngleSign);
          }
        }
        unit.target = unit.position.clone().add(steerVector);
        if (unit.target.distance(center) > radius + stepDistance * 0.75) {
          const fromCenter2 = unit.position.clone().sub(center);
          const targetAngle2 = fromCenter2.angle(toTarget);
          const centerDistance = distanceToCenter;
          const chordProjection = (radius * radius - stepDistance * stepDistance + centerDistance * centerDistance) / (centerDistance * 2);
          const chordHalfLength = Math.sqrt(radius * radius - chordProjection * chordProjection);
          const centerDirection = unit.position.clone().sub(center).normalize();
          const projectionPoint = center.clone().add(centerDirection.clone().mulScalar(chordProjection));
          steerVector = centerDirection.clone().rotate(Math.PI / 2 * targetAngle2).rotate(Math.PI / 8 * -targetAngle2).mulScalar(chordHalfLength);
          unit.target = projectionPoint.clone().add(steerVector);
        } else if (unit.target.distance(center) > radius && unit.target.distance(center) < radius + stepDistance * 0.5) {}
        return;
      }
    },
    back: {
      enter: function (_unit, _context) {},
      update: function (unit, _context) {
        if (unit.in === unit.base) {
          return "idle";
        }
        unit.smoothness = lerp(1, Math.max(1, Math.max(1, Math.min(unit.def, unit.greed) * 4)), Math.max(1, unit.maxDanger));
        const distanceToBorder = unit.game.border.radius - unit.position.distance(unit.game.space.center);
        if (distanceToBorder < 20) {
          unit.smoothness = 1;
        }
        unit.target = unit.baseNearestPoint;
        return;
      }
    },
    attack: {
      enter: () => ({}),
      update: function (unit, _context) {
        const {
          player
        } = unit.game;
        if (!player || player.death) {
          return "idle";
        }
        const {
          simplyline
        } = player.track;
        if (!simplyline.length) {
          return "idle";
        }
        if (player.track.length < unit.game.config.botAttackTrackLength && isBotInDanger(unit)) {
          return "idle";
        }
        let nearestIndex = 0;
        let nearestDistance = Infinity;
        simplyline.forEach((point, index) => {
          const distanceSquared = unit.position.distance2(point);
          if (distanceSquared < nearestDistance) {
            nearestDistance = distanceSquared;
            nearestIndex = index;
          }
        });
        unit.target = simplyline[nearestIndex] ?? null;
        return;
      }
    }
  };
  const createParticleSquarePath = () => {
    const path2D = new Path2D();
    const halfSize = 1;
    path2D.moveTo(-halfSize, -halfSize);
    path2D.lineTo(halfSize, -halfSize);
    path2D.lineTo(halfSize, halfSize);
    path2D.lineTo(-halfSize, halfSize);
    path2D.closePath();
    return path2D;
  };
  const particleSquarePath = createParticleSquarePath();
  class Particle {
    // `velocity`/`acceleration` are normally Vectors, but the score-collection path in
    // spawnScoreParticles reassigns them to scalar speeds on already-expiring particles (time===1),
    // so the field type is a union and the vector math below is typeof-guarded.
    acceleration: Vector | number | null;
    color: ParticleColor;
    fn: ((particle: Particle) => void) | null;
    position: Vector;
    rotate: number;
    rotation: number;
    scale: number;
    target: Unit | null;
    time: number;
    velocity: Vector | number;
    vscale: number;
    constructor(target: Unit | null, color: ParticleColor, position: Vector, velocity: Vector | number, acceleration: Vector | number | null, rotate: number, scale: number, vscale: number, time: number, callback?: (particle: Particle) => void) {
      this.target = target;
      this.color = color;
      this.position = position;
      this.velocity = velocity;
      this.acceleration = acceleration;
      this.rotate = rotate;
      this.scale = scale;
      this.vscale = vscale;
      this.rotation = Math.random() * Math.PI * 2;
      this.time = time;
      this.fn = callback || null;
    }
    update(deltaTimeMilliseconds: number) {
      const deltaTimeSeconds = deltaTimeMilliseconds / 1000;
      this.time -= deltaTimeMilliseconds;
      if (this.time <= 0) {
        if (this.fn) {
          this.fn(this);
        }
        return;
      }
      if (typeof this.velocity !== "number") {
        this.position.x += this.velocity.x * deltaTimeSeconds;
        this.position.y += this.velocity.y * deltaTimeSeconds;
        if (this.acceleration && typeof this.acceleration !== "number") {
          this.velocity.x += this.acceleration.x * deltaTimeSeconds;
          this.velocity.y += this.acceleration.y * deltaTimeSeconds;
        }
      }
      this.rotation += this.rotate * deltaTimeSeconds;
      this.scale += this.vscale * deltaTimeSeconds;
    }
    draw(context: CanvasRenderingContext2D) {
      const {
        x,
        y
      } = this.position;
      const {
        rotation,
        color,
        scale
      } = this;
      let savedTransform = context.getTransform();
      context.translate(x, y);
      context.rotate(rotation);
      context.scale(scale, scale);
      if (typeof color === "string") {
        if (context.fillStyle !== color) {
          context.fillStyle = color;
        }
        context.fill(particleSquarePath);
      } else {
        context.scale(1 / 20, 1 / 20);
        context.drawImage(color, -color.width / 2, -color.height / 2);
      }
      context.setTransform(savedTransform);
    }
    static nom(unit: Unit, segment: Segment, scale: number) {
      const randomSign = Math.sign(Math.random() - 0.5);
      const scaledMaxScale = unit.skin.container.maxScale * scale;
      const {
        unitSpeed,
        baseHeight
      } = unit.game.config;
      const velocity = ensureNonNullable(segment.vector).clone().normalize().rotate(randomSign * Math.random() * (Math.PI / 30)).mulScalar(unitSpeed * (1 + Math.random()));
      const perpendicularOffset = ensureNonNullable(segment.vector).clone().rotate(Math.PI / 2).normalize().mulScalar(randomSign * Math.random() * scaledMaxScale / 2);
      const forwardOffset = ensureNonNullable(segment.vector).clone().normalize().mulScalar(scaledMaxScale / 2);
      const acceleration = ensureNonNullable(segment.vector).clone().normalize().mulScalar(unitSpeed * -6).rotate(randomSign * Math.random() * (Math.PI / 10));
      const {
        particles
      } = ensureNonNullable(unit.in).unit.skin.colors;
      const scale2 = 0.75 + Math.random() * 0.5;
      const particle = new Particle(null, ensureNonNullable(particles[~~(Math.random() * particles.length)]), segment.start.clone().add(perpendicularOffset).add(forwardOffset).add(new Vector(0, -baseHeight)), velocity, acceleration, Math.PI + Math.random() * Math.PI, scale2, scale2 * -2, 300);
      return particle;
    }
  }
  function spawnScoreParticles(unit: Unit, scoreCollector: Unit | null, list4: Segment[], shouldTransferScore?: boolean) {
    let game = unit.game;
    if (game.visible) {
      const totalScores = ensureNonNullable(unit.schemes).scores();
      let i2 = 0;
      let accumulatedDistance = 0;
      let scorePerParticle = 0;
      list4.forEach((segment: Segment) => {
        accumulatedDistance += ensureNonNullable(segment.vector).magnitude();
        if (accumulatedDistance > 5) {
          accumulatedDistance = 0;
          const velocity = ensureNonNullable(segment.vector).clone().normalize().rotate(Math.sign(Math.random() - 0.5) * Math.PI / 2).mulScalar(25 + Math.random() * 100);
          if (Math.random() > 0.25) {
            velocity.mulScalar(0.1);
          }
          const rotationSpeed = (shouldTransferScore ? 3 : 1) * (1 + Math.random() * 0.5);
          const time = 500 + Math.random() * 500;
          const vscale = -rotationSpeed * 0.7 * (1000 / time);
          const particle = new Particle(null, ensureNonNullable(unit.skin.colors.particles[~~(Math.random() * unit.skin.colors.particles.length)]), segment.start.clone(), velocity, null, Math.PI * 2 * (1 + Math.random()) * Math.sign(Math.random() - 0.5 || 1), rotationSpeed, vscale, time, (particle2: Particle) => {
            if (scoreCollector) {
              particle2.target = scoreCollector;
              particle2.time = 1;
              particle2.velocity = (typeof particle2.velocity === "number" ? particle2.velocity : particle2.velocity.magnitude());
              particle2.acceleration = (1.5 + Math.random() * 0.5) * game.config.unitSpeed;
              particle2.fn = () => {
                if (shouldTransferScore) {
                  ensureNonNullable(scoreCollector.schemes).getScheme().accumulator += scorePerParticle;
                }
              };
              particle2.vscale = 0;
              particle2.scale = 1;
            }
          });
          game.particles.push(particle);
          i2++;
        }
      });
      scorePerParticle = totalScores / i2;
    }
  }
  type SchemeConstructor = new (unit: Unit) => ScoreLabel;
  interface ComebackInfo {
    increment: number;
    rise: Polygon;
    victims: { base: Territory; poly: Polygon }[];
    game: Game;
  }
  interface AchievementChecker {
    progress: number;
    update(unit: Unit, dt: number, game: Game): void;
    check(unit: Unit, dt: number, game: Game): boolean;
    onKill(unit: Unit): void;
    onOut(): void;
  }
  interface AchievementConfig {
    name: string;
    modes: string[];
    getChecker: () => AchievementChecker;
    description: string;
    url: string;
    onEarned?: (game: Game, achievement: Achievement) => void;
  }
  interface StoredAchievement {
    name: string;
    best: number;
    earned: boolean;
  }
  interface StoredProfile {
    achievements?: StoredAchievement[];
  }
  class SchemeCycler {
    Schemes: SchemeConstructor[];
    current: number;
    constructor(...schemeConstructors: SchemeConstructor[]) {
      this.Schemes = schemeConstructors;
      this.current = 0;
    }
    getSchemes(unit: Unit): Scoreboard {
      return new Scoreboard(this.Schemes.map((SchemeClass: SchemeConstructor) => new SchemeClass(unit)), this);
    }
    next(): void {
      this.current++;
      if (this.current === this.Schemes.length) {
        this.current = 0;
      }
    }
  }
  class Scoreboard {
    manager: SchemeCycler;
    schemes: ScoreLabel[];
    constructor(schemes: ScoreLabel[], manager: SchemeCycler) {
      this.schemes = schemes;
      this.manager = manager;
    }
    getScheme(name?: string): ScoreLabel {
      if (name) {
        return ensureNonNullable(this.schemes.find((scheme: ScoreLabel) => scheme.name === name));
      } else {
        return ensureNonNullable(this.schemes[this.manager.current]);
      }
    }
    scores(): number {
      return ensureNonNullable(this.schemes[this.manager.current]).scores();
    }
    result(): number {
      return ensureNonNullable(this.schemes[this.manager.current]).result();
    }
    print(score?: number): string {
      return ensureNonNullable(this.schemes[this.manager.current]).print(score);
    }
    update(dt?: number): void {
      this.schemes.forEach((scheme: ScoreLabel, index: number) => scheme.update(dt, this.manager.current !== index));
    }
    kill(killer?: Unit, cause?: number): void {
      this.schemes.forEach((scheme: ScoreLabel, index: number) => scheme.kill(killer, cause, this.manager.current !== index));
    }
    out(): void {
      this.schemes.forEach((scheme: ScoreLabel, index: number) => scheme.out(this.manager.current !== index));
    }
    comeback(info?: ComebackInfo): void {
      this.schemes.forEach((scheme: ScoreLabel, index: number) => scheme.comeback(info, this.manager.current !== index));
    }
  }
  class ScoreLabel {
    accumulator = 0;
    name: string;
    unit: Unit;
    constructor(unit: Unit, name: string) {
      this.unit = unit;
      this.name = name;
    }
    getScheme(): this {
      return this;
    }
    scores(): number {
      return 0;
    }
    print(_score?: number): string {
      return formatFixed2(this.scores());
    }
    result(): number {
      return this.scores();
    }
    kill(_killer?: Unit, _cause?: number, _isNotCurrent?: boolean): void {}
    update(_dt?: number, _isNotCurrent?: boolean): void {}
    out(_isNotCurrent?: boolean): void {}
    comeback(_info?: ComebackInfo, _isNotCurrent?: boolean): void {}
  }
  class BotScoreLabel extends ScoreLabel {
    constructor(unit: Unit) {
      super(unit, "percent");
    }
    override scores(): number {
      return this.unit.percent * 100;
    }
    override result(): number {
      return +this.scores().toFixed(2);
    }
    override print(scoreOverride?: number): string {
      const score = scoreOverride || this.scores();
      return formatFixed2(score) + "%";
    }
    override kill(killer?: Unit, _cause?: number, isNotCurrent?: boolean): void {
      if (!isNotCurrent && this.unit.isPlayer) {
        this.unit.addLabel({
          text: this.unit.game.language.killText,
          color: ensureNonNullable(killer).skin.colors.main,
          unit: this.unit,
          time: 1000,
          fading: true
        });
      }
    }
    override comeback({
      increment
    }: ComebackInfo, isNotCurrent?: boolean): void {
      if (!isNotCurrent && increment * 100 >= 0.01 && this.unit.isPlayer) {
        this.unit.addLabel({
          text: "+" + (increment * 100).toFixed(2) + "%",
          color: this.unit.skin.colors.nick,
          unit: this.unit,
          time: 1000,
          fading: true
        });
      }
    }
  }
  class Quest {
    current: number;
    description: string;
    image: HTMLImageElement | null;
    ready: boolean;
    state: number;
    states: number[];
    title: string;
    constructor(title: string, description: string, imageUrl?: string) {
      this.title = title;
      this.description = description;
      this.state = 0;
      this.current = 0;
      this.states = [500, 3000, 500, 250];
      this.image = null;
      if (imageUrl) {
        this.ready = false;
        const image = new Image();
        image.onload = () => {
          this.ready = true;
          this.image = image;
        };
        image.onerror = () => {
          this.ready = true;
        };
        image.src = imageUrl;
      } else {
        this.ready = true;
      }
    }
    update(amount: number): void {
      this.current += amount;
      if (this.current > ensureNonNullable(this.states[this.state])) {
        this.state++;
        this.current = 0;
      }
    }
    position(): number {
      switch (this.state) {
        case 0:
          return easeOutCubic(this.current / ensureNonNullable(this.states[0]));
        case 1:
          return 1;
        case 2:
          return 1 - easeOutCubic(this.current / ensureNonNullable(this.states[2]));
        default:
          return 0;
      }
    }
  }
  class Achievement {
    best: number;
    checker: AchievementChecker | null;
    description: string;
    earned: boolean;
    getChecker: () => AchievementChecker;
    modes: string[];
    name: string;
    onEarned?: (game: Game, achievement: Achievement) => void;
    url: string;
    constructor(name: string, modes: string[], getChecker: () => AchievementChecker, description: string, url: string, onEarned?: (game: Game, achievement: Achievement) => void) {
      this.name = name;
      this.modes = modes;
      this.getChecker = getChecker;
      this.description = description;
      this.url = url;
      if (onEarned) {
        this.onEarned = onEarned;
      }
      this.best = 0;
      this.earned = false;
      this.checker = null;
    }
    success(game: Game): void {
      this.earned = true;
      if (window.ga) {
        window.ga("send", "event", "skins_unlock", this.name);
      }
      this.checker = null;
      if (this.onEarned) {
        this.onEarned(game, this);
      }
      game.notifications.push(new Quest("New skin unlocked!", this.description, this.url));
    }
  }
  class AchievementStore {
    achievements: Achievement[];
    storageName: string;
    constructor(achievementConfigs: AchievementConfig[], storageName: string = "paper.io.storage") {
      this.storageName = storageName;
      this.achievements = achievementConfigs.map((achievement: AchievementConfig) => new Achievement(achievement.name, achievement.modes, achievement.getChecker, achievement.description, achievement.url, achievement.onEarned));
    }
    load(): void {
      const challenges: StoredChallenges = Cookies.getJSON("paperio_challenges") || {};
      const loadChallenge = (challengeKey: string, achievementName: string) => {
        if (challenges[challengeKey]) {
          const achievement = this.achievements.find((candidate: Achievement) => candidate.name === achievementName);
          if (achievement) {
            achievement.earned = true;
          }
        }
      };
      loadChallenge("c13", "reaper");
      loadChallenge("c22", "capAmerica");
      loadChallenge("c22", "thanos");
      loadChallenge("geraldquest1", "geralt");
      const profile: StoredProfile = Cookies.getJSON(this.storageName) || {};
      if (profile.achievements) {
        profile.achievements.forEach((achievement: StoredAchievement) => {
          const achievement2 = this.achievements.find((candidate: Achievement) => candidate.name === achievement.name);
          if (achievement2) {
            achievement2.best = achievement.best || 0;
            achievement2.earned = achievement.earned || false;
          }
        });
      }
    }
    save(): void {
      const storedAchievements: StoredAchievement[] = this.achievements.map((achievement: Achievement) => ({
        name: achievement.name,
        best: achievement.best,
        earned: achievement.earned
      }));
      const profile: StoredProfile = Cookies.getJSON(this.storageName) || {};
      profile.achievements = storedAchievements;
      const cookieOptions = {
        expires: 365
      };
      Cookies.set(this.storageName, profile, cookieOptions);
      const challenges: StoredChallenges = Cookies.getJSON("paperio_challenges") || {};
      const saveChallenge = (challengeKey: string, achievementName: string) => {
        const achievement = this.achievements.find((candidate: Achievement) => candidate.name === achievementName);
        if (achievement && achievement.earned) {
          challenges[challengeKey] = true;
        }
      };
      saveChallenge("c13", "reaper");
      saveChallenge("c22", "capAmerica");
      saveChallenge("c22", "thanos");
      saveChallenge("geraldquest1", "geralt");
      saveChallenge("sanitizerquest", "sanitizer");
      saveChallenge("doctorquest", "doctor");
      saveChallenge("covidquest", "covid");
      Cookies.set("paperio_challenges", challenges, cookieOptions);
      window.paperio_challenges = challenges;
      if (window.shop) {
        window.shop.autoCheckUnlock();
      } else {
        console.log("window.shop unavaliable");
      }
    }
  }
  class AchievementTracker {
    achievements: Achievement[] = [];
    profile: AchievementStore | null;
    constructor(profile: AchievementStore | null, mode: string) {
      this.profile = profile;
      if (!this.profile) {
        return;
      }
      this.achievements = ensureNonNullable(profile).achievements.filter((achievement: Achievement) => {
        const shouldTrack = !achievement.earned && achievement.modes.some((candidateMode: string) => candidateMode === mode);
        if (shouldTrack) {
          achievement.checker = achievement.getChecker();
        }
        return shouldTrack;
      });
    }
    update(unit: Unit, value: number, game: Game): void {
      this.achievements = this.achievements.filter((achievement: Achievement) => {
        ensureNonNullable(achievement.checker).update(unit, value, game);
        if (ensureNonNullable(achievement.checker).progress > achievement.best) {
          achievement.best = ensureNonNullable(achievement.checker).progress;
        }
        if (ensureNonNullable(achievement.checker).check(unit, value, game)) {
          achievement.success(game);
          ensureNonNullable(this.profile).save();
          return false;
        }
        return true;
      });
    }
    finish(): void {
      this.achievements = [];
      ensureNonNullable(this.profile).save();
    }
    onKill(unit: Unit): void {
      this.achievements.forEach((achievement: Achievement) => {
        ensureNonNullable(achievement.checker).onKill(unit);
      });
    }
    onOut(): void {
      this.achievements.forEach((achievement: Achievement) => {
        ensureNonNullable(achievement.checker).onOut();
      });
    }
  }
  class City {
    capital: boolean;
    country: string;
    labels: Label[];
    name: string;
    position: Vector;
    scores: number;
    skin: Skin | null;
    unit: Unit | null;
    constructor(name: string, isCapital: boolean, position: Vector, unit: Unit | null) {
      this.name = name;
      this.capital = isCapital;
      this.position = position;
      this.unit = unit;
      this.labels = [];
      this.country = ensureNonNullable(ensureNonNullable(unit).skin.assets.find((asset: Asset) => asset.pool.name === "flags")).name;
      this.scores = 0;
      this.skin = null;
    }
    add(amount: number) {
      const name = ensureNonNullable(ensureNonNullable(this.unit).skin.assets.find((asset: Asset) => asset.pool.name === "flags")).name;
      let scoreGain = 0;
      if (name === this.country) {
        scoreGain = amount * (this.capital ? 1 : 0.5);
      } else {
        scoreGain = amount * 0.1;
      }
      this.scores += scoreGain;
      return scoreGain;
    }
  }
  class Unit {
    achievements: AchievementTracker | null;
    base: Territory;
    baseDistance: number;
    baseNearestPoint: Vector | null;
    baseNearestPointNormal: Vector | null;
    baseNearestPointTangent: Vector | null;
    bestPercent: number;
    bornTime: number;
    cities: City[];
    death: boolean;
    direction: number;
    fsm: StateMachine | null;
    game: Game;
    in: Territory | null;
    jitter: number;
    killer: Unit | null;
    labels: Label[];
    lastSquare: number;
    log: Vector[];
    name: string;
    percent: number;
    position: Vector;
    respawn: boolean;
    scale: number;
    schemes: Scoreboard | null;
    scores: UnitScores;
    private _skin: Skin | null = null;
    smoothness: number;
    statistics: UnitStatistics;
    target: Vector | null;
    top: number;
    track: Trail;
    type: number;
    vrange: number;
    constructor(game: Game, name: string, position: Vector, basePoints: Vector[], _unused?: undefined, schemeCycler?: SchemeCycler) {
      this.killer = null;
      this.achievements = null;
      this.death = false;
      this.jitter = 0;
      this.smoothness = 0;
      this.type = 0;
      this.fsm = null;
      this.game = game;
      this.name = name;
      this.position = position;
      this.base = new Territory(this, basePoints);
      this.track = new Trail(this);
      this.lastSquare = this.base.square;
      this.in = this.base;
      this.target = null;
      this.respawn = false;
      this.statistics = {
        kills: 0
      };
      this.log = [];
      this.bornTime = now();
      this.cities = [];
      this.labels = [];
      this.percent = 0;
      this.bestPercent = 0;
      this.scale = 0;
      this.vrange = 1;
      this.direction = 0;
      this.top = 0;
      this.scores = {
        accumulator: 0,
        kills: 0
      };
      this.schemes = (schemeCycler && schemeCycler.getSchemes(this)) ?? null;
      this.baseDistance = 0;
      this.baseNearestPoint = null;
      this.baseNearestPointTangent = null;
      this.baseNearestPointNormal = null;
    }
    get isPlayer() {
      return false;
    }
    get skin(): Skin {
      return ensureNonNullable(this._skin);
    }
    set skin(value: Skin) {
      this._skin = value;
    }
    setSkin(skin: Skin) {
      this.skin = skin;
      skin.user = this;
    }
    onScoreChanged() {
      if (this.game.units.indexOf(this) <= 5 || this.isPlayer) {
        this.game.topListChanged = true;
      }
    }
    update(deltaTime: number) {
      this.log.push(this.position);
      if (this.in !== this.base) {
        this.scores.accumulator += this.percent * 100 * deltaTime / 1000;
      }
      let nearestDistanceSquared = 0;
      let nearestPoint = null;
      let tangent = null;
      if (this.in !== this.base) {
        nearestDistanceSquared = Infinity;
        let nearestIndex = 0;
        const {
          simplify
        } = this.base.polygon;
        simplify.forEach((point: Vector, index: number) => {
          const distanceSquared = point.distance2(this.position);
          if (distanceSquared < nearestDistanceSquared) {
            nearestDistanceSquared = distanceSquared;
            nearestPoint = point;
            nearestIndex = index;
          }
        });
        const previousPoint = simplify[nearestIndex > 0 ? nearestIndex - 1 : simplify.length - 1];
        const nextPoint = simplify[nearestIndex < simplify.length - 1 ? nearestIndex + 1 : 0];
        tangent = ensureNonNullable(nextPoint).clone().sub(ensureNonNullable(previousPoint)).normalize();
      }
      nearestDistanceSquared = Math.sqrt(nearestDistanceSquared);
      this.baseDistance = nearestDistanceSquared;
      this.baseNearestPoint = nearestPoint;
      this.baseNearestPointTangent = tangent;
      this.baseNearestPointNormal = tangent && tangent.clone().rotate(-Math.PI / 2);
    }
    movement() {
      return this.target && this.target.clone().sub(this.position).normalize();
    }
    addLabel(label: Label) {
      if (!label.unit) {
        label.unit = this;
      }
      this.labels.push(label);
    }
  }
  class Player extends Unit {
    moveTo?: boolean;
    win: boolean;
    override get isPlayer() {
      return true;
    }
    constructor(game: Game, name: string, position: Vector, basePoints: Vector[], _unused?: undefined, schemeCycler?: SchemeCycler) {
      super(game, name, position, basePoints, _unused, schemeCycler);
      this.win = false;
    }
    override update(deltaMilliseconds: number) {
      super.update(deltaMilliseconds);
      if (!this.respawn) {
        this.target = new Vector(1, 0).rotate(this.game.angle * Math.PI / 127).mulScalar(50).add(this.position);
      }
    }
  }
  class Bot extends Unit {
    aggro: number;
    aspect?: string;
    capSquare = 0;
    def: number;
    distanceDanger = 0;
    greed: number;
    maxDanger: number;
    safety: number;
    // Assigned an empty array in the constructor and never populated by any observed code path.
    targets: Unit[];
    unitDanger: Unit | null;
    unitToTrackDistances: UnitTrackDistance[] = [];
    constructor(game: Game, type: number, name: string, position: Vector, basePoints: Vector[], _unused?: undefined, schemeCycler?: SchemeCycler) {
      super(game, name, position, basePoints, _unused, schemeCycler);
      this.aggro = 0;
      this.greed = 0;
      this.safety = 0;
      this.def = 0;
      this.type = type;
      this.jitter = (this.game.rng() * 2 - 1) * 0.1;
      this.targets = [];
      this.smoothness = 1;
      this.maxDanger = 0;
      this.unitDanger = null;
      this.fsm = new StateMachine(botStates, "idle", this);
    }
    override update(deltaMilliseconds: number) {
      super.update(deltaMilliseconds);
      this.unitToTrackDistances = [];
      let maxDanger = 0;
      let dangerDistance = 0;
      let dangerUnit: Unit | null = null;
      if (this.in !== this.base) {
        const {
          player
        } = this.game;
        this.game.units.forEach((otherUnit: Unit) => {
          const isPlayerOutOfRange = player === otherUnit && this.position.distance(otherUnit.position) > this.vrange;
          if (otherUnit !== this && !isPlayerOutOfRange) {
            let nearestTrackDistance = Infinity;
            let nearestTrackPoint: Vector | null = null;
            this.track.simplyline.forEach((trackPoint: Vector) => {
              const distanceSquared = trackPoint.distance2(otherUnit.position);
              if (distanceSquared < nearestTrackDistance) {
                nearestTrackDistance = distanceSquared;
                nearestTrackPoint = trackPoint;
              }
            });
            nearestTrackDistance = Math.sqrt(nearestTrackDistance);
            const danger = this.baseDistance / nearestTrackDistance;
            this.unitToTrackDistances.push({
              unit: otherUnit,
              trackDistance: nearestTrackDistance,
              trackPoint: nearestTrackPoint,
              danger: danger
            });
            if (danger > maxDanger) {
              dangerUnit = otherUnit;
              dangerDistance = nearestTrackDistance;
              maxDanger = danger;
            }
          }
        });
      }
      this.unitDanger = dangerUnit;
      this.distanceDanger = dangerDistance;
      this.maxDanger = maxDanger;
      this.smoothness = 1;
      ensureNonNullable(this.fsm).update();
    }
  }
  class TextParticle {
    acceleration: Vector;
    color: string;
    duration: number;
    fading: boolean;
    position: Vector;
    text: string;
    time: number;
    unit: Unit | null;
    velocity: Vector;
    constructor(text: string, color: string, unit: Unit | null, position: Vector = new Vector(0, 0), velocity: Vector = new Vector(0, -50), durationMilliseconds: number = 2000, isFading: boolean = true) {
      this.text = text;
      this.color = color || "#000000";
      this.unit = unit;
      this.position = position;
      this.velocity = velocity;
      this.acceleration = velocity.clone().mulScalar(-2000 / durationMilliseconds);
      this.duration = durationMilliseconds;
      this.time = durationMilliseconds;
      this.fading = isFading;
    }
    update(deltaMilliseconds: number) {
      this.time -= deltaMilliseconds;
      if (this.time > 0) {
        this.velocity.add(this.acceleration.clone().mulScalar(deltaMilliseconds / 1000));
        this.position.add(this.velocity.clone().mulScalar(deltaMilliseconds / 1000));
      }
    }
    draw(context: CanvasRenderingContext2D, fontFamily: string, positionScale: number, fontScale: number) {
      const easeOut = (t: number) => 1 + --t * t * t * t * t;
      let alphaHex = Math.floor(easeOut(this.time / this.duration) * 255).toString(16);
      if (alphaHex.length < 2) {
        alphaHex = "0" + alphaHex;
      }
      const point = this.unit ? this.unit.position.clone().add(this.position) : this.position;
      const {
        devicePixelRatio
      } = window;
      const fontSize = fontScale * 30 / devicePixelRatio;
      context.save();
      context.fillStyle = "" + this.color + (this.fading ? alphaHex : "");
      context.font = "bold " + fontSize + "px " + fontFamily;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(this.text, point.x * positionScale, point.y * positionScale);
      context.restore();
    }
  }
  var fromCharCode = String.fromCharCode;
  class NamePool {
    pool: string[];
    rng: (seed?: number) => number;
    constructor(pool: string[], seed: number) {
      this.pool = pool;
      this.rng = createRandomGenerator(seed);
    }
    get() {
      let randomValue = this.rng();
      let name = this.pool[~~(randomValue * this.pool.length)];
      return name;
    }
    aviable() {
      return true;
    }
    request() {}
    release(names: string[]) {
      this.pool.push(...names);
    }
  }
  var objectAssign = Object.assign;
  const ENCODED_EXPECTED_HOST: [number, number[], number[]] = [46, [0, 51, 4, 4, 6, 1, 2, 1, 1], [5, 1, 5, 2, 6, 3, 4, 0, 7, 3, 8, 2]];
  const ENCODED_REDIRECT_HOST: [number, number[], number[]] = [45, [0, 1, 51, 2, 2, 4, 4, 2, 1, 2], [8, 2, 8, 4, 9, 0, 5, 7, 1, 3, 7, 6]];
  {
    const decodeString = (encoded: [number, number[], number[]]) => fromCharCode.apply(null, encoded[2].map((charIndex: number) => encoded[1].reduce((sum: number, delta: number, index: number) => {
      if (index <= charIndex) {
        return sum + delta;
      }
      return sum;
    }, encoded[0])));
    const expectedHost = decodeString(ENCODED_EXPECTED_HOST);
    const redirectHost = decodeString(ENCODED_REDIRECT_HOST);
    const list4: number[] = [0, 11, 3, 2, 34, 1, 1, 2, 3, 1, 3, 2, 1, 1, 2, 1, 1];
    const decodePropertyName = (charIndices: number[]) => fromCharCode.apply(null, charIndices.map((charIndex: number) => list4.reduce((sum: number, delta: number, index: number) => {
      if (index <= charIndex) {
        return sum + delta;
      }
      return sum;
    }, 47)));
    // These decode to the property names "host", "replace" and "location" respectively; the
    // original reflects them off `window` at runtime as a domain-lock. Typed against the real
    // Location members via literal-key assertions (the decoded strings are known constants).
    const hostKey = decodePropertyName([8, 12, 15, 16]);
    const replaceKey = decodePropertyName([14, 7, 13, 10, 4, 6, 7]);
    const redirectUrlPrefix = decodePropertyName([8, 16, 16, 13, 1, 0, 0]);
    const redirectUrlSeparator = decodePropertyName([0, 3, 5, 6, 2]);
    const locationKey = decodePropertyName([10, 12, 6, 4, 16, 9, 12, 11]);
    const currentHost = window[locationKey as "location"][hostKey as "host"];
    if (currentHost !== expectedHost) {
      setTimeout(() => {
        window[locationKey as "location"][replaceKey as "replace"](redirectUrlPrefix + redirectHost + redirectUrlSeparator + currentHost);
      }, (Math.PI + Math.random()) * 60000);
    } else {
      {
        Player.prototype.moveTo = true;
      }
    }
  }
  const TURN_SPEED_RADIANS_PER_SECOND = Math.PI * 2;
  const baseCos = Math.cos(0);
  const baseSin = Math.sin(0);
  const MAX_METRICS_SAMPLES = 240;
  const angleToVector = (angle: number) => {
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    const x = baseCos * cosAngle - baseSin * sinAngle;
    const y = baseCos * sinAngle + baseSin * cosAngle;
    return Vector.alloc(x, y);
  };
  interface Config {
    arenaSize: number; quadSize: number; borderPoints: number; prepareMult: number;
    prepareBatchCount: number; maxPreparingTime: number; baseRadius: number; baseCount: number;
    minScale: number; maxScale: number; observerScale: number; trackWidth: number; unitSpeed: number;
    spawnTimeout: number; prepareCounter: number; prepareAcceleration: number; baseHeight: number;
    botsCount: number; botLevel: number; startBotLevel: number; noPlayerBotLevel: number;
    nearPlayerBotSpawnCount: number; followKiller: boolean; selfKillDelay: number; enemyKillDelay: number;
    arenaColor: string; borderColor: string; backgroundTopColor: string; backgroundBottomColor: string;
    platesStrokeWidth: number; botAggroMin: number; botAggroMax: number; botDefMin: number; botDefMax: number;
    botGreedMin: number; botGreedMax: number; botSafetyMin: number; botSafetyMax: number;
    botAttackTrackLength: number; font: string;
  }
  // Declaration merge: SkinManager (defined later in the file, still `any`-typed by another
  // worker) is only missing these two members as far as `Game` is concerned. Merging adds them
  // without touching that class's body.
  interface SkinManager {
    getPlayerSkin(name?: string): Skin;
    isFlagSkinManager?: boolean;
    shieldSkinAssets?: { get(name: string): Asset };
  }
  interface CitiesManager {
    get(countryCode: string): string;
  }
  interface LeaderboardCountryEntry {
    country: string;
  }
  interface Leaderboard {
    countries: LeaderboardCountryEntry[];
  }
  interface Recorder {
    duration(): number;
    write(): void;
  }
  interface Replayer {
    start: number;
    skip?: boolean;
    currentlyPlaying(): number;
    duration(): number;
    read(): boolean;
    skipping(): boolean;
  }
  interface Metric {
    updateTime: number;
    renderTime: number;
    frameTime: number;
    events: { returns: number; kills: number };
  }
  interface GameOverResult {
    build: number;
    game: Game;
    percent: number;
    score: number;
    newBest: boolean;
    name: string;
    top: number;
    best: number | null;
    bestPercent: number;
    time: number;
    kills: number;
    image: string | undefined;
    reason: number;
  }
  interface Bounds {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }
  interface RenderContext {
    game: Game;
    view: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D | null;
    viewWidth: number;
    viewHeight: number;
    devicePixelRatio: number;
    scaler: number;
    scale: number;
    origin: Vector;
    pointInView: (point: Vector, margin?: number) => boolean;
    boundsInView: (shape: { bounds: Bounds }, margin?: number) => boolean;
    calcMult: (a: number, b: number) => number;
    viewScreenWidth: number;
    viewScreenHeight: number;
    fontSize: number;
    strokeWidth: number;
    backHeight: number;
    uiFont: string;
    padding: number;
    barHeight: number;
    halfBarHeight: number;
    barWidth: number;
    halfBarWidth: number;
  }
  interface Intersection {
    point: Vector;
    segment: Segment;
    distance: number;
    overlay: boolean;
    zn: number;
  }
  interface IntersectionGroup {
    point: Vector;
    intersections: Intersection[];
  }
  interface ShapeOwnerIntersection {
    owner: ShapeOwner;
    point: Vector;
    segment: Segment;
    index: number;
  }
  interface ComebackMergeParams {
    owner: Territory;
    enter: Segment;
    leave: Segment;
    startPoint: Vector;
    endPoint: Vector;
    startT: number;
    endT: number;
  }
  type Shape = Polygon | Polyline;
  class Game {
    achievementsProfile: AchievementStore;
    angle = 0;
    best: number | null;
    border: Border;
    botSpawnLimited: boolean;
    bots: number[];
    build: number;
    citiesManager: CitiesManager | null;
    config: Config;
    controller: Controller;
    currMetric: Metric | null;
    cycle: number;
    debug: boolean;
    debugGraph: boolean;
    debugView: boolean;
    direction: Vector;
    events: { returns: number; kills: number };
    fakeMouse: Vector | null;
    fpsSequence: number[];
    gameOverCallback: ((result: GameOverResult) => void) | null;
    isTest: boolean;
    keyboard?: Partial<PointerState> | null;
    labels: TextParticle[];
    language: LanguageStrings;
    last: number;
    leaderboard: Leaderboard | null;
    level: number;
    looped: boolean;
    metrics: Metric[];
    mouse: Vector;
    nameManager: NamePool;
    notifications: Quest[];
    origin: Vector | null = null;
    particles: Particle[];
    player: Player | null;
    playerDeathCallback: (() => void) | null;
    qas: { [qualityKey: string]: boolean };
    quality: number;
    recording: Recorder | null;
    renderer: ((game: Game) => void) | null;
    replaying?: Replayer | null;
    rng: (n?: number) => number;
    scale: number;
    schemesManager: SchemeCycler;
    seed: number;
    skinManager: SkinManager;
    space: SpatialGrid;
    spawnSuspend: number;
    square: number;
    startTime = 0;
    stats: { fps: number; ut: number; ait: number; st: number; rt: number };
    stopped: boolean;
    tailRecovered: boolean;
    timeAccumulated: number;
    timings: { updateStartTime: number; updateEndTime: number; aiStartTime: number; aiEndTime: number; spawnStartTime: number; spawnEndTime: number; renderStartTime: number; renderEndTime: number };
    topListChanged: boolean;
    units: Unit[];
    updateParticlesId: number;
    view: HTMLCanvasElement;
    visible: boolean;
    constructor(config: Config, canvas: HTMLCanvasElement, space: SpatialGrid, border: Border, skinManager: SkinManager, gameOverCallback: ((result: GameOverResult) => void) | null, nameManager: NamePool, controller: Controller, language: LanguageStrings, schemesManager: SchemeCycler, achievementsProfile: AchievementStore, seed: number) {
      this.best = null;
      this.isTest = false;
      this.playerDeathCallback = null;
      this.tailRecovered = false;
      this.topListChanged = false;
      this.citiesManager = null;
      this.renderer = null;
      this.rng = createRandomGenerator(seed);
      this.build = 704;
      this.config = config;
      this.language = language;
      this.controller = controller;
      this.skinManager = skinManager;
      this.nameManager = nameManager;
      this.achievementsProfile = achievementsProfile;
      this.space = space;
      this.view = canvas;
      this.border = border;
      this.player = null;
      this.units = [];
      this.mouse = new Vector();
      this.direction = new Vector(1, 0);
      this.recording = null;
      this.replaying = null;
      this.cycle = 0;
      this.seed = seed;
      this.botSpawnLimited = false;
      delete this.keyboard;
      this.fakeMouse = null;
      this.labels = [];
      this.notifications = [];
      this.scale = config.maxScale;
      this.square = this.border.polygon.square();
      this.gameOverCallback = gameOverCallback;
      this.visible = false;
      this.stopped = false;
      this.debugView = false;
      this.leaderboard = null;
      this.level = 0;
      this.bots = [0, 0, 0, 0];
      this.debug = false;
      this.debugGraph = false;
      this.spawnSuspend = 0;
      this.particles = [];
      this.metrics = [];
      this.currMetric = null;
      this.schemesManager = schemesManager;
      this.last = 0;
      this.timeAccumulated = 0;
      this.looped = false;
      this.border.polygon.calcPath();
      this.quality = 1;
      this.fpsSequence = [];
      this.qas = {
        q9: true,
        q8: true,
        q7: true,
        q6: true,
        q5: true
      };
      if (canvas) {
        const onResize = () => {};
        window.addEventListener("resize", onResize, false);
      }
      this.stats = {
        fps: 0,
        ut: 0,
        ait: 0,
        st: 0,
        rt: 0
      };
      this.timings = {
        updateStartTime: 0,
        updateEndTime: 0,
        aiStartTime: 0,
        aiEndTime: 0,
        spawnStartTime: 0,
        spawnEndTime: 0,
        renderStartTime: 0,
        renderEndTime: 0
      };
      this.events = {
        returns: 0,
        kills: 0
      };
      this.updateParticlesId = setInterval(() => {
        this.particles = this.particles.filter((particle: Particle) => particle.time > 0);
      }, 500);
    }
    stop(): void {
      this.stopped = true;
      clearInterval(this.updateParticlesId);
      for (let unit of this.units) {
        this.skinManager.release(unit.skin);
      }
    }
    addPlayer(player: Player) {
      this.quality = 1;
      this.fpsSequence = [];
      if (this.achievementsProfile) {
        player.achievements = new AchievementTracker(this.achievementsProfile, "classic");
      }
      this.addUnit(player);
      this.player = player;
      {
        setTimeout(() => {
          const element = document.createElement("img");
          element.src = "https://gameads.io/adspixel.png";
        }, (2 + Math.random()) * 60000);
      }
      this.debug = player.name === "dratest";
    }
    addUnit(unit: Unit) {
      this.units.push(unit);
    }
    getSpawnPosition(spawnMode?: "player" | "bounds" | "center" | "random", unitRadius?: number): Vector | undefined {
      const {
        center
      } = this.space;
      const {
        radius
      } = this.border;
      const {
        baseRadius
      } = this.config;
      let center2 = center;
      if (spawnMode === "player" && !this.player) {
        return;
      }
      unitRadius = unitRadius || baseRadius;
      const spacingMultiplier = this.player ? lerp(3, 1, this.player.percent) : 2;
      var minDistance = unitRadius + baseRadius * 2;
      var minDistanceSquared = minDistance * minDistance;
      var trailDistance = unitRadius + baseRadius * 2 * spacingMultiplier;
      var trailDistanceSquared = trailDistance * trailDistance;
      let spawnDistance;
      switch (spawnMode) {
        case "player":
          spawnDistance = lerp(baseRadius * 12, baseRadius * 16, Math.random());
          center2 = ensureNonNullable(this.player).position;
          break;
        case "bounds":
          spawnDistance = lerp(Math.max(0, radius - (unitRadius + baseRadius * 10)), Math.max(0, radius - (unitRadius + baseRadius * 4)), Math.random());
          break;
        case "center":
          spawnDistance = lerp(0, radius / 3, Math.random());
          break;
        default:
          spawnDistance = lerp(0, Math.max(0, radius - (unitRadius + baseRadius)), Math.random());
          break;
      }
      var offset = Vector.alloc(0, spawnDistance).rotate(Math.random() * Math.PI * 2);
      var vector = center2.clone().add(offset);
      offset.release();
      if (vector.distance(center) > radius - (unitRadius + baseRadius)) {
        return;
      }
      for (var i2 = 0; i2 < this.units.length; i2++) {
        var unit = ensureNonNullable(this.units[i2]);
        if (unit.base.polygon.inside(vector)) {
          return;
        }
        if (unit.base.polygon.simplify.some(function (vertex: Vector) {
          return vector.distance2(vertex) < minDistanceSquared;
        })) {
          return;
        }
        if (unit.track.simplyline.some(function (trailPoint: Vector) {
          return vector.distance2(trailPoint) < trailDistanceSquared;
        })) {
          return;
        }
      }
      return vector;
    }
    spawnBot(spawnMode?: "player" | "bounds" | "center" | "random"): void {
      const {
        baseCount,
        baseRadius,
        spawnTimeout,
        botsCount
      } = this.config;
      if (this.botSpawnLimited) {
        if (this.spawnSuspend > 0) {
          return;
        }
        this.spawnSuspend = spawnTimeout * (1 + this.rng());
      }
      if (this.units.length - (this.player ? 1 : 0) >= botsCount) {
        return;
      }
      if (!this.nameManager || !this.nameManager.aviable()) {
        return;
      }
      if (!this.skinManager || !this.skinManager.available()) {
        return;
      }
      const spawnPosition = this.getSpawnPosition(spawnMode);
      if (!spawnPosition) {
        return;
      }
      const botTypeCounts: number[] = [0, 0, 0, 0];
      const list4: number[][] = [[1, 2, 2, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 2, 2, 2, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0], [1, 1, 2, 2, 2, 2, 3, 3, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 2, 2, 2, 2, 2, 3, 0, 0, 0, 0, 0, 0]];
      this.units.forEach((unit: Unit) => {
        if (unit !== this.player) {
          botTypeCounts[unit.type] = ensureNonNullable(botTypeCounts[unit.type]) + 1;
        }
      });
      this.bots = objectAssign({}, botTypeCounts);
      const typeDistribution = ensureNonNullable(list4[Math.round(this.level * (list4.length - 1))]);
      let distributionIndex = -1;
      while (ensureNonNullable(botTypeCounts[ensureNonNullable(typeDistribution[++distributionIndex])]) > 0) {
        const decrementType = ensureNonNullable(typeDistribution[distributionIndex]);
        botTypeCounts[decrementType] = ensureNonNullable(botTypeCounts[decrementType]) - 1;
      }
      const botType = ensureNonNullable(typeDistribution[distributionIndex]);
      const botName = ensureNonNullable(this.nameManager.get());
      const bot = new Bot(this, botType, botName, spawnPosition, createCirclePoints(spawnPosition, baseCount, baseRadius), undefined, this.schemesManager);
      const botSkin = this.skinManager.get();
      bot.setSkin(botSkin);
      this.addUnit(bot);
      this.bots[botType] = ensureNonNullable(this.bots[botType]) + 1;
    }
    spawnPlayer(playerName?: string, skinName?: string, areaPercent?: number): void {
      const {
        baseCount,
        baseRadius,
        maxScale,
        minScale,
        botsCount
      } = this.config;
      const killUnitToMakeRoom = () => {
        if (this.units.length) {
          this.kill(this.units[~~(this.units.length / 2)], undefined, KILL_REASON_SYSTEM);
        }
      };
      if (this.units.length && this.units.length >= botsCount) {
        killUnitToMakeRoom();
      }
      let spawnPosition: Vector | undefined;
      let i2 = 0;
      var spawnRadius = areaPercent ? Math.sqrt(this.square * areaPercent / Math.PI) : baseRadius;
      while (!spawnPosition) {
        if (i2++ > 50) {
          i2 = 0;
          killUnitToMakeRoom();
        }
        spawnPosition = this.getSpawnPosition("random", spawnRadius);
      }
      const player = new Player(this, playerName || this.language.defaultPlayerName, spawnPosition, createCirclePoints(spawnPosition, baseCount, spawnRadius), undefined, this.schemesManager);
      const playerSkin = this.skinManager.getPlayerSkin(skinName);
      player.setSkin(playerSkin);
      this.addPlayer(player);
      this.scale = maxScale - ~~(player.base.square / this.square * 20) / 20 * (maxScale - minScale);
      this.startTime = now();
    }
    gameOver(reason?: number): void {
      const player = ensureNonNullable(this.player);
      if (!player.win) {
        let minX = Infinity;
        let maxX = 0;
        let minY = Infinity;
        let maxY = 0;
        player.base.polygon.segments.forEach((segment: Segment) => {
          const {
            x,
            y
          } = segment.start;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        });
        const width = maxX - minX;
        const height = maxY - minY;
        const maxDimension = Math.max(width, height);
        const vector = new Vector(minX + width / 2, minY + height / 2);
        const canvasSize = 500;
        const scale = canvasSize * 0.95 / maxDimension;
        const sizeUnit = canvasSize / 100;
        let dataUrl: string | undefined;
        if (typeof document !== "undefined") {
          const element = document.createElement("canvas");
          element.width = canvasSize;
          element.height = canvasSize;
          const context = ensureNonNullable(element.getContext("2d"));
          context.scale(scale, scale);
          context.translate(canvasSize / 2 / scale - vector.x, canvasSize / 2 / scale - vector.y);
          context.translate(0, sizeUnit / scale);
          context.fillStyle = player.skin.colors.back;
          context.fill(player.base.polygon.path);
          context.translate(0, sizeUnit * -2 / scale);
          context.fillStyle = player.skin.pattern && player.skin.pattern.pattern || player.skin.colors.main;
          context.fill(player.base.polygon.path);
          dataUrl = element.toDataURL("image/png");
        }
        const result: GameOverResult = {
          build: this.build,
          game: this,
          percent: player.percent,
          score: ensureNonNullable(player.schemes).result(),
          newBest: ensureNonNullable(player.schemes).result() > (this.best ?? 0),
          name: player.name,
          top: player.top,
          best: this.best,
          bestPercent: player.bestPercent,
          time: now() - this.startTime,
          kills: player.statistics.kills,
          image: dataUrl,
          reason: ensureNonNullable(reason)
        };
        if (reason === KILL_REASON_WIN) {
          player.win = true;
        }
        if (player.achievements) {
          player.achievements.finish();
        }
        if (this.playerDeathCallback) {
          this.playerDeathCallback();
        }
        setTimeout(() => {
          if (reason === KILL_REASON_WIN) {
            this.kill(player, undefined, reason);
          }
          this.player = null;
          if (this.gameOverCallback) {
            this.gameOverCallback(result);
          }
        }, reason === KILL_REASON_TRAIL || reason === KILL_REASON_EXIT_POINT || reason === KILL_REASON_SURROUNDED ? this.config.enemyKillDelay : this.config.selfKillDelay);
      }
    }
    checkBaseCommits(): void {
      this.units.forEach((unit: Unit) => {
        const polygon = unit.base.polygon;
        polygon.segments.forEach((segment: Segment) => {
          const {
            start,
            end
          } = segment;
          const startSegment = start.segments.find((candidate: Segment) => candidate === segment);
          const endSegment = end.segments.find((candidate: Segment) => candidate === segment);
          if (!startSegment || !endSegment) {
            throw new Error("точки сегмента не закоммичены");
          }
        });
      });
    }
    kill(unit?: Unit, unit2?: Unit, reason?: number): void {
      assertNonNullable(unit);
      if (unit.death) {
        return;
      }
      if (this.isTest) {
        const deathReasons: string[] = ["выигрыш", "самопересечение", "убит об стену", "убит пересечением трека", "убит захватом точки выхода", "убит окружением", "удален системой", "убит откружением столицы", "убит разделением со столицей"];
        console.log(unit.name + " убит" + (unit2 ? " " + unit2.name : "") + " (" + deathReasons[ensureNonNullable(reason)] + ")");
      }
      this.events.kills++;
      unit.death = true;
      if (this.skinManager) {
        this.skinManager.release(unit.skin);
      }
      this.units.forEach((otherUnit: Unit) => {
        if (otherUnit !== unit && otherUnit.in === unit.base) {
          otherUnit.in = null;
        }
      });
      if (reason !== KILL_REASON_SYSTEM) {
        spawnScoreParticles(unit, null, unit.track.polyline.segments);
        spawnScoreParticles(unit, null, unit.base.polygon.segments);
      }
      unit.track.remove();
      unit.base.remove();
      const index = this.units.findIndex((candidate: Unit) => candidate === unit);
      this.units.splice(index, 1);
      unit.killer = unit2 ?? null;
      if (unit2) {
        unit2.scores.kills = unit.scores.kills + unit.scores.accumulator;
        if (unit2.schemes) {
          unit2.schemes.kill(unit, reason);
        }
        if (unit2 && unit2.achievements) {
          unit2.achievements.onKill(unit);
        }
        unit2.statistics.kills++;
      }
      unit.onScoreChanged();
      if (unit2) {
        unit2.onScoreChanged();
      }
      if (reason !== KILL_REASON_WIN && unit === this.player) {
        this.gameOver(reason);
      }
    }
    getMovement(deltaMilliseconds: number, unit: Unit): Segment[] {
      const {
        unitSpeed
      } = this.config;
      const list4: Segment[] = [];
      const vector: Vector | null | undefined = unit.movement();
      if (!vector) {
        return list4;
      }
      vector.mulScalar(unitSpeed * deltaMilliseconds / 1000);
      const vector2 = angleToVector(unit.direction);
      let turnAngle = Math.atan2(vector2.x * vector.y - vector.x * vector2.y, vector2.dot(vector));
      vector2.release();
      const maxTurnThisFrame = TURN_SPEED_RADIANS_PER_SECOND * deltaMilliseconds / 1000 / (unit.smoothness || 1);
      if (Math.abs(turnAngle) > maxTurnThisFrame) {
        turnAngle = maxTurnThisFrame * Math.sign(turnAngle);
      }
      unit.direction += turnAngle;
      const displacement = angleToVector(unit.direction).mulScalar(unitSpeed * deltaMilliseconds / 1000);
      let segment = new Segment(unit.position, unit.position.clone().add(displacement));
      displacement.release();
      let list5: Intersection[] = this.border.intersections(segment);
      while (list5.length) {
        let intersection: Intersection;
        const vector3 = ensureNonNullable(segment.vector);
        if (list5.length === 2) {
          const vector6 = ensureNonNullable(ensureNonNullable(list5[0]).segment.vector);
          let angle = Math.atan2(vector3.x * vector6.y - vector6.x * vector3.y, vector3.dot(vector6));
          intersection = angle > 0 ? ensureNonNullable(list5[0]) : ensureNonNullable(list5[1]);
        } else {
          intersection = ensureNonNullable(list5[0]);
        }
        const {
          segment: borderSegment,
          point: intersectionPoint
        } = intersection;
        const vector4 = ensureNonNullable(borderSegment.vector);
        let angle2 = Math.atan2(vector3.x * vector4.y - vector4.x * vector3.y, vector3.dot(vector4));
        if (angle2 < 0) {
          break;
        }
        if (!isNearlyZero(intersection.distance)) {
          const segment2 = new Segment(segment.start, intersectionPoint);
          list4.push(segment2);
        }
        segment = new Segment(intersectionPoint, segment.end);
        const vector5 = ensureNonNullable(segment.vector);
        const slideVector = Vector.clone(vector4).normalize().mulScalar(vector5.dot(vector4) / vector4.magnitude());
        segment = new Segment(intersectionPoint, intersectionPoint.clone().add(slideVector));
        slideVector.release();
        list5 = this.border.intersections(segment);
      }
      list4.push(segment);
      return list4;
    }
    readInput(deltaMilliseconds?: number): void {
      if (!this.controller) {
        return;
      }
      if (this.controller.pressed()) {
        this.keyboard = Object.assign({}, this.controller.mouse);
        const maxTurnThisFrame = TURN_SPEED_RADIANS_PER_SECOND * ensureNonNullable(deltaMilliseconds) / 1000;
        if (ensureNonNullable(this.controller.keyboardModeSwitch).mode2) {
          let horizontalInput = 0;
          if (this.controller.left) {
            horizontalInput = -1;
          }
          if (this.controller.right) {
            horizontalInput = 1;
          }
          if (horizontalInput) {
            this.direction.rotate(horizontalInput * maxTurnThisFrame);
          }
        } else {
          const vector = new Vector();
          if (this.controller.up) {
            vector.add(new Vector(0, -1));
          }
          if (this.controller.down) {
            vector.add(new Vector(0, 1));
          }
          if (this.controller.left) {
            vector.add(new Vector(-1, 0));
          }
          if (this.controller.right) {
            vector.add(new Vector(1, 0));
          }
          if (vector.magnitude()) {
            let turnAngle = Math.atan2(this.direction.x * vector.y - vector.x * this.direction.y, this.direction.x * vector.x + this.direction.y * vector.y);
            if (Math.abs(turnAngle) > maxTurnThisFrame) {
              turnAngle = Math.sign(turnAngle) * maxTurnThisFrame;
            }
            this.direction.rotate(turnAngle);
          }
        }
      } else if (this.controller.mouse) {
        if (!this.keyboard || this.keyboard.x !== this.controller.mouse.x && this.keyboard.y !== this.controller.mouse.y) {
          this.keyboard = null;
          this.direction = new Vector(this.controller.mouse.x, this.controller.mouse.y).sub(new Vector(this.view.clientWidth / 2, this.view.clientHeight / 2)).normalize();
        }
      } else if (!this.keyboard && this.controller.lastMouse) {
        this.direction = new Vector(this.controller.lastMouse.x, this.controller.lastMouse.y).sub(new Vector(this.view.clientWidth / 2, this.view.clientHeight / 2)).normalize();
      }
    }
    prepareAndUpdate(deltaMilliseconds?: number): void {
      if (this.preparing()) {
        let prepareAcceleration = this.config.prepareAcceleration;
        while (this.preparing() && prepareAcceleration > 0) {
          this.update(TWO_FRAME_DURATION_MILLISECONDS);
          prepareAcceleration--;
        }
      } else {
        console.log(deltaMilliseconds);
        this.update(deltaMilliseconds);
      }
    }
    preparing(): boolean {
      return this.cycle < this.config.prepareCounter;
    }
    finishPrepare(): void {
      let targetCycle = this.replaying ? this.replaying.start : this.config.prepareCounter;
      if (this.cycle < targetCycle) {
        console.log("skip cycles to: " + targetCycle);
      }
      while (this.cycle < targetCycle) {
        this.update();
      }
    }
    recoverTail(): void {
      let player = this.player;
      if (player && player.in == player.base && !player.base.polygon.inside(player.position)) {
        {
          if (!player.moveTo) {
            return;
          }
        }
        let nearestSegment = player.base.polygon.segments.reduce((closest: Segment, segment: Segment) => closest.start.distance2(player.position) < segment.start.distance2(player.position) ? closest : segment);
        let vector = nearestSegment.start.clone().sub(player.position);
        let distance = vector.magnitude();
        player.position = vector.mulScalar(1 + 1 / distance).add(player.position);
        player.track.remove();
        if (this.debug) {
          player.game.alert("Tail is recovered");
          console.log("Recovering tail, cycle: " + this.cycle);
          this.tailRecovered = true;
        } else if (window.ga) {
          window.ga("send", "event", "error", "tailRecovered");
        }
      }
    }
    update(deltaMilliseconds?: number): boolean {
      const {
        maxScale,
        minScale,
        observerScale
      } = this.config;
      if (this.stopped) {
        return false;
      }
      Vector.space = this.space;
      if (deltaMilliseconds == null) {
        deltaMilliseconds = 1000 / 60;
      }
      deltaMilliseconds += this.rng() * 0.01;
      this.spawnSuspend -= deltaMilliseconds;
      if (!this.isTest) {
        this.readInput(deltaMilliseconds);
      }
      this.angle = Math.round(Math.atan2(this.direction.y, this.direction.x) / Math.PI * 127 + 254) % 254;
      console.assert(this.angle >= 0 && this.angle < 256);
      if (this.replaying) {
        if (!this.replaying.read()) {
          delete this.replaying;
          this.alert("End of replay", "#ff0000");
          return false;
        }
      }
      if (this.recording) {
        this.recording.write();
      }
      this.recoverTail();
      const {
        player
      } = this;
      this.timings.aiStartTime = now();
      this.units.forEach((unit: Unit) => unit.update(deltaMilliseconds));
      this.timings.aiEndTime = now();
      this.handleUnitMovements(deltaMilliseconds);
      this.units.forEach((unit: Unit) => {
        unit.lastSquare = unit.base.square;
      });
      this.units.forEach((unit: Unit) => {
        const percent = unit.base.square / this.square;
        unit.percent = percent;
        unit.bestPercent = Math.max(unit.bestPercent, percent);
        unit.scale = lerp(maxScale, minScale, easeOutCubic(~~(percent * 20) / 20));
        unit.vrange = Math.sqrt(2455780) / 2 / unit.scale * 0.8;
        if (unit.schemes) {
          unit.schemes.update(deltaMilliseconds);
        }
        if (unit.labels.length) {
          let vector = new Vector(0, -35);
          const vector2 = new Vector(0, -10);
          const vector3 = new Vector(0, -10);
          unit.labels.forEach((textParticle: Label) => {
            this.labels.push(new TextParticle(textParticle.text, textParticle.color, ensureNonNullable(textParticle.unit), vector, vector2, textParticle.time, textParticle.fading));
            vector = vector.clone().add(vector3);
          });
          unit.labels = [];
        }
      });
      this.units.sort((unitA: Unit, unitB: Unit) => unitB.schemes && unitA.schemes ? unitB.schemes.scores() - unitA.schemes.scores() : 0);
      this.units.forEach((unit: Unit, index: number) => {
        unit.top = index + 1;
      });
      this.labels = this.labels.filter((particle: TextParticle) => {
        particle.update(deltaMilliseconds);
        return particle.time > 0;
      });
      if (this.notifications.length) {
        const quest = ensureNonNullable(this.notifications[0]);
        if (quest.ready) {
          quest.update(deltaMilliseconds);
          if (quest.state > 3) {
            this.notifications.shift();
          }
        }
      }
      this.particles.forEach((particle: Particle) => particle.update(deltaMilliseconds));
      if (player) {
        this.level = lerp(this.config.startBotLevel, 1, player.percent);
      } else {
        this.level = this.config.noPlayerBotLevel;
      }
      if (this.config.botLevel !== -1) {
        this.level = this.config.botLevel;
      }
      this.units.forEach((bot: Unit) => {
        if (bot instanceof Bot) {
          const clampedLevel = Math.min(1, Math.max(0, this.level + bot.jitter));
          let {
            botAggroMin,
            botAggroMax,
            botDefMin,
            botDefMax,
            botGreedMin,
            botGreedMax,
            botSafetyMin,
            botSafetyMax
          } = this.config;
          switch (bot.type) {
            case 1:
              botAggroMin *= 1.25;
              botAggroMax *= 1.25;
              break;
            case 2:
              botGreedMin *= 2;
              botGreedMax *= 1.1;
              botSafetyMin *= 0.75;
              botSafetyMax *= 0.75;
              break;
            case 3:
              botAggroMin *= 0.75;
              botAggroMax *= 0.75;
              botGreedMin *= 4;
              botGreedMax *= 1.1;
              botSafetyMin *= 0.5;
              botSafetyMax *= 0.5;
              botDefMin *= 2;
              botDefMax *= 2;
              break;
          }
          bot.aggro = lerp(botAggroMin, botAggroMax, clampedLevel);
          bot.greed = lerp(botGreedMin, botGreedMax, clampedLevel);
          bot.safety = lerp(botSafetyMin, botSafetyMax, clampedLevel);
          bot.def = lerp(botDefMin, botDefMax, clampedLevel);
        }
      });
      if (this.player && this.player.achievements) {
        this.player.achievements.update(this.player, deltaMilliseconds, this);
      }
      if (player && player.track.length > this.config.botAttackTrackLength) {
        let closestBot: Bot | null = null;
        let closestDistance = Infinity;
        for (const unit of this.units) {
          if (unit instanceof Bot) {
            let minDistance = Infinity;
            player.track.simplyline.forEach((trackPoint: Vector) => {
              const distanceSquared = trackPoint.distance2(unit.position);
              if (distanceSquared < minDistance) {
                minDistance = distanceSquared;
              }
            });
            minDistance = Math.sqrt(minDistance);
            if (minDistance < closestDistance) {
              closestBot = unit;
              closestDistance = minDistance;
            }
          }
        }
        if (closestBot) {
          ensureNonNullable(closestBot.fsm).change("attack");
        }
      }
      const targetScale = player ? player.scale : observerScale;
      const scaleDelta = targetScale - this.scale;
      this.scale += scaleDelta * deltaMilliseconds / 400;
      if (player && player.percent > 0.9999) {
        player.percent = 1;
        this.gameOver(KILL_REASON_WIN);
      }
      this.timings.spawnStartTime = now();
      for (let i2 = 0; i2 < this.config.nearPlayerBotSpawnCount; i2++) {
        this.spawnBot("player");
      }
      this.spawnBot("center");
      this.spawnBot(this.rng() > 0.3 ? "bounds" : "random");
      this.timings.spawnEndTime = now();
      this.cycle++;
      return true;
    }
    get renderContext(): RenderContext | undefined {
      return this.getRenderContext();
    }
    getRenderContext(): RenderContext | undefined {
      const {
        view
      } = this;
      if (!view) {
        return;
      }
      const {
        font
      } = this.config;
      const context = view.getContext("2d");
      const clientWidth = view.clientWidth;
      const clientHeight = view.clientHeight;
      const viewWidth = ~~(clientWidth * this.quality);
      const viewHeight = ~~(clientHeight * this.quality);
      if (view.width !== viewWidth || view.height !== viewHeight) {
        view.width = viewWidth;
        view.height = viewHeight;
      }
      const {
        devicePixelRatio
      } = window;
      const viewScreenWidth = viewWidth * devicePixelRatio;
      const viewScreenHeight = viewHeight * devicePixelRatio;
      const scaler = Math.sqrt(viewScreenWidth * viewScreenWidth + viewScreenHeight * viewScreenHeight) / Math.sqrt(2455780);
      const scale = this.scale * scaler / devicePixelRatio;
      let vector: Vector;
      if (this.player) {
        vector = this.player.position;
        if (this.player.killer && this.config.followKiller) {
          vector = this.player.killer.position;
        }
      } else {
        vector = this.space.center;
      }
      if (this.origin && (!this.player || this.player.killer)) {
        const distance = this.origin.distance(vector);
        let stepDistance = distance / 30;
        const offset = vector.clone().sub(this.origin).normalize().mulScalar(stepDistance);
        vector = this.origin.add(offset);
      }
      this.origin = vector.clone();
      const left = vector.x - viewWidth / 2 / scale;
      const right = vector.x + viewWidth / 2 / scale;
      const top = vector.y - viewHeight / 2 / scale;
      const bottom = vector.y + viewHeight / 2 / scale;
      const pointInView = (point: Vector, margin = 0) => isBetween(left - margin, right + margin, point.x) && isBetween(top - margin, bottom + margin, point.y);
      const boundsInView = (boundsObject: { bounds: Bounds }, margin = 0) => intervalOverlap(boundsObject.bounds.left - margin, boundsObject.bounds.right + margin, left, right) > 0 && intervalOverlap(boundsObject.bounds.top - margin, boundsObject.bounds.bottom + margin, top, bottom) > 0;
      const calcMult = (a: number, b: number) => {
        const landscapeAspectRatio = 16 / 9;
        const portraitAspectRatio = 9 / 16;
        const clampedAspectRatio = clamp(portraitAspectRatio, landscapeAspectRatio, viewScreenWidth / viewScreenHeight);
        const delta = a - b;
        const aspectSpan = portraitAspectRatio - landscapeAspectRatio;
        const offset = -(delta * landscapeAspectRatio + aspectSpan * a);
        return -(offset + delta * clampedAspectRatio) / aspectSpan;
      };
      const fontSize = ~~(calcMult(20, 30) * scaler);
      const strokeWidth = this.config.platesStrokeWidth * scaler;
      const backHeight = ~~(scaler * 4);
      const uiFont = fontSize + "px " + font;
      const padding = ~~(scaler * 16);
      const halfBarHeight = ~~(fontSize * 0.75);
      const barHeight = halfBarHeight * 2;
      const barWidth = ~~(viewScreenWidth / calcMult(4, 2.25));
      const halfBarWidth = ~~(barWidth / 2);
      return {
        game: this,
        view: view,
        ctx: context,
        viewWidth: viewWidth,
        viewHeight: viewHeight,
        devicePixelRatio: devicePixelRatio,
        scaler: scaler,
        scale: scale,
        origin: vector,
        pointInView: pointInView,
        boundsInView: boundsInView,
        calcMult: calcMult,
        viewScreenWidth: viewScreenWidth,
        viewScreenHeight: viewScreenHeight,
        fontSize: fontSize,
        strokeWidth: strokeWidth,
        backHeight: backHeight,
        uiFont: uiFont,
        padding: padding,
        barHeight: barHeight,
        halfBarHeight: halfBarHeight,
        barWidth: barWidth,
        halfBarWidth: halfBarWidth
      };
    }
    updateMetrics(frameTime: number): void {
      const {
        stats,
        timings
      } = this;
      const metric: Metric = {
        updateTime: timings.updateEndTime - timings.updateStartTime,
        renderTime: timings.renderEndTime - timings.renderStartTime,
        frameTime: frameTime,
        events: this.events
      };
      this.metrics.push(metric);
      if (this.metrics.length > MAX_METRICS_SAMPLES) {
        this.metrics.shift();
      }
      const smoothingFactor = 0.05;
      stats.fps = lerp(stats.fps, 1000 / frameTime, smoothingFactor);
      stats.ut = lerp(stats.ut, timings.updateEndTime - timings.updateStartTime, smoothingFactor);
      stats.ait = lerp(stats.ait, timings.aiEndTime - timings.aiStartTime, smoothingFactor);
      stats.st = lerp(stats.st, timings.spawnEndTime - timings.spawnStartTime, smoothingFactor);
      stats.rt = lerp(stats.rt, timings.renderEndTime - timings.renderStartTime, smoothingFactor);
      this.fpsSequence.push(stats.fps);
      const lowFpsThreshold = 25;
      const highFpsThreshold = 35;
      const criticalFpsThreshold = 10;
      const fpsSampleSize = 120;
      const minQuality = 0.5;
      if (this.fpsSequence.length > fpsSampleSize) {
        this.fpsSequence.sort();
        const medianFps = ensureNonNullable(this.fpsSequence[~~(fpsSampleSize / 2)]);
        if (medianFps < lowFpsThreshold) {
          this.quality -= 0.1;
        }
        if (medianFps < criticalFpsThreshold) {
          this.quality -= 0.1;
        }
        if (this.quality < minQuality) {
          this.quality = minQuality;
        }
        if (medianFps > highFpsThreshold) {
          this.quality += 0.1;
        }
        if (this.quality > 1) {
          this.quality = 1;
        }
        const qualityLevel = Math.round(this.quality * 10);
        this.quality = qualityLevel / 10;
        if (qualityLevel < 10) {
          const qualityKey = "q" + qualityLevel;
          if (this.qas[qualityKey]) {
            this.qas[qualityKey] = false;
            if (window.ga) {
              window.ga("send", "event", "fps", qualityKey);
            }
          }
        }
        this.fpsSequence = [];
      }
      this.events = {
        returns: 0,
        kills: 0
      };
    }
    setLeaderboard(leaderboard?: Leaderboard) {
      if (leaderboard) {
        this.leaderboard = leaderboard;
        this.changeShields();
      }
    }
    changeShields(): void {
      const {
        countries: leaderboard
      } = ensureNonNullable(this.leaderboard);
      if (leaderboard) {
        const goldCountry = leaderboard[0] && leaderboard[0].country;
        const silverCountry = leaderboard[1] && leaderboard[1].country;
        const bronzeCountry = leaderboard[2] && leaderboard[2].country;
        this.units.forEach((unit: Unit) => {
          const shieldAsset = unit.skin.assets.find((asset: Asset) => asset.pool.name === "shields");
          const flagAsset = unit.skin.assets.find((asset: Asset) => asset.pool.name === "flags");
          if (shieldAsset && flagAsset) {
            let shieldName = "gray";
            switch (flagAsset.name) {
              case goldCountry:
                shieldName = "gold";
                break;
              case silverCountry:
                shieldName = "silver";
                break;
              case bronzeCountry:
                shieldName = "bronze";
                break;
            }
            if (shieldAsset.name !== shieldName) {
              unit.skin.removeAsset(shieldAsset);
              if ("shieldSkinAssets" in this.skinManager) {
                unit.skin.addAsset(this.skinManager.shieldSkinAssets.get(shieldName));
              }
            }
          }
        });
      }
    }
    post(): void {
      var paper2_results = window.paper2_results;
      var scores = paper2_results.scores;
      function getLanguageCode(): string {
        return (navigator.languages && navigator.languages[0] || navigator.userLanguage || navigator.language || navigator.browserLanguage || "en").substr(0, 2).toUpperCase();
      }
      var payload = {
        build: paper2_results.build || 0,
        player: window.playerId || 0,
        lng: getLanguageCode(),
        name: ensureNonNullable(this.player).name,
        top: paper2_results.top || 0,
        persent: Math.round(paper2_results.score * 100),
        best: paper2_results.bestPercent && Math.round(paper2_results.bestPercent * 10000) || 0,
        time: Math.round(paper2_results.time / 1000),
        kills: paper2_results.kills,
        scores: {
          accumulator: scores && scores.accumulator || 0,
          kills: scores && scores.kills || 0
        },
        reason: paper2_results.reason || 0
      };
      function xorEncode(text: string): string {
        var encoded = "";
        for (var i2 = 0; i2 < text.length; i2++) {
          var charCode = text.charCodeAt(i2);
          var encodedCharCode = charCode ^ 42;
          encoded = encoded + String.fromCharCode(encodedCharCode);
        }
        return encoded;
      }
      fetch("/newpaperio/ajax/results.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: xorEncode(escape(JSON.stringify(payload)))
      });
    }
    addCity(unit: Unit) {
      const name = ensureNonNullable(unit.skin.assets.find((asset: Asset) => asset.pool.name === "flags")).name;
      const city = new City(ensureNonNullable(this.citiesManager).get(name), false, unit.position.clone(), unit);
      if (this.skinManager.isFlagSkinManager) {
        const citySkin = this.skinManager.getCitySkin(name);
        city.skin = citySkin ?? null;
      }
      unit.cities.push(city);
    }
    checkSegments(): void {
      let totalSegmentCount = 0;
      this.units.forEach((unit: Unit) => {
        totalSegmentCount += unit.base.polygon.segments.length;
        totalSegmentCount += unit.track.polyline.segments.length;
      });
      this.space.segmentsCount();
    }
    handleReturn(unit: Unit): boolean | undefined {
      if (unit.death) {
        return;
      }
      this.events.returns++;
      const polyline = unit.track.polyline.clone();
      const {
        base: unit2
      } = unit;
      const startIndex = unit2.polygon.segments.findIndex((segment: Segment) => segment.start === polyline.start);
      const endIndex = unit2.polygon.segments.findIndex((segment: Segment) => segment.start === polyline.end);
      const fromIndex = Math.min(endIndex, startIndex);
      const toIndex = Math.max(endIndex, startIndex);
      if (fromIndex !== startIndex) {
        polyline.reverse();
      }
      const trackPoints = polyline.points();
      const polygon = unit2.polygon.points();
      const list4 = polygon.splice(fromIndex, toIndex - fromIndex + 1, ...trackPoints);
      list4.shift();
      list4.pop();
      list4.reverse();
      list4.push(...trackPoints);
      const polygon2 = new Polygon(list4);
      let polygon3: Polygon;
      if (polygon2.rawSquare() < 0) {
        polygon3 = new Polygon(polygon.reverse());
        unit2.polygon.unsplice(polyline, fromIndex, toIndex);
      } else {
        polygon3 = polygon2;
        unit2.polygon.splice(polyline, fromIndex, toIndex);
      }
      unit2.square += polygon3.square();
      unit2.polygon.calcPath();
      this.units.filter((otherUnit: Unit) => otherUnit !== unit).forEach((unit3: Unit) => {
        if (!unit3.death) {
          if (unit3.in === unit3.base && polygon3.inside(unit3.position)) {
            this.kill(unit3, unit, KILL_REASON_SURROUNDED);
          }
          if (unit3.track.polyline.start && polygon3.inside(unit3.track.polyline.start)) {
            this.kill(unit3, unit, KILL_REASON_EXIT_POINT);
          }
          if (unit3.cities && unit3.cities[0] && polygon3.inside(unit3.cities[0].position)) {
            this.kill(unit3, unit, KILL_REASON_CAPITAL_SURROUNDED);
          }
        }
      });
      let list5: ShapeOwnerIntersection[] = [];
      const segments = unit.track.polyline.segments;
      const length = segments.length;
      const list6: { base: Territory; poly: Polygon }[] = [];
      for (let i2 = 0; i2 <= length; i2++) {
        const point = i2 === length ? ensureNonNullable(segments[i2 - 1]).end : ensureNonNullable(segments[i2]).start;
        const crossingSegments = point.segments.filter((segment: Segment) => ensureNonNullable(segment.shape).owner !== unit.track && ensureNonNullable(segment.shape).owner !== unit.base && segment.start === point);
        if (crossingSegments.length) {
          let list7: ShapeOwnerIntersection[] = crossingSegments.map((segment: Segment) => ({
            owner: ensureNonNullable(ensureNonNullable(segment.shape).owner),
            point: point,
            segment: segment,
            index: i2
          }));
          if (!list5.length) {
            const intersectionRecord = unit.track.intersections.find((record: TrailIntersectionRecord) => record.point.equal(point));
            if (!intersectionRecord) {
              return false;
            }
            list5 = list7.filter((intersection: ShapeOwnerIntersection) => {
              const list8 = intersectionRecord.intersections.filter((crossing: TrailCrossing) => crossing.base === intersection.owner);
              if (!list8.length) {
                return false;
              }
              return ensureNonNullable(list8[list8.length - 1]).enter;
            });
          } else {
            let list8 = list5.filter((intersection: ShapeOwnerIntersection) => list7.some((otherIntersection: ShapeOwnerIntersection) => {
              return otherIntersection.owner === intersection.owner;
            }));
            if (list8.length) {
              const enterIntersection = ensureNonNullable(list8[0]);
              const leaveIntersection = ensureNonNullable(list7.find((intersection: ShapeOwnerIntersection) => intersection.owner === enterIntersection.owner));
              const mergeComeback = (params: ComebackMergeParams) => {
                const {
                  owner,
                  startT,
                  endT,
                  startPoint,
                  endPoint
                } = params;
                let {
                  enter,
                  leave
                } = params;
                if (enter.shape !== owner.polygon) {
                  enter = ensureNonNullable(owner.polygon.segments.find((segment: Segment) => segment.start === startPoint));
                }
                if (leave.shape !== owner.polygon) {
                  leave = ensureNonNullable(owner.polygon.segments.find((segment: Segment) => segment.start === endPoint));
                }
                if (enter === leave) {
                  return;
                }
                const points = unit.track.polyline.points().splice(startT, endT - startT + 1);
                const enterIndex = owner.polygon.segments.findIndex((segment: Segment) => segment === enter);
                const leaveIndex = owner.polygon.segments.findIndex((segment: Segment) => segment === leave);
                const startIndex = Math.min(leaveIndex, enterIndex);
                const endIndex = Math.max(leaveIndex, enterIndex);
                if (startIndex !== enterIndex) {
                  points.reverse();
                }
                const list10 = owner.polygon.points();
                const list11 = list10.splice(startIndex, endIndex - startIndex + 1, ...points);
                list11.shift();
                list11.pop();
                list11.push(...points.slice().reverse());
                const polygon4 = new Polygon(list11);
                const polygon5 = new Polygon(list10);
                let polygon6: Polygon;
                if (owner.unit.in === owner.unit.base && polygon4.inside(owner.unit.position) || owner.unit.in !== owner.unit.base && polygon4.inside(ensureNonNullable(owner.unit.track.polyline.start))) {
                  owner.polygon.right(points, startIndex, endIndex);
                  polygon6 = polygon5;
                } else {
                  owner.polygon.left(points, startIndex, endIndex);
                  polygon6 = polygon4;
                }
                owner.square -= polygon6.square();
                owner.polygon.calcPath();
                list6.push({
                  base: owner,
                  poly: polygon6
                });
                this.units.forEach((unit3: Unit) => {
                  if (owner.unit !== unit3 && unit3.in === owner && polygon6.inside(unit3.position)) {
                    unit3.in = null;
                  }
                });
              };
              if (!(enterIntersection.owner instanceof Territory)) {
                throw new Error("Это не база");
              }
              mergeComeback({
                owner: enterIntersection.owner,
                enter: enterIntersection.segment,
                startPoint: enterIntersection.point,
                startT: enterIntersection.index,
                leave: leaveIntersection.segment,
                endPoint: leaveIntersection.point,
                endT: leaveIntersection.index
              });
              const intersectionRecord2 = ensureNonNullable(unit.track.intersections.find((record: TrailIntersectionRecord) => record.point.equal(point)));
              const list9 = intersectionRecord2.intersections.filter((crossing: TrailCrossing) => crossing.base === enterIntersection.owner);
              if (list9.length === 1 || ensureNonNullable(list9[list9.length - 1]).enter === false) {
                list7 = list7.filter((intersection: ShapeOwnerIntersection) => intersection.owner !== enterIntersection.owner);
              }
            }
            list5 = list7;
          }
        }
      }
      this.units.forEach((unit3: Unit) => {
        if (unit !== unit3 && polygon3.inside(unit3.position)) {
          unit3.in = unit.base;
        }
      });
      const increment = (unit.base.square - unit.lastSquare) / this.square;
      if (unit.schemes) {
        unit.schemes.comeback({
          increment: increment,
          rise: polygon3,
          victims: list6,
          game: this
        });
      }
      return;
    }
    render(): void {
      if (this.renderer) {
        this.renderer(this);
      }
    }
    handleUnitMovements(deltaMilliseconds?: number) {
      this.units.slice().forEach((unit: Unit) => {
        if (unit.death) {
          return;
        }
        let list4 = this.getMovement(ensureNonNullable(deltaMilliseconds), unit);
        {
          if (unit === this.player && !this.player.moveTo && unit.in === null && Math.random() < 0.0005) {
            unit.in = unit.base;
          }
        }
        while (list4.length) {
          if (unit.death) {
            return;
          }
          const segment = ensureNonNullable(list4.shift());
          const list5: Intersection[] = this.space.intersections(segment);
          const list6: IntersectionGroup[] = [];
          list5.forEach((intersection: Intersection) => {
            const groupIndex = list6.findIndex((group: IntersectionGroup) => group.point.equal(intersection.point));
            if (groupIndex === -1) {
              list6.push({
                point: intersection.point,
                intersections: [intersection]
              });
            } else {
              const group = ensureNonNullable(list6[groupIndex]);
              if (intersection.point !== group.point) {
                if (intersection.point.cell) {
                  if (group.point.cell) {
                    throw new Error("Бывает ли такое?");
                  } else {
                    group.point = intersection.point;
                    group.intersections.forEach((intersection: Intersection) => {
                      intersection.point = intersection.point;
                    });
                  }
                } else {
                  intersection.point = group.point;
                }
              }
              group.intersections.push(intersection);
            }
          });
          list5.forEach((intersection: Intersection) => {
            intersection.distance = segment.start.distance2(intersection.point);
          });
          list5.sort((intersectionA: Intersection, intersectionB: Intersection) => intersectionA.distance - intersectionB.distance);
          const list7: Intersection[][] = [];
          let list8: Intersection[] | null = null;
          let lastDistance = -1;
          list5.forEach((intersection: Intersection) => {
            if (!isNearlyEqual(intersection.distance, lastDistance)) {
              list8 = [];
              lastDistance = intersection.distance;
              list7.push(list8);
            }
            ensureNonNullable(list8).push(intersection);
          });
          list7.forEach((list9: Intersection[]) => {
            const list10: Shape[] = [];
            list9.forEach((intersection: Intersection) => {
              const {
                shape
              } = intersection.segment;
              if (shape && list10.indexOf(shape) === -1) {
                list10.push(shape);
              }
            });
            while (list10.length) {
              const inShapeIndex = list10.findIndex((shape: Shape) => shape.owner === unit.in);
              if (inShapeIndex > 0) {
                const firstShape = ensureNonNullable(list10[0]);
                list10[0] = ensureNonNullable(list10[inShapeIndex]);
                list10[inShapeIndex] = firstShape;
              }
              const trackShapeIndex = list10.findIndex((shape: Shape) => ensureNonNullable(shape.owner).isTrack);
              if (trackShapeIndex > 0) {
                const firstShape2 = ensureNonNullable(list10[0]);
                list10[0] = ensureNonNullable(list10[trackShapeIndex]);
                list10[trackShapeIndex] = firstShape2;
              }
              const shape = ensureNonNullable(list10.shift());
              const list11: Intersection[] = [];
              list9.forEach((intersection: Intersection) => {
                if (intersection.segment.shape === shape) {
                  list11.push(intersection);
                }
              });
              while (!unit.death && list11.length) {
                list11.sort((intersectionA: Intersection, intersectionB: Intersection) => {
                  if (unit.in) {
                    return intersectionB.zn - intersectionA.zn;
                  } else {
                    return intersectionA.zn - intersectionB.zn;
                  }
                });
                const intersection = ensureNonNullable(list11.shift());
                if (intersection.segment.shape && !ensureNonNullable(shape.owner).unit.death) {
                  ensureNonNullable(shape.owner).handleIntersect(intersection, unit, segment);
                }
              }
            }
          });
          if (unit.death) {
            return;
          }
          const {
            end
          } = segment;
          if (unit.in !== unit.base) {
            unit.track.add(end);
          }
          unit.position = end;
          if (this.visible && !list4.length && unit.in && unit.in !== unit.base) {
            let particle = Particle.nom(unit, segment, this.config.trackWidth);
            this.particles.push(particle);
          }
        }
      });
    }
    isPlayer(unit?: Unit): boolean {
      return unit === this.player;
    }
    alert(text?: string, color?: string) {
      this.labels.push(new TextParticle(ensureNonNullable(text), color || "#000000", this.player));
    }
    loop(): void {
      let currentTime = now();
      if (this.stopped) {
        return;
      }
      if (!this.debugView && (this.visible || this.cycle < this.config.prepareCounter)) {
        this.looped = true;
        if (this.last == 0) {
          this.last = currentTime;
        }
        let deltaMilliseconds = currentTime - this.last;
        if (deltaMilliseconds < 1) {
          deltaMilliseconds = 1;
        }
        this.updateMetrics(deltaMilliseconds);
        if (deltaMilliseconds > 10000) {
          deltaMilliseconds = 10000;
        }
        this.timings.updateStartTime = now();
        if (this.replaying || this.recording) {
          if (this.cycle < this.config.prepareCounter + 120 && deltaMilliseconds > 100) {
            deltaMilliseconds = 100;
          }
          if (deltaMilliseconds > FRAME_DURATION_MILLISECONDS * 0.9 && deltaMilliseconds < FRAME_DURATION_MILLISECONDS * 1.1) {
            deltaMilliseconds = FRAME_DURATION_MILLISECONDS;
          }
          this.timeAccumulated += deltaMilliseconds;
          if (this.preparing()) {
            this.prepareAndUpdate(FRAME_DURATION_MILLISECONDS);
            this.timeAccumulated = 0;
          } else if (this.replaying && this.replaying.skip && this.replaying.skipping()) {
            let prepareAcceleration = this.config.prepareAcceleration;
            while (this.replaying && this.replaying.skipping() && prepareAcceleration-- > 0) {
              this.update(FRAME_DURATION_MILLISECONDS);
            }
            this.timeAccumulated = 0;
          } else {
            if (this.timeAccumulated > FRAME_DURATION_MILLISECONDS * 10) {
              this.timeAccumulated = FRAME_DURATION_MILLISECONDS * 10;
            }
            while (this.timeAccumulated >= FRAME_DURATION_MILLISECONDS) {
              this.timeAccumulated -= FRAME_DURATION_MILLISECONDS;
              this.update(FRAME_DURATION_MILLISECONDS);
            }
          }
        } else if (this.visible) {
          const maxStepMilliseconds = FRAME_DURATION_MILLISECONDS * 2;
          while (deltaMilliseconds > 0) {
            const stepMilliseconds = deltaMilliseconds <= maxStepMilliseconds ? deltaMilliseconds : deltaMilliseconds < maxStepMilliseconds * 2 ? deltaMilliseconds / 2 + Math.random() : maxStepMilliseconds + Math.random();
            this.update(stepMilliseconds);
            deltaMilliseconds -= stepMilliseconds;
          }
        } else {
          this.prepareAndUpdate(deltaMilliseconds);
        }
        this.timings.updateEndTime = now();
      }
      this.timings.renderStartTime = now();
      if (this.visible) {
        this.render();
      }
      this.timings.renderEndTime = now();
      this.last = currentTime;
      requestAnimationFrame(() => this.loop());
    }
  }
  interface Config {
    arenaSize: number;
    quadSize: number;
    borderPoints: number;
    prepareMult: number;
    prepareBatchCount: number;
    maxPreparingTime: number;
    baseRadius: number;
    baseCount: number;
    minScale: number;
    maxScale: number;
    observerScale: number;
    trackWidth: number;
    unitSpeed: number;
    spawnTimeout: number;
    prepareCounter: number;
    prepareAcceleration: number;
    baseHeight: number;
    botsCount: number;
    botLevel: number;
    startBotLevel: number;
    noPlayerBotLevel: number;
    nearPlayerBotSpawnCount: number;
    followKiller: boolean;
    selfKillDelay: number;
    enemyKillDelay: number;
    arenaColor: string;
    borderColor: string;
    backgroundTopColor: string;
    backgroundBottomColor: string;
    platesStrokeWidth: number;
    botAggroMin: number;
    botAggroMax: number;
    botDefMin: number;
    botDefMax: number;
    botGreedMin: number;
    botGreedMax: number;
    botSafetyMin: number;
    botSafetyMax: number;
    botAttackTrackLength: number;
    font: string;
    // Every field is a `string | number | boolean`; the index signature lets the
    // config-editing form write fields back by their dynamic string key (its
    // named fields keep their specific types since those take precedence).
    [configKey: string]: string | number | boolean;
  }
  class KeyboardModeSwitch {
    mode2: boolean;
    constructor() {
      this.mode2 = false;
    }
    get(): boolean {
      return this.mode2;
    }
    switch(): void {}
  }
  interface PointerState {
    x: number;
    y: number;
  }
  interface MouseButtonsState {
    left: boolean;
    middle: boolean;
    right: boolean;
  }
  interface ModifiersState {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
    meta: boolean;
  }
  interface KeyCodeHandler {
    code: number;
    handler: () => void;
  }
  interface KeyCodeSetHandler {
    codes: number[];
    handler: () => void;
  }
  class Controller {
    buttons: MouseButtonsState;
    codes: KeyCodeHandler[];
    dispose: () => void;
    down: boolean;
    keyboardModeSwitch: KeyboardModeSwitch | undefined;
    lastMouse: PointerState | null;
    left: boolean;
    modifiers: ModifiersState;
    mouse: PointerState | null;
    pressedButtons: number[];
    right: boolean;
    sets: KeyCodeSetHandler[];
    up: boolean;
    constructor(element: HTMLElement, keyboardModeSwitch?: KeyboardModeSwitch) {
      this.up = false;
      this.down = false;
      this.left = false;
      this.right = false;
      this.modifiers = {
        shift: false,
        ctrl: false,
        alt: false,
        meta: false
      };
      this.mouse = null;
      this.lastMouse = null;
      this.buttons = {
        left: false,
        middle: false,
        right: false
      };
      this.codes = [];
      this.sets = [];
      this.keyboardModeSwitch = keyboardModeSwitch;
      this.pressedButtons = [];
      const onKeyDown = (event: KeyboardEvent) => this.onKeyChange(event, true);
      const onKeyUp = (event: KeyboardEvent) => this.onKeyChange(event, false);
      if (keyboardModeSwitch) {
        keyboardModeSwitch.get();
        window.addEventListener("keydown", onKeyDown, false);
        window.addEventListener("keyup", onKeyUp, false);
      }
      const onContextMenu = (event: Event) => event.preventDefault();
      element.addEventListener("contextmenu", onContextMenu, false);
      const onMouseDown = (event: MouseEvent) => this.onMouseChange(event, true);
      const onMouseUp = (event: MouseEvent) => this.onMouseChange(event, false);
      const onMouseLeave = (event: MouseEvent) => {
        this.lastMouse = this.mouse;
        this.mouse = null;
        event.preventDefault();
      };
      const onMouseMove = (event: MouseEvent) => {
        this.mouse = {
          x: event.pageX,
          y: event.pageY
        };
        event.preventDefault();
      };
      const onMouseEnter = (event: MouseEvent) => {
        onMouseMove(event);
        const {
          buttons
        } = event;
        this.buttons = {
          left: !!(buttons & 1),
          middle: !!(buttons & 4),
          right: !!(buttons & 2)
        };
        event.preventDefault();
      };
      element.addEventListener("mouseenter", onMouseEnter, false);
      element.addEventListener("mousemove", onMouseMove, false);
      element.addEventListener("mouseleave", onMouseLeave, false);
      element.addEventListener("mousedown", onMouseDown, false);
      element.addEventListener("mouseup", onMouseUp, false);
      const onTouchEnd = (event: TouchEvent) => {
        this.lastMouse = this.mouse;
        this.mouse = null;
        event.preventDefault();
      };
      const onTouchMove = (event: TouchEvent) => {
        const event2 = ensureNonNullable(event.changedTouches[0]);
        this.mouse = {
          x: event2.clientX,
          y: event2.clientY
        };
        event.preventDefault();
      };
      element.addEventListener("touchstart", onTouchMove, false);
      element.addEventListener("touchmove", onTouchMove, false);
      element.addEventListener("touchend", onTouchEnd, false);
      element.addEventListener("touchcancel", onTouchEnd, false);
      this.dispose = () => {
        element.removeEventListener("contextmenu", onContextMenu, false);
        if (keyboardModeSwitch) {
          window.removeEventListener("keydown", onKeyDown, false);
          window.removeEventListener("keyup", onKeyUp, false);
        }
        element.removeEventListener("mouseenter", onMouseEnter, false);
        element.removeEventListener("mousemove", onMouseMove, false);
        element.removeEventListener("mouseleave", onMouseLeave, false);
        element.removeEventListener("mousedown", onMouseDown, false);
        element.removeEventListener("mouseup", onMouseUp, false);
      };
    }
    pressed(): boolean {
      return this.up || this.down || this.left || this.right;
    }
    onKeyChange(event: KeyboardEvent, isPressed: boolean) {
      if (event.target === document.body) {
        let isHandled = true;
        const {
          keyCode
        } = event;
        const pressedIndex = this.pressedButtons.indexOf(keyCode);
        if (isPressed) {
          if (pressedIndex < 0) {
            this.pressedButtons.push(keyCode);
          }
          const matchedSet = this.sets.find((set: KeyCodeSetHandler) => set.codes.every((code: number) => !!this.pressedButtons.find((pressedCode: number) => pressedCode === code)));
          if (matchedSet) {
            matchedSet.handler();
          }
        } else {
          if (pressedIndex >= 0) {
            this.pressedButtons.splice(pressedIndex, 1);
          }
          const matchedCode = this.codes.find((codeHandler: KeyCodeHandler) => codeHandler.code === keyCode);
          if (matchedCode) {
            matchedCode.handler();
          }
        }
        switch (keyCode) {
          case 38:
          case 87:
            this.up = isPressed;
            break;
          case 40:
          case 83:
            this.down = isPressed;
            break;
          case 37:
          case 65:
            this.left = isPressed;
            break;
          case 39:
          case 68:
            this.right = isPressed;
            break;
          case 67:
            if (!isPressed && this.keyboardModeSwitch) {
              this.keyboardModeSwitch.switch();
            }
            break;
          default:
            isHandled = false;
            break;
        }
        this.modifiers.shift = event.shiftKey;
        this.modifiers.ctrl = event.ctrlKey;
        this.modifiers.alt = event.altKey;
        this.modifiers.meta = event.metaKey;
        if (isHandled) {
          event.preventDefault();
        }
      }
    }
    onMouseChange(event: MouseEvent, isPressed: boolean) {
      switch (event.button) {
        case 0:
          this.buttons.left = isPressed;
          break;
        case 1:
          this.buttons.middle = isPressed;
          break;
        case 2:
          this.buttons.right = isPressed;
          break;
      }
    }
    addButton(code: number, handler: () => void) {
      this.codes.push({
        code: code,
        handler: handler
      });
    }
    addSet(codes: number[], handler: () => void) {
      this.sets.push({
        codes: codes.sort(),
        handler: handler
      });
    }
  }
  var assign2 = Object.assign;
  interface SkinLayerDescriptor {
    url?: string;
    src?: HTMLCanvasElement | HTMLImageElement;
    level?: number;
    scale?: number;
    x?: number;
    y?: number;
    direction?: string;
    rotation?: number;
    pivot?: {
      x?: number;
      y?: number;
    };
  }
  class SkinLayer {
    config: Config;
    direction: string;
    image: HTMLCanvasElement | null;
    level: number;
    pivot: {
      x: number;
      y: number;
    };
    rotation: number;
    scale: number;
    src: HTMLCanvasElement | HTMLImageElement | null;
    url: string;
    x: number;
    y: number;
    constructor(config: Config, descriptor: SkinLayerDescriptor, onReady?: (skinLayer: SkinLayer) => void) {
      this.level = 0;
      this.scale = 1;
      this.x = 0;
      this.y = 0;
      this.direction = "";
      this.rotation = 0;
      this.url = "";
      this.src = null;
      this.image = null;
      this.config = config;
      Object.assign(this, descriptor);
      this.pivot = Object.assign({
        x: 0.5,
        y: 0.5
      }, descriptor.pivot);
      let imagePromise = this.url ? loadImage(this.url) : this.src ? Promise.resolve(this.src) : null;
      if (imagePromise) {
        imagePromise.then((image: HTMLImageElement) => {
          this.src = image;
          this.rescale(1);
          if (onReady) {
            onReady(this);
          }
        });
      }
    }
    rescale(scale: number) {
      const {
        trackWidth,
        maxScale
      } = this.config;
      const baseSize = trackWidth * maxScale;
      const src = this.src;
      if (!src) {
        return;
      }
      const sourceWidth = "naturalWidth" in src ? src.naturalWidth || src.width : src.width;
      const sourceHeight = "naturalHeight" in src ? src.naturalHeight || src.height : src.height;
      const scaleRatio = baseSize * scale * this.scale / sourceWidth;
      const targetWidth = ~~(sourceWidth * scaleRatio);
      const targetHeight = ~~(sourceHeight * scaleRatio);
      const scaleX = targetWidth / sourceWidth;
      const scaleY = targetHeight / sourceHeight;
      const element = document.createElement("canvas");
      element.width = targetWidth;
      element.height = targetHeight;
      const context = element.getContext("2d");
      if (!context) {
        return;
      }
      context.scale(scaleX, scaleY);
      context.drawImage(src, 0, 0);
      this.image = element;
    }
  }
  let svgElement: SVGSVGElement | undefined;
  interface PatternSource {
    url?: string;
    scale?: number;
  }
  class PatternAsset {
    pattern: CanvasPattern | null;
    ready: boolean;
    scale: number;
    src: HTMLImageElement | null;
    url: string;
    constructor(config: Config, canvas: HTMLCanvasElement, baseUrl: string, source: PatternSource = {}, onReady?: () => void) {
      this.url = baseUrl + source.url;
      this.scale = source.scale || 1;
      this.src = null;
      this.ready = false;
      this.pattern = null;
      const {
        maxScale
      } = config;
      loadImage(this.url).then((spatialGrid2: HTMLImageElement) => {
        this.src = spatialGrid2;
        const sourceWidth = ~~(spatialGrid2.naturalWidth || spatialGrid2.width);
        const sourceHeight = ~~(spatialGrid2.naturalHeight || spatialGrid2.height);
        const scaleRatio = maxScale * 100 * this.scale / sourceWidth;
        if (sourceWidth == 0) {
          console.log(this.url + " has no width");
        }
        if (sourceHeight == 0) {
          console.log(this.url + " has no heigth");
        }
        const targetWidth = Math.floor(sourceWidth * scaleRatio) || 1;
        const targetHeight = Math.floor(sourceHeight * scaleRatio) || 1;
        const element = document.createElement("canvas");
        element.width = targetWidth;
        element.height = targetHeight;
        const elementContext = element.getContext("2d");
        if (!elementContext) {
          return;
        }
        elementContext.drawImage(spatialGrid2, 0, 0, targetWidth + 1, targetHeight + 1);
        const canvasContext = canvas.getContext("2d");
        if (!canvasContext) {
          return;
        }
        this.pattern = canvasContext.createPattern(element, "repeat");
        const inverseScale = 1 / maxScale;
        if (!svgElement) {
          svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        }
        const transformMatrix = svgElement.createSVGMatrix().scale(inverseScale, inverseScale);
        if (this.pattern && this.pattern.setTransform) {
          this.pattern.setTransform(transformMatrix);
        }
        this.ready = true;
        if (onReady) {
          onReady();
        }
      });
    }
  }
  interface AvatarDescriptor {
    layers?: SkinLayerDescriptor[];
    scale?: number;
    x?: number;
    y?: number;
  }
  class Avatar {
    backLayers: SkinLayer[];
    frontLayers: SkinLayer[];
    layers: SkinLayer[];
    ready: boolean;
    scale: number;
    x: number;
    y: number;
    constructor(config: Config, baseUrl: string, descriptor: AvatarDescriptor, onReady?: () => void) {
      this.layers = [];
      this.scale = 1;
      this.x = 0;
      this.y = 0;
      this.ready = false;
      Object.assign(this, descriptor);
      let i2 = 0;
      const onLayerReady = (layer: SkinLayer) => {
        layer.rescale(this.scale);
        if (this.layers.length === ++i2) {
          this.ready = true;
          if (onReady) {
            onReady();
          }
        }
      };
      const layerDescriptors: SkinLayerDescriptor[] = descriptor.layers || [];
      this.layers = layerDescriptors.map((layerDescriptor: SkinLayerDescriptor) => {
        const resolvedDescriptor: SkinLayerDescriptor = assign2({}, layerDescriptor);
        const resolvedUrl = layerDescriptor.url && "" + baseUrl + layerDescriptor.url;
        if (resolvedUrl) {
          resolvedDescriptor.url = resolvedUrl;
        }
        return new SkinLayer(config, resolvedDescriptor, onLayerReady);
      });
      this.frontLayers = this.layers.filter((layer: SkinLayer) => layer.level >= 1).sort((layerA: SkinLayer, layerB: SkinLayer) => layerA.level - layerB.level);
      this.backLayers = this.layers.filter((layer: SkinLayer) => layer.level < 1).sort((layerA: SkinLayer, layerB: SkinLayer) => layerB.level - layerA.level);
    }
  }
  interface DisplayLayerEntry {
    display: Avatar;
    layer: SkinLayer;
  }
  class DisplayList {
    backLayers: DisplayLayerEntry[];
    displays: Avatar[];
    frontLayers: DisplayLayerEntry[];
    maxScale: number;
    constructor() {
      this.displays = [];
      this.frontLayers = [];
      this.backLayers = [];
      this.maxScale = 0;
    }
    get ready(): boolean {
      return this.displays.every((display: Avatar) => display.ready);
    }
    sort(): void {
      this.frontLayers = ([] as DisplayLayerEntry[]).concat(...this.displays.map((display: Avatar) => display.frontLayers.map((layer: SkinLayer) => ({
        display: display,
        layer: layer
      })))).sort((entryA: DisplayLayerEntry, entryB: DisplayLayerEntry) => entryA.layer.level - entryB.layer.level);
      this.backLayers = ([] as DisplayLayerEntry[]).concat(...this.displays.map((display: Avatar) => display.backLayers.map((layer: SkinLayer) => ({
        display: display,
        layer: layer
      })))).sort((entryA: DisplayLayerEntry, entryB: DisplayLayerEntry) => entryB.layer.level - entryA.layer.level);
      this.maxScale = Math.max(...this.frontLayers.map((entry: DisplayLayerEntry) => entry.display.scale * entry.layer.scale));
    }
    add(display: Avatar) {
      this.displays.push(display);
      this.sort();
    }
    remove(_display: Avatar) {
      this.displays = this.displays.filter((display: Avatar) => display !== display);
      this.sort();
    }
  }
  let cachedGradient: CanvasGradient | undefined;
  let cachedTopColor: string | undefined;
  let cachedBottomColor: string | undefined;
  let cachedContext: CanvasRenderingContext2D | undefined;
  interface SizedGridLike {
    width: number;
    height: number;
  }
  const getVerticalGradient = (context: CanvasRenderingContext2D, spatialGrid2: SizedGridLike, topColor: string, bottomColor: string): CanvasGradient | undefined => {
    if (cachedContext !== context || cachedTopColor !== topColor || cachedBottomColor !== bottomColor) {
      cachedGradient = context.createLinearGradient(spatialGrid2.width / 2, 0, spatialGrid2.width / 2, spatialGrid2.height);
      cachedGradient.addColorStop(0, topColor);
      cachedGradient.addColorStop(1, bottomColor);
    }
    return cachedGradient;
  };
  const strokePath = (context: CanvasRenderingContext2D, path: Path2D, strokeColor: string, lineWidth: number) => {
    context.strokeStyle = strokeColor;
    context.lineWidth = lineWidth;
    context.stroke(path);
  };
  const strokeTrail = (context: CanvasRenderingContext2D, strokeStyle: string | CanvasPattern, trail: Trail, _unused: Vector, lineWidth: number) => {
    if (trail.polyline.segments.length) {
      context.lineWidth = lineWidth;
      context.strokeStyle = strokeStyle;
      context.stroke(trail.polyline.path);
    }
  };
  const drawUnitName = (context: CanvasRenderingContext2D, unit: Unit, zoom: number, scale: number, fontFamily: string) => {
    const {
      devicePixelRatio
    } = window;
    const fontSize = scale * 24 / devicePixelRatio;
    const outlineWidth = scale * 4 / devicePixelRatio;
    context.save();
    context.translate(unit.position.x, unit.position.y);
    context.scale(1.001 / zoom, 1.001 / zoom);
    context.font = fontSize + "px " + fontFamily;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    let name = unit.name;
    if (unit == unit.game.player) {
      if (new Date().getSeconds() % 2 == 0) {
        if (unit.game.recording) {
          name = "Recording";
        } else if (unit.game.replaying) {
          name = "Replaying";
        }
      }
    }
    const textOffsetY = ~~(zoom * -12);
    const outlineColor = "#363331";
    context.lineWidth = outlineWidth / 4;
    context.strokeStyle = outlineColor;
    context.shadowColor = outlineColor;
    context.shadowBlur = outlineWidth / 2;
    context.strokeText(name, 0, textOffsetY);
    context.fillStyle = outlineColor;
    context.fillText(name, 2, textOffsetY + 2);
    let nameColor = "#dddddd";
    const shieldAsset = unit.skin.assets.find((asset: Asset) => asset.pool.name === "shields");
    if (shieldAsset) {
      nameColor = ensureNonNullable(shieldAsset.content.color);
    }
    context.fillStyle = nameColor;
    context.shadowColor = nameColor;
    context.shadowBlur = outlineWidth / 3;
    context.fillText(name, 0, textOffsetY);
    context.restore();
  };
  const createCrownPath = () => {
    const path2D = new Path2D();
    const size = 5;
    path2D.moveTo(size * -3, size * -3);
    path2D.lineTo(size * -1, size * -1);
    path2D.lineTo(size * 0, size * -3);
    path2D.lineTo(size * 1, size * -1);
    path2D.lineTo(size * 3, size * -3);
    path2D.lineTo(size * 2, size * 1);
    path2D.lineTo(size * -2, size * 1);
    path2D.closePath();
    return path2D;
  };
  const crownPath = createCrownPath();
  const drawCrown = (context: CanvasRenderingContext2D, unit: Unit, zoom: number, scale: number) => {
    const {
      devicePixelRatio
    } = window;
    const verticalOffset = scale * 24 / devicePixelRatio;
    context.save();
    context.translate(unit.position.x, unit.position.y);
    context.scale(1 / (zoom * devicePixelRatio), 1 / (zoom * devicePixelRatio));
    context.fillStyle = "#ffff00";
    context.strokeStyle = "#ff8800";
    context.lineJoin = "round";
    context.lineWidth = 1;
    context.translate(0, zoom * -10 * devicePixelRatio);
    context.translate(0, -verticalOffset * devicePixelRatio);
    context.scale(scale, scale);
    context.translate(0, -4);
    context.translate(0, -12);
    context.fill(crownPath);
    context.stroke(crownPath);
    context.restore();
  };
  const createFacePath = () => {
    const path2D = new Path2D();
    const size = 1.6;
    path2D.moveTo(size * 0, size * -7);
    path2D.lineTo(size * 5, size * -6);
    path2D.lineTo(size * 7, size * -3);
    path2D.lineTo(size * 6, size * 2);
    path2D.lineTo(size * 4, size * 3);
    path2D.lineTo(size * 3, size * 6);
    path2D.lineTo(size * 0, size * 7);
    path2D.lineTo(size * -3, size * 6);
    path2D.lineTo(size * -4, size * 3);
    path2D.lineTo(size * -6, size * 2);
    path2D.lineTo(size * -7, size * -3);
    path2D.lineTo(size * -5, size * -6);
    path2D.closePath();
    path2D.arc(size * -3, size * -1, size * 2, 0, Math.PI * 2, true);
    path2D.closePath();
    path2D.arc(size * 3, size * -1, size * 2, 0, Math.PI * 2, true);
    path2D.closePath();
    path2D.moveTo(size * 0, size * 1);
    path2D.lineTo(size * -2, size * 3);
    path2D.lineTo(size * 0, size * 4);
    path2D.lineTo(size * 2, size * 3);
    path2D.closePath();
    return path2D;
  };
  const facePath = createFacePath();
  const drawFaceIcon = (context: CanvasRenderingContext2D, x: number, y: number, scale: number) => {
    context.save();
    context.fillStyle = "#ffffffcc";
    context.translate(x, y);
    context.scale(scale, scale);
    context.fill(facePath);
    context.restore();
  };
  interface AvatarBearer {
    position: Vector;
    skin: Skin;
    direction?: number;
    target?: Vector | null;
  }
  const drawSkinLayer = (config: Config, context: CanvasRenderingContext2D, unit: AvatarBearer, skinLayer: Avatar, skinLayer2: SkinLayer) => {
    const {
      trackWidth
    } = config;
    if (skinLayer2.image) {
      const imageWidth = skinLayer2.image.width;
      const imageHeight = skinLayer2.image.height;
      const imageScale = trackWidth * skinLayer.scale * skinLayer2.scale / imageWidth;
      context.save();
      context.translate(unit.position.x, unit.position.y - config.baseHeight * skinLayer2.level);
      context.rotate(ensureNonNullable(unit.direction) + Math.PI / 2);
      context.translate((skinLayer.x + skinLayer2.x) * trackWidth, (skinLayer.y + skinLayer2.y) * trackWidth);
      let rotation = 0;
      if (skinLayer2.direction === "target") {
        const point = (unit.target || new Vector(0, 0)).clone().sub(unit.position);
        const targetAngle = Math.atan2(point.y, point.x);
        rotation += targetAngle - ensureNonNullable(unit.direction);
      }
      if (skinLayer2.direction === "billboard") {
        rotation += -ensureNonNullable(unit.direction) - Math.PI / 2;
      }
      if (skinLayer2.rotation) {
        rotation += skinLayer2.rotation * 0.0174533;
      }
      if (rotation) {
        context.rotate(rotation);
      }
      context.scale(imageScale, imageScale);
      context.translate(imageWidth * -skinLayer2.pivot.x, imageHeight * -skinLayer2.pivot.y);
      context.drawImage(skinLayer2.image, 0, 0);
      context.restore();
    }
  };
  const drawAvatarLayers = (config: Config, context: CanvasRenderingContext2D, unit: AvatarBearer, avatar: DisplayList, isFront: boolean) => {
    const list4 = isFront ? avatar.frontLayers : avatar.backLayers;
    list4.forEach((layerEntry: DisplayLayerEntry) => drawSkinLayer(config, context, unit, layerEntry.display, layerEntry.layer));
  };
  const drawRoundedRect = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, cornerRadii: [number, number, number, number], strokeWidth?: number) => {
    const [topLeftRadius, topRightRadius, bottomRightRadius, bottomLeftRadius] = cornerRadii;
    context.beginPath();
    context.moveTo(x + topLeftRadius, y);
    context.lineTo(x + width - topRightRadius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + topRightRadius);
    context.lineTo(x + width, y + height - bottomRightRadius);
    context.quadraticCurveTo(x + width, y + height, x + width - bottomRightRadius, y + height);
    context.lineTo(x + bottomLeftRadius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - bottomLeftRadius);
    context.lineTo(x, y + topLeftRadius);
    context.quadraticCurveTo(x, y, x + topLeftRadius, y);
    context.closePath();
    context.fill();
    if (strokeWidth) {
      context.strokeStyle = "#00000099";
      context.lineWidth = strokeWidth;
      context.stroke();
    }
  };
  const fillPath = (context: CanvasRenderingContext2D, path: Path2D, fillStyle: string | CanvasPattern) => {
    context.fillStyle = fillStyle;
    context.fill(path);
  };
  interface Bounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }
  interface HasBounds {
    bounds: Bounds;
  }
  interface RenderContext {
    game: Game;
    view: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D | null;
    viewWidth: number;
    viewHeight: number;
    devicePixelRatio: number;
    scaler: number;
    scale: number;
    origin: Vector;
    pointInView: (point: Vector, padding?: number) => boolean;
    boundsInView: (target: HasBounds, padding?: number) => boolean;
    calcMult: (a: number, b: number) => number;
    viewScreenWidth: number;
    viewScreenHeight: number;
    fontSize: number;
    strokeWidth: number;
    backHeight: number;
    uiFont: string;
    padding: number;
    barHeight: number;
    halfBarHeight: number;
    barWidth: number;
    halfBarWidth: number;
  }
  const drawBaseFills = (renderContext: RenderContext) => {
    const {
      game: game,
      boundsInView
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    const {
      trackWidth
    } = game.config;
    game.units.forEach((unit: Unit) => {
      if (boundsInView({ bounds: ensureNonNullable(unit.base.polygon.bounds) }, trackWidth) || game.debugView) {
        fillPath(ctx, unit.base.polygon.path, unit.skin.pattern && unit.skin.pattern.pattern || unit.skin.colors.main);
      }
    });
  };
  const drawTrailUnderlays = (renderContext: RenderContext) => {
    const {
      game: game,
      boundsInView
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    const {
      trackWidth
    } = game.config;
    ctx.save();
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = "destination-out";
    game.units.forEach((unit: Unit) => {
      const {
        start
      } = unit.track.polyline;
      if (start) {
        if (boundsInView(unit.track.polyline, trackWidth)) {
          strokeTrail(ctx, unit.skin.colors.main, unit.track, unit.position, trackWidth);
          ctx.save();
          ctx.globalCompositeOperation = "destination-over";
          ctx.clip(unit.base.polygon.path);
          strokeTrail(ctx, unit.skin.pattern && unit.skin.pattern.pattern || unit.skin.colors.main, unit.track, unit.position, trackWidth + 2);
          ctx.restore();
        }
      }
    });
    ctx.restore();
  };
  const drawAvatarFrontLayers = (renderContext: RenderContext) => {
    const {
      game: game,
      pointInView
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    const {
      trackWidth
    } = game.config;
    game.units.forEach((city: Unit) => {
      if (pointInView(city.position, trackWidth * 4)) {
        drawAvatarLayers(game.config, ctx, city, city.skin.container, true);
      }
    });
  };
  const drawUnitNames = (renderContext: RenderContext) => {
    const {
      game: game,
      scale,
      scaler,
      pointInView
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    const {
      trackWidth,
      font
    } = game.config;
    game.units.forEach((unit: Unit) => {
      if (pointInView(unit.position, trackWidth * 20) || game.debugView) {
        drawUnitName(ctx, unit, scale, scaler, font);
      }
    });
  };
  const drawAvatarBackLayers = (renderContext: RenderContext) => {
    const {
      game: game,
      pointInView
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    const {
      trackWidth
    } = game.config;
    game.units.forEach((city: Unit) => {
      if (pointInView(city.position, trackWidth * 4)) {
        drawAvatarLayers(game.config, ctx, city, city.skin.container, false);
      }
    });
  };
  const drawTrails = (renderContext: RenderContext) => {
    const {
      game: game,
      boundsInView
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    const {
      trackWidth
    } = game.config;
    ctx.save();
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.6;
    game.units.forEach((unit: Unit) => {
      if (unit.in !== unit.base) {
        if (boundsInView(unit.track.polyline, trackWidth)) {
          strokeTrail(ctx, game.tailRecovered && unit == game.player ? "#f00" : unit.skin.colors.main, unit.track, unit.position, trackWidth);
        }
      }
    });
    ctx.restore();
  };
  const drawBaseBacks = (renderContext: RenderContext) => {
    const {
      game: game,
      boundsInView
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    const {
      trackWidth
    } = game.config;
    game.units.forEach((unit: Unit) => {
      if (boundsInView({ bounds: ensureNonNullable(unit.base.polygon.bounds) }, trackWidth)) {
        fillPath(ctx, unit.base.polygon.path, unit.skin.colors.back);
      }
    });
  };
  const drawArenaBackground = (renderContext: RenderContext) => {
    const {
      game: game,
      viewScreenWidth,
      viewScreenHeight
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    const {
      baseHeight,
      arenaColor,
      borderColor,
      backgroundTopColor,
      backgroundBottomColor
    } = game.config;
    fillPath(ctx, game.border.polygon.path, arenaColor);
    ctx.translate(0, baseHeight * 3);
    fillPath(ctx, game.border.polygon.path, borderColor);
    ctx.translate(0, baseHeight * -3);
    const backgroundGradient = getVerticalGradient(ctx, game.space, backgroundTopColor, backgroundBottomColor);
    if (backgroundGradient) {
      ctx.fillStyle = backgroundGradient;
    }
    ctx.fillRect(viewScreenWidth / -2, viewScreenHeight / -2, game.space.width + viewScreenWidth, game.space.height + viewScreenHeight);
  };
  const drawParticles = (renderContext: RenderContext) => {
    const {
      game: game,
      pointInView
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    const {
      trackWidth
    } = game.config;
    ctx.save();
    game.particles.forEach((particle: Particle) => particle.time > 0 && pointInView(particle.position, trackWidth) && particle.draw(ctx));
    ctx.restore();
  };
  const drawLabels = (renderContext: RenderContext) => {
    const {
      game: game,
      scale,
      scaler
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    const {
      font
    } = game.config;
    ctx.scale(1 / scale, 1 / scale);
    game.labels.forEach((label: TextParticle) => label.draw(ctx, font, scale, scaler));
    ctx.scale(scale, scale);
  };
  const drawLeaderMarker = (renderContext: RenderContext) => {
    const {
      game: game,
      scale,
      scaler
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    const topUnit = game.units[0];
    if (topUnit) {
      drawCrown(ctx, topUnit, scale, scaler);
    }
  };
  const drawMinimap = (renderContext: RenderContext) => {
    const {
      game: game,
      scaler,
      calcMult,
      viewScreenWidth,
      viewScreenHeight,
      padding
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    assertNonNullable(game.player);
    const minimapSize = viewScreenWidth / calcMult(8, 3);
    const minimapStrokeWidth = game.space.width / minimapSize * scaler * 3;
    ctx.save();
    ctx.translate(viewScreenWidth - padding - minimapSize, viewScreenHeight - padding - minimapSize);
    ctx.scale(minimapSize / game.space.width, minimapSize / game.space.height);
    fillPath(ctx, game.border.polygon.path, "#c2d6cdaa");
    fillPath(ctx, game.player.base.polygon.path, game.player.skin.colors.main);
    strokePath(ctx, game.player.base.polygon.path, game.player.skin.colors.back, minimapStrokeWidth / 2);
    strokeTrail(ctx, game.player.skin.colors.back, game.player.track, game.player.position, minimapStrokeWidth / 2);
    const borderColor = game.units.some((unit: Unit) => !game.isPlayer(unit) && unit.in === ensureNonNullable(game.player).base) ? "#ff0000" : "#00000099";
    strokePath(ctx, game.border.polygon.path, borderColor, minimapStrokeWidth);
    ctx.beginPath();
    ctx.arc(game.player.position.x, game.player.position.y, minimapStrokeWidth, 0, Math.PI * 2);
    ctx.fillStyle = game.player.skin.colors.nick;
    ctx.fill();
    const flagAsset = game.player.skin.assets.find((asset: Asset) => asset.pool && asset.pool.name === "flags");
    const spatialGrid2 = flagAsset && flagAsset.content.roundedFlag;
    if (spatialGrid2 && game.player.cities) {
      game.player.cities.forEach((city: City) => {
        ctx.save();
        ctx.translate(city.position.x, city.position.y);
        ctx.scale(2, 2);
        ctx.drawImage(spatialGrid2, -spatialGrid2.width / 2, -spatialGrid2.height / 2);
        ctx.restore();
      });
    }
    ctx.restore();
  };
  let spatialGrid: HTMLCanvasElement | null = null;
  window.addEventListener("resize", () => spatialGrid = null, false);
  const drawLeaderboard = (renderContext: RenderContext) => {
    const {
      devicePixelRatio
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    if (!spatialGrid) {
      spatialGrid = document.createElement("canvas");
      spatialGrid.width = ~~renderContext.barWidth;
      spatialGrid.height = ~~(renderContext.barHeight * 1.3 * 8);
    }
    if (renderContext.game.topListChanged) {
      renderContext.game.topListChanged = false;
      let context = spatialGrid.getContext("2d");
      if (context) {
        context.save();
        context.clearRect(0, 0, spatialGrid.width, spatialGrid.height);
        context.translate(-ctx.canvas.width + spatialGrid.width, 0);
        context.scale(1 / devicePixelRatio, 1 / devicePixelRatio);
        drawLeaderboardRows(context, renderContext);
        context.restore();
      }
    }
    ctx.save();
    ctx.resetTransform();
    ctx.drawImage(spatialGrid, ctx.canvas.width - spatialGrid.width, 0);
    ctx.restore();
  };
  const drawLeaderboardRows = (context: CanvasRenderingContext2D, renderContext: RenderContext) => {
    const {
      game: game,
      viewScreenWidth,
      padding,
      backHeight,
      barHeight,
      halfBarHeight,
      barWidth,
      halfBarWidth,
      strokeWidth,
      uiFont
    } = renderContext;
    let previousBarWidth: number | undefined;
    const drawLeaderboardRow = (unit: Unit, rank: number, rowIndex: number, maxScore: number) => {
      const rowY = padding + rowIndex * (barHeight * 1.3);
      const score = ensureNonNullable(unit.schemes).scores();
      let scoreBarWidth = halfBarWidth * (score / maxScore);
      if (previousBarWidth && scoreBarWidth > previousBarWidth - halfBarWidth * 0.05) {
        scoreBarWidth = previousBarWidth - halfBarWidth * 0.05;
      }
      previousBarWidth = scoreBarWidth;
      const barRightOffset = halfBarWidth + scoreBarWidth;
      let barX = viewScreenWidth - barRightOffset;
      const cornerRadii: [number, number, number, number] = [halfBarHeight, 0, 0, halfBarHeight];
      context.fillStyle = "#00000022";
      drawRoundedRect(context, barX + backHeight, rowY + backHeight * 3, barWidth, barHeight, cornerRadii);
      context.fillStyle = unit.skin.colors.back;
      drawRoundedRect(context, barX, rowY + backHeight, barWidth, barHeight, cornerRadii, strokeWidth);
      context.fillStyle = unit.skin.colors.main;
      drawRoundedRect(context, barX, rowY, barWidth, barHeight, cornerRadii, strokeWidth);
      const flagAsset = unit.skin.assets.find((asset: Asset) => asset.pool && asset.pool.name === "flags");
      const flagImage = flagAsset && flagAsset.content.roundedFlag;
      if (flagImage) {
        const flagHeight = barHeight * 0.8;
        const flagOffsetX = barHeight / 4;
        const flagScale = flagHeight / flagImage.height;
        context.save();
        context.translate(barX + flagOffsetX, rowY + barHeight / 2);
        context.scale(flagScale, flagScale);
        context.drawImage(flagImage, 0, -flagImage.height / 2);
        context.restore();
        barX += flagHeight;
      }
      context.fillStyle = unit.skin.colors.plate;
      context.font = uiFont;
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText(rank + " – " + ensureNonNullable(unit.schemes).print() + " " + unit.name, barX + halfBarHeight, rowY + halfBarHeight * 1.1);
    };
    const topUnit = game.units[0];
    const topScore = topUnit && ensureNonNullable(topUnit.schemes).scores();
    let isPlayerListed = false;
    for (let i2 = 0; i2 < 5; i2++) {
      const unit = game.units[i2];
      if (unit) {
        if (game.isPlayer(unit)) {
          isPlayerListed = true;
        }
        drawLeaderboardRow(unit, i2 + 1, i2, ensureNonNullable(topScore));
      }
    }
    if (!isPlayerListed && game.player && !game.player.death) {
      const playerIndex = game.units.findIndex((unit: Unit) => game.isPlayer(unit));
      drawLeaderboardRow(game.player, playerIndex + 1, 6, ensureNonNullable(topScore));
    }
  };
  const renderScoreBar = (renderContext: RenderContext) => {
    const {
      game: game,
      padding,
      backHeight,
      barHeight,
      halfBarHeight,
      barWidth,
      strokeWidth,
      uiFont
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    const {
      player
    } = game;
    assertNonNullable(player);
    ctx.fillStyle = "#00000022";
    drawRoundedRect(ctx, 0, padding, barWidth, barHeight + backHeight, [0, (barHeight + backHeight) / 2, (barHeight + backHeight) / 2, 0]);
    const scoreRatio = game.best ? Math.min(1, ensureNonNullable(player.schemes).scores() / game.best) : 1;
    const fillWidth = barWidth * (0.25 + scoreRatio * 0.75);
    ctx.fillStyle = player.skin.colors.back;
    drawRoundedRect(ctx, 0, padding + backHeight, fillWidth, barHeight, [0, halfBarHeight, halfBarHeight, 0], strokeWidth);
    ctx.fillStyle = player.skin.colors.main;
    drawRoundedRect(ctx, 0, padding, fillWidth, barHeight, [0, halfBarHeight, halfBarHeight, 0], strokeWidth);
    ctx.fillStyle = player.skin.colors.plate;
    ctx.font = uiFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(ensureNonNullable(player.schemes).print(), halfBarHeight, padding + halfBarHeight * 1.1);
  };
  const renderBestScore = (renderContext: RenderContext) => {
    const {
      game: game,
      padding,
      backHeight,
      barHeight,
      uiFont
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    ctx.font = uiFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let bestText = game.language.bestTxt + " " + ensureNonNullable(ensureNonNullable(game.player).schemes).print(game.best ?? undefined);
    ctx.fillStyle = "#00000066";
    ctx.fillText(bestText, padding / 2, padding + barHeight + backHeight + padding / 2);
  };
  const renderKillCount = (renderContext: RenderContext) => {
    const {
      game: game,
      scaler,
      padding,
      backHeight,
      barHeight,
      halfBarHeight,
      fontSize,
      uiFont
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    const killsY = padding + barHeight + backHeight + fontSize + padding / 2 + 4;
    ctx.font = uiFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let killsText = "x" + ensureNonNullable(game.player).statistics.kills;
    ctx.fillStyle = "#00000088";
    drawRoundedRect(ctx, 0, killsY, barHeight * 1.5 + ctx.measureText(killsText).width, barHeight, [0, halfBarHeight, halfBarHeight, 0]);
    drawFaceIcon(ctx, barHeight * 1.4 / 2, killsY + barHeight / 2, scaler);
    ctx.fillStyle = "#ffffffcc";
    ctx.fillText(killsText, barHeight * 1.25, killsY + halfBarHeight + barHeight * 0.03);
  };
  const renderQuestNotification = (renderContext: RenderContext) => {
    const {
      game: game,
      padding,
      backHeight,
      barHeight,
      fontSize,
      uiFont,
      viewScreenWidth
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    if (game.notifications.length) {
      const quest = ensureNonNullable(game.notifications[0]);
      if (quest.ready) {
        ctx.save();
        ctx.font = uiFont;
        const notificationHeight = fontSize * 2 + padding;
        const notificationY = quest.position() * (notificationHeight + padding) - notificationHeight;
        const textWidth = Math.max(ctx.measureText(quest.title).width, ctx.measureText(quest.description).width);
        const iconSize = fontSize * 2;
        const notificationWidth = textWidth + padding * 5 + iconSize;
        const inset = padding / 2;
        ctx.fillStyle = "#00000088";
        drawRoundedRect(ctx, (viewScreenWidth - notificationWidth) / 2, notificationY, notificationWidth, notificationHeight, [(barHeight + backHeight) / 2, (barHeight + backHeight) / 2, (barHeight + backHeight) / 2, (barHeight + backHeight) / 2]);
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 1;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(quest.title, (viewScreenWidth - notificationWidth) / 2 + notificationWidth / 2 + iconSize / 2, notificationY + inset);
        ctx.fillStyle = "#ffffff88";
        ctx.shadowColor = "#ffffff88";
        ctx.shadowBlur = 1;
        ctx.font = uiFont;
        ctx.fillText(quest.description, (viewScreenWidth - notificationWidth) / 2 + notificationWidth / 2 + iconSize / 2, notificationY + inset + fontSize);
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 10;
        if (quest.image) {
          ctx.drawImage(quest.image, (viewScreenWidth - notificationWidth) / 2 + inset, notificationY + inset, iconSize, iconSize);
        }
        ctx.restore();
      }
    }
  };
  function renderGame(game: Game) {
    const renderContext = game.getRenderContext();
    if (!renderContext) {
      return;
    }
    const {
      baseHeight
    } = game.config;
    let {
      origin,
      scale
    } = renderContext;
    const {
      devicePixelRatio,
      viewWidth,
      viewHeight
    } = renderContext;
    const ctx = ensureNonNullable(renderContext.ctx);
    if (game.debugView) {
      scale = 0.5;
      origin = game.space.center;
    }
    ctx.resetTransform();
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    const offsetX = origin.x * scale - viewWidth / 2;
    const offsetY = origin.y * scale - viewHeight / 2;
    ctx.translate(-offsetX, -offsetY);
    ctx.scale(scale, scale);
    ctx.translate(0, -baseHeight);
    drawBaseFills(renderContext);
    drawTrailUnderlays(renderContext);
    ctx.translate(0, baseHeight);
    ctx.globalCompositeOperation = "destination-over";
    drawAvatarBackLayers(renderContext);
    drawTrails(renderContext);
    drawBaseBacks(renderContext);
    drawArenaBackground(renderContext);
    ctx.globalCompositeOperation = "source-over";
    drawAvatarFrontLayers(renderContext);
    drawUnitNames(renderContext);
    drawParticles(renderContext);
    drawLabels(renderContext);
    drawLeaderMarker(renderContext);
    ctx.resetTransform();
    ctx.scale(1 / devicePixelRatio, 1 / devicePixelRatio);
    if (game.player) {
      drawLeaderboard(renderContext);
      renderScoreBar(renderContext);
      renderBestScore(renderContext);
      renderKillCount(renderContext);
      drawMinimap(renderContext);
      renderQuestNotification(renderContext);
    }
    if (game.debug || game.recording || game.replaying) {
      renderDebugOverlay(game);
    }
  }
  interface Metric {
    updateTime: number;
    renderTime: number;
    frameTime: number;
    events: {
      returns: number;
      kills: number;
    };
  }
  function renderDebugOverlay(game: Game) {
    const {
      view
    } = game;
    if (!view) {
      return;
    }
    const context = view.getContext("2d");
    if (!context) {
      return;
    }
    context.fillStyle = "#000000";
    context.strokeStyle = "#ffffff";
    context.textAlign = "left";
    context.textBaseline = "top";
    let lineY = game.quality * 160;
    const drawStatLine = (text: string = "", indentLevel: number = 0) => {
      if (text) {
        context.strokeText(text, 10 + indentLevel * 20, lineY);
        context.fillText(text, 10 + indentLevel * 20, lineY);
      }
      lineY += game.quality * 20;
    };
    drawStatLine("Update time: " + game.stats.ut.toFixed(1));
    drawStatLine("AI time: " + game.stats.ait.toFixed(1), 1);
    drawStatLine("Spawn time: " + game.stats.st.toFixed(1), 1);
    drawStatLine("Render time: " + game.stats.rt.toFixed(1));
    drawStatLine("FPS: " + Math.round(game.stats.fps));
    drawStatLine("Quality: " + game.quality);
    drawStatLine();
    drawStatLine("Units: " + game.units.length);
    drawStatLine("Level: " + game.level.toFixed(3));
    drawStatLine();
    drawStatLine("Particles: " + game.particles.length);
    drawStatLine();
    if (game.recording) {
      drawStatLine("Recording: " + game.recording.duration().toFixed(1) + " s");
    }
    if (game.replaying) {
      drawStatLine("Replaying: " + game.replaying.currentlyPlaying().toFixed(1) + "/" + game.replaying.duration().toFixed(1) + " s");
    }
    if (game.debugGraph) {
      const graphWidth = view.width / 3;
      const graphHeight = 100;
      const path2D = new Path2D();
      const path2D2 = new Path2D();
      const path2D3 = new Path2D();
      const path2D4 = new Path2D();
      path2D4.moveTo(0, 0);
      let maxFrameTime = 16.67;
      game.metrics.forEach((metric: Metric) => {
        maxFrameTime = Math.max(maxFrameTime, metric.frameTime);
      });
      maxFrameTime *= 1.1;
      const xStep = graphWidth / (MAX_METRICS_SAMPLES - 1);
      const yScale = graphHeight / maxFrameTime;
      context.save();
      context.translate((view.width - graphWidth) / 2, graphHeight);
      context.fillStyle = "#00000033";
      context.fillRect(0, -graphHeight, graphWidth, graphHeight);
      game.metrics.forEach((metric: Metric, index: number) => {
        path2D.lineTo(xStep * index, -metric.updateTime * yScale);
        path2D2.lineTo(xStep * index, -metric.renderTime * yScale);
        path2D4.lineTo(xStep * index, -(metric.updateTime + metric.renderTime) * yScale);
        path2D3.lineTo(xStep * index, -metric.frameTime * yScale);
      });
      path2D4.lineTo(xStep * (game.metrics.length - 1), 0);
      context.lineWidth = 1;
      const targetFrameTimeY = yScale * 16.67;
      context.strokeStyle = "red";
      context.beginPath();
      context.moveTo(0, -targetFrameTimeY);
      context.lineTo(graphWidth, -targetFrameTimeY);
      context.stroke();
      context.fillStyle = "#ffff00a0";
      context.fill(path2D4);
      context.strokeStyle = "#990099cc";
      context.stroke(path2D);
      context.strokeStyle = "#009900cc";
      context.stroke(path2D2);
      context.strokeStyle = "#0000ffcc";
      context.stroke(path2D3);
      context.lineWidth = 0.5;
      game.metrics.forEach((metric: Metric, index: number) => {
        const {
          returns,
          kills
        } = metric.events;
        if (returns || kills) {
          if (kills) {
            context.strokeStyle = "#99000040";
          } else {
            context.strokeStyle = "#00000040";
          }
          context.beginPath();
          context.moveTo(xStep * index, 0);
          context.lineTo(xStep * index, -graphHeight);
          context.stroke();
        }
      });
      context.restore();
    }
  }
  interface LanguageStrings {
    yourScore: string;
    bestScore: string;
    newText: string;
    timePlayed: string;
    playersKilled: string;
    playAgain: string;
    menu: string;
    messages: string[];
    nosupport: string;
    btnPlay: string;
    placeholderText: string;
    defaultPlayerName: string;
    bestTxt: string;
    killText: string;
    btnContinue: string;
    extraLife: string;
    btnSelect: string;
  }
  interface Language {
    name: string;
    lng: LanguageStrings;
  }
  var russianLanguage: Language = {
    name: "ru",
    lng: {
      yourScore: "ВАШ РЕЗУЛЬТАТ",
      bestScore: "ЛУЧШИЙ РЕЗУЛЬТАТ",
      newText: "НОВЫЙ",
      timePlayed: "ДЛИТЕЛЬНОСТЬ",
      playersKilled: "УБИТО",
      playAgain: "ИГРАТЬ СНОВА",
      menu: "МЕНЮ",
      messages: ["Не знаете как играть?", "Коснитесь экрана для управления", "Пересекайте хвосты противников и не позволяйте им пересечь свой!", "Захватите всю карту"],
      nosupport: "Игра не поддерживается на вашем браузере",
      btnPlay: "ИГРАТЬ",
      placeholderText: "Ваше имя",
      defaultPlayerName: "Игрок",
      bestTxt: "ЛУЧШИЙ",
      killText: "Убит",
      btnContinue: "ПРОДОЛЖИТЬ",
      extraLife: "ДОПОЛНИТЕЛЬНАЯ ЖИЗНЬ!",
      btnSelect: "ВЫБРАТЬ"
    }
  };
  interface GameResults {
    newBest: boolean;
    score: number;
    time: number;
    kills: number;
  }
  interface GameApi {
    create: (view: HTMLCanvasElement) => void;
    preparing: boolean;
    prepare: (onPrepared?: () => void) => void;
    start: (playerName?: string, skinName?: string, bestScore?: number, onGameOver?: (results: GameResults) => void, extraLives?: number) => void;
    game: Game;
    startGame?: () => void;
  }
  const createGameApi = (config: Config, language: Language, createSkinManager: (config: Config, view: HTMLCanvasElement) => GameSkinManager, namePool: NamePool, schemeCycler: SchemeCycler, achievementStore: AchievementStore): GameApi | null => {
    let gameApi = {} as GameApi;
    if (Path2D) {
      gameApi.create = (view: HTMLCanvasElement) => {
        const {
          arenaSize,
          quadSize,
          borderPoints
        } = config;
        const spatialGrid2 = new SpatialGrid(arenaSize, arenaSize, quadSize);
        Vector.space = spatialGrid2;
        const vector = new Vector(arenaSize / 2, arenaSize / 2);
        const radius = Math.min(vector.x, vector.y) * 0.95;
        const border = Border.circular(vector, borderPoints, radius);
        const skinManager = createSkinManager(config, view);
        const game = new Game(config, view, spatialGrid2, border, skinManager, null, namePool, new Controller(view, new KeyboardModeSwitch()), language.lng, schemeCycler, achievementStore, Math.random());
        skinManager.game = game;
        game.renderer = renderGame;
        gameApi.game = game;
        game.controller.addSet([16, 18, 81, 66, 77], () => {
          game.debug = !game.debug;
        });
        game.controller.addButton(71, () => {
          game.debugGraph = !game.debugGraph;
        });
      };
      gameApi.preparing = true;
      let i2 = 0;
      let prepareIntervalId: number | undefined;
      const runPrepareBatch = () => {
        const {
          prepareMult
        } = config;
        let {
          prepareBatchCount
        } = config;
        while (prepareBatchCount--) {
          gameApi.game.update(1000 / 60 * prepareMult + Math.random());
          i2++;
        }
      };
      gameApi.prepare = (onPrepared?: () => void) => {
        const {
          game: gameApi2
        } = gameApi;
        prepareIntervalId = setInterval(() => {
          if (namePool.aviable()) {
            runPrepareBatch();
            if (i2 > config.prepareCounter) {
              clearInterval(prepareIntervalId);
              gameApi.preparing = false;
              gameApi2.visible = true;
              if (!gameApi2.looped) {
                gameApi2.loop();
              }
              if (onPrepared) {
                onPrepared();
              }
            }
          }
        }, 0);
      };
      gameApi.start = (playerName?: string, skinName?: string, bestScore?: number, onGameOver?: (results: GameResults) => void, extraLives?: number) => {
        const game = gameApi.game;
        if (gameApi.preparing) {
          clearInterval(prepareIntervalId);
          const startTime = now();
          while (i2 < config.prepareCounter) {
            runPrepareBatch();
            if (now() - startTime > config.maxPreparingTime) {
              break;
            }
          }
        }
        game.best = bestScore ?? null;
        game.spawnPlayer(playerName, skinName, extraLives);
        if (extraLives) {
          ensureNonNullable(game.player).addLabel({
            text: russianLanguage.lng.extraLife,
            time: 5000,
            color: "#7fed4c"
          });
        }
        if (onGameOver) {
          game.gameOverCallback = onGameOver;
        }
        gameApi.preparing = false;
        game.visible = true;
        if (!game.looped) {
          game.loop();
        }
        window.focus();
      };
      return gameApi;
    } else {
      return null;
    }
  };
  type Dispatch<T> = (action: T | ((prevState: T) => T)) => void;
  // Declaration-merged onto the core `Component` (rather than kept as a
  // parallel `PreactComponent` type): the bundled preact/hooks addon patches
  // the shared `preactOptions` object and touches the same live
  // component/vnode instances the core reconciler already types, so both
  // sides need to agree on one shape.

  interface LanguagesData {
    [languageCode: string]: Partial<LanguageStrings>;
  }
  var assign3 = Object.assign;
  const list3: Language[] = [];
  const buildLanguageList = (languagesData: LanguagesData) => {
    const {
      en
    } = languagesData;
    Object.entries(languagesData).forEach(([languageName, languageStrings]) => {
      list3.push({
        name: languageName,
        lng: assign3(assign3({}, en), languageStrings) as LanguageStrings
      });
    });
  };
  const browserLanguageCode = (navigator.languages && navigator.languages.length && navigator.languages[0] || navigator.userLanguage || navigator.language || navigator.browserLanguage || "en").substr(0, 2).toLowerCase();
  const findDefaultLanguage = (): Language | undefined => list3.find((language: Language) => language.name === browserLanguageCode) || list3.find((language: Language) => language.name === "en");
  type Ref<T> = {
    current: T;
  };
  interface SkinColors {
    main: string;
    back: string;
    nick: string;
    plate: string;
    particles: ParticleColor[];
  }
  interface SkinSource {
    name: string;
    colors?: Partial<SkinColors>;
    pattern?: PatternSource;
    avatar?: AvatarDescriptor;
  }
  const LanguageContext = createContext<Language | undefined>(undefined);
  const Tips = ({
    messages
  }: {
    messages: string[];
  }) => {
    const [tipIndex, setTipIndex] = useState(0);
    useEffect(() => {
      const intervalId = setInterval(() => setTipIndex((previousIndex: number) => (previousIndex + 1) % messages.length), 3000);
      return () => clearInterval(intervalId);
    }, []);
    return createElement("div", {
      class: "tips"
    }, createElement("div", {
      class: "tip",
      key: tipIndex
    }, messages[tipIndex]));
  };
  const ConfigForm = ({
    config,
    apply
  }: {
    config: Config | null | undefined;
    apply: (event: Event) => void;
  }) => {
    if (!config) {
      return null;
    }
    return createElement("form", {
      class: "config",
      onSubmit: apply
    }, Object.entries(config).map(([configKey, configValue]) => createElement("label", {
      style: "color: white;"
    }, configKey, "\xA0", createElement("input", {
      type: "text",
      id: configKey,
      name: configKey,
      value: String(configValue),
      autocomplete: "off",
      maxlength: "10"
    }))), createElement("button", {
      id: "apply",
      name: "apply",
      class: "yellow"
    }, "Применить"));
  };
  const ConfigScreen = ({
    api,
    view,
    setPreparing,
    setState
  }: {
    api: GameApi | null;
    view: Ref<HTMLCanvasElement | null>;
    setPreparing: Dispatch<boolean>;
    setState: Dispatch<string>;
  }) => {
    const config = api && api.game && api.game.config;
    const applyConfig = (event: Event) => {
      event.preventDefault();
      assertNonNullable(api);
      assertNonNullable(config);
      Object.keys(config).forEach((configKey: string) => {
        const element = document.getElementById(configKey);
        if (element) {
          const parsedValue = parseFloat(element.value);
          config[configKey] = parsedValue !== parsedValue ? element.value : parsedValue;
        }
      });
      api.game.stopped = true;
      api.create(ensureNonNullable(view.current));
      setPreparing(true);
      api.prepare(() => setPreparing(false));
      setState("menu");
    };
    return createElement("div", {
      class: "uibox"
    }, createElement("div", {
      class: "logo"
    }, createElement("img", {
      src: "assets/images/logo.png"
    })), createElement(ConfigForm, {
      config: config,
      apply: applyConfig
    }));
  };
  const LanguageFooter = ({
    setLanguage
  }: {
    setLanguage: Dispatch<Language | undefined>;
  }) => {
    const currentLanguage = useContext(LanguageContext);
    const languageItems = list3.map((language: Language, index: number) => createElement("li", {
      class: language === currentLanguage ? "active" : "",
      onClick: () => setLanguage(list3[index])
    }, language.name.toUpperCase()));
    return createElement("div", {
      id: "footer"
    }, createElement("ul", {
      id: "lng"
    }, languageItems));
  };
  const MenuScreen = ({
    nickName,
    setNickName,
    start,
    route,
    api,
    skin
  }: {
    nickName: string;
    setNickName: Dispatch<string>;
    playable: boolean;
    preparing: boolean;
    start: () => void;
    route: Dispatch<string>;
    provider?: undefined;
    setLanguage: Dispatch<Language | undefined>;
    api: GameApi | null;
    skin: string;
  }) => {
    const {
      lng
    } = ensureNonNullable(useContext(LanguageContext));
    const isSupported = !!api;
    const handleNickNameInput = (event: Event) => setNickName((event.target as HTMLInputElement).value);
    const canPlay = isSupported;
    const handlePlay = (event: Event) => {
      event.preventDefault();
      if (canPlay) {
        start();
      }
    };
    useEffect(() => {
      if (window.ads && window.ads.showAds) {
        window.ads.showAds();
      }
    }, []);
    return createElement(Fragment, null, createElement("div", {
      id: "left_side"
    }), createElement("div", {
      class: "uibox"
    }, createElement("div", {
      class: "logo"
    }, createElement("img", {
      src: "assets/images/logo.png"
    })), createElement(Tips, {
      messages: lng.messages
    }), createElement("div", {
      class: "play"
    }, createElement("input", {
      type: "text",
      id: "nick",
      name: "nick",
      value: nickName,
      autocomplete: "off",
      placeholder: lng.placeholderText,
      maxlength: "12",
      oninput: handleNickNameInput
    }), createElement("button", {
      id: "play",
      name: "play",
      class: "yellow" + (canPlay ? "" : " disabled"),
      onClick: handlePlay
    }, lng.btnPlay), createElement("button", {
      id: "skins",
      name: "skins",
      class: "orange noPadding",
      onClick: () => route("skins")
    }, createElement("img", {
      width: "30",
      height: "30",
      src: "assets/skins/select/" + (skin || "noskin").toLowerCase().replace(/\s+/g, "") + ".png"
    }))), !isSupported && createElement("p", {
      class: "notsupported"
    }, lng.nosupport)), createElement("div", {
      id: "right_side"
    }));
  };
  const GameScreen = ({
    nickName,
    bestScore,
    setBestScore,
    setResults,
    setPreparing,
    api,
    route,
    skin,
    lastPercent
  }: {
    nickName: string;
    bestScore: number;
    setBestScore: Dispatch<number>;
    setResults: Dispatch<GameResults | null>;
    setPreparing: Dispatch<boolean>;
    api: GameApi | null;
    route: Dispatch<string>;
    skin: string;
    lastPercent?: number;
  }) => {
    useEffect(() => {
      const handleGameOver = (results: GameResults) => {
        if (results.newBest) {
          setBestScore(results.score);
        }
        setResults(results);
        route("results");
      };
      if (window.ads && window.ads.hideAds) {
        window.ads.hideAds();
      }
      ensureNonNullable(api).game.language = ensureNonNullable(useContext(LanguageContext)).lng;
      let skin2 = skin;
      if (skin2 === "default" || skin2 === "No skin") {
        skin2 = "";
      }
      ensureNonNullable(api).start(nickName, skin2, bestScore, handleGameOver, lastPercent);
      const {
        dataLayer
      } = window;
      if (dataLayer) {
        dataLayer.push({
          event: "levelStart",
          publisher: "CONNECT2MEDIA",
          productKey: "paper2IO"
        });
      }
      setPreparing(false);
    }, []);
    return null;
  };
  const ResultsScreen = ({
    bestScore,
    results,
    route
  }: {
    bestScore: number;
    results: GameResults;
    start: () => void;
    route: Dispatch<string>;
    provider?: undefined;
    country?: undefined;
  }) => {
    const goToMenu = () => route("menu");
    const {
      lng
    } = ensureNonNullable(useContext(LanguageContext));
    const {
      dataLayer
    } = window;
    if (dataLayer) {
      dataLayer.push({
        event: "levelCompletion",
        publisher: "CONNECT2MEDIA",
        productKey: "paper2IO"
      });
    }
    useEffect(() => {
      if (window.ads && window.ads.showAds) {
        window.ads.showAds();
      }
    }, []);
    return createElement(Fragment, null, createElement("div", {
      id: "left_side"
    }), createElement("div", {
      class: "uibox"
    }, createElement("div", {
      class: "logo"
    }, createElement("img", {
      src: "assets/images/logo.png"
    })), createElement("div", {
      class: "nav"
    }, createElement("button", {
      class: "yellow slider-5",
      id: "menu",
      onClick: goToMenu
    }, lng.btnContinue)), createElement("div", {
      class: "resultbox"
    }, createElement("div", {
      class: "results"
    }, createElement("div", {
      class: "left"
    }, createElement("div", {
      class: "slider-1"
    }, lng.yourScore, ":"), createElement("div", {
      class: "slider-2"
    }, results.newBest && createElement("span", {
      class: "newScore"
    }, lng.newText, " "), lng.bestScore, ":"), createElement("div", {
      class: "slider-3"
    }, lng.timePlayed, ":"), createElement("div", {
      class: "slider-4"
    }, lng.playersKilled, ":")), createElement("div", {
      class: "right"
    }, createElement("div", {
      class: "slider-1"
    }, results.score.toFixed(2) + "%"), createElement("div", {
      class: "slider-2"
    }, bestScore.toFixed(2) + "%"), createElement("div", {
      class: "slider-3"
    }, new Date(results.time).toISOString().slice(14, -5)), createElement("div", {
      class: "slider-4"
    }, results.kills)))), createElement("div", {
      id: "yandex_rtb"
    })), createElement("div", {
      id: "right_side"
    }));
  };
  const SkinPreview = ({
    name
  }: {
    name: string;
  }) => {
    return createElement("div", {
      class: "skin"
    }, createElement("div", {
      class: "skin-view"
    }, createElement("h3", null, name), createElement("img", {
      src: "assets/skins/select/" + name.toLowerCase().replace(/\s+/g, "") + ".png"
    })));
  };
  const SkinCarousel = ({
    skins,
    skin,
    menu,
    setSkin
  }: {
    skins: SkinSource[];
    skin: string;
    menu: () => void;
    setSkin: Dispatch<string>;
  }) => {
    const {
      lng
    } = ensureNonNullable(useContext(LanguageContext));
    const currentSkinIndex = skins.findIndex((skinSource: SkinSource) => skinSource.name === skin);
    const [skinIndex, setSkinIndex] = useState(currentSkinIndex > 0 ? currentSkinIndex : 0);
    const selectSkin = (index: number) => {
      if (index >= 0 && index < skins.length) {
        setSkinIndex(index);
        setSkin(ensureNonNullable(skins[index]).name);
      }
    };
    return createElement("div", {
      class: "skinbox"
    }, createElement("div", {
      class: "skins-container"
    }, createElement("button", {
      name: "left",
      class: "orange",
      onClick: () => selectSkin(skinIndex - 1)
    }, "<"), createElement(SkinPreview, {
      name: ensureNonNullable(skins[skinIndex]).name
    }), createElement("button", {
      name: "right",
      class: "orange",
      onClick: () => selectSkin(skinIndex + 1)
    }, ">")), createElement("div", {
      class: "nav"
    }, createElement("button", {
      class: "green",
      onClick: menu
    }, lng.btnSelect)));
  };
  const SkinsScreen = ({
    skins,
    skin,
    route,
    setSkin
  }: {
    skins: SkinSource[];
    skin: string;
    route: Dispatch<string>;
    setSkin: Dispatch<string>;
  }) => {
    const goToMenu = () => route("menu");
    useEffect(() => {
      const element = document.getElementById("paperio-site_multisize");
      if (element) {
        element.style.display = "none";
      }
    }, []);
    return createElement(Fragment, null, createElement("div", {
      id: "left_side"
    }), createElement("div", {
      class: "uibox"
    }, createElement("div", {
      class: "logo"
    }, createElement("img", {
      src: "assets/images/logo.png"
    })), createElement(SkinCarousel, {
      skins: [{
        name: "No skin"
      }].concat(skins),
      menu: goToMenu,
      setSkin: setSkin,
      skin: skin
    })), createElement("div", {
      id: "right_side"
    }));
  };
  interface StoredGameData {
    nickName?: string;
    bestScore?: number;
    skin?: string;
  }
  interface StorageApi {
    getJSON: (key: string) => StoredGameData | null;
    set: (key: string, value: StoredGameData, options: {
      expires: number;
    }) => void;
  }
  const App = ({
    api,
    storage,
    provider,
    skins
  }: {
    api: GameApi | null;
    storage: StorageApi;
    ads?: undefined;
    provider?: undefined;
    skins: SkinSource[];
    mode?: string;
  }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [playable, setPlayable] = useState(false);
    const [route, setRoute] = useState("menu");
    const [preparing, setPreparing] = useState(true);
    const [language, setLanguage] = useState(findDefaultLanguage());
    const [results, setResults] = useState<GameResults | null>(null);
    const storageKey = "paper.io.storage";
    const storedData = storage.getJSON(storageKey) || {};
    const [nickName, setNickName] = useState(storedData.nickName || "");
    const [bestScore, setBestScore] = useState(storedData.bestScore || 0);
    const [skin, setSkin] = useState(storedData.skin || "");
    const storageOptions = {
      expires: 365
    };
    if (nickName !== storedData.nickName || bestScore !== storedData.bestScore || skin !== storedData.skin) {
      storage.set(storageKey, {
        nickName: nickName,
        bestScore: bestScore,
        skin: skin
      }, storageOptions);
    }
    useEffect(() => {
      if (api) {
        api.create(ensureNonNullable(canvasRef.current));
        api.prepare(() => setPreparing(false));
        setPlayable(true);
      }
    }, []);
    ensureNonNullable(api).startGame = () => {
      const element = document.getElementById("overlay");
      if (element) {
        element.style.display = "none";
      }
      if (api && api.game) {
        api.game.visible = true;
      }
      setRoute("game");
    };
    const start = () => {
      const element = document.getElementById("overlay");
      if (element) {
        element.style.display = "block";
        element.style.animation = "fadein 500ms";
      }
      if (api && api.game) {
        api.game.visible = false;
      }
      ensureNonNullable(window.ShowPreroll)();
    };
    const setCanvasRef = (element: EventTarget | null) => {
      canvasRef.current = element instanceof HTMLCanvasElement ? element : null;
    };
    return createElement(Fragment, null, createElement("canvas", {
      class: route === "game" || preparing ? "" : "fadein",
      id: "view",
      ref: setCanvasRef
    }), route !== "game" && createElement("div", {
      id: "ui_overlay"
    }), createElement(LanguageContext.Provider, {
      value: language,
      children: [createElement("div", {
      id: "ui",
      class: route === "game" ? "hide" : ""
    }, route === "menu" && createElement(MenuScreen, {
      nickName: nickName,
      setNickName: setNickName,
      playable: playable,
      preparing: preparing,
      start: start,
      route: setRoute,
      provider: provider,
      setLanguage: setLanguage,
      api: api,
      setState: setRoute,
      skins: skins,
      skin: skin
    }), route === "game" && createElement(GameScreen, {
      nickName: nickName,
      bestScore: bestScore,
      setBestScore: setBestScore,
      setResults: setResults,
      setPreparing: setPreparing,
      api: api,
      route: setRoute,
      skin: skin
    }), route === "results" && createElement(ResultsScreen, {
      bestScore: bestScore,
      results: ensureNonNullable(results),
      start: start,
      route: setRoute,
      provider: provider
    }), route === "config" && createElement(ConfigScreen, {
      api: api,
      view: canvasRef,
      setPreparing: setPreparing,
      setState: setRoute
    }), route === "skins" && createElement(SkinsScreen, {
      skins: skins,
      skin: skin,
      route: setRoute,
      setSkin: setSkin
    })), route !== "game" && createElement(LanguageFooter, {
      setLanguage: setLanguage
    })]}), createElement("div", {
      id: "overlay"
    }));
  };
  let defaultConfig = {
    arenaSize: 2000,
    quadSize: 20,
    borderPoints: 300,
    prepareMult: 3,
    prepareBatchCount: 5,
    maxPreparingTime: 500,
    baseRadius: 30,
    baseCount: 50,
    minScale: 3,
    maxScale: 4.5,
    observerScale: 2.5,
    trackWidth: 8,
    unitSpeed: 90,
    spawnTimeout: 3000,
    prepareCounter: 6000,
    prepareAcceleration: 30,
    baseHeight: 2,
    botsCount: 15,
    botLevel: -1,
    startBotLevel: 0.1,
    noPlayerBotLevel: 0.5,
    nearPlayerBotSpawnCount: 1,
    followKiller: true,
    selfKillDelay: 1000,
    enemyKillDelay: 2000,
    arenaColor: "#e7fff4",
    borderColor: "#88a799",
    backgroundTopColor: "#2d6998",
    backgroundBottomColor: "#81faff",
    platesStrokeWidth: 0,
    botAggroMin: 0.2,
    botAggroMax: 1,
    botDefMin: 1.2,
    botDefMax: 0.6,
    botGreedMin: 0.1,
    botGreedMax: 0.6,
    botSafetyMin: 0.5,
    botSafetyMax: 1,
    botAttackTrackLength: 1500,
    font: "PT Sans Caption"
  };
  var COLOR_PALETTE: string[] = ["#3b5998", "#8b9dc3", "#2a4d69", "#4b86b4", "#8dbdff", "#64a1f4", "#3b7dd8", "#843b62", "#8874a3", "#8d5524", "#c68642", "#f1c27d", "#f77f00", "#fcbf49", "#ffe066", "#65737e", "#a7adba", "#4a7c59", "#1a936f", "#88d498", "#2a9d8f", "#68b0ab", "#99e550", "#6abe30", "#4b692f", "#8f974a", "#8a6f30", "#524b24", "#d62828", "#fe4a49", "#ed6a5a", "#ff3377", "#ff77aa", "#ff99cc", "#b23a48", "#fcb9b2"];
  var assign4 = Object.assign;
  interface AssetContent {
    colors?: SkinColors;
    pattern?: PatternAsset;
    display?: Avatar;
    color?: string;
    roundedFlag?: HTMLCanvasElement | HTMLImageElement;
  }
  class Skin {
    assets: Asset[];
    colors: SkinColors;
    config: Config | undefined;
    container: DisplayList;
    name: string | undefined;
    pattern: PatternAsset | null;
    user: Unit | undefined;
    constructor() {
      this.config = undefined;
      this.user = undefined;
      this.name = undefined;
      this.assets = [];
      this.colors = {
        main: "black",
        back: "black",
        nick: "black",
        plate: "black",
        particles: ["black"]
      };
      this.pattern = null;
      this.container = new DisplayList();
    }
    addAsset(asset: Asset) {
      if (asset.content.colors) {
        this.colors = asset.content.colors;
      }
      if (asset.content.pattern) {
        this.pattern = asset.content.pattern;
      }
      if (asset.content.display) {
        this.container.add(asset.content.display);
      }
      this.assets.push(asset);
    }
    removeAsset(asset: Asset) {
      if (asset.content.display) {
        this.container.remove(asset.content.display);
      }
      const index = this.assets.indexOf(asset);
      if (index !== -1) {
        this.assets.splice(index, 1);
      }
    }
  }
  // `pool` is added via declaration merge rather than a class field: the base
  // never sets it (each concrete subclass assigns its own narrower pool in its
  // constructor), so an interface member keeps the type non-null for every
  // reader without a class-field initializer that strict init would reject.
  interface Asset {
    pool: AssetSet;
  }
  class Asset {
    content: AssetContent;
    loadingStarted: boolean;
    name: string;
    ready: boolean;
    constructor(name: string) {
      this.loadingStarted = false;
      this.name = name;
      this.content = {};
      this.ready = false;
    }
    load(): void {}
  }
  class SvgAsset extends Asset {
    override pool: ImageAssetSet;
    source: SkinColors;
    constructor(pool: ImageAssetSet, name: string, source: SkinColors) {
      super(name);
      this.pool = pool;
      this.source = source;
    }
  }
  class ImageAsset extends Asset {
    override pool: SvgAssetSet;
    source: SkinSource;
    constructor(pool: SvgAssetSet, name: string, source: SkinSource) {
      super(name);
      this.pool = pool;
      this.source = source;
    }
    override load(): void {
      if (this.loadingStarted) {
        return;
      }
      this.loadingStarted = true;
      const updateReady = () => {
        this.ready = !!this.content.display && this.content.display.ready && (this.content.pattern ? this.content.pattern.ready : true);
      };
      const {
        source
      } = this;
      if (source.colors) {
        this.content.colors = assign4({
          main: "#000000",
          back: "#000000",
          nick: "#000000",
          plate: "#000000",
          particles: ["#000000"]
        }, source.colors);
      }
      if (source.pattern) {
        this.content.pattern = new PatternAsset(ensureNonNullable(this.pool.config), this.pool.view, this.pool.path, source.pattern, updateReady);
      }
      if (source.avatar) {
        this.content.display = new Avatar(ensureNonNullable(this.pool.config), this.pool.path, source.avatar, updateReady);
      }
    }
  }
  class AssetSet {
    assets: Asset[];
    config: Config | undefined;
    name: string;
    constructor(name: string) {
      this.config = undefined;
      this.name = name;
      this.assets = [];
    }
    get(name?: string, requireReady?: boolean): Asset | null {
      let asset;
      asset = this.assets.find((asset: Asset) => asset.name === name && (requireReady ? asset.ready === true : true));
      if (!asset) {
        return null;
      }
      asset.load();
      return asset;
    }
  }
  class ImageAssetSet extends AssetSet {
    constructor(config: Config) {
      super("colors");
      this.config = config;
      this.add(COLOR_PALETTE);
    }
    add(colors: string[]) {
      const {
        config
      } = this;
      this.assets.push(...(colors || []).map((color: string) => {
        const rgb = hexToRgb(color);
        const hsv = rgbToHsv(rgb);
        const backHsv = scaleValue(hsv, 0.75);
        const back = hsvToHex(backHsv);
        const nickHsv = scaleValue(hsv, 0.5);
        const nick = hsvToHex(nickHsv);
        const darkPlateHsv = brighten(hsv, 2);
        const darkPlate = hsvToHex(darkPlateHsv);
        const colors = {
          main: color,
          back: back,
          nick: nick,
          plate: hsv.v > 50 ? nick : darkPlate,
          particles: [hsvToHex(setValue(hsv, 100)), hsvToHex(setValue(hsv, 90)), hsvToHex(setValue(hsv, 80)), hsvToHex(setValue(hsv, 70)), hsvToHex(setValue(hsv, 60)), hsvToHex(setValue(hsv, 50)), hsvToHex(setValue(hsv, 40)), hsvToHex(setValue(hsv, 30)), hsvToHex(setValue(hsv, 20))]
        };
        const svgAsset = new SvgAsset(this, color, colors);
        svgAsset.content.colors = colors;
        if (config) {
          svgAsset.content.display = new Avatar(config, "", {
            layers: [{
              src: createColorTile(colors.nick, colors.nick)
            }, {
              level: 1,
              src: createColorTile(colors.main, colors.back)
            }]
          });
        }
        svgAsset.ready = true;
        svgAsset.name = color;
        return svgAsset;
      }));
    }
    loadAsset<T>(asset: T): T {
      return asset;
    }
  }
  class SvgAssetSet extends AssetSet {
    path: string;
    view: HTMLCanvasElement;
    constructor(config: Config, canvas: HTMLCanvasElement, path: string, sources: SkinSource[], shouldPreload: boolean = false) {
      super("classic");
      this.config = config;
      this.view = canvas;
      this.path = path;
      this.add(sources);
      if (shouldPreload) {
        for (let asset of this.assets) {
          asset.load();
        }
      }
    }
    add(sources: SkinSource[]) {
      this.assets.push(...(sources || []).map((source: SkinSource) => new ImageAsset(this, source.name, source)));
    }
  }
  function createColorTile(mainColor: string, backColor: string): HTMLCanvasElement {
    const element = document.createElement("canvas");
    element.width = 100;
    element.height = 100;
    const context = element.getContext("2d");
    assertNonNullable(context);
    context.fillStyle = backColor;
    context.fillRect(0, 0, 100, 100);
    context.fillStyle = mainColor;
    context.fillRect(10, 10, 80, 80);
    return element;
  }
  interface SkinManagerAssetEntry {
    asset: Asset;
    tag: string;
  }
  interface SkinManagerAssetMap {
    [name: string]: SkinManagerAssetEntry;
  }
  interface SkinManagerUsageMap {
    [name: string]: Skin[];
  }
  class SkinManager {
    assets: SkinManagerAssetMap;
    game?: Game;
    rng: (n?: number) => number;
    unusedAssets: SkinManagerAssetMap;
    usedBy: SkinManagerUsageMap;
    constructor(seed?: number) {
      this.usedBy = {};
      this.assets = {};
      this.unusedAssets = {};
      this.rng = createRandomGenerator(ensureNonNullable(seed));
    }
    registerAsset(asset: Asset, tag: string) {
      this.unusedAssets[asset.name] = this.assets[asset.name] = {
        asset: asset,
        tag: tag
      };
    }
    registerAssets(assetSet: AssetSet, tag: string) {
      for (let asset of assetSet.assets) {
        this.registerAsset(asset, tag);
      }
    }
    available(tag?: string): number {
      let list4 = Object.values(this.unusedAssets);
      if (tag) {
        return list4.filter((entry: SkinManagerAssetEntry) => entry.tag == tag).length;
      } else {
        return list4.length;
      }
    }
    has(name: string): boolean {
      return name in this.unusedAssets;
    }
    randomAssetName(tag?: string, unusedOnly: boolean = true): string | undefined {
      let assetMap = unusedOnly ? this.unusedAssets : this.assets;
      let list4 = Object.keys(assetMap);
      if (tag) {
        list4 = list4.filter((name: string) => ensureNonNullable(assetMap[name]).tag == tag);
      }
      let index = this.rng(list4.length);
      let name = list4[index];
      return name;
    }
    get(name?: string, tag?: string): Skin {
      if (!name) {
        name = this.randomAssetName(tag);
      }
      assertNonNullable(name);
      let asset = ensureNonNullable(this.assets[name]).asset;
      delete this.unusedAssets[name];
      asset.load();
      const skin = new Skin();
      skin.addAsset(asset);
      skin.name = name;
      this.usedBy[name] = (this.usedBy[name] || []).concat(skin);
      return skin;
    }
    release(skin: Skin) {
      const name = ensureNonNullable(skin.name);
      const remaining = ensureNonNullable(this.usedBy[name]).filter((skin: Skin) => skin != skin);
      this.usedBy[name] = remaining;
      if (remaining.length == 0) {
        delete this.usedBy[name];
        this.unusedAssets[name] = ensureNonNullable(this.assets[name]);
      }
    }
    reskin(name: string) {
      let skins = this.usedBy[name];
      if (skins) {
        for (let skin of skins) {
          ensureNonNullable(skin.user).setSkin(this.get());
        }
        delete this.usedBy[name];
      }
    }
    getCitySkin(_name?: string): Skin | undefined {
      return undefined;
    }
  }
  class GameSkinManager extends SkinManager {
    constructor(imageAssetSet: ImageAssetSet, svgAssetSet: SvgAssetSet, seed?: number) {
      super(seed);
      this.registerAssets(imageAssetSet, "colored");
      this.registerAssets(svgAssetSet, "classic");
    }
    override getPlayerSkin(name?: string): Skin {
      if (!name) {
        return this.get(undefined, "colored");
      }
      this.reskin(name);
      return this.get(name);
    }
    getBotSkin(): Skin {
      let tagOrder = this.rng() < 0.25 ? ["colored", "classic"] : ["classic", "colored"];
      let name = this.randomAssetName(tagOrder[0], true) || this.randomAssetName(tagOrder[1]);
      return this.get(name);
    }
  }
  const BOT_NAMES_TEXT = "DeadMorose\nold_demon\nfox\nDeFreeZe\nGoSeek\nKeyplex\nDarkfury\nFunnyway\nBLACK_PRINCE\n[BigBoss]ShadiBoo\nDizzer\nKARATEL\nHowlux\nLight_Soul\n2fab4u\nBoOT\nMrKat2017\nSkulL\nCmeTano4Ka\nflash\nh1me3ra\nHoward\ni_Pro\nred_devil\nbest_of_the_best\nblow_crazy \nface_of_vengeance\nGlambit \nMASTER_GRIF\nMr.ByBlIk\nn1ce_DayZ\nRantom\nAbove Daemons\ncompany_THE_Best\nDanie\ndarklight\nDaxmaut\ndiablo\ngreat_man\nkiller_innothing\nNix\nValett\nDarkAngelKael\nduelist\ni_zadrot\nMonster_Energy\nMr.Winston\nRaindrops\nSumerbraum\nTermit\nTITAN\nWOOOlf\nAVSTRAL\nBadLike\nBuri\ncop_zombie\ndestroyer_for_us\nEKEN\nEksnet\nFrostorik\nghost_of_fear\nHotzarzim\nj111m\nKael\nKikET\n4CHAN\nPIKABU\n9GAG\naustralia\naustria\nayylmao\nbait\nbangladesh\nbelgium\nbosnia\nbotswana\nbrazil\nbulgaria\ncambodia\ncanada\nchile\nchina\ncia\nconfederate\ncroatia\ndenmark\nea\nearth\nestonia\neuropeanunion\nfacepunch\nfeminism\nfinland\nfrance\ngermanempire\ngermany\ngreece\nhongkong\nhungary\nindia\nindiana\nindonesia\niran\niraq\nireland\nitaly\njamaica\njapan\nkc\nlatvia\nlithuania\nluxembourg\nmaldivas\nmatriarchy\nmexico\nmoon\nnazi\nnetherlands\nnigeria\nnorthkorea\nnorway\norigin\npakistan\npatriarchy\nperu\npewdiepie\npiccolo\npoland\nportugal\nprodota\nqingdynasty\nquebec\nreddit\nrussia\nsanik\nsatanist\nsealand\nsouthkorea\nspain\nstalin\nsteam\nsweden\nswitzerland\ntaiwan\ntexas\nthailand\ntsaristrussia\ntumblr\nukraine\nunitedkingdom\nusa\nussr\nvinesauce\nyaranaika\ntumblr\nhongkong\nKillerGamer\nLimuzin\nmage\nMCGaMeR\nMr_Het\nNadornsMonsters\nnero\noutcaster\nSteepCat\nTUCA\nurban_hunter\nvirtual_lord\nwertyi\nWinstonLight\nWoJDoo\nArtemad\nClydeKautz\nBarney\nRhodaPing\nSharlaPropes\nNanciTyner\nIlaWorm\nSebastianRawlinson\nCraigFlury\nEstebanBrehm\nDeberaVancuren\nTabithaOlivieri\nTrishaKimball\nMilagrosHyler\nCinderellaGerson\nFranBaldridge\nMelisaBrock\nGaynelleSimmonds\nEttaMirabella\nLaveraLabrecque\nBudNormand\nEliasSherwood\nJackpot\nSensation\nChuck\nSoots\nTheSaint\nICEman\nMiracleSnoopy\nBahartet\nBiotary\nHammer85\nBizcarit\nBlackenta\nBurkelstrin\nBurntSeen\nChariana\ngoldfinger\nConfidentHelp\nCopiconc\nDemocoman\nGaartely\nGenantro\nGlitzMcGenius\nJuliatu\nKalstaxi\nKeymatr\nKredicon\nLuvGurly\nMasteranca\nMediaBolt\nMeemuset\nMonsterInformer\nOccuiffu\nOnnitall\nRodeonevedo\nSandBlondeFully\nShipnease\nSlypectle\nSpinfonexu\nAdocarli\nAnglosi\nSimba\nAuetonbr\nBanshfeli\nQWERT\nBezequaci\nBizarrebobw\nBizarrewo\nBlenetra\nBootXboxStein\nBradleyFinest\nCeticRaven\nChunkyKlug\nDailiesHigh\nDravencybe\nFarerSaiyan\nGabring\nHalcytech\nHeminepe\nHeraldhama\nImagene\nLolandexte\nLucebayn\nMatroner\nMediumbben\nMofficanki\nNateinvelo\nTIMBERLAKE\nNessDiddy\nPlatinumTrippin\ntheviking\nPlusedge\nRaetstalyda\nJustinStromberg\nRebecaSenn\nRoxy\nNeil\nMaria\nWarren\nGrace\nWilliam\nJane\nVanessa\nLisa\nStephanie\nDidi\nBoris\nRuth\nLeonard\nJack\nCaroline\nSebastian\nConnor\nIan\nTOMAS\nSue\nFOX\nDylan\nLisa\nGrace\nJabbaDabba\nJennifer\nBenjamin\nPiPPa\nSteven\nJoe\nKNine\nKevin\nCaroline\nMcFlurry\nKatherine\nLeah\nIrene\nOwen\nUna\nGabrielleSlater\nAmyFisher\nAngelaGrant\nAlisonOgden\nDeadshot\nNitro\nTrevorBlack\nKatherinePullman\nOliverMacDonald\nAvaVaughan\nJenniferWhite\nWarrenPeters\nLeahCameron\nAlisonBerry\nKeithBuckland\nJulianMackay\nNatalieSanderson\nviZion\nJoshuaPeake\nKeithDowd\nHotdog\nJamesLambert\nJanBond\nColinMarshall\nJasonRees\nFRED\nJaneHughes\nLeonardOliver\nHarryAnderson\nGraceSmith\nDeirdreJones\nAudreySpringer\nEllaGray\nDominicHamilton\nKeithBlake\nRuthJackson\nMollyHudson\nSophieBerry\nCarolineLyman\nEmmaHudson\nJoeLyman\nOliviaPiper\nChristopherAllan\nMariaKing\nPippaSlater\nSarahJohnston\nRyanWhite\nJackHill\nWilliamMackay\nBenjaminAlsop\nAmandaRoberts\nThomasParsons\nLiamMcGrath\nJanHenderson\nSoniaChapman\nWilliam\nLily\nPeter\nKeith\nIsaac\nLeah\nMadeleine\nKaren\nFrank\nAlan\nMichael\nRachel\nDominic\nPaul\nNicola\nEmily\nTim\nbigBEN\nCohen\nGood\nFrancis\nOdom\nGreen\nCain\nTrevino\nLucero\nAshley\nigloo\nduffer\nloaded\nsickness\ngreeting\nlonely\nbafflement\ntrusty\nalteration\nevil\nsolva\npenumbra\ndauphine\nalluring\nlilly\nstinchar\ncubic\nblackbrook\nrebuff\ninclined\nlyon\nsquash\nunique\nlyne\nchewy\nmasticate\nmagnet\nknit\nindolent\nsevere\nfestus\ntrain\nincisionKim\nBean\nAguilar\nErnesto\nCurtis\nCortez\nTyshawn\nBrady\nBeckett\nXavier\nCason\nBryson\nSheldon\nPierce\nDeshawn\nAndy\nAaron\nArmando\nKarson\nK9\nNadia\nJovan\nErin\nTerry\nGrayson\nCelia\nAlexzander\nCannon\nJoey\nStella\nGracie\nKFCLOVER\nChico\nPrince\nMocha\nScooter\nChester\nCoco\nDusty\nZoe\nSocks\njefferson\nignore\nalladale\nvirtue\nprovided\ncohesive\nbullfinche\ncomet\ndip\nzipper\npostulate\nlick\nbashful\npascals\nrudy\ngloaming\ncashew\nmixcloud\ntraumatic\nprostate\npeas\nmelon\nbulbous\ngavel\nnumnah\nnavel\nriver\nsaskatoon\ncaused\nhardy\npare\nfemale\nvolunteer\nspeck\nyears\nvalid\narmpit\nbobby\nbolham\ngoogle\nbrennand\npastry\nweapon\ncuillin\ndescent\neasier\nmore\nrisedale\ngoggles\ncute\nmagellanic\nrenal\nzunyi\nEveryPrivate\nChipmunkThreat\nLeafyForefoot\nSebastianExxon\nHuckFaisalabad\nWheelchairHadar\nBulimiaMilk\nEiderStallion\nMoronicBuckinghamshire\nPayBiff\nHillsboroughEnvelope\nAllianzRhapsody\nArseEnteral\nBoronRadiant\nArchiveUntrue\nPlasticSpeech\nOfficerWiltshire\nBungBuzzard\nMoscowStellar\nTrialsHearty\nModelHorse\nBootsGrimacing\nShiraMosedale\nLeopardClapper\nSkatersStars\nCaramelizeStraws\nAngolanVinomadefied\nBatterySiemens\nHedgeThompson\nLukaIcing\nMimosaBrunswick\nTinForgetful\nHumberHook\nSeagullTrump\nBookerTouring\nSugarWarn\nCustardsStructure\nRudyBarium\nElectrolyteDisfigured\nBlighterPhysicist\nAntoniadiAtom\nPachaRule\nMaltyPatches\nHonoluluSwedish\nGemGleaming\nAssociatedThose\nAfterCointreau\nEyesPierre\nStewartGels\nAretePuppy\nFullscreenTrophic\nMailWillow\nScaupFrosty\nZaraBipedal\nCheapScafell\nDevonYolk\nSkegCohesive\nCricketBashful\nCocoaPuck\nDecathlonIschemic\nOftSnottor\nCheepNewlyn\nSwimGrill\nBaubleSymbolic\nAstronomerSpam\nVarlotLealt\nSensorSquamish\nKeyTechnetium\nCrummyQuirky\nVinePlane\nWaterskiBlind\nOrdinateCrown\nSpotTense\nFumeVine\nGlasswareCherries\nPhenomenonWillied\nPappusWazzed\nFilterSpace\nHypnosisSociable\nGaffEnder\nTordaHelpless\nResearchMat\nAmpereHeptagon\nEclipseBaldy\nLliediDiopside\nRockersGatcombe\nSabineEssential\nPlutoAbsurd\nTagTestify\nForswearJosie\nEquuleusFalter\nChewieFluther\nWombYakama\nHinderHighland\nBiteSeptum\nRifleGym\nJuneauInboard\nTroubadourChillingwood\nNeogeneLecturer\nSullivanStencils\nCheesecakePit\nClumpUnhelpful\nCheckBig\nLollyPumpkin\nCitrusyCountless\nVarunaRemy\nDivergentOils\nFallingTalisker\nBlackwaterNifty\nBrinkworthFranklyn\nFreddyPostman\nClumperPoke\nSlopeTokahee\nStencilsHume\nJijiKey\nAdeptStores\nUnicodeIgneous\nMeatyNut\nMaskSpark\nForegoingMoist\nEthicalConfident\nOblongataIsraeli\nGreenAle\nFibulaJoss\nShrugMinge\nFlowsWhispers\nActiveGlissade\nExaltedSpaghetti\nMeerkatMatch\nCouldHoff\nYawnObtuse\nCrazyUnknown\nPlanemoTyler\nCalderaBeans\nSoundcloudJapan\nSeveralGalled\nStarbucksDomain\nEdibleGlazier\nResourcesCapital\nNitrogenBella\nFlavorfulProtoplanet\nTeachSqueeze\nMeiosisSiphon\nTelephoneMarl\nTrundleRitec\nTheodoreShamrock\nNoirMelody\nVanillaArmenian\nHonkExoticism\nMandibleSepsis\nVenomousSignal\nManukaEval\nLooksLeaves\nFriedInto\nBlowTalented\nStubbsHeadphones\nWigeonNewcastle\nLoadHamster\nPinkieSaint\nEuphoniumRedundant\nSabdenRoad\nSuccessApache\nPateraCitric\nBalnagownQuiver\nGambianHartford\nRidingNostalgic\nAmbushFlex\nBretonCommon\nSpot!Fine\nPlaintivePride\nDiphthongPraline\nShearraInflate\nWoldsLennon\nSordiniMeathead\nSordCegidog\nSelfiesWeigh\nOrganVile\nPinchWeixin\nSassyFlag\nAlberniDart\nBowenImmense\nRulerFocus\nMaggotMine\nRegulateInventions\nMeshAlbite\nPoxArabella\nTikiFredericton\nNeedleDiapir\nGeneBlurt\nBindyFollowed\nMongolianTurtle\nSenseProfess\nFoldingHacking\nArsonistClipping\nKerryBonnie\nMaliciousMilitary\nMountainFrivolous\nCannonCog\nCordFlapping\nSnickerIndonesian\ndome\nking\nohio\nstandard\nfustilarian\nnative\nsupply\namherst\ninitial\ntowel\npumpion\nperfect\nmouldy\nflasks\ncarina\nduchess\ncrackers\nexciting\nhole\nwiggle\ngreat\nben\npoop\notis\npolite\nslapping\notherwise\ngrilled\nwes\nsummary\nnice\nbasketball\nstarbolins\nbaby\nbooking\nrhubarb\nperson\nshooter\nbounded\nnorthamptonshire\nsyllable\ngreenish\nuptight\ntweed\nthe\nreeky\nlathered\nascension\nobtain\nnagging\nchallenger\nsecret\nworcester\nlangley\npolly\nurinal\ntrusting\nbeverley\nfrankie\ndartmoor\nmash\ngillie\nmethodist\ngalaxy\nmozart\nbarrage\nspoticus\nscheduled\neel\npanel\nflapjack\nchemist\nalbert\nmetacarpus\ndense\nbleeding\nfixation\nniggles\ncamel\nrosin\ncommunity\nleash\ndulais\nladder\nlee\nindices\nyou\neducation\ndumplings\nbid\nprince\nartiste\navocet\nburns\nbarney\nmanaged\nburritos\npeduncle\npaltry\nequator\nsubmerge\nexpected\nfags\nperl\nclueless\ncartier\nwombled\nbearded\nkalman\ntrees\npink\naddie\ntod\nusd";
  var botNames = BOT_NAMES_TEXT.split("\n");
  var assign5 = Object.assign;
  console.log("Version: A6 2020-10-14T10:51:36.392Z");
  const gameConfig = assign5(assign5({}, defaultConfig), {
    followKiller: true,
    selfKillDelay: 1000,
    enemyKillDelay: 2000
  });
  const languagesPromise = fetch("assets/languages.json").then((response: Response) => response.json());
  const skinsPromise = fetch("assets/skins/skins.json").then((response: Response) => response.json());
  // `ts-reset` types `Response.json()` as `Promise<unknown>`, so the fetched
  // payloads arrive untyped. This validates the trusted shipped-asset shapes at
  // the boundary (an object map of languages + an array of skins) and narrows
  // them for the rest of the closure — analogous to the null-guard helpers.
  function assertLoadedAssets(loadedAssets: [unknown, unknown]): asserts loadedAssets is [LanguagesData, SkinSource[]] {
    const [languages, skins] = loadedAssets;
    if (typeof languages !== "object" || languages === null || !Array.isArray(skins)) {
      throw new Error("Unexpected assets payload from languages.json / skins.json");
    }
  }
  Promise.all([languagesPromise, skinsPromise]).then((loadedAssets: [unknown, unknown]) => {
    assertLoadedAssets(loadedAssets);
    const [languages, skins] = loadedAssets;
    buildLanguageList(languages);
    const createSkinManager = (config: Config, canvas: HTMLCanvasElement) => {
      let imageAssetSet = new ImageAssetSet(config);
      let svgAssetSet = new SvgAssetSet(config, canvas, "assets/skins/", skins);
      const gameSkinManager = new GameSkinManager(imageAssetSet, svgAssetSet, 1);
      return gameSkinManager;
    };
    const schemeCycler = new SchemeCycler(BotScoreLabel);
    const achievementStore = new AchievementStore([]);
    achievementStore.load();
    const api = createGameApi(gameConfig, ensureNonNullable(findDefaultLanguage()), createSkinManager, new NamePool(botNames, Math.random()), schemeCycler, achievementStore);
    if (api) {
      window.paperio2api = api;
    }
    render(createElement(App, {
      api: api,
      storage: Cookies,
      skins: skins
    }), ensureNonNullable(document.getElementById("game")));
  });
})();