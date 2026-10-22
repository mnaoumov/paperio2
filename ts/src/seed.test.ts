import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  createSeededRandom,
  createSeedText,
  hashSeed,
  installSeededMathRandom,
  MAX_SEED_LENGTH,
  NEW_SEED_LENGTH,
  readSeedParam,
  urlWithSeed
} from './seed.ts';

const SAMPLE_COUNT = 1000;

describe('the speedrun seed', () => {
  const nativeRandom = Math.random;

  afterEach(() => {
    Math.random = nativeRandom;
    vi.restoreAllMocks();
  });

  it('reads the seed from the query string, trimmed and capped', () => {
    expect(readSeedParam('?seed=abc')).toBe('abc');
    expect(readSeedParam('?original&seed=%20x%20')).toBe('x');
    expect(readSeedParam('?seed=')).toBeNull();
    expect(readSeedParam('')).toBeNull();
    expect(readSeedParam(`?seed=${'a'.repeat(MAX_SEED_LENGTH + 10)}`)).toHaveLength(MAX_SEED_LENGTH);
  });

  it('sets and drops the seed in a URL, keeping the rest', () => {
    expect(urlWithSeed('https://example.test/paperio2/?a=1', 'xyz')).toBe('https://example.test/paperio2/?a=1&seed=xyz');
    expect(urlWithSeed('https://example.test/paperio2/?seed=xyz&a=1', null)).toBe('https://example.test/paperio2/?a=1');
  });

  it('hashes equal texts equally and different texts differently', () => {
    expect(hashSeed('speedrun')).toBe(hashSeed('speedrun'));
    expect(hashSeed('speedrun')).not.toBe(hashSeed('speedrun2'));
  });

  it('draws doubles in [0, 1) and replays from a read state', () => {
    const random = createSeededRandom(hashSeed('a'));
    for (let index = 0; index < SAMPLE_COUNT; index++) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    const state = random.readState();
    const first = [random.next(), random.next()];
    random.writeState(state);
    expect([random.next(), random.next()]).toEqual(first);
  });

  it('makes Math.random the same sequence for the same seed', () => {
    installSeededMathRandom('race');
    const first = [Math.random(), Math.random(), Math.random()];
    installSeededMathRandom('race');
    expect([Math.random(), Math.random(), Math.random()]).toEqual(first);
    installSeededMathRandom('other');
    expect([Math.random(), Math.random(), Math.random()]).not.toEqual(first);
  });

  it('makes a new seed from crypto, never from Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const seed = createSeedText();
    expect(seed).toMatch(new RegExp(`^[a-z2-9]{${String(NEW_SEED_LENGTH)}}$`, 'v'));
    expect(spy).not.toHaveBeenCalled();
  });
});
