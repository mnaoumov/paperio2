import {
  describe,
  expect,
  it
} from 'vitest';

import { THREE_EIGHTHS_TURN } from './plane.ts';
import { guardWallTurn } from './whitebox.ts';

const CENTER = { x: 0, y: 0 };
const RADIUS = 100;
/** Pressed against the wall, where the outward normal is angle 0. */
const PRESSED = { x: 100, y: 0 };
/** Sliding along the wall towards positive angles. */
const HEADING = 0.5;

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
