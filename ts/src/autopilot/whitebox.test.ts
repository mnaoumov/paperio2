import {
  describe,
  expect,
  it
} from 'vitest';

import { THREE_EIGHTHS_TURN } from './plane.ts';
import {
  findLoop,
  guardWallTurn,
  homeFlightLength
} from './whitebox.ts';

const CENTER = { x: 0, y: 0 };
const RADIUS = 100;
/** Pressed against the wall, where the outward normal is angle 0. */
const PRESSED = { x: 100, y: 0 };
/** Sliding along the wall towards positive angles. */
const HEADING = 0.5;

describe('findLoop', () => {
  it('keeps every bot beyond the distance it can cover before the whole loop closes', () => {
    const enemies = Array.from({ length: 15 }, (_unused, index) => ({ direction: index, hunting: false, position: { x: 1000 + Math.cos(index * Math.PI * 2 / 15) * 350, y: 1000 + Math.sin(index * Math.PI * 2 / 15) * 350 }, trigger: 80 }));
    const plan = findLoop({ center: { x: 1000, y: 1000 }, enemies, heading: 0, maxTrail: 900, outline: [{ x: 900, y: 900 }, { x: 1100, y: 900 }, { x: 1100, y: 1100 }, { x: 900, y: 1100 }], position: { x: 1000, y: 1000 }, radius: 1000, spaceHeight: 2000, spaceWidth: 2000, speed: 100 });
    expect(plan === null || enemies.every((enemy) => plan.check.samples.every((point) => Math.hypot(point.x - enemy.position.x, point.y - enemy.position.y) >= plan.check.trailLength + 40))).toBe(true);
  });
});

describe('homeFlightLength', () => {
  const outline = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }];

  it('rejects a straight-clear target when the turn first leaves the base', () => {
    expect(homeFlightLength({ heading: Math.PI, outline, position: { x: 1, y: 100 }, speed: 100, target: { x: 100, y: 100 } })).toBeNull();
  });

  it('accepts a reachable target when the flight stays inside', () => {
    expect(homeFlightLength({ heading: 0, outline, position: { x: 50, y: 100 }, speed: 100, target: { x: 100, y: 100 } })).toBeGreaterThan(45);
  });

  it('rejects a target across a concave gap in the base', () => {
    const bent = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 150, y: 200 }, { x: 150, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 200 }, { x: 0, y: 200 }];
    expect(homeFlightLength({ heading: 0, outline: bent, position: { x: 25, y: 150 }, speed: 100, target: { x: 175, y: 150 } })).toBeNull();
  });
});

describe('guardWallTurn', () => {
  it('leaves a turn away from the wall alone', () => {
    expect(guardWallTurn({ x: 50, y: 0 }, HEADING, -0.5, CENTER, RADIUS)).toBe(-0.5);
  });

  it('leaves a pressed turn that keeps the slide going forward alone', () => {
    expect(guardWallTurn(PRESSED, HEADING, 1, CENTER, RADIUS)).toBe(1);
    expect(guardWallTurn(PRESSED, HEADING, 2.5, CENTER, RADIUS)).toBe(2.5);
  });

  it('keeps sliding forward when the target lies back along the wall', () => {
    expect(guardWallTurn(PRESSED, HEADING, -0.5, CENTER, RADIUS)).toBeCloseTo(0.3);
  });

  it('turns the long way round, through the inward side, when the target lies inward and behind', () => {
    expect(guardWallTurn(PRESSED, HEADING, -2.5, CENTER, RADIUS)).toBeCloseTo(HEADING + THREE_EIGHTHS_TURN);
  });
});
