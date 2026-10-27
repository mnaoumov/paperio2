import { createHash } from 'node:crypto';
import {
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  expect,
  it
} from 'vitest';

import { buildBenchmark } from '../benchmark/build.ts';
import {
  launchBrowser,
  openVariant
} from './harness.ts';
import { pinBundle } from './pinned-bundle.ts';

it('serves the captured bundle to later pages after its source file changes', async () => {
  const build = await buildBenchmark();
  expect(build.identity.bundleSha256).toBe(build.bundle.sha256);
  const directory = await mkdtemp(join(tmpdir(), 'paperio2-bundle-'));
  const browser = await launchBrowser();
  try {
    const path = join(directory, 'app2.js');
    const original = `${build.bundle.body}\nwindow.__bundleMarker = 'first';`;
    await writeFile(path, original);
    const bundle = await pinBundle(path);
    expect(bundle.sha256).toBe(createHash('sha256').update(original).digest('hex'));
    const scenario = { expectedCoverage: {}, frames: 0, keys: [], name: 'pinned bundle', seed: 1, startFrame: 0 };
    const first = await openVariant(browser, 'reconstruction', scenario, { bundle, traceCanvas: false });
    expect(await first.evaluate(() => Reflect.get(window, '__bundleMarker'))).toBe('first');
    await first.browserContext().close();

    await writeFile(path, original.replace('= \'first\'', '= \'second\''));
    expect((await pinBundle(path)).sha256).not.toBe(bundle.sha256);
    const second = await openVariant(browser, 'reconstruction', scenario, { bundle, traceCanvas: false });
    expect(await second.evaluate(() => Reflect.get(window, '__bundleMarker'))).toBe('first');
    await second.browserContext().close();
    // The new bytes really execute differently, so this test detects rereading the source for a later page.
    const changed = await openVariant(browser, 'reconstruction', scenario, { bundle: await pinBundle(path), traceCanvas: false });
    expect(await changed.evaluate(() => Reflect.get(window, '__bundleMarker'))).toBe('second');
    await changed.browserContext().close();
  } finally {
    await browser.close();
    await rm(directory, { recursive: true });
  }
});
