import {
  describe,
  expect,
  it
} from 'vitest';

import { nextOf } from './enemy-menu.ts';
import {
  ENEMY_COUNTS,
  ENEMY_LEVELS,
  ENEMY_MODES,
  ENEMY_VISIONS
} from './entities/enemy-modes.ts';

describe('nextOf', () => {
  it('wraps from 100% back to Ramp (original)', () => {
    expect(nextOf(ENEMY_LEVELS, 1)).toBeNull();
    expect(nextOf(ENEMY_LEVELS, null)).toBe(0);
  });

  it('wraps from 30 bots back to the original count', () => {
    expect(nextOf(ENEMY_COUNTS, ENEMY_COUNTS.at(-1) ?? null)).toBeNull();
  });

  it('visits every value once and returns to the start, for every cycling setting', () => {
    for (const values of [ENEMY_COUNTS, ENEMY_LEVELS, ENEMY_MODES, ENEMY_VISIONS] as const) {
      const [first] = values;
      const seen: unknown[] = [];
      let current: unknown = first;
      for (const _value of values) {
        seen.push(current);
        current = nextOf<unknown>(values, current);
      }
      expect(seen).toEqual(values);
      expect(current).toBe(first);
    }
  });

  it('keeps the current value only for an empty list', () => {
    expect(nextOf<null | number>([], null)).toBeNull();
    expect(nextOf<null | number>([], 3)).toBe(3);
  });
});
