/**
 * @file
 *
 * Which automatic takes **Record every game** keeps. A take started by V is never touched; an automatic one is
 * dropped when it is too short to be worth anything, or when it is older than the newest few that nobody marked Keep.
 */

import type { RecordingRecord } from './store.ts';

/** How many unkept automatic takes stay. */
export const AUTO_TAKES_KEPT = 5;
/** An automatic take shorter than this is not kept at all. */
export const MIN_AUTO_TAKE_MILLISECONDS = 10_000;

/**
 * The automatic takes to delete: every unkept, finished one past the newest {@link AUTO_TAKES_KEPT}.
 *
 * @param records - The takes, newest first, as `listRecordings` returns them.
 * @param kept - How many unkept automatic takes stay.
 * @returns The ids to delete.
 */
export function autoTakesToPrune(records: readonly RecordingRecord[], kept = AUTO_TAKES_KEPT): string[] {
  return records
    .filter((record: RecordingRecord) => record.auto === true && record.keep !== true && record.status !== 'recording')
    .slice(kept)
    .map((record: RecordingRecord) => record.id);
}

/**
 * Whether a finished take is an automatic one too short to keep.
 *
 * @param record - The finished take.
 * @returns `true` when it should be deleted straight away.
 */
export function isTooShortAutoTake(record: RecordingRecord): boolean {
  return record.auto === true && record.durationMilliseconds < MIN_AUTO_TAKE_MILLISECONDS;
}
