/**
 * @file
 *
 * The recorded scenarios of the differential test: each is a seed for the page's `Math.random` plus a scripted
 * route for the player, written as legs of held arrow keys. Holding two adjacent arrows steers diagonally, which
 * is how the joystick drives the engine too.
 */

import type {
  KeyEvent,
  Scenario
} from './harness.ts';

export const KEY_UP = 38;
export const KEY_DOWN = 40;
export const KEY_LEFT = 37;
export const KEY_RIGHT = 39;

/** One leg of a route: the arrow keys held, and for how many frames. */
export type Leg = readonly [keys: readonly number[], frames: number];

/**
 * A long pseudo-random walk: legs of 20 to 80 frames over all eight directions plus "no key" (which hands steering
 * to the engine's pointer fallback), from a fixed LCG so the script is the same on every run.
 */
export function randomWalk(seed: number, legCount: number): Leg[] {
  /* eslint-disable no-magic-numbers -- the LCG constants and the leg-length range. */
  const directions: readonly (readonly number[])[] = [
    [KEY_UP],
    [KEY_UP, KEY_RIGHT],
    [KEY_RIGHT],
    [KEY_RIGHT, KEY_DOWN],
    [KEY_DOWN],
    [KEY_DOWN, KEY_LEFT],
    [KEY_LEFT],
    [KEY_LEFT, KEY_UP],
    []
  ];
  let state = seed;
  function next(bound: number): number {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state % bound;
  }
  const legs: Leg[] = [];
  for (let index = 0; index < legCount; index++) {
    legs.push([directions[next(directions.length)] ?? [], 20 + next(61)]);
  }
  return legs;
  /* eslint-enable no-magic-numbers -- end of the LCG constants. */
}

/** Converts legs into key events, releasing each leg's keys as the next leg's keys go down. */
export function route(firstFrame: number, legs: readonly Leg[]): KeyEvent[] {
  const events: KeyEvent[] = [];
  let frame = firstFrame;
  let held: readonly number[] = [];
  for (const [keys, frames] of legs) {
    for (const keyCode of held) {
      events.push({ frame, isDown: false, keyCode });
    }
    for (const keyCode of keys) {
      events.push({ frame, isDown: true, keyCode });
    }
    held = keys;
    frame += frames;
  }
  for (const keyCode of held) {
    events.push({ frame, isDown: false, keyCode });
  }
  return events;
}

const START_FRAME = 120;
const FIRST_INPUT_FRAME = 150;

/* eslint-disable no-magic-numbers -- the scripted routes are data: frame counts per leg. */
export const SCENARIOS: readonly Scenario[] = [
  {
    // A clean loop out of the base and back: the player captures territory twice, then rides along the wall.
    expectedCoverage: { botKillsByBots: 1, playerCaptures: 2 },
    frames: 2400,
    keys: route(FIRST_INPUT_FRAME, [[[KEY_RIGHT], 90], [[KEY_UP], 90], [[KEY_LEFT], 115], [[KEY_DOWN], 90], [[KEY_RIGHT], 60], [[KEY_UP], 630]]),
    name: 'capture loop, then the wall',
    seed: 2,
    startFrame: START_FRAME
  },
  {
    // A bot cuts the player's trail on the way out; the bots then play on and kill each other.
    expectedCoverage: { botKillsByBots: 1, playerKilledByBots: 1 },
    frames: 2400,
    keys: route(FIRST_INPUT_FRAME, [[[KEY_RIGHT], 90], [[KEY_UP], 90], [[KEY_LEFT], 90], [[KEY_DOWN], 120]]),
    name: 'killed by a bot, bots play on',
    seed: 1,
    startFrame: START_FRAME
  },
  {
    // The return leg runs back over where the first leg went (that trail was already cut, so the player lives),
    // Then the player rides the bottom wall.
    expectedCoverage: { botDeaths: 1 },
    frames: 1200,
    keys: route(FIRST_INPUT_FRAME, [[[KEY_RIGHT], 90], [[KEY_UP], 60], [[KEY_LEFT], 45], [[KEY_DOWN], 120]]),
    name: 'back over its own path, then along the wall',
    seed: 7,
    startFrame: START_FRAME
  },
  {
    // Eight-way and diagonal steering plus the pointer fallback, until the player dies with no killer.
    expectedCoverage: { botKillsByBots: 1, playerDeaths: 1 },
    frames: 3000,
    keys: route(FIRST_INPUT_FRAME, randomWalk(11, 70)),
    name: 'random walk',
    seed: 11,
    startFrame: START_FRAME
  }
];
/* eslint-enable no-magic-numbers -- end of the scripted routes. */
