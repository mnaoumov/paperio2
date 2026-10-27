import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** Immutable JavaScript text captured before any pages start. */
export interface PinnedBundle {
  readonly body: string;
  readonly sha256: string;
}

export async function pinBundle(path: string): Promise<PinnedBundle> {
  const bytes = await readFile(path);
  return Object.freeze({ body: bytes.toString('utf8'), sha256: createHash('sha256').update(bytes).digest('hex') });
}
