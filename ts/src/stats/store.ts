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
  readonly id: string;
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

/** Older games are dropped when a new one is written. */
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

export async function deleteStatsGame(id: string): Promise<void> {
  await write((store: IDBObjectStore) => {
    store.delete(id);
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
 * Writes a game's log, and drops the oldest games past {@link KEPT_STATS_GAMES}.
 *
 * @param record - The game.
 */
export async function putStatsGame(record: StatsGameRecord): Promise<void> {
  await write((store: IDBObjectStore) => {
    store.put(record);
  });
  const stale = (await listStatsGames()).slice(KEPT_STATS_GAMES);
  if (stale.length) {
    await write((store: IDBObjectStore) => {
      for (const { id } of stale) {
        store.delete(id);
      }
    });
  }
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

async function write(action: (store: IDBObjectStore) => void): Promise<void> {
  await connection.write(GAMES, (transaction: IDBTransaction) => {
    action(transaction.objectStore(GAMES));
  });
}
