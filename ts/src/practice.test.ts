import {
  describe,
  expect,
  it
} from 'vitest';

import {
  keepsAutoCheckpoint,
  RECENT_AUTO_CHECKPOINTS
} from './practice.ts';

const AUTO_CHECKPOINTS_PER_HOUR = 360;

function keptAfter(latestIndex: number): number[] {
  let kept: number[] = [];
  for (let index = 0; index <= latestIndex; index++) {
    kept.push(index);
    kept = kept.filter((candidate) => keepsAutoCheckpoint(candidate, index));
  }
  return kept;
}

describe('keepsAutoCheckpoint', () => {
  it('keeps every recent automatic checkpoint', () => {
    const kept = keptAfter(AUTO_CHECKPOINTS_PER_HOUR);
    for (let age = 0; age < RECENT_AUTO_CHECKPOINTS; age++) {
      expect(kept).toContain(AUTO_CHECKPOINTS_PER_HOUR - age);
    }
  });

  it('keeps the first one, and 25 after an hour at one every 10 seconds', () => {
    const kept = keptAfter(AUTO_CHECKPOINTS_PER_HOUR);
    expect(kept[0]).toBe(0);
    expect(kept).toHaveLength(25);
  });

  it('adds 6 for each further hour', () => {
    expect(keptAfter(AUTO_CHECKPOINTS_PER_HOUR * 2).length - keptAfter(AUTO_CHECKPOINTS_PER_HOUR).length).toBe(6);
  });

  it('never brings back one it dropped, since a checkpoint only grows older', () => {
    const latestIndex = AUTO_CHECKPOINTS_PER_HOUR;
    for (let index = 0; index < latestIndex; index++) {
      if (!keepsAutoCheckpoint(index, latestIndex)) {
        expect(keepsAutoCheckpoint(index, latestIndex + 1)).toBe(false);
      }
    }
  });
});
