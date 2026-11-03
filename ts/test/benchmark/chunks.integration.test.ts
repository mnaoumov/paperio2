import { execFile } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  rm
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  expect,
  it
} from 'vitest';

import { TS_ROOT } from '../differential/harness.ts';

it('reports bounded browser-call progress without changing a seeded rollout game or its exact curve samples', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paperio2-chunks-'));
  const outputs = [];
  const results = [];
  try {
    for (const chunk of [null, '1800']) {
      const path = join(directory, `result-${chunk ?? 'default'}.json`);
      const { stdout } = await promisify(execFile)(process.execPath, [
        'node_modules/jiti/lib/jiti-cli.mjs',
        'test/benchmark/autopilot-benchmark.ts',
        '--modes',
        'whitebox',
        '--seed-list',
        '1718',
        '--max-minutes',
        '0.51',
        '--parallel',
        '1',
        '--rollout',
        '--results',
        path,
        ...chunk === null ? [] : ['--chunk-frames', chunk]
      ], { cwd: TS_ROOT, maxBuffer: 1_000_000 });
      outputs.push(stdout);
      results.push(await readFile(path, 'utf8'));
    }
    expect(outputs[0]?.match(/^progress /gm)?.length).toBe(31);
    expect(outputs[1]?.match(/^progress /gm)?.length).toBe(2);
    // Only elapsed wall time may depend on the browser round trips. Curves, build, outcome and game time must agree.
    expect(withoutWallTime(results[0])).toBe(withoutWallTime(results[1]));
    expect(results[0]).toMatch(/"curve":\[[\d.]+,null/);
  } finally {
    await rm(directory, { recursive: true });
  }
});

function withoutWallTime(text: string | undefined): string {
  return (text ?? '').replace(/"wallSeconds":[\d.]+/g, '"wallSeconds":0');
}
