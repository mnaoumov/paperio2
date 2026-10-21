import {
  describe,
  expect,
  it
} from 'vitest';

import {
  createRandomGenerator,
  readRandomSeed,
  writeRandomSeed
} from './random.ts';

describe('createRandomGenerator', () => {
  it('replays its sequence from a seed read mid-way', () => {
    const generator = createRandomGenerator(0.25);
    generator();
    generator(10);
    const seed = readRandomSeed(generator);
    const first = [generator(), generator(100), generator()];
    writeRandomSeed(generator, seed);
    expect([generator(), generator(100), generator()]).toEqual(first);
  });

  it('draws the same sequence as a generator created from the read seed', () => {
    const generator = createRandomGenerator(12345);
    generator();
    const copy = createRandomGenerator(readRandomSeed(generator));
    expect([generator(), generator(7)]).toEqual([copy(), copy(7)]);
  });

  it('refuses a function it did not create', () => {
    expect(() => readRandomSeed(Math.random)).toThrow('createRandomGenerator');
  });
});
