import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  defaultConfig,
  Game
} from './engine.ts';
import { Unit } from './entities/units.ts';
import { Border } from './geometry/border.ts';
import { SpatialGrid } from './geometry/spatial-grid.ts';
import { Vector } from './geometry/vector.ts';

// The arena `GameApi.create` builds from the default config: 2000 x 2000, a 300-gon of radius 950.
const ARENA_CENTER = 1000;
const BORDER_POINTS = 300;
const BORDER_RADIUS = 950;
const UNIT_SPEED = 90;
const FRAME_MILLISECONDS = 1000 / 60;
const COMPASS_POINTS = 8;
const STEPS_PER_RUN = 900;
const OUTSIDE_OFFSET = 1;
const TOLERANCE = 1e-6;

vi.hoisted(() => {
  // `engine.ts` builds a particle Path2D and reads the host at module level.
  class FakePath2D {
    public closePath(): void {
      // A Path2D stand-in for Node: the movement code never draws.
    }

    public lineTo(): void {
      // A Path2D stand-in for Node: the movement code never draws.
    }

    public moveTo(): void {
      // A Path2D stand-in for Node: the movement code never draws.
    }
  }
  vi.stubGlobal('Path2D', FakePath2D);
  vi.stubGlobal('window', { location: { host: 'paperio.site', hostname: 'paperio.site' } });
});

const ARENA_SIZE = ARENA_CENTER * 2;
const QUAD_SIZE = 20;
Vector.space = new SpatialGrid(ARENA_SIZE, ARENA_SIZE, QUAD_SIZE);
const border = Border.circular(new Vector(ARENA_CENTER, ARENA_CENTER), BORDER_POINTS, BORDER_RADIUS);
// Only `getMovement` runs, and it reads nothing of the game but the wall and the unit speed.
const game = Object.create<Game>(Game.prototype);
game.border = border;
game.config = { ...defaultConfig, unitSpeed: UNIT_SPEED };

function isInsideWall(point: Vector): boolean {
  for (const segment of border.polygon.segments) {
    const centerSide = segment.a * ARENA_CENTER + segment.b * ARENA_CENTER + segment.c;
    const pointSide = segment.a * point.x + segment.b * point.y + segment.c;
    if (-Math.sign(centerSide) * pointSide > TOLERANCE) {
      return false;
    }
  }
  return true;
}

function makeUnit(position: Vector, direction: number, steer: (unit: Unit) => number): Unit {
  const unit = Object.create<Unit>(Unit.prototype);
  unit.direction = direction;
  unit.position = position;
  unit.smoothness = 1;
  unit.movement = (): Vector => new Vector(Math.cos(steer(unit)), Math.sin(steer(unit)));
  return unit;
}

function outwardAngle(point: Vector): number {
  return Math.atan2(point.y - ARENA_CENTER, point.x - ARENA_CENTER);
}
/** Moves the unit the way `handleUnitMovements` does (it ends at the last segment's end) and returns every point it passed. */
function step(unit: Unit, deltaMilliseconds: number): Vector[] {
  const segments = game.getMovement(deltaMilliseconds, unit);
  const last = segments.at(-1);
  if (last) {
    unit.position = last.end;
  }
  return segments.map((segment) => segment.end);
}

describe('the wall', () => {
  it.each(Array.from({ length: COMPASS_POINTS }, (_, index) => index))('holds a unit steered into it at compass point %i, head on and sliding both ways', (index) => {
    // Every compass point is a vertex of the 300-gon. Head on, the original's wall slide leaves the unit 1e-4 outside
    // the wall after 28 steps, and from there an outward move never crosses the wall again: the escape the owner saw.
    const angle = index * 2 * Math.PI / COMPASS_POINTS;
    for (const skew of [0, Math.PI / 3, -Math.PI / 3]) {
      const start = new Vector(ARENA_CENTER + Math.cos(angle) * (BORDER_RADIUS - 50), ARENA_CENTER + Math.sin(angle) * (BORDER_RADIUS - 50));
      const unit = makeUnit(start, angle, (moving) => outwardAngle(moving.position) + skew);
      for (let i = 0; i < STEPS_PER_RUN; i++) {
        // Frame lengths as a live game splits them: up to two frames per update.
        const delta = (i % 7 === 0 ? 2 : 1) * FRAME_MILLISECONDS;
        for (const point of step(unit, delta)) {
          expect(isInsideWall(point), `step ${String(i)} at (${String(point.x)}, ${String(point.y)})`).toBe(true);
        }
      }
    }
  });

  it.each(Array.from({ length: COMPASS_POINTS }, (_, index) => index))('brings back a unit already outside it at compass point %i and heading away', (index) => {
    // The state the owner recorded: the player outside the wall, and every outward move ignored by the wall slide,
    // which only stops a move that crosses the wall.
    const angle = index * 2 * Math.PI / COMPASS_POINTS + 0.01;
    const radius = BORDER_RADIUS + OUTSIDE_OFFSET;
    const start = new Vector(ARENA_CENTER + Math.cos(angle) * radius, ARENA_CENTER + Math.sin(angle) * radius);
    expect(isInsideWall(start)).toBe(false);
    const unit = makeUnit(start, angle, () => angle);
    step(unit, FRAME_MILLISECONDS);
    expect(isInsideWall(unit.position)).toBe(true);
    for (let i = 0; i < 60; i++) {
      step(unit, FRAME_MILLISECONDS);
      expect(isInsideWall(unit.position)).toBe(true);
    }
  });

  it('leaves a move the wall slide ended on the wall exactly where the original puts it', () => {
    const start = new Vector(ARENA_CENTER + BORDER_RADIUS - 5, ARENA_CENTER + 3);
    const unit = makeUnit(start, Math.PI / 4, () => Math.PI / 4);
    const ends: Vector[] = [];
    for (let i = 0; i < 120; i++) {
      ends.push(...step(unit, FRAME_MILLISECONDS));
    }
    for (const end of ends) {
      expect(border.pullInside(end)).toBeNull();
    }
  });
});
