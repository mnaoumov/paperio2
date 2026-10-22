import {
  describe,
  expect,
  it
} from 'vitest';

import type { BedSegment } from './playlist.ts';

import {
  audioRandom,
  planMusicBed,
  shuffledOrder
} from './playlist.ts';

function sequence(values: readonly number[]): () => number {
  let index = 0;
  return (): number => values[index++ % values.length] ?? 0;
}

describe('shuffledOrder', () => {
  it('holds every track once', () => {
    const order = shuffledOrder(5, sequence([0.9, 0.1, 0.5, 0.3]));
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('never starts a round on the track that just played', () => {
    for (let after = 0; after < 4; after++) {
      for (const seed of [0, 0.25, 0.5, 0.75, 0.99]) {
        expect(shuffledOrder(4, sequence([seed]), after)[0]).not.toBe(after);
      }
    }
  });

  it('plays a single track again', () => {
    expect(shuffledOrder(1, audioRandom, 0)).toEqual([0]);
  });
});

describe('audioRandom', () => {
  it('never draws from Math.random', () => {
    const original = Math.random;
    let draws = 0;
    Math.random = (): number => {
      draws++;
      return original();
    };
    try {
      const value = audioRandom();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    } finally {
      Math.random = original;
    }
    expect(draws).toBe(0);
  });
});

describe('planMusicBed', () => {
  const base = { crossfadeSeconds: 2, durations: [10, 20, 30], endFadeSeconds: 3 };

  it('covers the video exactly, overlapping each pair of tracks by the crossfade', () => {
    const segments = planMusicBed({ ...base, order: [1, 0, 2], totalSeconds: 50 });
    expect(segments.map((segment: BedSegment) => [segment.track, segment.start])).toEqual([[1, 0], [0, 18], [2, 26]]);
    const last = segments.at(-1);
    expect((last?.start ?? 0) + (last?.duration ?? 0)).toBe(50);
    expect(last?.fadeOut).toBe(3);
    expect(segments[0]?.fadeIn).toBe(0);
    expect(segments[1]?.fadeIn).toBe(2);
  });

  it('repeats the order when the video outlasts the playlist', () => {
    const segments = planMusicBed({ ...base, order: [0, 1], totalSeconds: 60 });
    expect(segments.map((segment: BedSegment) => segment.track)).toEqual([0, 1, 0, 1, 0]);
  });

  it('cuts a single track short for a short video', () => {
    expect(planMusicBed({ ...base, order: [2], totalSeconds: 5 })).toEqual([{ duration: 5, fadeIn: 0, fadeOut: 3, start: 0, track: 2 }]);
  });

  it('lays nothing under an empty video', () => {
    expect(planMusicBed({ ...base, order: [0], totalSeconds: 0 })).toEqual([]);
  });
});
