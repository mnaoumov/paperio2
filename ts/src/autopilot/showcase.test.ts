import {
  describe,
  expect,
  it
} from 'vitest';

import {
  LEAD_MARGIN,
  pickLeader
} from './showcase.ts';

describe('pickLeader', () => {
  const small = { percent: 0.01 };
  const large = { percent: 0.05 };

  it('picks the unit with the most territory', () => {
    expect(pickLeader([small, large], null)).toBe(large);
  });

  it('keeps the current leader while another is ahead by less than the margin', () => {
    const close = { percent: large.percent + LEAD_MARGIN / 2 };
    expect(pickLeader([large, close], large)).toBe(large);
  });

  it('hands over once another is ahead by the margin', () => {
    const ahead = { percent: large.percent + LEAD_MARGIN * 2 };
    expect(pickLeader([large, ahead], large)).toBe(ahead);
  });

  it('drops a leader that is no longer alive', () => {
    expect(pickLeader([small], large)).toBe(small);
  });

  it('has no leader without units', () => {
    expect(pickLeader([], null)).toBeNull();
  });
});
