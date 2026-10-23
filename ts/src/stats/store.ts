/**
 * @file
 *
 * Where the stats logs live: IndexedDB, one record per game holding the whole log, rewritten as the game goes on. Only
 * the newest {@link KEPT_STATS_GAMES} are kept; a log of an hour is about 2.5 MB.
 */

import type { StatsOutcome } from './format.ts';

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

let databasePromise: null | Promise<IDBDatabase> = null;

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
  const database = await openDatabase();
  const records = await result(database.transaction(GAMES, 'readonly').objectStore(GAMES).getAll()) as StatsGameRecord[];
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

function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (): void => {
      const database = request.result;
      if (!database.objectStoreNames.contains(GAMES)) {
        database.createObjectStore(GAMES, { keyPath: 'id' });
      }
    };
    request.onsuccess = (): void => {
      resolve(request.result);
    };
    request.onerror = (): void => {
      databasePromise = null;
      reject(request.error ?? new Error('IndexedDB could not be opened'));
    };
  });
  return databasePromise;
}

function pad(value: number): string {
  return String(value).padStart(DATE_PART_DIGITS, '0');
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = (): void => {
      resolve(request.result);
    };
    request.onerror = (): void => {
      reject(request.error ?? new Error('The storage request failed'));
    };
  });
}

async function write(action: (store: IDBObjectStore) => void): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(GAMES, 'readwrite');
  const done = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = (): void => {
      resolve();
    };
    transaction.onabort = (): void => {
      reject(transaction.error ?? new Error('The storage transaction was aborted'));
    };
    transaction.onerror = (): void => {
      reject(transaction.error ?? new Error('The storage transaction failed'));
    };
  });
  action(transaction.objectStore(GAMES));
  await done;
}
