import {
  describe,
  expect,
  it
} from 'vitest';

import {
  PositionedParts,
  recordingFileName
} from './export.ts';

async function bytesOf(parts: PositionedParts): Promise<number[]> {
  return [...new Uint8Array(await parts.toBlob('application/octet-stream').arrayBuffer())];
}

describe('PositionedParts', () => {
  it('appends writes in order', async () => {
    const parts = new PositionedParts();
    parts.write(new Uint8Array([1, 2, 3]), 0);
    parts.write(new Uint8Array([4, 5]), 3);
    expect(await bytesOf(parts)).toEqual([1, 2, 3, 4, 5]);
    expect(parts.size).toBe(5);
  });

  it('patches bytes already written, across part boundaries', async () => {
    const parts = new PositionedParts();
    parts.write(new Uint8Array([1, 2, 3]), 0);
    parts.write(new Uint8Array([4, 5, 6]), 3);
    parts.write(new Uint8Array([9, 9]), 2);
    expect(await bytesOf(parts)).toEqual([1, 2, 9, 9, 5, 6]);
  });

  it('patches and extends in one write', async () => {
    const parts = new PositionedParts();
    parts.write(new Uint8Array([1, 2, 3]), 0);
    parts.write(new Uint8Array([7, 8, 9]), 2);
    expect(await bytesOf(parts)).toEqual([1, 2, 7, 8, 9]);
  });

  it('keeps its own copy of the data', async () => {
    const parts = new PositionedParts();
    const data = new Uint8Array([1, 2]);
    parts.write(data, 0);
    data[0] = 0;
    expect(await bytesOf(parts)).toEqual([1, 2]);
  });
});

describe('recordingFileName', () => {
  it('names the file by the local start time', () => {
    const startedAt = new Date(2026, 9, 21, 9, 5).getTime();
    expect(recordingFileName(startedAt)).toBe('paperio2-2026-10-21-0905.mp4');
  });
});
