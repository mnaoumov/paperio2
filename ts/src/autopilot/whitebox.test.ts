import {
  describe,
  expect,
  it
} from 'vitest';

import type {
  LoopPlanner,
  PlanInput
} from './whitebox.ts';

import {
  pointInPolygon,
  THREE_EIGHTHS_TURN
} from './plane.ts';
import {
  enemyCrossesLoop,
  findLoop,
  guardBaseExit,
  guardWallTurn,
  homeCutInTime,
  homeFlightLength,
  reachesInTime,
  returnEntryPoint,
  simulateApproach,
  threatens,
  WhiteboxPilot
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
  it('rejects a pending capture crossed after the first waypoint', () => {
    const obstacle = { bottom: 20, left: 40, points: [{ x: 40, y: -20 }, { x: 60, y: -20 }, { x: 60, y: 20 }, { x: 40, y: 20 }], right: 60, top: -20 };
    expect(simulateApproach({ avoids: [obstacle], center: CENTER, heading: 0, horizon: true, maxSteps: 60, path: [{ x: 20, y: 0 }, { x: 200, y: 0 }], position: CENTER, radius: 1000, speed: 100, trail: [] })).toBeNull();
  });
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
  it('does not reject an interior target because a fixed heading would later leave the base', () => {
    const base = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }];
    expect(guardBaseExit({ allowExit: false, captures: [], center: CENTER, enemies: [], heading: 0, outline: base, position: { x: 140, y: 100 }, radius: 10000, speed: 100, target: { x: 160, y: 100 }, wanted: 0 })).toBe(0);
  });
  const outline = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }];

  it('avoids entering a pending capture even during a planned departure', () => {
    const captures = [[{ x: 175, y: 80 }, { x: 200, y: 80 }, { x: 200, y: 120 }, { x: 175, y: 120 }]];
    expect(guardBaseExit({ allowExit: true, captures, center: CENTER, enemies: [], heading: 0, outline, position: { x: 140, y: 100 }, radius: 10000, speed: 100, target: { x: 10000, y: 100 }, wanted: 0 })).not.toBe(0);
  });

  it('allows escaping a capture that already encloses the player', () => {
    const captures = [[{ x: 150, y: 80 }, { x: 190, y: 80 }, { x: 190, y: 120 }, { x: 150, y: 120 }]];
    expect(guardBaseExit({ allowExit: true, captures, center: CENTER, enemies: [], heading: 0, outline, position: { x: 170, y: 100 }, radius: 10000, speed: 100, target: { x: 10000, y: 100 }, wanted: 0 })).toBe(0);
  });

  it('turns away from an unplanned exit even without a nearby enemy', () => {
    expect(guardBaseExit({ allowExit: false, captures: [], center: CENTER, enemies: [], heading: 0, outline, position: { x: 170, y: 100 }, radius: 10000, speed: 100, target: { x: 10000, y: 100 }, wanted: 0 })).not.toBe(0);
  });

  it('lets a planned loop leave when no enemy is near the exit', () => {
    expect(guardBaseExit({ allowExit: true, captures: [], center: CENTER, enemies: [], heading: 0, outline, position: { x: 170, y: 100 }, radius: 10000, speed: 100, target: { x: 10000, y: 100 }, wanted: 0 })).toBe(0);
  });

  it('keeps room for a turn instead of skimming the edge during incidental movement', () => {
    const position = { x: 150, y: 100 };
    const direction = guardBaseExit({ allowExit: false, captures: [], center: CENTER, enemies: [], heading: 0, outline, position, radius: 10000, speed: 100, target: { x: 10000, y: 100 }, wanted: 0 });
    const core = [{ x: 30, y: 30 }, { x: 170, y: 30 }, { x: 170, y: 170 }, { x: 30, y: 170 }];
    expect(homeFlightLength({ heading: 0, outline: core, position, speed: 100, target: { x: position.x + Math.cos(direction) * 100, y: position.y + Math.sin(direction) * 100 } })).not.toBeNull();
  });
});

describe('findLoop', () => {
  it('leaves threat headroom while approaching the exit instead of choosing a knife-edge loop', () => {
    const enemies = Array.from({ length: 15 }, (_unused, index) => ({ direction: index, hunting: false, position: { x: 1000 + Math.cos(index * Math.PI * 2 / 15) * 350, y: 1000 + Math.sin(index * Math.PI * 2 / 15) * 350 }, target: null, trigger: 80 }));
    const input: PlanInput = { captures: [], center: { x: 1000, y: 1000 }, enemies, heading: 0, maxTrail: 900, outline: [{ x: 900, y: 900 }, { x: 1100, y: 900 }, { x: 1100, y: 1100 }, { x: 900, y: 1100 }], position: { x: 1000, y: 1000 }, radius: 1000, spaceHeight: 2000, spaceWidth: 2000, speed: 100 };
    const plan = findLoop(input);
    expect(plan).not.toBeNull();
    if (!plan) {
      throw new Error('The surrounding bots still leave room for a small loop');
    }
    const exit = plan.waypoints[0] ?? input.position;
    const transit = Math.min(Math.hypot(exit.x - input.position.x, exit.y - input.position.y), input.speed / 4);
    for (const enemy of enemies) {
      const toward = Math.atan2(plan.check.center.y - enemy.position.y, plan.check.center.x - enemy.position.x);
      const position = { x: enemy.position.x + Math.cos(toward) * transit, y: enemy.position.y + Math.sin(toward) * transit };
      expect(threatens({ check: plan.check, enemy: { ...enemy, position } })).toBe(false);
    }
  });
  it('does not select a loop crossed by a passive bot on its committed leg', () => {
    const input = { captures: [], center: { x: 1000, y: 1000 }, enemies: [], heading: 0, maxTrail: 900, outline: [{ x: 900, y: 900 }, { x: 1100, y: 900 }, { x: 1100, y: 1100 }, { x: 900, y: 1100 }], position: { x: 1000, y: 1000 }, radius: 1000, spaceHeight: 2000, spaceWidth: 2000, speed: 100 };
    const clear = findLoop(input);
    expect(clear).not.toBeNull();
    if (!clear) {
      throw new Error('The clear fixture needs a loop');
    }
    const enemy = { direction: Math.PI, hunting: false, position: { x: clear.check.center.x - 600, y: clear.check.center.y }, target: { x: clear.check.center.x + 600, y: clear.check.center.y }, trigger: 0 };
    const plan = findLoop({ ...input, enemies: [enemy] });
    expect(plan === null || !enemyCrossesLoop({ enemy, samples: plan.check.samples, trailLength: plan.check.trailLength })).toBe(true);
  });
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
    const enemies = Array.from({ length: 15 }, (_unused, index) => ({ direction: index, hunting: false, position: { x: 1000 + Math.cos(index * Math.PI * 2 / 15) * 350, y: 1000 + Math.sin(index * Math.PI * 2 / 15) * 350 }, target: null, trigger: 80 }));
    const plan = findLoop({ captures: [], center: { x: 1000, y: 1000 }, enemies, heading: 0, maxTrail: 900, outline: [{ x: 900, y: 900 }, { x: 1100, y: 900 }, { x: 1100, y: 1100 }, { x: 900, y: 1100 }], position: { x: 1000, y: 1000 }, radius: 1000, spaceHeight: 2000, spaceWidth: 2000, speed: 100 });
    expect(plan).not.toBeNull();
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
/* eslint-disable @typescript-eslint/dot-notation -- bracket access exercises the private planner boundary with typed inputs. */
describe('delayed whitebox plans', () => {
  const input: PlanInput = {
    captures: [],
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
      enemies: danger ? [{ direction: 0, hunting: true, position: plan?.check.samples[0] ?? CENTER, target: null, trigger: 100 }] : [],
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

  it('keeps whether the loop it flies was checked', () => {
    const plan = findLoop(input);
    expect(plan).not.toBeNull();
    if (!plan) {
      return;
    }
    const pilot = new WhiteboxPilot();
    pilot['takePlan']({ ...plan, checked: true });
    expect(pilot['loopChecked']).toBe(true);
    pilot['takePlan'](plan);
    expect(pilot['loopChecked']).toBe(false);
  });

  it('flies a checked loop by its schedule from the moment the plan was asked', () => {
    const plan = findLoop(input);
    expect(plan).not.toBeNull();
    if (!plan) {
      return;
    }
    const east = { x: 1, y: 0 };
    const north = { x: 0, y: -1 };
    const schedule = { directions: [east, east, north], stepSeconds: 0.5 };
    const pilot = new WhiteboxPilot();
    pilot['now'] = 11;
    pilot['takePlan']({ ...plan, checked: true, schedule }, 10);
    const outside = { inBase: false, position: CENTER };
    expect(pilot['scheduledDirection'](outside)).toBe(north);
    expect(pilot.debug.phase).toBe('out');
    pilot['now'] = 10.2;
    expect(pilot['scheduledDirection'](outside)).toBe(east);
    pilot['now'] = 11.5;
    expect(pilot['scheduledDirection'](outside)).toBeNull();
    // Once run out, the schedule is gone, and the waypoints fly the rest.
    pilot['now'] = 10;
    expect(pilot['scheduledDirection'](outside)).toBeNull();
    // An unchecked loop has no schedule to fly.
    pilot['takePlan']({ ...plan, schedule }, 10);
    expect(pilot['scheduledDirection'](outside)).toBeNull();
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

describe('enemyCrossesLoop', () => {
  it('does not let the circle bound hide an extended corridor with admission headroom', () => {
    const enemy = { direction: 0, hunting: false, position: CENTER, target: { x: 1000, y: 0 }, trigger: 0 };
    const samples = [{ x: 225, y: -5 }, { x: 225, y: 5 }];
    const check = { center: { x: 225, y: 0 }, exposure: 100, maxRemaining: 100, remaining: [100, 90], samples, spread: 5, trailLength: 100 };
    expect(enemyCrossesLoop({ enemy, reserve: 50, samples, trailLength: 100 })).toBe(true);
    expect(threatens({ check, enemy, reserve: 50 })).toBe(true);
  });
  it('sees a passive bot returning across a future trail even when its current heading points away', () => {
    expect(enemyCrossesLoop({ enemy: { direction: Math.PI, hunting: false, position: { x: 0, y: 0 }, target: { x: 300, y: 0 }, trigger: 0 }, samples: [{ x: 200, y: -100 }, { x: 200, y: 100 }], trailLength: 300 })).toBe(true);
  });

  it('allows a committed leg that cannot reach the loop before closure', () => {
    expect(enemyCrossesLoop({ enemy: { direction: 0, hunting: false, position: { x: 0, y: 0 }, target: { x: 1000, y: 0 }, trigger: 0 }, samples: [{ x: 700, y: -100 }, { x: 700, y: 100 }], trailLength: 300 })).toBe(false);
  });

  it('allows a bot whose current target takes it away from the loop', () => {
    expect(enemyCrossesLoop({ enemy: { direction: 0, hunting: false, position: { x: 0, y: 0 }, target: { x: -300, y: 0 }, trigger: 0 }, samples: [{ x: 200, y: -100 }, { x: 200, y: 100 }], trailLength: 300 })).toBe(false);
  });
});
