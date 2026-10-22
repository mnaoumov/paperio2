import {
  describe,
  expect,
  it
} from 'vitest';

import type { Point } from './plane.ts';

import { Odometer } from './odometry.ts';

const WIDTH = 120;
const HEIGHT = 80;
const MASKED = 5;

/**
 * A world of discs and bars, so the ground has edges in every direction.
 *
 * @param x - The world column.
 * @param y - The world row.
 * @returns The class there.
 */
function ground(x: number, y: number): number {
  const cellX = Math.floor(x / 40);
  const cellY = Math.floor(y / 40);
  if (Math.hypot(x - (cellX * 40 + 20), y - (cellY * 40 + 20)) < 9 + (cellX + cellY * 3) % 5) {
    return 1;
  }
  return (x + 2 * y) % 57 < 4 ? 3 : 0;
}

function view(position: Point): Uint8Array {
  const classes = new Uint8Array(WIDTH * HEIGHT);
  for (let row = 0; row < HEIGHT; row++) {
    for (let column = 0; column < WIDTH; column++) {
      // The avatar hides the middle of the view.
      const masked = Math.hypot(column - WIDTH / 2, row - HEIGHT / 2) < 8;
      classes[row * WIDTH + column] = masked ? MASKED : ground(Math.round(column - WIDTH / 2 + position.x), Math.round(row - HEIGHT / 2 + position.y));
    }
  }
  return classes;
}

describe('odometer', () => {
  it('follows the ground sliding under the view, curve and all', () => {
    const odometer = new Odometer(MASKED);
    let position = { x: 500, y: 500 };
    let heading = 0;
    const start = position;
    odometer.update(view(position), WIDTH, HEIGHT, { x: 0, y: 0 });
    let previousStep = { x: 0, y: 0 };
    for (let frame = 0; frame < 240; frame++) {
      heading += frame < 120 ? 0.02 : -0.03;
      const step = { x: Math.cos(heading) * 1.6, y: Math.sin(heading) * 1.6 };
      position = { x: position.x + step.x, y: position.y + step.y };
      // The prediction lags the curve by a frame, as a pilot's own would: the odometer has to measure the rest.
      odometer.update(view(position), WIDTH, HEIGHT, previousStep);
      previousStep = step;
    }
    expect(odometer.measured).toBe(true);
    expect(odometer.position.x).toBeCloseTo(position.x - start.x, -0.5);
    expect(odometer.position.y).toBeCloseTo(position.y - start.y, -0.5);
    expect(Math.hypot(odometer.velocity.x, odometer.velocity.y)).toBeCloseTo(1.6, 0);
  });
});
