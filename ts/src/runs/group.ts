/**
 * @file
 *
 * Puts each run's recordings and its stats log together, for the menu's one row per run. A recording names its run by
 * `runId`, which is the stats log's id. A recording from before the field existed is matched by time: to the newest
 * log whose run had started by the recording's start and was still going then, give or take
 * {@link LEGACY_MATCH_SLACK_MILLISECONDS}.
 */

import type { StatsGameRecord } from '../stats/store.ts';
import type { RecordingRecord } from '../video/store.ts';

/** How far past a log's logged game time an old recording may start and still count as that run's. */
export const LEGACY_MATCH_SLACK_MILLISECONDS = 60_000;

const MILLISECONDS_PER_SECOND = 1000;

export interface RunGroup {
  /** The run's id, or `recording:<id>` for a recording no run claims. */
  readonly id: string;
  /** The run's recordings, oldest first. */
  readonly recordings: readonly RecordingRecord[];
  /** When the run, or its first recording, started. */
  readonly startedAt: number;
  readonly stats: null | StatsGameRecord;
}

interface MutableRun {
  readonly recordings: RecordingRecord[];
  startedAt: number;
  readonly stats: null | StatsGameRecord;
}

/**
 * Groups recordings and stats logs into runs.
 *
 * @param recordings - The recordings, in any order.
 * @param games - The stats logs, in any order.
 * @returns The runs, newest first.
 */
export function groupRuns(recordings: readonly RecordingRecord[], games: readonly StatsGameRecord[]): RunGroup[] {
  const byId = new Map<string, MutableRun>();
  for (const game of games) {
    byId.set(game.id, { recordings: [], startedAt: game.startedAt, stats: game });
  }
  const newestFirst = [...games].sort((a: StatsGameRecord, b: StatsGameRecord) => b.startedAt - a.startedAt);
  for (const record of recordings) {
    const runId = record.runId ?? legacyRunId(record, newestFirst) ?? `recording:${record.id}`;
    const run = byId.get(runId);
    if (run) {
      run.recordings.push(record);
      run.startedAt = Math.min(run.startedAt, record.startedAt);
    } else {
      byId.set(runId, { recordings: [record], startedAt: record.startedAt, stats: null });
    }
  }
  return [...byId].map(([id, run]) => ({
    id,
    recordings: run.recordings.sort((a: RecordingRecord, b: RecordingRecord) => a.startedAt - b.startedAt),
    startedAt: run.startedAt,
    stats: run.stats
  })).sort((a: RunGroup, b: RunGroup) => b.startedAt - a.startedAt);
}

/**
 * Whether a run is marked Keep: its stats log or any of its recordings carries the mark.
 *
 * @param run - The run.
 * @returns The mark.
 */
export function isKeptRun(run: RunGroup): boolean {
  return run.stats?.keep === true || run.recordings.some((record: RecordingRecord) => record.keep === true);
}

/**
 * Whether a run's recording is still being written.
 *
 * @param run - The run.
 * @returns `true` while a take of it runs.
 */
export function isRecordingRun(run: RunGroup): boolean {
  return run.recordings.some((record: RecordingRecord) => record.status === 'recording');
}

/**
 * The runs **Delete all** removes: every run not marked Keep and not being recorded.
 *
 * @param runs - The runs.
 * @returns The runs to delete.
 */
export function runsToDeleteAll(runs: readonly RunGroup[]): RunGroup[] {
  return runs.filter((run: RunGroup) => !isKeptRun(run) && !isRecordingRun(run));
}

function legacyRunId(record: RecordingRecord, newestFirst: readonly StatsGameRecord[]): null | string {
  const game = newestFirst.find((candidate: StatsGameRecord) =>
    candidate.startedAt <= record.startedAt
    && record.startedAt <= candidate.startedAt + candidate.seconds * MILLISECONDS_PER_SECOND + LEGACY_MATCH_SLACK_MILLISECONDS
  );
  return game?.id ?? null;
}
