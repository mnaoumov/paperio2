import {
  describe,
  expect,
  it
} from 'vitest';

import type {
  Envelope,
  EnvelopeParam
} from './envelope.ts';

import {
  applyEnvelope,
  areaUntil,
  isAudibleIn,
  valueAt
} from './envelope.ts';

type Automation = readonly ['ramp' | 'set', number, number];

const RISE: readonly Envelope[] = [{ time: 0, value: 1 }, { time: 2, value: 3 }];
const BUMP: readonly Envelope[] = [{ time: 0, value: 0 }, { time: 1, value: 1 }, { time: 2, value: 0 }];

describe('valueAt', () => {
  it('draws straight lines between the corners and holds the ends', () => {
    expect(valueAt(RISE, -1)).toBe(1);
    expect(valueAt(RISE, 1)).toBe(2);
    expect(valueAt(RISE, 5)).toBe(3);
    expect(valueAt([], 1)).toBe(0);
  });
});

describe('areaUntil', () => {
  it('sums the area under the lines, and the last value after the last corner', () => {
    expect(areaUntil(RISE, 0)).toBe(0);
    expect(areaUntil(RISE, 1)).toBe(1.5);
    expect(areaUntil(RISE, 2)).toBe(4);
    expect(areaUntil(RISE, 4)).toBe(10);
    expect(areaUntil(BUMP, 2)).toBe(1);
  });
});

describe('isAudibleIn', () => {
  it('finds a value above zero at either end or at a corner inside', () => {
    expect(isAudibleIn(BUMP, 0, 3)).toBe(true);
    expect(isAudibleIn(BUMP, 2, 3)).toBe(false);
    expect(isAudibleIn(BUMP, 1.5, 3)).toBe(true);
    expect(isAudibleIn([{ time: 0, value: 0 }], 0, 10)).toBe(false);
  });
});

describe('applyEnvelope', () => {
  it('schedules the window\'s part of the envelope, shifted by the lead-in', () => {
    const events: Automation[] = [];
    const param: EnvelopeParam = {
      linearRampToValueAtTime(value: number, endTime: number): void {
        events.push(['ramp', value, endTime]);
      },
      setValueAtTime(value: number, startTime: number): void {
        events.push(['set', value, startTime]);
      }
    };
    applyEnvelope(param, BUMP, 0.5, 1.5, 2);
    expect(events).toEqual([['set', 0.5, 2], ['ramp', 1, 2.5], ['ramp', 0.5, 3]]);
  });
});
