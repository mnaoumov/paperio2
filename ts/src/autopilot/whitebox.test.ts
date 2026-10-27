import {
  describe,
  expect,
  it
} from 'vitest';

import {
  pointInPolygon,
  THREE_EIGHTHS_TURN
} from './plane.ts';
import {
  findLoop,
  guardBaseExit,
  guardWallTurn,
  homeCutInTime,
  homeFlightLength,
  reachesInTime,
  returnEntryPoint,
  simulateApproach
} from './whitebox.ts';

const CENTER = { x: 0, y: 0 };
const RADIUS = 100;
/** Pressed against the wall, where the outward normal is angle 0. */
const PRESSED = { x: 100, y: 0 };
/** Sliding along the wall towards positive angles. */
const HEADING = 0.5;

describe('homeCutInTime', () => {
  it('does not chase a closing trail that will disappear first', () => {
    expect(homeCutInTime({ baseDistance: 100, flightSeconds: 2, returning: true, speed: 100 })).toBe(false);
  });

  it('can cut a bot that is still drawing its loop instead of assuming it is already heading home', () => {
    expect(homeCutInTime({ baseDistance: 100, flightSeconds: 2, returning: false, speed: 100 })).toBe(true);
  });
});

describe('reachesInTime', () => {
  it('rejects a cut that arrives after its owner can close the trail', () => {
    expect(reachesInTime(2, { baseDistance: 100 }, 100)).toBe(false);
  });

  it('allows a cut with time to spare before its owner can get home', () => {
    expect(reachesInTime(0.5, { baseDistance: 300 }, 100)).toBe(true);
  });
});

describe('simulateApproach', () => {
  it('rejects a curved approach that enters a pending capture', () => {
    const obstacle = { bottom: 20, left: 40, points: [{ x: 40, y: -20 }, { x: 60, y: -20 }, { x: 60, y: 20 }, { x: 40, y: 20 }], right: 60, top: -20 };
    expect(simulateApproach({ avoids: [obstacle], center: CENTER, heading: 0, horizon: true, maxSteps: 60, path: [{ x: 200, y: 0 }], position: CENTER, radius: 1000, speed: 100, trail: [] })).toBeNull();
  });
  it('counts a second sliding at the wall as a full second of exposure', () => {
    expect(simulateApproach({ center: CENTER, heading: HEADING, horizon: true, maxSteps: 60, path: [{ x: 200, y: 200 }], position: PRESSED, radius: RADIUS, speed: 100, trail: [] })).toBeCloseTo(100);
  });

  it('rejects a return that crosses the trail laid during its own turn', () => {
    expect(simulateApproach({ center: CENTER, heading: Math.PI / 2, horizon: true, maxSteps: 120, path: [{ x: 5, y: 0 }], position: CENTER, radius: 1000, speed: 100, trackSelf: true, trail: [] })).toBeNull();
  });
});

describe('returnEntryPoint', () => {
  const outline = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 90 }, { x: 300, y: 90 }, { x: 300, y: 110 }, { x: 200, y: 110 }, { x: 200, y: 200 }, { x: 0, y: 200 }];

  it('rejects re-entry into a narrow spit with no room for the next turn', () => {
    expect(returnEntryPoint({ edge: { x: 250, y: 110 }, outline, position: { x: 250, y: 150 } })).toBeNull();
  });

  it('accepts re-entry into the broad part of the base', () => {
    expect(returnEntryPoint({ edge: { x: 100, y: 200 }, outline, position: { x: 100, y: 250 } })).toEqual({ x: 100, y: 155 });
  });
});

describe('guardBaseExit', () => {
  const outline = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }];

  it('avoids entering a pending capture even during a planned departure', () => {
    const captures = [[{ x: 175, y: 80 }, { x: 200, y: 80 }, { x: 200, y: 120 }, { x: 175, y: 120 }]];
    expect(guardBaseExit({ allowExit: true, captures, enemies: [], heading: 0, outline, position: { x: 140, y: 100 }, speed: 100, wanted: 0 })).not.toBe(0);
  });

  it('allows escaping a capture that already encloses the player', () => {
    const captures = [[{ x: 150, y: 80 }, { x: 190, y: 80 }, { x: 190, y: 120 }, { x: 150, y: 120 }]];
    expect(guardBaseExit({ allowExit: true, captures, enemies: [], heading: 0, outline, position: { x: 170, y: 100 }, speed: 100, wanted: 0 })).toBe(0);
  });

  it('turns away from an unplanned exit even without a nearby enemy', () => {
    expect(guardBaseExit({ allowExit: false, captures: [], enemies: [], heading: 0, outline, position: { x: 170, y: 100 }, speed: 100, wanted: 0 })).not.toBe(0);
  });

  it('lets a planned loop leave when no enemy is near the exit', () => {
    expect(guardBaseExit({ allowExit: true, captures: [], enemies: [], heading: 0, outline, position: { x: 170, y: 100 }, speed: 100, wanted: 0 })).toBe(0);
  });

  it('keeps room for a turn instead of skimming the edge during incidental movement', () => {
    const position = { x: 150, y: 100 };
    const direction = guardBaseExit({ allowExit: false, captures: [], enemies: [], heading: 0, outline, position, speed: 100, wanted: 0 });
    const core = [{ x: 30, y: 30 }, { x: 170, y: 30 }, { x: 170, y: 170 }, { x: 30, y: 170 }];
    expect(homeFlightLength({ heading: 0, outline: core, position, speed: 100, target: { x: position.x + Math.cos(direction) * 100, y: position.y + Math.sin(direction) * 100 } })).not.toBeNull();
  });
});

describe('findLoop', () => {
  it('plans a different exit when a pending capture covers the preferred one', () => {
    const input = { captures: [], center: { x: 1000, y: 1000 }, enemies: [], heading: 0, maxTrail: 900, outline: [{ x: 900, y: 900 }, { x: 1100, y: 900 }, { x: 1100, y: 1100 }, { x: 900, y: 1100 }], position: { x: 1000, y: 1000 }, radius: 1000, spaceHeight: 2000, spaceWidth: 2000, speed: 100 };
    const first = findLoop(input)?.waypoints[0];
    expect(first).toBeDefined();
    if (!first) {
      throw new Error('The clear fixture needs a loop');
    }
    const capture = [{ x: first.x - 30, y: first.y - 30 }, { x: first.x + 30, y: first.y - 30 }, { x: first.x + 30, y: first.y + 30 }, { x: first.x - 30, y: first.y + 30 }];
    const next = findLoop({ ...input, captures: [capture] })?.waypoints[0];
    expect(next).toBeDefined();
    expect(next && pointInPolygon(next, capture)).toBe(false);
  });
  it('finds a flyable loop while passive bots surround the base', () => {
    const enemies = Array.from({ length: 15 }, (_unused, index) => ({ direction: index, hunting: false, position: { x: 1000 + Math.cos(index * Math.PI * 2 / 15) * 350, y: 1000 + Math.sin(index * Math.PI * 2 / 15) * 350 }, trigger: 80 }));
    const plan = findLoop({ captures: [], center: { x: 1000, y: 1000 }, enemies, heading: 0, maxTrail: 900, outline: [{ x: 900, y: 900 }, { x: 1100, y: 900 }, { x: 1100, y: 1100 }, { x: 900, y: 1100 }], position: { x: 1000, y: 1000 }, radius: 1000, spaceHeight: 2000, spaceWidth: 2000, speed: 100 });
    expect(plan).not.toBeNull();
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
