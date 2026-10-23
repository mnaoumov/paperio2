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
} from './exposure-loops.ts';

import {
  EXPOSURE_CROSSFADE_SECONDS,
  EXPOSURE_LEVELS,
  ExposureLoops
} from './exposure-loops.ts';
import {
  exposureMix,
  FULL_TENSION_TRAIL_LENGTH,
  SILENT_MIX
} from './exposure.ts';

type Automation = readonly ['cancel' | 'ramp' | 'set', number, number];

interface FakeContext extends LoopContext {
  currentTime: number;
  readonly gains: FakeGain[];
  readonly oscillators: FakeOscillator[];
}

interface FakeGain extends FakeNode, LoopGain {
  readonly gain: FakeParam;
}

interface FakeNode extends LoopNode {
  readonly connections: (LoopNode | LoopParam)[];
  disconnected: boolean;
}

interface FakeOscillator extends FakeNode, LoopOscillator {
  readonly frequency: FakeParam;
  started: boolean;
  stoppedAt: null | number;
}

interface FakeParam extends LoopParam {
  readonly events: Automation[];
}

interface Harness {
  readonly context: FakeContext;
  readonly destination: FakeNode;
  readonly loops: ExposureLoops;
}

interface Levels {
  readonly enemy: FakeGain;
  readonly open: FakeGain;
}

const OPEN_SHORT = exposureMix('open', 0);
const ENEMY_SHORT = exposureMix('enemy', 0);
const START_TIME = 10;
const CROSSFADE_TIME = 12;
const CURRENT_OPEN_GAIN = 0.1;
const QUIETEST_CAPTURE_LEVEL = 0.6;

describe('ExposureLoops', () => {
  it('builds nothing while silent', () => {
    const test = harness();
    test.loops.apply(SILENT_MIX);
    expect(test.context.gains).toHaveLength(0);
    expect(test.context.oscillators).toHaveLength(0);
  });

  it('starts the open loop with a crossfade on stepping off home, the enemy loop staying at 0', () => {
    const test = harness();
    test.loops.apply(OPEN_SHORT);
    const { enemy, open } = levels(test);
    expect(test.context.oscillators.every((oscillator: FakeOscillator) => oscillator.started)).toBe(true);
    expect(lastRamp(open.gain)).toEqual(['ramp', OPEN_SHORT.open * EXPOSURE_LEVELS.open, START_TIME + EXPOSURE_CROSSFADE_SECONDS]);
    expect(lastRamp(enemy.gain)).toEqual(['ramp', 0, START_TIME + EXPOSURE_CROSSFADE_SECONDS]);
  });

  it('crossfades open into enemy, both ramps starting from the current value at the same moment', () => {
    const test = harness();
    test.loops.apply(OPEN_SHORT);
    const { enemy, open } = levels(test);
    test.context.currentTime = CROSSFADE_TIME;
    open.gain.value = CURRENT_OPEN_GAIN;
    test.loops.apply(ENEMY_SHORT);
    const end = CROSSFADE_TIME + EXPOSURE_CROSSFADE_SECONDS;
    expect(open.gain.events.slice(-3)).toEqual([['cancel', 0, CROSSFADE_TIME], ['set', CURRENT_OPEN_GAIN, CROSSFADE_TIME], ['ramp', 0, end]]);
    expect(lastRamp(enemy.gain)).toEqual(['ramp', ENEMY_SHORT.enemy * EXPOSURE_LEVELS.enemy, end]);
  });

  it('fades both loops out on reaching home, without stopping them', () => {
    const test = harness();
    test.loops.apply(ENEMY_SHORT);
    const { enemy, open } = levels(test);
    test.loops.apply(SILENT_MIX);
    expect(lastRamp(enemy.gain)?.[1]).toBe(0);
    expect(lastRamp(open.gain)?.[1]).toBe(0);
    expect(test.context.oscillators.every((oscillator: FakeOscillator) => oscillator.stoppedAt === null)).toBe(true);
  });

  it('schedules nothing when the mix has not changed', () => {
    const test = harness();
    test.loops.apply(OPEN_SHORT);
    const { open } = levels(test);
    const count = open.gain.events.length;
    test.loops.apply(exposureMix('open', 1));
    expect(open.gain.events).toHaveLength(count);
  });

  it('quickens and raises the playing loop as the trail grows', () => {
    const test = harness();
    test.loops.apply(OPEN_SHORT);
    const long = exposureMix('open', FULL_TENSION_TRAIL_LENGTH);
    test.loops.apply(long);
    // Only the open loop's pulse is driven; the enemy loop's keeps its own rate while silent.
    const pulses = test.context.oscillators.filter((oscillator: FakeOscillator) => oscillator.frequency.events.length > 0);
    expect(pulses).toHaveLength(1);
    expect(lastRamp(pulses[0]?.frequency)?.[1]).toBe(long.rate);
    expect(long.rate).toBeGreaterThan(OPEN_SHORT.rate);
    expect(lastRamp(levels(test).open.gain)?.[1]).toBe(EXPOSURE_LEVELS.open);
  });

  it('keeps both loops under the quietest capture sound', () => {
    expect(EXPOSURE_LEVELS.enemy).toBeLessThan(QUIETEST_CAPTURE_LEVEL);
    expect(EXPOSURE_LEVELS.open).toBeLessThan(EXPOSURE_LEVELS.enemy);
  });

  it('on stop, fades out, stops every oscillator after the fade and disconnects once they end', () => {
    const test = harness();
    test.loops.apply(ENEMY_SHORT);
    const { enemy } = levels(test);
    test.loops.stop();
    const end = START_TIME + EXPOSURE_CROSSFADE_SECONDS;
    expect(lastRamp(enemy.gain)).toEqual(['ramp', 0, end]);
    expect(test.context.oscillators.every((oscillator: FakeOscillator) => oscillator.stoppedAt === end)).toBe(true);
    const ended = test.context.oscillators.find((oscillator: FakeOscillator) => oscillator.onended !== null);
    ended?.onended?.(new Event('ended'));
    expect(test.context.gains.every((gain: FakeGain) => gain.disconnected)).toBe(true);
    // A later step off home builds a fresh pair.
    test.loops.apply(OPEN_SHORT);
    expect(test.context.oscillators.some((oscillator: FakeOscillator) => oscillator.stoppedAt === null)).toBe(true);
  });
});

function fakeContext(): FakeContext {
  const gains: FakeGain[] = [];
  const oscillators: FakeOscillator[] = [];
  return {
    createBiquadFilter(): LoopFilter {
      return Object.assign(fakeNode(), { frequency: fakeParam(), Q: fakeParam(), type: 'lowpass' as const });
    },
    createGain(): FakeGain {
      const gain: FakeGain = Object.assign(fakeNode(), { gain: fakeParam() });
      gains.push(gain);
      return gain;
    },
    createOscillator(): FakeOscillator {
      const oscillator: FakeOscillator = Object.assign(fakeNode(), {
        frequency: fakeParam(),
        onended: null,
        start(): void {
          oscillator.started = true;
        },
        started: false,
        stop(when = 0): void {
          oscillator.stoppedAt = when;
        },
        stoppedAt: null,
        type: 'sine' as const
      });
      oscillators.push(oscillator);
      return oscillator;
    },
    currentTime: START_TIME,
    gains,
    oscillators
  };
}

function fakeNode(): FakeNode {
  const node: FakeNode = {
    connect(destination: LoopNode | LoopParam): void {
      node.connections.push(destination);
    },
    connections: [],
    disconnect(): void {
      node.disconnected = true;
    },
    disconnected: false
  };
  return node;
}

function fakeParam(): FakeParam {
  const events: Automation[] = [];
  return {
    cancelScheduledValues(cancelTime: number): void {
      events.push(['cancel', 0, cancelTime]);
    },
    events,
    linearRampToValueAtTime(value: number, endTime: number): void {
      events.push(['ramp', value, endTime]);
    },
    setValueAtTime(value: number, startTime: number): void {
      events.push(['set', value, startTime]);
    },
    value: 0
  };
}

function harness(): Harness {
  const context = fakeContext();
  const destination = fakeNode();
  return { context, destination, loops: new ExposureLoops(context, destination) };
}

function lastRamp(param: FakeParam | undefined): Automation | undefined {
  return param?.events.filter((event: Automation) => event[0] === 'ramp').at(-1);
}

/**
 * The two loops' level gains, the only gains wired to the destination: enemy first, as they are built.
 *
 * @param test - The harness.
 * @returns The level gains.
 */
function levels(test: Harness): Levels {
  const [enemy, open] = test.context.gains.filter((gain: FakeGain) => gain.connections.includes(test.destination));
  if (!enemy || !open) {
    throw new Error('the loops are not built');
  }
  return { enemy, open };
}
