import {
  describe,
  expect,
  it
} from 'vitest';

import type { GhostTrack } from './track.ts';

import {
  GHOST_SAMPLE_INTERVAL_MILLISECONDS,
  ghostAt,
  ghostPath,
  GhostRecorder,
  ghostStorageKey,
  isBetterRun,
  parseGhost
} from './track.ts';

const RECORDED_AT = 1_700_000_000_000;

function track(points: readonly (readonly [number, number, number, number])[]): GhostTrack {
  const recorder = new GhostRecorder('abc');
  for (const [time, x, y, percent] of points) {
    recorder.sample(time, x, y, percent);
  }
  const result = recorder.finish('You', RECORDED_AT);
  if (!result) {
    throw new Error('Nothing was sampled');
  }
  return result;
}

describe('the ghost track', () => {
  it('samples no more often than the interval, but sees every best', () => {
    const recorder = new GhostRecorder(null);
    recorder.sample(0, 1, 1, 0.01);
    recorder.sample(GHOST_SAMPLE_INTERVAL_MILLISECONDS / 2, 2, 2, 0.05);
    recorder.sample(GHOST_SAMPLE_INTERVAL_MILLISECONDS, 3, 3, 0.04);
    const result = recorder.finish('You', RECORDED_AT);
    expect(result?.samples).toEqual([0, 1, 1, 0.01, GHOST_SAMPLE_INTERVAL_MILLISECONDS, 3, 3, 0.04]);
    expect(result?.best).toBe(0.05);
    expect(result?.bestAt).toBe(GHOST_SAMPLE_INTERVAL_MILLISECONDS / 2);
  });

  it('has nothing to finish when nothing was sampled', () => {
    expect(new GhostRecorder(null).finish('You', RECORDED_AT)).toBeNull();
  });

  it('interpolates between samples and stays at the end after it', () => {
    const ghost = track([[0, 0, 0, 0], [100, 10, 20, 0.2]]);
    expect(ghostAt(ghost, -1)).toBeNull();
    expect(ghostAt(ghost, 50)).toEqual({ ended: false, percent: 0.1, x: 5, y: 10 });
    expect(ghostAt(ghost, 500)).toEqual({ ended: true, percent: 0.2, x: 10, y: 20 });
  });

  it('gives the path over a span', () => {
    const ghost = track([[0, 0, 0, 0], [100, 1, 1, 0], [200, 2, 2, 0], [300, 3, 3, 0]]);
    expect(ghostPath(ghost, 100, 200)).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
  });

  it('ranks runs by territory, then by how soon they got it', () => {
    const small = track([[0, 0, 0, 0.1]]);
    const large = track([[0, 0, 0, 0.2]]);
    const largeLater = track([[0, 0, 0, 0.1], [100, 0, 0, 0.2]]);
    expect(isBetterRun(small, null)).toBe(true);
    expect(isBetterRun(large, small)).toBe(true);
    expect(isBetterRun(small, large)).toBe(false);
    expect(isBetterRun(large, largeLater)).toBe(true);
    expect(isBetterRun(largeLater, large)).toBe(false);
  });

  it('keeps one best run per seed', () => {
    expect(ghostStorageKey(null)).not.toBe(ghostStorageKey('free'));
    expect(ghostStorageKey('a')).not.toBe(ghostStorageKey('b'));
  });

  it('reads back what it stored and refuses anything else', () => {
    const ghost = track([[0, 1, 2, 0.3]]);
    expect(parseGhost(JSON.stringify(ghost))).toEqual(ghost);
    expect(parseGhost(null)).toBeNull();
    expect(parseGhost('not json')).toBeNull();
    expect(parseGhost(JSON.stringify({ ...ghost, version: 0 }))).toBeNull();
    expect(parseGhost(JSON.stringify({ ...ghost, samples: [1, 2, 3] }))).toBeNull();
  });
});
