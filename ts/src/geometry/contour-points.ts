import type { Vector } from './vector.ts';

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
