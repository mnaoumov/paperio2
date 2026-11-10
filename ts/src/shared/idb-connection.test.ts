import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  describe,
  expect,
  it
} from 'vitest';

import { createDatabaseConnection } from './idb-connection.ts';

interface AbortCounter {
  count: number;
}

interface FakeFactory {
  readonly abortNext: AbortCounter;
  readonly databases: FakeDatabase[];
  readonly factory: IDBFactory;
}

interface FakeOpenRequest {
  onerror: (() => void) | null;
  onsuccess: (() => void) | null;
  onupgradeneeded: (() => void) | null;
  result?: FakeDatabase;
}

interface FakeStore {
  put(value: string): void;
}

/* A stand-in for just the parts of IndexedDB the connection touches: open, transaction, close and its two events. */

class FakeDatabase {
  public closing = false;
  public onclose: (() => void) | null = null;
  public onversionchange: (() => void) | null = null;
  public readonly transactions: FakeTransaction[] = [];

  public constructor(public readonly id: number, private readonly abortNext: AbortCounter) {}

  public close(): void {
    this.closing = true;
  }

  /** What the browser does when it closes a connection itself: the handle goes dead, then `close` fires. */
  public closeByBrowser(): void {
    this.closing = true;
    this.onclose?.();
  }

  public transaction(): FakeTransaction {
    if (this.closing) {
      throw new DOMException('The database connection is closing.', 'InvalidStateError');
    }
    const transaction = new FakeTransaction(this);
    this.transactions.push(transaction);
    setTimeout(() => {
      if (this.abortNext.count > 0) {
        this.abortNext.count--;
        // The browser closes the connection while the transaction is running.
        this.closeByBrowser();
        transaction.error = new DOMException('The transaction was aborted.', 'AbortError');
        transaction.onabort?.();
        return;
      }
      transaction.oncomplete?.();
    }, 0);
    return transaction;
  }
}

class FakeTransaction {
  public error: DOMException | null = null;
  public onabort: (() => void) | null = null;
  public oncomplete: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public readonly puts: string[] = [];

  public constructor(public readonly database: FakeDatabase) {}

  public objectStore(): FakeStore {
    return {
      put: (value: string): void => {
        this.puts.push(value);
      }
    };
  }
}

function connect(factory: IDBFactory): ReturnType<typeof createDatabaseConnection> {
  return createDatabaseConnection({
    factory,
    name: 'test',
    upgrade(): void {
      // Nothing to create in the stand-in.
    },
    version: 1
  });
}

function fakeFactory(): FakeFactory {
  const databases: FakeDatabase[] = [];
  const abortNext: AbortCounter = { count: 0 };
  const factory = {
    open(): unknown {
      const request: FakeOpenRequest = {
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null
      };
      setTimeout(() => {
        const database = new FakeDatabase(databases.length, abortNext);
        databases.push(database);
        request.result = database;
        request.onsuccess?.();
      }, 0);
      return request;
    }
  };
  return { abortNext, databases, factory: castTo<IDBFactory>(factory) };
}

function put(connection: ReturnType<typeof createDatabaseConnection>, value: string): Promise<void> {
  return connection.write(['store'], (transaction: IDBTransaction) => {
    transaction.objectStore('store').put(value);
  });
}

describe('createDatabaseConnection', () => {
  it('keeps one connection while it stays open', async () => {
    const { databases, factory } = fakeFactory();
    const connection = connect(factory);
    await put(connection, 'a');
    await put(connection, 'b');
    expect(databases).toHaveLength(1);
  });

  it('reopens after the browser closes the connection', async () => {
    const { databases, factory } = fakeFactory();
    const connection = connect(factory);
    await put(connection, 'a');
    databases[0]?.closeByBrowser();
    await put(connection, 'b');
    expect(databases).toHaveLength(2);
    expect(databases[1]?.transactions[0]?.puts).toEqual(['b']);
  });

  it('lets go on versionchange, so a newer page can upgrade, and reopens', async () => {
    const { databases, factory } = fakeFactory();
    const connection = connect(factory);
    await put(connection, 'a');
    databases[0]?.onversionchange?.();
    expect(databases[0]?.closing).toBe(true);
    await put(connection, 'b');
    expect(databases).toHaveLength(2);
  });

  it('reopens when the handle is dead but no event arrived (the installed-app case)', async () => {
    const { databases, factory } = fakeFactory();
    const connection = connect(factory);
    await put(connection, 'a');
    // Closed with no `close` event: the old cache threw "The database connection is closing" on every read from here.
    databases[0]?.close();
    const transaction = await connection.transaction('store', 'readonly');
    expect(transaction).toBeInstanceOf(FakeTransaction);
    expect(databases).toHaveLength(2);
  });

  it('runs a write again on a fresh connection when the connection closes under it', async () => {
    const { abortNext, databases, factory } = fakeFactory();
    const connection = connect(factory);
    abortNext.count = 1;
    await put(connection, 'chunk');
    expect(databases).toHaveLength(2);
    expect(databases[1]?.transactions[0]?.puts).toEqual(['chunk']);
  });

  it('reports a write that fails twice rather than retrying forever', async () => {
    const { abortNext, factory } = fakeFactory();
    const connection = connect(factory);
    abortNext.count = 2;
    await expect(put(connection, 'chunk')).rejects.toThrow('The transaction was aborted.');
  });

  it('does not retry a write that failed for another reason', async () => {
    const { databases, factory } = fakeFactory();
    const connection = connect(factory);
    await expect(connection.write(['store'], () => {
      throw new Error('bad value');
    })).rejects.toThrow('bad value');
    expect(databases).toHaveLength(1);
  });
});
