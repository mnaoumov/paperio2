import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  expect,
  it
} from 'vitest';

import { buildBenchmark } from './build.ts';

it('distinguishes clean, modified and untracked build inputs and refuses inputs changed during a build', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paperio2-build-'));
  const buildScript = 'import { readFileSync, writeFileSync } from \'node:fs\'; writeFileSync(\'dist/app2.js\', readFileSync(\'src/game.js\'));';
  try {
    await mkdir(join(directory, 'src'));
    await mkdir(join(directory, 'dist'));
    await writeFile(join(directory, '.gitignore'), 'dist/\n');
    await writeFile(join(directory, 'src/game.js'), 'original');
    await writeFile(join(directory, 'build.mjs'), buildScript);
    for (const args of [['init'], ['add', '.'], ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--no-gpg-sign', '-m', 'test: initial inputs']]) {
      await promisify(execFile)('git', args, { cwd: directory });
    }
    const clean = await buildBenchmark(directory);
    expect(clean.identity.dirty).toBe(false);
    expect(clean.bundle.body).toBe('original');

    await writeFile(join(directory, 'src/game.js'), 'modified');
    const modified = await buildBenchmark(directory);
    expect(modified.identity.dirty).toBe(true);
    expect(modified.identity.commit).toBe(clean.identity.commit);
    expect(modified.identity.sourceSha256).not.toBe(clean.identity.sourceSha256);
    expect(modified.identity.bundleSha256).not.toBe(clean.identity.bundleSha256);

    await writeFile(join(directory, 'src/new.js'), 'untracked');
    const untracked = await buildBenchmark(directory);
    expect(untracked.identity.dirty).toBe(true);
    expect(untracked.identity.sourceSha256).not.toBe(modified.identity.sourceSha256);
    expect(untracked.identity.bundleSha256).toBe(modified.identity.bundleSha256);

    await writeFile(join(directory, 'build.mjs'), `${buildScript}\nwriteFileSync('src/game.js', 'changed during build');`);
    await expect(buildBenchmark(directory)).rejects.toThrow('Build inputs changed');
  } finally {
    await rm(directory, { recursive: true });
  }
});
