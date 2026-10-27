import {
  describe,
  expect,
  it
} from 'vitest';

import type {
  LoopPlanner,
  PlanInput
} from './whitebox.ts';

import { THREE_EIGHTHS_TURN } from './plane.ts';
import {
  findLoop,
  guardWallTurn,
  WhiteboxPilot
} from './whitebox.ts';

const CENTER = { x: 0, y: 0 };
const RADIUS = 100;
/** Pressed against the wall, where the outward normal is angle 0. */
const PRESSED = { x: 100, y: 0 };
/** Sliding along the wall towards positive angles. */
const HEADING = 0.5;

/* eslint-disable @typescript-eslint/dot-notation -- bracket access exercises the private planner boundary with typed inputs. */
describe('delayed whitebox plans', () => {
  const input: PlanInput = {
    center: CENTER,
    enemies: [],
    heading: 0,
    maxTrail: 1000,
    outline: [{ x: -100, y: -100 }, { x: 100, y: -100 }, { x: 100, y: 100 }, { x: -100, y: 100 }],
    position: CENTER,
    radius: 1000,
    spaceHeight: 2000,
    spaceWidth: 2000,
    speed: 60
  };

  it.each([
    { danger: false, heading: 0, position: { x: 99, y: 0 }, safe: false },
    { danger: false, heading: 0, position: { x: 1, y: 0 }, safe: true },
    { danger: false, heading: Math.PI, position: { x: 99, y: 0 }, safe: true },
    { danger: true, heading: 0, position: { x: 1, y: 0 }, safe: false }
  ])('checks a delayed route from the latest pose ($safe)', ({ danger, heading, position, safe }) => {
    const pilot = new WhiteboxPilot();
    const answers: Parameters<LoopPlanner>[1][] = [];
    const requests: PlanInput[] = [];
    pilot.planner = (request, answer): void => {
      requests.push(request);
      answers.push(answer);
    };
    const plan = findLoop(input);
    expect(plan).not.toBeNull();
    // These calls model consecutive steer updates while waiting, without needing a canvas or a game instance.
    pilot['updates']++;
    expect(pilot['planLoop'](input)).toBeNull();
    pilot['updates']++;
    const current: PlanInput = {
      ...input,
      enemies: danger ? [{ direction: 0, hunting: true, position: plan?.check.samples[0] ?? CENTER, trigger: 100 }] : [],
      heading,
      position
    };
    expect(pilot['planLoop'](current)).toBeNull();
    answers[0]?.(plan);
    pilot['updates']++;
    const accepted = pilot['planLoop'](current);
    expect(pilot.stats.loops).toBe(safe ? 1 : 0);
    expect(accepted).toBe(safe ? true : null);
    expect(requests).toHaveLength(safe ? 1 : 2);
    if (!safe) {
      expect(requests[1]).toEqual(current);
      expect(pilot.debug.loop).toBeNull();
    }
  });
});

/* eslint-enable @typescript-eslint/dot-notation -- the remaining tests use only public methods. */

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
