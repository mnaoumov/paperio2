/**
 * @file
 *
 * Where in-game recordings live: IndexedDB, one record per take and one per encoded chunk. A chunk is written as soon
 * as the encoder hands it over, so only the chunk index is in memory, a take survives a reload, and a respawn's cut is
 * one key-range delete. A take a crash or a closed tab left unfinished is marked `recovered` on the next load.
 */

import type { SoundEntry } from './timeline.ts';

export interface ChunkRecord {
  readonly data: ArrayBuffer;
  readonly recordingId: string;
  readonly seq: number;
  /** Microseconds of video. */
  readonly timestamp: number;
  readonly type: 'delta' | 'key';
}

export interface RecordingRecord {
  bytes: number;
  readonly codec: StoredCodec;
  decoderConfig: null | StoredDecoderConfig;
  durationMilliseconds: number;
  readonly fps: number;
  readonly height: number;
  readonly id: string;
  /** The sound effects heard in the take, which a download mixes in; absent from a take recorded before there was sound. */
  sounds?: readonly SoundEntry[];
  /** `Date.now()` when the take started. */
  readonly startedAt: number;
  status: RecordingStatus;
  thumbnail: Blob | null;
  /** `Date.now()` of the last write of this record. */
  updatedAt: number;
  readonly width: number;
}

export type RecordingStatus = 'finished' | 'recording' | 'recovered';

/** The muxer's name for the codec: `avc`, `vp9` or `av1`. */
export type StoredCodec = 'av1' | 'avc' | 'vp9';

/** The decoder config the encoder reported, copied into plain values that IndexedDB can clone. */
export interface StoredDecoderConfig {
  readonly codec: string;
  readonly codedHeight?: number;
  readonly codedWidth?: number;
  readonly colorSpace?: VideoColorSpaceInit;
  readonly description?: ArrayBuffer;
}

const DATABASE_NAME = 'paperio2-video';
const DATABASE_VERSION = 1;
const RECORDINGS = 'recordings';
const CHUNKS = 'chunks';
const READ_BATCH = 120;
const MICROSECONDS_PER_MILLISECOND = 1000;
const MILLISECONDS_PER_SECOND = 1000;

let databasePromise: null | Promise<IDBDatabase> = null;

export async function deleteChunksFrom(recordingId: string, fromSeq: number): Promise<void> {
  await write([CHUNKS], (transaction: IDBTransaction) => {
    transaction.objectStore(CHUNKS).delete(chunkRange(recordingId, fromSeq));
  });
}

export async function deleteRecording(recordingId: string): Promise<void> {
  await write([RECORDINGS, CHUNKS], (transaction: IDBTransaction) => {
    transaction.objectStore(CHUNKS).delete(chunkRange(recordingId));
    transaction.objectStore(RECORDINGS).delete(recordingId);
  });
}

/**
 * Lists the takes, newest first.
 *
 * @returns The takes.
 */
export async function listRecordings(): Promise<RecordingRecord[]> {
  const database = await openDatabase();
  const records = await result(database.transaction(RECORDINGS, 'readonly').objectStore(RECORDINGS).getAll()) as RecordingRecord[];
  return records.sort((a: RecordingRecord, b: RecordingRecord) => b.startedAt - a.startedAt);
}

export async function putChunk(chunk: ChunkRecord): Promise<void> {
  await write([CHUNKS], (transaction: IDBTransaction) => {
    transaction.objectStore(CHUNKS).put(chunk);
  });
}

export async function putRecording(record: RecordingRecord): Promise<void> {
  await write([RECORDINGS], (transaction: IDBTransaction) => {
    transaction.objectStore(RECORDINGS).put(record);
  });
}

/**
 * Reads a take's chunks in order, a batch at a time, so an hour of video is never in memory at once.
 *
 * @param recordingId - The take.
 * @yields {ChunkRecord[]} Each batch, in order; the next is read once the caller asks for it.
 */
export async function* readChunks(recordingId: string): AsyncGenerator<ChunkRecord[]> {
  const database = await openDatabase();
  let fromSeq = 0;
  for (;;) {
    const store = database.transaction(CHUNKS, 'readonly').objectStore(CHUNKS);
    const batch = await result(store.getAll(chunkRange(recordingId, fromSeq), READ_BATCH)) as ChunkRecord[];
    const last = batch.at(-1);
    if (!last) {
      return;
    }
    yield batch;
    fromSeq = last.seq + 1;
  }
}

/**
 * The Web Lock a take holds while it is recorded.
 *
 * @param recordingId - The take.
 * @returns The lock's name.
 */
export function recordingLockName(recordingId: string): string {
  return `paperio2-video-${recordingId}`;
}

/**
 * Marks the takes a crash or a closed tab left unfinished as `recovered`, and deletes the ones that never got a
 * chunk out of the encoder.
 *
 * @returns How many were recovered.
 */
export async function recoverUnfinished(): Promise<number> {
  const now = Date.now();
  let recovered = 0;
  // A take still being recorded, in this tab or another, holds its lock; the browser drops it with the tab.
  const held = new Set(((await navigator.locks.query()).held ?? []).map((lock: LockInfo) => lock.name));
  for (const record of await listRecordings()) {
    if (record.status !== 'recording' || held.has(recordingLockName(record.id))) {
      continue;
    }
    if (record.decoderConfig === null) {
      await deleteRecording(record.id);
      continue;
    }
    // The size and length written last can be up to one update old, so they are counted again from the chunks.
    let bytes = 0;
    let lastTimestamp = 0;
    for await (const chunks of readChunks(record.id)) {
      for (const chunk of chunks) {
        bytes += chunk.data.byteLength;
        lastTimestamp = chunk.timestamp;
      }
    }
    record.bytes = bytes;
    record.durationMilliseconds = lastTimestamp / MICROSECONDS_PER_MILLISECOND + MILLISECONDS_PER_SECOND / record.fps;
    record.status = 'recovered';
    record.updatedAt = now;
    await putRecording(record);
    recovered++;
  }
  return recovered;
}

function chunkRange(recordingId: string, fromSeq = 0): IDBKeyRange {
  return IDBKeyRange.bound([recordingId, fromSeq], [recordingId, Infinity]);
}

function finish(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
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
}

function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (): void => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORDINGS)) {
        database.createObjectStore(RECORDINGS, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(CHUNKS)) {
        database.createObjectStore(CHUNKS, { keyPath: ['recordingId', 'seq'] });
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

async function write(storeNames: string[], action: (transaction: IDBTransaction) => void): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(storeNames, 'readwrite');
  const done = finish(transaction);
  action(transaction);
  await done;
}
