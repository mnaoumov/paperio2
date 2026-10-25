import {
  describe,
  expect,
  it
} from 'vitest';

import type {
  ReplayResults,
  TrialOutcome
} from './situation.ts';

import {
  compareReplays,
  exactMcNemarP,
  poissonInterval
} from './situation.ts';

function outcomes(deaths: readonly boolean[]): TrialOutcome[] {
  return deaths.map((died) => ({ died, gain: 0, reason: died ? 'trail cut' : null, seconds: 30 }));
}

function results(label: string, deaths: readonly boolean[]): ReplayResults {
  return { commit: null, controlWindowSeconds: 60, deathWindowSeconds: 30, label, situations: [{ kind: 'death', name: 'seed1', outcomes: outcomes(deaths) }], trials: deaths.length };
}

describe('exactMcNemarP', () => {
  it('is 1 with nothing to tell the pilots apart', () => {
    expect(exactMcNemarP(0, 0)).toBe(1);
    expect(exactMcNemarP(3, 3)).toBe(1);
  });

  it('matches the two-sided binomial tail', () => {
    // 2 * P(X <= 1) for X ~ Binomial(10, 1/2) = 2 * 11 / 1024.
    expect(exactMcNemarP(1, 9)).toBeCloseTo(22 / 1024, 10);
    expect(exactMcNemarP(9, 1)).toBeCloseTo(22 / 1024, 10);
  });
});

describe('poissonInterval', () => {
  it('is close to the exact interval', () => {
    // The exact 95% interval for 10 is 4.795-18.390.
    const [lower, upper] = poissonInterval(10);
    expect(lower).toBeCloseTo(4.795, 1);
    expect(upper).toBeCloseTo(18.39, 1);
  });

  it('starts at 0 for no events', () => {
    const [lower, upper] = poissonInterval(0);
    expect(lower).toBe(0);
    expect(upper).toBeCloseTo(3.689, 0);
  });
});

describe('compareReplays', () => {
  it('pairs the trials of the same situation', () => {
    const report = compareReplays(results('main', [true, true, false, true]), results('variant', [false, true, false, false]));
    expect(report).toContain('| death | 1 | 4 | 3 | 1 | 2 | 0 | 0.500 |');
    expect(report).toContain('| seed1 | 3/4 | 1/4 |');
  });
});
