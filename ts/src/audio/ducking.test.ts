import {
  describe,
  expect,
  it
} from 'vitest';

import type { LoopParam } from './exposure-loops.ts';

import {
  DUCK_ATTACK_SECONDS,
  DUCK_RELEASE_SECONDS,
  MUSIC_DUCK_GAIN,
  MusicDucker
} from './ducking.ts';

type Automation = readonly ['cancel' | 'ramp' | 'set', number, number];

interface FakeParam extends LoopParam {
  readonly events: Automation[];
}

const NOW = 10;
const LATER = 13;
const ALERT_SECONDS = 1.2;
const SHORT_ALERT_SECONDS = 0.05;

describe('MusicDucker', () => {
  it('ducks the music while a warning loop plays and brings it back after', () => {
    const param = fakeParam();
    const ducker = new MusicDucker(param);
    ducker.setLoops(NOW, true);
    expect(param.events).toEqual([['cancel', 0, NOW], ['set', 1, NOW], ['ramp', MUSIC_DUCK_GAIN, NOW + DUCK_ATTACK_SECONDS]]);
    param.value = MUSIC_DUCK_GAIN;
    ducker.setLoops(LATER, false);
    expect(param.events.slice(-3)).toEqual([['cancel', 0, LATER], ['set', MUSIC_DUCK_GAIN, LATER], ['ramp', 1, LATER + DUCK_RELEASE_SECONDS]]);
  });

  it('schedules nothing while the loops stay on', () => {
    const param = fakeParam();
    const ducker = new MusicDucker(param);
    ducker.setLoops(NOW, true);
    const count = param.events.length;
    ducker.setLoops(LATER, true);
    expect(param.events).toHaveLength(count);
  });

  it('ducks for an alert and releases when it ends', () => {
    const param = fakeParam();
    new MusicDucker(param).alert(NOW, ALERT_SECONDS);
    const releaseAt = NOW + ALERT_SECONDS;
    expect(param.events.slice(-3)).toEqual([
      ['ramp', MUSIC_DUCK_GAIN, NOW + DUCK_ATTACK_SECONDS],
      ['set', MUSIC_DUCK_GAIN, releaseAt],
      ['ramp', 1, releaseAt + DUCK_RELEASE_SECONDS]
    ]);
  });

  it('holds a short alert until the music is down', () => {
    const param = fakeParam();
    new MusicDucker(param).alert(NOW, SHORT_ALERT_SECONDS);
    expect(param.events.at(-1)).toEqual(['ramp', 1, NOW + DUCK_ATTACK_SECONDS + DUCK_RELEASE_SECONDS]);
  });

  it('keeps the music down for an alert that outlasts the loops', () => {
    const param = fakeParam();
    const ducker = new MusicDucker(param);
    ducker.setLoops(NOW, true);
    ducker.alert(NOW, ALERT_SECONDS);
    // The loops already hold it down: the alert schedules nothing of its own.
    expect(param.events).toHaveLength(3);
    const stopAt = NOW + SHORT_ALERT_SECONDS;
    ducker.setLoops(stopAt, false);
    expect(param.events.at(-2)).toEqual(['set', MUSIC_DUCK_GAIN, NOW + ALERT_SECONDS]);
    expect(param.events.at(-1)).toEqual(['ramp', 1, NOW + ALERT_SECONDS + DUCK_RELEASE_SECONDS]);
  });
});

function fakeParam(): FakeParam {
  const events: Automation[] = [];
  return {
    cancelScheduledValues(cancelTime: number): void {
      events.push(['cancel', 0, cancelTime]);
    },
    events,
    linearRampToValueAtTime(value: number, endTime: number): void {
      events.push(['ramp', value, endTime]);
    },
    setValueAtTime(value: number, startTime: number): void {
      events.push(['set', value, startTime]);
    },
    value: 1
  };
}
