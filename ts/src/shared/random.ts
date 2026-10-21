const LCG_MULTIPLIER = 69069;
const LCG_MODULUS = 2147483648;
const RANDOM_INT_RANGE = 1000000000;

interface RandomState {
  seed: number;
}

/** Each generator's state, kept off the function so a snapshot can read and rewind it. */
const randomStates = new WeakMap<(max?: number) => number, RandomState>();

export function createRandomGenerator(seed: number): (max?: number) => number {
  const state: RandomState = { seed };
  if (state.seed > 0 && state.seed < 1) {
    state.seed = Math.floor(state.seed * RANDOM_INT_RANGE);
  }
  randomStates.set(random, state);
  return random;
  function nextInt(bound: number): number {
    state.seed = (state.seed * LCG_MULTIPLIER + 1) % LCG_MODULUS;
    return state.seed % bound;
  }
  function random(max?: number): number {
    return max === undefined ? nextInt(RANDOM_INT_RANGE) / RANDOM_INT_RANGE : nextInt(max);
  }
}

/**
 * Reads where a generator from {@link createRandomGenerator} is in its sequence.
 *
 * @param generator - The generator.
 * @returns Its current seed.
 */
export function readRandomSeed(generator: (max?: number) => number): number {
  const state = randomStates.get(generator);
  if (!state) {
    throw new Error('Not a generator from createRandomGenerator');
  }
  return state.seed;
}

/**
 * Moves a generator from {@link createRandomGenerator} to a point of its sequence read by {@link readRandomSeed}.
 *
 * @param generator - The generator.
 * @param seed - The seed to continue from.
 */
export function writeRandomSeed(generator: (max?: number) => number, seed: number): void {
  const state = randomStates.get(generator);
  if (!state) {
    throw new Error('Not a generator from createRandomGenerator');
  }
  state.seed = seed;
}
