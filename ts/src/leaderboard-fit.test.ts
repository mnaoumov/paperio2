import {
  describe,
  expect,
  it
} from 'vitest';

import type { LeaderboardRowFitInput } from './leaderboard-fit.ts';

import { fitLeaderboardRow } from './leaderboard-fit.ts';

const CHARACTER_WIDTH = 10;
const RIGHT_EDGE = 1000;
const BAR_WIDTH = 300;
const HALF_BAR_HEIGHT = 15;
const FLAG_WIDTH = 24;

function row(overrides: Partial<LeaderboardRowFitInput>): LeaderboardRowFitInput {
  return {
    barWidth: BAR_WIDTH,
    barX: RIGHT_EDGE - BAR_WIDTH,
    halfBarHeight: HALF_BAR_HEIGHT,
    iconWidth: 0,
    measure: (text: string) => Array.from(text).length * CHARACTER_WIDTH,
    name: 'dome',
    prefix: '3 – 4.82% ',
    rightEdge: RIGHT_EDGE,
    ...overrides
  };
}

describe('fitLeaderboardRow', () => {
  it('keeps the original position and text when the label already fits', () => {
    const input = row({ barX: 820 });
    expect(fitLeaderboardRow(input)).toEqual({ barX: 820, label: '3 – 4.82% dome' });
  });

  it('moves a staggered bar left just enough for its text to end a margin inside the right edge', () => {
    const input = row({ barX: 900, name: 'mnaoumov', prefix: '16 – 0.10% ' });
    // 19 characters, plus the margin on both sides.
    expect(fitLeaderboardRow(input)).toEqual({ barX: RIGHT_EDGE - 190 - 2 * HALF_BAR_HEIGHT, label: '16 – 0.10% mnaoumov' });
  });

  it('counts the flag before the text', () => {
    const input = row({ barX: 900, iconWidth: FLAG_WIDTH, name: 'mnaoumov', prefix: '16 – 0.10% ' });
    expect(fitLeaderboardRow(input).barX).toBe(RIGHT_EDGE - 190 - 2 * HALF_BAR_HEIGHT - FLAG_WIDTH);
  });

  it('cuts short a name that cannot fit even at the top bar position', () => {
    const input = row({ barX: 950, iconWidth: FLAG_WIDTH, name: 'an extremely long player name', prefix: '16 – 0.10% ' });
    const { barX, label } = fitLeaderboardRow(input);
    expect(barX).toBe(RIGHT_EDGE - 240 - 2 * HALF_BAR_HEIGHT - FLAG_WIDTH);
    // 300 - 24 - 30 = 246 px, so 24 characters: the 11-character prefix, 12 of the name and the ellipsis.
    expect(label).toBe('16 – 0.10% an extremely…');
  });

  it('drops a trailing space before the ellipsis', () => {
    const input = row({ barWidth: 280, name: 'Unbelievable! Junior', prefix: '1 – 9.76% ' });
    // 250 px: the 10-character prefix leaves 15 for the name and the ellipsis, which cuts right after the space.
    expect(fitLeaderboardRow(input).label).toBe('1 – 9.76% Unbelievable!…');
  });

  it('keeps the prefix whole and never moves left of the top bar when even the prefix does not fit', () => {
    const input = row({ barWidth: 100, barX: 950, name: 'mnaoumov', prefix: '16 – 0.10% ' });
    expect(fitLeaderboardRow(input)).toEqual({ barX: RIGHT_EDGE - 100, label: '16 – 0.10% …' });
  });
});
