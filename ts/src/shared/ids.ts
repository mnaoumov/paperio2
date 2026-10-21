let nextId = 1;

export function generateId(): number {
  return nextId++;
}

/**
 * Reads the id the next {@link generateId} call returns, so a snapshot can rewind the counter.
 *
 * @returns The next id.
 */
export function peekNextId(): number {
  return nextId;
}

/**
 * Rewinds or advances the id counter to a value read by {@link peekNextId}.
 *
 * @param id - The id the next {@link generateId} call returns.
 */
export function setNextId(id: number): void {
  nextId = id;
}
