import {
  describe,
  expect,
  it
} from 'vitest';

import type {
  LoopContext,
  LoopFilter,
  LoopGain,
  LoopNode,
  LoopOscillator,
  LoopParam
} from '../audio/exposure-loops.ts';
import type { Envelope } from './envelope.ts';
import type { ExposureEntry } from './timeline.ts';

import {
  EXPOSURE_CROSSFADE_SECONDS,
  EXPOSURE_LEVELS,
  INITIAL_PULSE_RATE
} from '../audio/exposure-loops.ts';
import {
  areaUntil,
  valueAt
} from './envelope.ts';
import {
  alignedStart,
  EXPOSURE_LEAD_SECONDS,
  exposureEnvelopes,
  isExposureAudible,
  scheduleExposure
} from './exposure-track.ts';

interface FakeContext extends LoopContext {
  readonly gains: FakeGain[];
  readonly oscillators: FakeOscillator[];
}

type FakeGain = FakeNode & LoopGain;

interface FakeNode extends LoopNode {
  readonly connections: unknown[];
}

interface FakeOscillator extends LoopOscillator {
  startedAt: null | number;
}

const MICROSECONDS_PER_SECOND = 1_000_000;
const OPEN_LEVEL = 0.4;
const OPEN_RATE = 1.4;
const ENEMY_LEVEL = 0.55;
const ENEMY_RATE = 4.5;
const PRECISION = 9;

describe('exposureEnvelopes', () => {
  it('ramps each loop over the crossfade, and the rate only on the loop that plays', () => {
    const { enemy, open } = exposureEnvelopes([openAt(1), enemyAt(3), silentAt(5)]);
    const fade = EXPOSURE_CROSSFADE_SECONDS;
    const openGain = OPEN_LEVEL * EXPOSURE_LEVELS.open;
    const enemyGain = ENEMY_LEVEL * EXPOSURE_LEVELS.enemy;
    expect(open.level).toEqual([corner(0, 0), corner(1, 0), corner(1 + fade, openGain), corner(3, openGain), corner(3 + fade, 0)]);
    expect(enemy.level).toEqual([corner(0, 0), corner(3, 0), corner(3 + fade, enemyGain), corner(5, enemyGain), corner(5 + fade, 0)]);
    expect(open.rate).toEqual([corner(0, INITIAL_PULSE_RATE), corner(1, INITIAL_PULSE_RATE), corner(1 + fade, OPEN_RATE)]);
    expect(enemy.rate).toEqual([corner(0, INITIAL_PULSE_RATE), corner(3, INITIAL_PULSE_RATE), corner(3 + fade, ENEMY_RATE)]);
  });

  it('cuts a ramp still under way short from where it had got to', () => {
    const { open } = exposureEnvelopes([openAt(1), silentAt(1.05)]);
    const reached = OPEN_LEVEL * EXPOSURE_LEVELS.open * (0.05 / EXPOSURE_CROSSFADE_SECONDS);
    expect(open.level.map((point: Envelope) => point.time)).toEqual([0, 1, 1.05, 1.05 + EXPOSURE_CROSSFADE_SECONDS]);
    expect(open.level[2]?.value).toBeCloseTo(reached, PRECISION);
    expect(valueAt(open.level, 2)).toBe(0);
  });

  it('is silent with no entries', () => {
    expect(isExposureAudible(exposureEnvelopes([]), 0, 3600)).toBe(false);
    expect(isExposureAudible(exposureEnvelopes([openAt(20)]), 0, 10)).toBe(false);
    expect(isExposureAudible(exposureEnvelopes([openAt(20)]), 10, 20.1)).toBe(true);
  });
});

describe('alignedStart', () => {
  it('starts an oscillator within its first period so it has run the cycles asked, give or take whole ones, by the lead\'s end', () => {
    for (const frequency of [1, 1.4, 8, 55, 246.94]) {
      for (const cycles of [0, 0.25, 0.999, 12.5, 889_000.3]) {
        const start = alignedStart(cycles, frequency, EXPOSURE_LEAD_SECONDS);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(start).toBeLessThan(1 / frequency);
        const ran = (EXPOSURE_LEAD_SECONDS - start) * frequency;
        const offBy = ran - cycles;
        expect(offBy - Math.round(offBy)).toBeCloseTo(0, 6);
      }
    }
  });
});

describe('scheduleExposure', () => {
  it('builds only the loops heard in the window, each oscillator at its running phase', () => {
    const envelopes = exposureEnvelopes([openAt(1)]);
    const context = fakeContext();
    const destination = fakeNode();
    scheduleExposure(context, destination, envelopes, 10, 20, EXPOSURE_LEAD_SECONDS);

    // The open loop alone: its level gain, wired to the destination, at its level from the window's start.
    const levels = context.gains.filter((gain: FakeGain) => gain.connections.includes(destination));
    expect(levels).toHaveLength(1);
    expect(levels[0]?.gain.value).toBe(OPEN_LEVEL * EXPOSURE_LEVELS.open);
    const [pulse, ...carriers] = [...context.oscillators].reverse();
    expect(carriers).toHaveLength(2);
    for (const carrier of carriers) {
      const frequency = carrier.frequency.value;
      expect(carrier.startedAt).toBe(alignedStart(frequency * 10, frequency, EXPOSURE_LEAD_SECONDS));
    }
    expect(pulse?.frequency.value).toBe(OPEN_RATE);
    expect(pulse?.startedAt).toBe(alignedStart(areaUntil(envelopes.open.rate, 10), OPEN_RATE, EXPOSURE_LEAD_SECONDS));
  });

  it('builds nothing in a silent window', () => {
    const context = fakeContext();
    scheduleExposure(context, fakeNode(), exposureEnvelopes([openAt(30)]), 10, 20, EXPOSURE_LEAD_SECONDS);
    expect(context.oscillators).toHaveLength(0);
  });
});

function corner(time: number, value: number): Envelope {
  return { time, value };
}

function enemyAt(seconds: number): ExposureEntry {
  return { enemy: ENEMY_LEVEL, open: 0, rate: ENEMY_RATE, timestamp: seconds * MICROSECONDS_PER_SECOND };
}

function fakeContext(): FakeContext {
  const gains: FakeGain[] = [];
  const oscillators: FakeOscillator[] = [];
  return {
    createBiquadFilter(): LoopFilter {
      return Object.assign(fakeNode(), { frequency: fakeParam(), Q: fakeParam(), type: 'lowpass' as const });
    },
    createGain(): LoopGain {
      const gain: FakeGain = Object.assign(fakeNode(), { gain: fakeParam() });
      gains.push(gain);
      return gain;
    },
    createOscillator(): LoopOscillator {
      const oscillator: FakeOscillator = Object.assign(fakeNode(), {
        frequency: fakeParam(),
        onended: null,
        start(when = 0): void {
          oscillator.startedAt = when;
        },
        startedAt: null,
        stop(): void {
          // Never stopped in a window.
        },
        type: 'sine' as const
      });
      oscillators.push(oscillator);
      return oscillator;
    },
    currentTime: 0,
    gains,
    oscillators
  };
}

function fakeNode(): FakeNode {
  const connections: unknown[] = [];
  const node: FakeNode = {
    connect(destination: LoopNode | LoopParam): void {
      connections.push(destination);
    },
    connections,
    disconnect(): void {
      // Nothing to undo.
    }
  };
  return node;
}

function fakeParam(): LoopParam {
  return {
    cancelScheduledValues(): void {
      // Nothing scheduled to cancel.
    },
    linearRampToValueAtTime(): void {
      // The schedule is the envelope's, tested there.
    },
    setValueAtTime(): void {
      // The schedule is the envelope's, tested there.
    },
    value: 0
  };
}

function openAt(seconds: number): ExposureEntry {
  return { enemy: 0, open: OPEN_LEVEL, rate: OPEN_RATE, timestamp: seconds * MICROSECONDS_PER_SECOND };
}

function silentAt(seconds: number): ExposureEntry {
  return { enemy: 0, open: 0, rate: 0, timestamp: seconds * MICROSECONDS_PER_SECOND };
}
