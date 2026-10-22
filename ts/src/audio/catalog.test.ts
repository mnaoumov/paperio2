import {
  describe,
  expect,
  it
} from 'vitest';

import {
  captureCue,
  isSoundName,
  PRACTICE_SOUNDS
} from './catalog.ts';

describe('captureCue', () => {
  it('picks the effect by the size of the capture', () => {
    expect(captureCue(0.001)?.sound).toBe('capture-small');
    expect(captureCue(0.01)?.sound).toBe('capture-medium');
    expect(captureCue(0.1)?.sound).toBe('capture-large');
  });

  it('is louder the more was taken, and never past full volume', () => {
    expect(captureCue(0.001)?.gain).toBeLessThan(captureCue(0.01)?.gain ?? 0);
    expect(captureCue(0.01)?.gain).toBeLessThan(captureCue(0.04)?.gain ?? 0);
    expect(captureCue(0.5)?.gain).toBe(1);
  });

  it('stays silent for the slivers sliding along the base takes, and plays for the smallest real loop', () => {
    expect(captureCue(7e-7)).toBeNull();
    expect(captureCue(0)).toBeNull();
    expect(captureCue(0.0018)).not.toBeNull();
  });
});

describe('the catalogue', () => {
  it('knows its own names only', () => {
    expect(isSoundName('kill')).toBe(true);
    expect(isSoundName('nope')).toBe(false);
  });

  it('counts the respawn and the checkpoint clicks as practice sounds, and nothing of a real run', () => {
    expect([...PRACTICE_SOUNDS].sort()).toEqual(['checkpoint-remove', 'checkpoint-set', 'respawn']);
  });
});
