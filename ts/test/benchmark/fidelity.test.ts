import {
  describe,
  expect,
  it
} from 'vitest';

import type { RolloutFrame } from '../../src/rollout/protocol.ts';

import {
  compareTracks,
  loopSchedule,
  quantile,
  scheduleIndex,
  scheduleInputs,
  trackOf
} from './fidelity.ts';

const LIVE_STEP_MS = 1000 / 60;

function frame(time: number, units: readonly [string, number, number, null | string][], death: null | number = null): RolloutFrame {
  return {
    death,
    frame: 0,
    kills: 0,
    randomState: 0,
    returns: 0,
    time,
    units: units.map(([name, x, y, state]) => ({ angle: 0, context: [], id: 0, inOwnBase: false, name, square: 0, state, target: null, territory: '', trail: '', x, y }))
  };
}

describe('loopSchedule', () => {
  it('flies a square out, sideways and back', () => {
    const schedule = loopSchedule('square', { x: 1, y: 0 }, 4500);
    expect(schedule).toHaveLength(225);
    expect(schedule[0]).toEqual({ x: 1, y: 0 });
    expect(schedule[75]?.y).toBeCloseTo(1);
    expect(schedule[125]?.x).toBeCloseTo(-1);
  });

  it('turns an arc on every step and comes round to where it started', () => {
    const schedule = loopSchedule('arc', { x: 0, y: 1 }, 4500);
    expect(schedule[31]).not.toEqual(schedule[32]);
    expect(schedule[224]?.x).toBeCloseTo(0);
    expect(schedule[224]?.y).toBeCloseTo(1);
  });
});

describe('scheduleIndex', () => {
  it('reads the step the rollout held, or the pilot one ahead', () => {
    expect(scheduleIndex(20, 'aligned', 10)).toBe(0);
    expect(scheduleIndex(20, 'pilot', 10)).toBe(1);
    expect(scheduleIndex(LIVE_STEP_MS, 'aligned', 10)).toBe(0);
    expect(scheduleIndex(LIVE_STEP_MS, 'pilot', 10)).toBe(0);
    expect(scheduleIndex(LIVE_STEP_MS * 3, 'aligned', 10)).toBe(2);
    expect(scheduleIndex(LIVE_STEP_MS * 3 + 1e-9, 'aligned', 10)).toBe(2);
    expect(scheduleIndex(1000, 'aligned', 10)).toBe(9);
  });
});

describe('scheduleInputs', () => {
  it('gives a 20 ms aligned rollout the schedule step for step', () => {
    const schedule = loopSchedule('square', { x: 1, y: 0 }, 4500);
    expect(scheduleInputs(schedule, 20, 225, 'aligned').map((input) => input.frame)).toEqual([0, 75, 125]);
  });

  it('moves the turns to the 60 fps frames that hold them', () => {
    const schedule = loopSchedule('square', { x: 1, y: 0 }, 4500);
    expect(scheduleInputs(schedule, LIVE_STEP_MS, 270, 'aligned').map((input) => input.frame)).toEqual([0, 90, 150]);
    expect(scheduleInputs(schedule, LIVE_STEP_MS, 270, 'pilot').map((input) => input.frame)).toEqual([0, 89, 149]);
  });
});

describe('compareTracks', () => {
  it('meets a 20 ms and a 60 fps track every 100 ms and finds the first divergences', () => {
    const forecast = trackOf([20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map((time, index) => frame(1000 + time, [['me', index, 0, null], ['bot', 0, 0, 'back']])), 1000);
    const live = trackOf(Array.from({ length: 12 }, (_unused, index) => frame(1000 + (index + 1) * LIVE_STEP_MS, [['me', index < 6 ? index * 0.83 : 50, 0, null], ['bot', 3, 4, index < 6 ? 'back' : 'exit']])), 1000);
    const { firstPlayerMs, firstStateMs, points } = compareTracks(forecast, live, 'me', 1000);
    expect(points.map((point) => point.elapsedMs)).toEqual([100, 200]);
    expect(points[0]?.botErrorMedian).toBe(5);
    expect(points[0]?.stateMismatches).toBe(0);
    expect(points[1]?.stateMismatches).toBe(1);
    expect(firstPlayerMs).toBe(200);
    expect(firstStateMs).toBe(200);
  });

  it('reports the player gone and the death time', () => {
    const forecast = trackOf([frame(100, [['me', 0, 0, null]], 3)], 0);
    const live = trackOf([frame(100, [['bot', 0, 0, 'back']])], 0);
    expect(forecast.deathMs).toBe(100);
    expect(compareTracks(forecast, live, 'me', 100).points[0]).toMatchObject({ botsInOne: 1, playerError: null });
  });
});

describe('quantile', () => {
  it('takes the nearest rank', () => {
    expect(quantile([5, 1, 3, 2, 4], 0.9)).toBe(5);
    expect(quantile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(quantile([], 0.5)).toBeNull();
  });
});
