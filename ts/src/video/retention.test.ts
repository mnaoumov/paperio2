import {
  describe,
  expect,
  it
} from 'vitest';

import type {
  RecordingRecord,
  RecordingStatus
} from './store.ts';

import {
  autoTakesToPrune,
  isTooShortAutoTake,
  MIN_AUTO_TAKE_MILLISECONDS
} from './retention.ts';

interface TakeOptions {
  readonly auto?: boolean;
  readonly durationMilliseconds?: number;
  readonly keep?: boolean;
  readonly status?: RecordingStatus;
}

function take(id: string, options: TakeOptions = {}): RecordingRecord {
  return {
    ...(options.auto === undefined ? {} : { auto: options.auto }),
    bytes: 0,
    codec: 'avc',
    decoderConfig: null,
    durationMilliseconds: options.durationMilliseconds ?? MIN_AUTO_TAKE_MILLISECONDS,
    fps: 30,
    height: 720,
    id,
    ...(options.keep === undefined ? {} : { keep: options.keep }),
    startedAt: 0,
    status: options.status ?? 'finished',
    thumbnail: null,
    updatedAt: 0,
    width: 1280
  };
}

describe('autoTakesToPrune', () => {
  it('keeps the newest automatic takes and prunes the rest', () => {
    const records = ['a', 'b', 'c', 'd'].map((id: string) => take(id, { auto: true }));
    expect(autoTakesToPrune(records, 2)).toEqual(['c', 'd']);
  });

  it('never prunes a take started by V, and does not count it', () => {
    const records = [take('a', { auto: true }), take('v1'), take('b', { auto: true }), take('v2'), take('c', { auto: true })];
    expect(autoTakesToPrune(records, 2)).toEqual(['c']);
  });

  it('never prunes a kept take, and does not count it', () => {
    const records = [take('a', { auto: true, keep: true }), take('b', { auto: true }), take('c', { auto: true }), take('d', { auto: true })];
    expect(autoTakesToPrune(records, 2)).toEqual(['d']);
  });

  it('leaves a take still being recorded alone', () => {
    const records = [take('a', { auto: true, status: 'recording' }), take('b', { auto: true }), take('c', { auto: true, status: 'recovered' })];
    expect(autoTakesToPrune(records, 1)).toEqual(['c']);
  });
});

describe('isTooShortAutoTake', () => {
  it('drops a short automatic take only', () => {
    expect(isTooShortAutoTake(take('a', { auto: true, durationMilliseconds: MIN_AUTO_TAKE_MILLISECONDS - 1 }))).toBe(true);
    expect(isTooShortAutoTake(take('a', { auto: true, durationMilliseconds: MIN_AUTO_TAKE_MILLISECONDS }))).toBe(false);
    expect(isTooShortAutoTake(take('v', { durationMilliseconds: 1 }))).toBe(false);
  });
});
