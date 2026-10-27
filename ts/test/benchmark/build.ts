import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { PinnedBundle } from '../differential/pinned-bundle.ts';

import { TS_ROOT } from '../differential/harness.ts';
import { pinBundle } from '../differential/pinned-bundle.ts';

export interface BenchmarkBuild {
  readonly bundle: PinnedBundle;
  readonly identity: BuildIdentity;
}

/** Identity of the inputs at build time and of the exact bytes served throughout the run. */
export interface BuildIdentity {
  readonly bundleSha256: string;
  readonly commit: string;
  readonly dirty: boolean;
  readonly sourceSha256: string;
}

interface SourceIdentity {
  readonly commit: string;
  readonly dirty: boolean;
  readonly sourceSha256: string;
}

const BUILD_INPUTS = ['src', 'build.mjs', 'package.json', 'package-lock.json'];

export async function buildBenchmark(root = TS_ROOT): Promise<BenchmarkBuild> {
  const before = await sourceIdentity(root);
  await promisify(execFile)(process.execPath, ['build.mjs'], { cwd: root });
  const bundle = await pinBundle(join(root, 'dist/app2.js'));
  const after = await sourceIdentity(root);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error('Build inputs changed while building the benchmark; restart on a stable checkout.');
  }
  return { bundle, identity: { bundleSha256: bundle.sha256, ...before } };
}

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await promisify(execFile)('git', args, { cwd: root });
  return stdout;
}

async function sourceIdentity(root: string): Promise<SourceIdentity> {
  const commit = await git(root, ['rev-parse', 'HEAD']);
  const status = await git(root, ['status', '--porcelain', '--untracked-files=all', '--', ...BUILD_INPUTS]);
  const paths = (await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...BUILD_INPUTS])).split('\0').filter(Boolean).sort();
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(path).update('\0');
    // A tracked deletion is an input change too; the build itself decides whether it is needed.
    const bytes = await readFile(join(root, path)).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    });
    hash.update(bytes === null ? 'deleted' : createHash('sha256').update(bytes).digest('hex')).update('\0');
  }
  return { commit: commit.trim(), dirty: status.length > 0, sourceSha256: hash.digest('hex') };
}
