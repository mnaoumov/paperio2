import {
  describe,
  expect,
  it
} from 'vitest';

import { ExportCache } from './export-cache.ts';

interface Exporter {
  calls(this: void): number;
  exportFile(this: void): Promise<Blob>;
}

function exporter(content: string): Exporter {
  let count = 0;
  return {
    calls: () => count,
    exportFile: async (): Promise<Blob> => {
      count++;
      return Promise.resolve(new Blob([content]));
    }
  };
}

describe('ExportCache', () => {
  it('returns each take its own file', async () => {
    const cache = new ExportCache();
    const takeA = exporter('take A');
    const takeB = exporter('take B');
    expect(await (await cache.get('a', 'all', takeA.exportFile)).text()).toBe('take A');
    expect(await (await cache.get('b', 'all', takeB.exportFile)).text()).toBe('take B');
    expect(takeB.calls()).toBe(1);
  });

  it('exports a take once per Sound setting', async () => {
    const cache = new ExportCache();
    const take = exporter('take');
    const first = await cache.get('a', 'all', take.exportFile);
    expect(await cache.get('a', 'all', take.exportFile)).toBe(first);
    expect(take.calls()).toBe(1);
    await cache.get('a', 'none', take.exportFile);
    expect(take.calls()).toBe(2);
  });

  it('forgets only the removed take', async () => {
    const cache = new ExportCache();
    const takeA = exporter('take A');
    const takeB = exporter('take B');
    await cache.get('a', 'all', takeA.exportFile);
    await cache.get('a', 'none', takeA.exportFile);
    const fileB = await cache.get('b', 'all', takeB.exportFile);
    cache.forget('a');
    expect(await cache.get('b', 'all', takeB.exportFile)).toBe(fileB);
    expect(takeB.calls()).toBe(1);
    await cache.get('a', 'all', takeA.exportFile);
    expect(takeA.calls()).toBe(3);
  });

  it('does not keep a failed export', async () => {
    const cache = new ExportCache();
    await expect(cache.get('a', 'all', async () => Promise.reject(new Error('failed')))).rejects.toThrow('failed');
    const take = exporter('take');
    expect(await (await cache.get('a', 'all', take.exportFile)).text()).toBe('take');
  });
});
