import {
  describe,
  expect,
  it
} from 'vitest';

import { TerritoryLoss } from './territory-loss.ts';

describe('rendered territory loss', () => {
  it('waits for a visible drop, ignoring initial area, growth and unchanged frames', () => {
    const loss = new TerritoryLoss();
    expect(loss.sample({ area: 0.1, size: 200, time: 0 })).toBe(false);
    expect(loss.sample({ area: 0.1, size: 200, time: 16 })).toBe(false);
    expect(loss.sample({ area: 0.2, size: 200, time: 32 })).toBe(false);
    expect(loss.sample({ area: 0.19, size: 200, time: 48 })).toBe(true);
    expect(loss.sample({ area: 0.19, size: 200, time: 64 })).toBe(false);
  });

  it('ignores subpixel losses and edge noise without accumulating it across frames', () => {
    const loss = new TerritoryLoss();
    expect(loss.sample({ area: 0.1, size: 50, time: 0 })).toBe(false);
    expect(loss.sample({ area: 0.0998, size: 50, time: 16 })).toBe(false);
    expect(loss.sample({ area: 0.0996, size: 50, time: 32 })).toBe(false);
    expect(loss.sample({ area: 0.099, size: 50, time: 48 })).toBe(true);
  });

  it('uses the noise floor even on a large minimap', () => {
    const loss = new TerritoryLoss();
    expect(loss.sample({ area: 0.1, size: 1000, time: 0 })).toBe(false);
    expect(loss.sample({ area: 0.09999, size: 1000, time: 16 })).toBe(false);
  });

  it('plays once through a burst and rearms after a quiet interval', () => {
    const loss = new TerritoryLoss();
    expect(loss.sample({ area: 0.2, size: 200, time: 0 })).toBe(false);
    expect(loss.sample({ area: 0.19, size: 200, time: 100 })).toBe(true);
    expect(loss.sample({ area: 0.18, size: 200, time: 400 })).toBe(false);
    expect(loss.sample({ area: 0.17, size: 200, time: 800 })).toBe(false);
    expect(loss.sample({ area: 0.16, size: 200, time: 1400 })).toBe(true);
  });

  it('starts fresh on respawn, resize and a rewound game clock', () => {
    const loss = new TerritoryLoss();
    expect(loss.sample({ area: 0.2, size: 200, time: 1000 })).toBe(false);
    loss.reset();
    expect(loss.sample({ area: 0.1, size: 200, time: 1000 })).toBe(false);
    expect(loss.sample({ area: 0.09, size: 100, time: 1016 })).toBe(false);
    expect(loss.sample({ area: 0.08, size: 100, time: 0 })).toBe(false);
    expect(loss.sample({ area: 0.07, size: 100, time: 16 })).toBe(true);
  });
});
