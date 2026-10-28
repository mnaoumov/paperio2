import {
  describe,
  expect,
  it
} from 'vitest';

import type {
  RolloutFrame,
  RolloutRequest,
  RolloutResult
} from '../rollout/protocol.ts';
import type { PlanInput } from './whitebox.ts';

import {
  judgeRollout,
  RolloutPlanner,
  rolloutRequest
} from './rollout-planner.ts';
import {
  findLoop,
  findLoops,
  loopSchedule
} from './whitebox.ts';

const EMPTY_TRAIL = '0:2166136261:5381';
const INPUT: PlanInput = { captures: [], center: { x: 1000, y: 1000 }, enemies: [], heading: 0, maxTrail: 900, outline: [{ x: 900, y: 900 }, { x: 1100, y: 900 }, { x: 1100, y: 1100 }, { x: 900, y: 1100 }], position: { x: 1000, y: 1000 }, radius: 1000, spaceHeight: 2000, spaceWidth: 2000, speed: 100 };

function frame(index: number, inOwnBase: boolean, trail: string): RolloutFrame {
  return { death: null, frame: index, kills: 0, randomState: 0, returns: 0, time: index, units: [{ angle: 0, context: [], id: 1, inOwnBase, name: 'me', square: 0, state: null, target: null, territory: '', trail, x: 0, y: 0 }] };
}

function result(frames: RolloutFrame[], death: RolloutResult['death'] = null): RolloutResult {
  return { death, elapsedMs: 0, frames, growth: 0 };
}

describe('judgeRollout', () => {
  it('passes a flight that leaves, closes its trail at home and lives', () => {
    expect(judgeRollout(result([frame(0, true, EMPTY_TRAIL), frame(1, false, '3:1:1'), frame(2, true, EMPTY_TRAIL)]), 'me')).toBe('safe');
  });
  it('fails a flight that dies', () => {
    expect(judgeRollout(result([frame(0, false, '1:1:1')], { frame: 0, reason: 3, time: 0 }), 'me')).toBe('death');
  });
  it('fails a flight that is still out when the rollout ends', () => {
    expect(judgeRollout(result([frame(0, true, EMPTY_TRAIL), frame(1, false, '3:1:1')]), 'me')).toBe('no-return');
  });
  it('does not count staying home as a closed loop', () => {
    expect(judgeRollout(result([frame(0, true, EMPTY_TRAIL), frame(1, true, EMPTY_TRAIL)]), 'me')).toBe('no-return');
  });
  it('fails a flight whose player is gone from the units', () => {
    expect(judgeRollout(result([{ ...frame(0, true, EMPTY_TRAIL), units: [] }]), 'me')).toBe('death');
  });
});

describe('rolloutRequest', () => {
  it('sends an input only where the direction changes and runs past the schedule', () => {
    const request = rolloutRequest([{ x: 1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], 1);
    expect(request.inputs).toEqual([{ frame: 0, x: 1, y: 0 }, { frame: 2, x: 0, y: 1 }]);
    expect(request.frames).toBeGreaterThan(3);
    expect(request.ignoreParticles).toBe(true);
  });
});

describe('findLoops and loopSchedule', () => {
  it('returns findLoop first', () => {
    expect(findLoops(INPUT, 3)[0]).toEqual(findLoop(INPUT));
  });
  it('schedules a loop that ends back inside the base', () => {
    const plan = findLoop(INPUT);
    expect(plan).not.toBeNull();
    const directions = loopSchedule(INPUT, plan?.waypoints ?? [], 0.02, 600);
    expect(directions.length).toBeGreaterThan(0);
    expect(directions.length).toBeLessThan(600);
    let { heading, position } = INPUT;
    let left = false;
    for (const direction of directions) {
      const wanted = Math.atan2(direction.y, direction.x);
      const turn = Math.atan2(Math.sin(wanted - heading), Math.cos(wanted - heading));
      heading += Math.max(-0.1, Math.min(0.1, turn));
      position = { x: position.x + Math.cos(heading) * 2, y: position.y + Math.sin(heading) * 2 };
      left ||= Math.abs(position.x - 1000) > 100 || Math.abs(position.y - 1000) > 100;
    }
    expect(left).toBe(true);
    expect(Math.abs(position.x - 1000) <= 100 && Math.abs(position.y - 1000) <= 100).toBe(true);
  });
});

describe('RolloutPlanner', () => {
  it('takes the next loop when the first one dies in its rollout', async () => {
    const loops = findLoops(INPUT, 3);
    expect(loops.length).toBeGreaterThan(1);
    let calls = 0;
    const planner = new RolloutPlanner(() => 'me', (_request: RolloutRequest) => {
      calls++;
      return Promise.resolve(calls === 1 ? result([frame(0, false, '1:1:1')], { frame: 0, reason: 3, time: 0 }) : result([frame(0, false, '1:1:1'), frame(1, true, EMPTY_TRAIL)]));
    });
    let answered: unknown = 'none';
    planner.plan(INPUT, (plan) => {
      answered = plan;
    });
    await planner.pending;
    expect(answered).toEqual(loops[1]);
    expect(planner.stats).toMatchObject({ accepted: 1, rejectedDeath: 1, rollouts: 2 });
  });
  it('answers no loop when every rollout dies', async () => {
    const planner = new RolloutPlanner(() => 'me', () => Promise.resolve(result([], { frame: 0, reason: 3, time: 0 })));
    let answered: unknown = 'none';
    planner.plan(INPUT, (plan) => {
      answered = plan;
    });
    await planner.pending;
    expect(answered).toBeNull();
    expect(planner.stats.rejectedAll).toBe(1);
  });
});
