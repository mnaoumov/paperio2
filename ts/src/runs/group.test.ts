import {
  describe,
  expect,
  it
} from 'vitest';

import type { StatsGameRecord } from '../stats/store.ts';
import type {
  RecordingRecord,
  RecordingStatus
} from '../video/store.ts';
import type { RunGroup } from './group.ts';

import {
  groupRuns,
  isKeptRun,
  LEGACY_MATCH_SLACK_MILLISECONDS,
  runsToDeleteAll
} from './group.ts';

interface TakeOptions {
  readonly keep?: boolean;
  readonly runId?: string;
  readonly startedAt: number;
  readonly status?: RecordingStatus;
}

function game(id: string, startedAt: number, seconds = 60, keep = false): StatsGameRecord {
  return { id, ...keep ? { keep } : {}, outcome: 'death', percent: 1, pilot: 'human', seconds, startedAt, text: '' };
}

function ids(runs: readonly RunGroup[]): string[] {
  return runs.map((run: RunGroup) => run.id);
}

function take(id: string, options: TakeOptions): RecordingRecord {
  return {
    bytes: 0,
    codec: 'avc',
    decoderConfig: null,
    durationMilliseconds: 0,
    fps: 30,
    height: 720,
    id,
    ...options.keep === undefined ? {} : { keep: options.keep },
    ...options.runId === undefined ? {} : { runId: options.runId },
    startedAt: options.startedAt,
    status: options.status ?? 'finished',
    thumbnail: null,
    updatedAt: 0,
    width: 1280
  };
}

describe('groupRuns', () => {
  it('puts a run\'s recordings beside its stats log, newest run first', () => {
    const runs = groupRuns(
      [take('v1', { runId: 'r1', startedAt: 1010 }), take('v2', { runId: 'r2', startedAt: 5010 }), take('v3', { runId: 'r2', startedAt: 5500 })],
      [game('r1', 1000), game('r2', 5000)]
    );
    expect(ids(runs)).toEqual(['r2', 'r1']);
    expect(runs[0]?.recordings.map((record: RecordingRecord) => record.id)).toEqual(['v2', 'v3']);
    expect(runs[0]?.stats?.id).toBe('r2');
    expect(runs[1]?.recordings.map((record: RecordingRecord) => record.id)).toEqual(['v1']);
  });

  it('gives a run with only one of the two its own row', () => {
    const runs = groupRuns([take('v1', { runId: 'gone', startedAt: 3000 })], [game('r1', 1000)]);
    expect(ids(runs)).toEqual(['gone', 'r1']);
    expect(runs[0]?.stats).toBeNull();
    expect(runs[1]?.recordings).toEqual([]);
  });

  it('matches an old recording with no run id to the log of the run it was taken in', () => {
    const runs = groupRuns(
      [take('old', { startedAt: 1000 + 30_000 }), take('late', { startedAt: 1000 + 60_000 + LEGACY_MATCH_SLACK_MILLISECONDS + 1 })],
      [game('r1', 1000, 60)]
    );
    expect(runs.find((run: RunGroup) => run.id === 'r1')?.recordings.map((record: RecordingRecord) => record.id)).toEqual(['old']);
    expect(ids(runs)).toContain('recording:late');
  });

  it('matches an old recording to the newest run that had started', () => {
    const runs = groupRuns([take('old', { startedAt: 5100 })], [game('r1', 1000), game('r2', 5000)]);
    expect(runs.find((run: RunGroup) => run.id === 'r2')?.recordings).toHaveLength(1);
  });
});

describe('runsToDeleteAll', () => {
  it('spares the runs marked Keep, by either half, and a run still being recorded', () => {
    const runs = groupRuns(
      [
        take('kept-video', { keep: true, runId: 'r1', startedAt: 1000 }),
        take('plain', { runId: 'r2', startedAt: 2000 }),
        take('live', { runId: 'r4', startedAt: 4000, status: 'recording' })
      ],
      [game('r1', 1000), game('r2', 2000), game('r3', 3000, 60, true), game('r4', 4000), game('r5', 5000)]
    );
    expect(runs.filter(isKeptRun).map((run: RunGroup) => run.id).sort()).toEqual(['r1', 'r3']);
    expect(ids(runsToDeleteAll(runs))).toEqual(['r5', 'r2']);
  });
});
