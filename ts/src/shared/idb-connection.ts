/**
 * @file
 *
 * One cached IndexedDB connection that survives the browser closing it. The browser can close a page's connection on
 * its own: another page of the origin asks for a newer version (`versionchange`), or the connection is closed
 * abnormally (`close`), which an installed app window met while a browser tab of the same site was open. A cached
 * handle that is never dropped then throws `InvalidStateError: The database connection is closing` on every later
 * `transaction()`. This module drops the handle on either event, and a transaction that still meets a closing
 * connection reopens it and starts again once.
 */

export interface CreateDatabaseConnectionParams {
  /** `indexedDB`, or a stand-in in a test. */
  readonly factory?: IDBFactory;
  readonly name: string;
  readonly upgrade: (database: IDBDatabase) => void;
  readonly version: number;
}

export interface DatabaseConnection {
  /** Drops the cached connection and closes it, so the next transaction opens a fresh one. */
  reset(): void;
  /**
   * Starts a transaction on a live connection.
   *
   * @param storeNames - The object stores.
   * @param mode - The mode.
   * @returns The transaction.
   */
  transaction(storeNames: string | string[], mode: IDBTransactionMode): Promise<IDBTransaction>;
  /**
   * Runs one read-write transaction to its end. When the connection closes under it, the transaction is run once more
   * on a fresh connection, so `action` must be safe to repeat (puts and deletes by key are).
   *
   * @param storeNames - The object stores.
   * @param action - Queues the requests.
   */
  write(storeNames: string | string[], action: (transaction: IDBTransaction) => void): Promise<void>;
}

interface OpenConnection {
  closed: boolean;
  readonly database: Promise<IDBDatabase>;
}

interface Started {
  readonly connection: OpenConnection;
  readonly transaction: IDBTransaction;
}

/** A write that failed, and whether its connection had been closed by then. */
class WriteFailure extends Error {
  public constructor(public override readonly cause: unknown, public readonly connectionClosed: boolean) {
    super('The storage write failed', { cause });
  }
}

/**
 * Opens connections to one database on demand and keeps the newest open.
 *
 * @param options - The database.
 * @returns The connection.
 */
export function createDatabaseConnection(options: CreateDatabaseConnectionParams): DatabaseConnection {
  let current: null | OpenConnection = null;

  function open(): OpenConnection {
    if (current && !current.closed) {
      return current;
    }
    const connection: OpenConnection = {
      closed: false,
      database: new Promise<IDBDatabase>((resolve, reject) => {
        const request = (options.factory ?? indexedDB).open(options.name, options.version);
        request.onupgradeneeded = (): void => {
          options.upgrade(request.result);
        };
        request.onsuccess = (): void => {
          const database = request.result;
          database.onversionchange = (): void => {
            // A newer page wants to upgrade; holding on would block it, so let go and reopen when next needed.
            drop(connection);
            database.close();
          };
          database.onclose = (): void => {
            drop(connection);
          };
          resolve(database);
        };
        request.onerror = (): void => {
          drop(connection);
          reject(request.error ?? new Error('IndexedDB could not be opened'));
        };
      })
    };
    current = connection;
    return connection;
  }

  function drop(connection: OpenConnection): void {
    connection.closed = true;
    if (current === connection) {
      current = null;
    }
  }

  async function begin(storeNames: string | string[], mode: IDBTransactionMode): Promise<Started> {
    const connection = open();
    const database = await connection.database;
    try {
      return { connection, transaction: database.transaction(storeNames, mode) };
    } catch (error) {
      if (!isClosingError(error)) {
        throw error;
      }
      // The browser closed it without telling us (or before the event ran): start again on a new connection.
      drop(connection);
      const fresh = open();
      return { connection: fresh, transaction: (await fresh.database).transaction(storeNames, mode) };
    }
  }

  async function transaction(storeNames: string | string[], mode: IDBTransactionMode): Promise<IDBTransaction> {
    return (await begin(storeNames, mode)).transaction;
  }

  async function runWrite(storeNames: string | string[], action: (transaction: IDBTransaction) => void): Promise<void> {
    const started = await begin(storeNames, 'readwrite');
    try {
      const done = finish(started.transaction);
      action(started.transaction);
      await done;
    } catch (error) {
      throw new WriteFailure(error, started.connection.closed);
    }
  }

  return {
    reset(): void {
      const connection = current;
      if (!connection) {
        return;
      }
      drop(connection);
      connection.database.then((database: IDBDatabase) => {
        database.close();
      }, () => {
        // It never opened, so there is nothing to close.
      });
    },
    transaction,
    async write(storeNames: string | string[], action: (transaction: IDBTransaction) => void): Promise<void> {
      try {
        await runWrite(storeNames, action);
        return;
      } catch (error) {
        // Aborted because its connection closed mid-way: run it again on a fresh one, once.
        if (!(error instanceof WriteFailure) || (!error.connectionClosed && !isClosingError(error.cause))) {
          throw unwrap(error);
        }
      }
      try {
        await runWrite(storeNames, action);
      } catch (error) {
        throw unwrap(error);
      }
    }
  };
}

/**
 * Waits for a request's result.
 *
 * @param request - The request.
 * @returns Its result.
 */
export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = (): void => {
      resolve(request.result);
    };
    request.onerror = (): void => {
      reject(request.error ?? new Error('The storage request failed'));
    };
  });
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

function isClosingError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'InvalidStateError';
}

function unwrap(error: unknown): unknown {
  return error instanceof WriteFailure ? error.cause : error;
}
