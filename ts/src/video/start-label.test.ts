import {
  describe,
  expect,
  it
} from 'vitest';

import {
  formatStartLabel,
  formatStartTooltip
} from './start-label.ts';

const OCTOBER = 9;
const NOW = new Date(2026, OCTOBER, 22, 23, 15).getTime();

describe('formatStartLabel', () => {
  it('shows only the time for a take from today', () => {
    expect(formatStartLabel(new Date(2026, OCTOBER, 22, 14, 8).getTime(), NOW, 'en-US')).toMatch(/^2:08\sPM$/v);
    expect(formatStartLabel(new Date(2026, OCTOBER, 22, 14, 8).getTime(), NOW, 'de-DE')).toBe('14:08');
  });

  it('adds the month and day for an earlier day of this year', () => {
    expect(formatStartLabel(new Date(2026, OCTOBER, 21, 14, 8).getTime(), NOW, 'en-US')).toMatch(/^Oct 21, 2:08\sPM$/v);
  });

  it('adds the year for an earlier year', () => {
    expect(formatStartLabel(new Date(2025, OCTOBER, 22, 14, 8).getTime(), NOW, 'en-US')).toMatch(/^Oct 22, 2025, 2:08\sPM$/v);
  });

  it('keeps the full date and time with seconds for the tooltip', () => {
    expect(formatStartTooltip(new Date(2026, OCTOBER, 22, 14, 8, 30).getTime(), 'en-US')).toMatch(/^Thursday, October 22, 2026 at 2:08:30\sPM$/v);
  });
});
