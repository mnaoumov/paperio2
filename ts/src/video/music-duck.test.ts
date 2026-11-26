import {
  describe,
  expect,
  it
} from 'vitest';

import type { Envelope } from './envelope.ts';
import type {
  ExposureEntry,
  SoundEntry
} from './timeline.ts';

import {
  DUCK_ATTACK_SECONDS,
  DUCK_RELEASE_SECONDS,
  MUSIC_DUCK_GAIN
} from '../audio/ducking.ts';
import { valueAt } from './envelope.ts';
import {
  duckEnvelope,
  duckSpans
} from './music-duck.ts';

const MICROSECONDS = 1_000_000;
const KILL_SECONDS = 0.8;
const TOTAL_SECONDS = 30;

describe('duckSpans', () => {
  it('spans each stretch with a loop above silence, and each ducking alert for its length', () => {
    const exposures: ExposureEntry[] = [exposure(2, 0.4, 0), exposure(3, 0, 1), exposure(5, 0, 0), exposure(20, 0.5, 0)];
    const sounds: SoundEntry[] = [sound(10, 'kill'), sound(12, 'capture-small')];
    const spans = duckSpans(exposures, sounds, (name: string) => name === 'kill' ? KILL_SECONDS : 1, TOTAL_SECONDS);
    expect(spans).toEqual([{ end: 10 + KILL_SECONDS, start: 10 }, { end: 5, start: 2 }, { end: TOTAL_SECONDS, start: 20 }]);
  });

  it('skips an alert whose sound did not load', () => {
    expect(duckSpans([], [sound(1, 'territory-loss')], () => undefined, TOTAL_SECONDS)).toEqual([]);
  });
});

describe('duckEnvelope', () => {
  it('ducks over the attack, holds, and comes back over the release', () => {
    const points = duckEnvelope([{ end: 5, start: 2 }]);
    expect(valueAt(points, 1)).toBe(1);
    expect(valueAt(points, 2 + DUCK_ATTACK_SECONDS)).toBe(MUSIC_DUCK_GAIN);
    expect(valueAt(points, 4)).toBe(MUSIC_DUCK_GAIN);
    expect(valueAt(points, 5 + DUCK_RELEASE_SECONDS)).toBe(1);
  });

  it('merges overlapping spans', () => {
    const points = duckEnvelope([{ end: 6, start: 4 }, { end: 5, start: 2 }]);
    expect(valueAt(points, 5.5)).toBe(MUSIC_DUCK_GAIN);
    expect(valueAt(points, 6 + DUCK_RELEASE_SECONDS)).toBe(1);
  });

  it('turns the music down again from where its release had got to', () => {
    const halfway = 5 + DUCK_RELEASE_SECONDS / 2;
    const points = duckEnvelope([{ end: 5, start: 2 }, { end: 9, start: halfway }]);
    const expected = (MUSIC_DUCK_GAIN + 1) / 2;
    expect(valueAt(points, halfway)).toBeCloseTo(expected);
    expect(valueAt(points, halfway + DUCK_ATTACK_SECONDS)).toBe(MUSIC_DUCK_GAIN);
    // Times are kept in order, so the envelope schedules as one line.
    expect(points.every((point: Envelope, index: number) => index === 0 || (points[index - 1]?.time ?? 0) <= point.time)).toBe(true);
  });
});

function exposure(seconds: number, open: number, enemy: number): ExposureEntry {
  return { enemy, open, rate: open + enemy > 0 ? 1 : 0, timestamp: seconds * MICROSECONDS };
}

function sound(seconds: number, name: string): SoundEntry {
  return { gain: 1, sound: name, timestamp: seconds * MICROSECONDS };
}
