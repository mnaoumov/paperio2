import type {
  Intersection,
  Segment
} from './shapes.ts';

import { generateId } from '../shared/ids.ts';
import { ensureNonNullable } from '../type-guards.ts';
import {
  CELL_MARGIN,
  ContourPoints
} from './contour-points.ts';
import { Vector } from './vector.ts';

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
