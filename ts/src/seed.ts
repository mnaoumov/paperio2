/**
 * @file
 *
 * The speedrun seed: `?seed=<text>` on the page's URL makes every Play start on the same map, with the same bots and
 * the same spawn point. The reconstruction replaces `Math.random` with a generator seeded from the text before the game
 * draws from it, so the game's own generators, which are seeded from `Math.random`, follow. The menu's bots run on
 * real time before Play, so the API also keeps the game as it stood the moment preparation ended and puts it back on
 * every seeded Play. `?original` never loads this module, and without the parameter nothing here runs.
 */

/** The URL parameter that carries the seed. */
export const SEED_PARAM = 'seed';
/** Seeds longer than this are cut, so a pasted URL cannot carry an arbitrarily long one. */
export const MAX_SEED_LENGTH = 64;
/** How many characters {@link createSeedText} picks. */
export const NEW_SEED_LENGTH = 8;
/** Characters a new seed is made of: no 0/O and 1/l, so a seed read aloud or retyped survives. */
// cspell:disable-next-line -- an alphabet, not a word.
const SEED_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

const UINT32_RANGE = 4294967296;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const MULBERRY_INCREMENT = 0x6d2b79f5;
const MULBERRY_SHIFT_A = 15;
const MULBERRY_SHIFT_B = 7;
const MULBERRY_SHIFT_C = 14;
const MULBERRY_MULTIPLIER = 61;

/** A seeded stand-in for `Math.random` whose place in its sequence can be read and rewound. */
export interface SeededRandom {
  readonly next: () => number;
  readonly readState: () => number;
  readonly writeState: (state: number) => void;
}

/**
 * A mulberry32 generator, which draws doubles in [0, 1) the way `Math.random` does.
 *
 * @param seed - The 32-bit starting state.
 * @returns The generator.
 */
export function createSeededRandom(seed: number): SeededRandom {
  /* eslint-disable no-bitwise -- mulberry32 is defined by its 32-bit integer operations. */
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + MULBERRY_INCREMENT) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> MULBERRY_SHIFT_A), value | 1);
      value ^= value + Math.imul(value ^ (value >>> MULBERRY_SHIFT_B), value | MULBERRY_MULTIPLIER);
      return ((value ^ (value >>> MULBERRY_SHIFT_C)) >>> 0) / UINT32_RANGE;
    },
    readState(): number {
      return state;
    },
    writeState(nextState: number): void {
      state = nextState >>> 0;
    }
  };
  /* eslint-enable no-bitwise -- end of mulberry32. */
}

/**
 * A random seed for the menu's New seed button. It draws from `crypto`, never from `Math.random`, which the game owns.
 *
 * @returns The seed.
 */
export function createSeedText(): string {
  const values = new Uint32Array(NEW_SEED_LENGTH);
  crypto.getRandomValues(values);
  return Array.from(values, (value: number) => SEED_ALPHABET.charAt(value % SEED_ALPHABET.length)).join('');
}

/**
 * Turns a seed's text into the generator's 32-bit starting state (FNV-1a over its UTF-16 code units).
 *
 * @param text - The seed.
 * @returns The state.
 */
export function hashSeed(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index++) {
    // eslint-disable-next-line no-bitwise -- FNV-1a is defined by its 32-bit integer operations.
    hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME) >>> 0;
  }
  return hash;
}

/**
 * Replaces `Math.random` with a generator seeded from the text.
 *
 * @param text - The seed.
 * @returns The generator, so the API can read and rewind it.
 */
export function installSeededMathRandom(text: string): SeededRandom {
  const random = createSeededRandom(hashSeed(text));
  Math.random = random.next;
  return random;
}

/**
 * Reads the seed from a URL's query string.
 *
 * @param search - `location.search`.
 * @returns The trimmed seed, or `null` when there is none.
 */
export function readSeedParam(search: string): null | string {
  const seed = new URLSearchParams(search).get(SEED_PARAM)?.trim().slice(0, MAX_SEED_LENGTH) ?? '';
  return seed === '' ? null : seed;
}

/**
 * The page's URL with another seed, or with none.
 *
 * @param href - `location.href`.
 * @param seed - The seed, or `null` to drop it.
 * @returns The URL.
 */
export function urlWithSeed(href: string, seed: null | string): string {
  const url = new URL(href);
  if (seed === null) {
    url.searchParams.delete(SEED_PARAM);
  } else {
    url.searchParams.set(SEED_PARAM, seed);
  }
  return url.toString();
}
