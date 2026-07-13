const LCG_MULTIPLIER = 69069;
const LCG_MODULUS = 2147483648;
const RANDOM_INT_RANGE = 1000000000;

export function createRandomGenerator(seed: number): (max?: number) => number {
  if (seed > 0 && seed < 1) {
    seed = Math.floor(seed * RANDOM_INT_RANGE);
  }
  return random;
  function nextInt(bound: number): number {
    seed = (seed * LCG_MULTIPLIER + 1) % LCG_MODULUS;
    return seed % bound;
  }
  function random(max?: number): number {
    return max === undefined ? nextInt(RANDOM_INT_RANGE) / RANDOM_INT_RANGE : nextInt(max);
  }
}
