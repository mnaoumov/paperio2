/**
 * @file
 *
 * Where the stats logs live: IndexedDB, one record per game holding the whole log, rewritten as the game goes on. Only
 * the newest {@link KEPT_STATS_GAMES} are kept; a log of an hour is about 2.5 MB.
 */

import type { StatsOutcome } from './format.ts';

import {
  createDatabaseConnection,
  requestResult as result
} from '../shared/idb-connection.ts';

export interface StatsGameRecord {
  /** The run's id, which its recordings carry as `runId` (see `runs/run-id.ts`). */
  readonly id: string;
  /** Whether the owner marked the run Keep, which exempts the log from {@link KEPT_STATS_GAMES}. */
  readonly keep?: boolean;
  readonly outcome: StatsOutcome;
  /** The player's share of the arena on the last frame logged, in percent. */
  readonly percent: number;
  /** Who started the game: `human`, or the demo pilot's mode. */
  readonly pilot: string;
  /** Seconds of game time logged. */
  readonly seconds: number;
  /** `Date.now()` when the game started. */
  readonly startedAt: number;
  /** The log, JSONL. */
  readonly text: string;
}

/** Older games not marked Keep are dropped when a new one is written. */
export const KEPT_STATS_GAMES = 20;

const DATABASE_NAME = 'paperio2-stats';
const DATABASE_VERSION = 1;
const GAMES = 'games';
const DATE_PART_DIGITS = 2;

const connection = createDatabaseConnection({
  name: DATABASE_NAME,
  upgrade(database: IDBDatabase): void {
    if (!database.objectStoreNames.contains(GAMES)) {
      database.createObjectStore(GAMES, { keyPath: 'id' });
    }
  },
  version: DATABASE_VERSION
});

export async function deleteStatsGames(ids: readonly string[]): Promise<void> {
  await write((store: IDBObjectStore) => {
    for (const id of ids) {
      store.delete(id);
    }
  });
}

/**
 * Lists the logged games, newest first.
 *
 * @returns The games.
 */
export async function listStatsGames(): Promise<StatsGameRecord[]> {
  const records = await result((await connection.transaction(GAMES, 'readonly')).objectStore(GAMES).getAll()) as StatsGameRecord[];
  return records.sort((a: StatsGameRecord, b: StatsGameRecord) => b.startedAt - a.startedAt);
}

/**
 * Writes a game's log, keeping a Keep mark the stored record already has, and drops the oldest unkept games past
 * {@link KEPT_STATS_GAMES}.
 *
 * @param record - The game.
 */
export async function putStatsGame(record: StatsGameRecord): Promise<void> {
  await update(record.id, (stored: null | StatsGameRecord) => stored?.keep === true ? { ...record, keep: true } : record);
  const stale = (await listStatsGames()).filter((game: StatsGameRecord) => game.keep !== true).slice(KEPT_STATS_GAMES);
  if (stale.length) {
    await write((store: IDBObjectStore) => {
      for (const { id } of stale) {
        store.delete(id);
      }
    });
  }
}

/**
 * Marks a game's log Keep, or takes the mark off. A game that is not stored is left alone.
 *
 * @param id - The game.
 * @param keep - The mark.
 */
export async function setStatsGameKeep(id: string, keep: boolean): Promise<void> {
  await update(id, (stored: null | StatsGameRecord) => {
    if (!stored) {
      return null;
    }
    const { id: storedId, outcome, percent, pilot, seconds, startedAt, text } = stored;
    return { id: storedId, outcome, percent, pilot, seconds, startedAt, text, ...keep ? { keep } : {} };
  });
}

/**
 * The download's file name: `paperio2-<yyyy-mm-dd-hhmm>.jsonl`, in local time.
 *
 * @param startedAt - `Date.now()` when the game started.
 * @returns The name.
 */
export function statsFileName(startedAt: number): string {
  const date = new Date(startedAt);
  return `paperio2-${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.jsonl`;
}

function pad(value: number): string {
  return String(value).padStart(DATE_PART_DIGITS, '0');
}

/**
 * Reads a game and writes what `change` makes of it, in one transaction, so a Keep mark and a running game's log never
 * overwrite each other.
 *
 * @param id - The game.
 * @param change - The new record from the stored one (`null` when absent); `null` writes nothing.
 */
async function update(id: string, change: (stored: null | StatsGameRecord) => null | StatsGameRecord): Promise<void> {
  await write((store: IDBObjectStore) => {
    const request = store.get(id);
    request.onsuccess = (): void => {
      const next = change((request.result as StatsGameRecord | undefined) ?? null);
      if (next) {
        store.put(next);
      }
    };
  });
}

async function write(action: (store: IDBObjectStore) => void): Promise<void> {
  await connection.write(GAMES, (transaction: IDBTransaction) => {
    action(transaction.objectStore(GAMES));
  });
}
