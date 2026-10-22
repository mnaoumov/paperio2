/**
 * @file
 *
 * The Node half of the differential test: opens the site's `index.html` twice, once with `?original` (the
 * shipped `app2.js`) and once plain (the reconstruction's `ts/dist/app2.js`, which the page serves by default),
 * then drives one page of each in lockstep through the same scenario and reports the first frame on which they
 * differ. It serves the repository root, or the directory `DIFFERENTIAL_SITE_ROOT` names, such as the assembled
 * GitHub Pages artifact.
 */

import type {
  Browser,
  HTTPRequest,
  Page
} from 'puppeteer-core';

import {
  readFile,
  writeFile
} from 'node:fs/promises';
import {
  extname,
  join,
  normalize,
  resolve
} from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { launch } from 'puppeteer-core';

import type {
  DifferentialFrameResult,
  DifferentialRemovedUnit,
  DifferentialSnapshot
} from './page-instrumentation.ts';

import { installDeterminism } from './page-instrumentation.ts';

export type Variant = 'original' | 'reconstruction';

export const VARIANTS: readonly Variant[] = ['original', 'reconstruction'];

export const TS_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SITE_ROOT = resolve(process.env['DIFFERENTIAL_SITE_ROOT'] ?? resolve(TS_ROOT, '..'));
const MILLISECONDS_PER_SECOND = 1000;
const FRAMES_PER_SECOND = 60;
const FRAME_MILLISECONDS = MILLISECONDS_PER_SECOND / FRAMES_PER_SECOND;
const VIEWPORT_HEIGHT = 720;
const VIEWPORT_WIDTH = 1280;
const VIEWPORT = { deviceScaleFactor: 1, height: VIEWPORT_HEIGHT, width: VIEWPORT_WIDTH };
const BOOT_TIMEOUT_MILLISECONDS = 30_000;
const BOOT_POLL_MILLISECONDS = 50;
const HTTP_NOT_FOUND = 404;
const HTTP_OK = 200;
const SNAPSHOT_INTERVAL_FRAMES = 30;
const DEFAULT_HOST = 'paperio2.test';
const PLAYER_PATH_INTERVAL_FRAMES = 150;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

/** The events a scenario is there to exercise, counted from the original's run. */
export interface Coverage {
  readonly botDeaths: number;
  readonly botKillsByBots: number;
  readonly playerCaptures: number;
  readonly playerDeaths: number;
  readonly playerKilledByBots: number;
  readonly untypedBotSpawns: number;
}

export interface Divergence {
  readonly frame: number;
  readonly original: string;
  readonly reconstruction: string;
  readonly what: string;
}

export interface KeyEvent {
  readonly frame: number;
  readonly isDown: boolean;
  readonly keyCode: number;
}

export interface Scenario {
  /** The minimum count of each event the run must reach, so a scenario that stops reaching them fails. */
  readonly expectedCoverage: Partial<Coverage>;
  readonly frames: number;
  /**
   * The host the page believes it is on, `paperio2.test` when left out. `paperio.site` makes the engine's domain lock
   * take its real-host branch.
   */
  readonly host?: string;
  readonly keys: readonly KeyEvent[];
  readonly name: string;
  readonly seed: number;
  readonly startFrame: number;
}

export const COVERAGE_EVENTS: readonly (keyof Coverage)[] = ['botDeaths', 'botKillsByBots', 'playerCaptures', 'playerDeaths', 'playerKilledByBots', 'untypedBotSpawns'];

export interface ScenarioResult {
  readonly coverage: Coverage;
  readonly divergence: Divergence | null;
  readonly drawCalls: number;
  readonly framesCompared: number;
  readonly playerDeaths: readonly DifferentialRemovedUnit[];
  /** The player's position and territory every 150 frames, from the original's run, for a coverage failure. */
  readonly playerPath: readonly string[];
  /** The original page's environment and `Math.random` call count when the game starts, for a coverage failure. */
  readonly startFacts: string;
}

interface ServedFile {
  readonly body: Buffer;
  readonly status: number;
  readonly type: string;
}

export async function applyFrameInput(page: Page, scenario: Scenario, frame: number): Promise<void> {
  if (frame === scenario.startFrame) {
    await page.evaluate(() => {
      window.paperio2api.startGame();
    });
  }
  for (const keyEvent of scenario.keys) {
    if (keyEvent.frame === frame) {
      await page.evaluate(
        (keyCode: number, isDown: boolean) => {
          window.__differential.key(keyCode, isDown);
        },
        keyEvent.keyCode,
        keyEvent.isDown
      );
    }
  }
}
export async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env['CHROME_PATH'];
  return launch({
    args: process.env['CI'] ? ['--no-sandbox'] : [],
    defaultViewport: VIEWPORT,
    headless: true,
    ...executablePath ? { executablePath } : { channel: 'chrome' }
  });
}

export async function openVariant(browser: Browser, variant: Variant, scenario: Scenario): Promise<Page> {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(String(error));
  });
  await page.evaluateOnNewDocument(installDeterminism, { seed: scenario.seed });
  const pageOrigin = `http://${scenario.host ?? DEFAULT_HOST}`;
  await interceptHost(page, pageOrigin);
  await page.goto(`${pageOrigin}/${variant}/index.html${variant === 'original' ? '?original' : ''}`, { waitUntil: 'load' });
  // `waitForFunction` polls through the page's `requestAnimationFrame` or `setTimeout`, which the instrumentation
  // Has frozen, so the boot wait polls from Node instead.
  const deadline = performance.now() + BOOT_TIMEOUT_MILLISECONDS;
  while (!await page.evaluate(() => 'paperio2api' in window && document.querySelector('canvas') !== null)) {
    if (performance.now() > deadline || errors.length > 0) {
      throw new Error(`${variant} did not boot within ${String(BOOT_TIMEOUT_MILLISECONDS)} ms:\n${errors.join('\n')}`);
    }
    await delay(BOOT_POLL_MILLISECONDS);
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  // The reconstruction moves a leaderboard bar left when its name would be clipped, which the original never does, so
  // The comparison turns that off before the first frame; `src/leaderboard-fit.test.ts` covers the layout. The original
  // Exposes no config and has nothing to turn off.
  await page.evaluate(() => {
    const { config } = window.paperio2api;
    if (config) {
      config['leaderboardFitNames'] = false;
    }
  });
  if (errors.length > 0) {
    throw new Error(`${variant} raised page errors while booting:\n${errors.join('\n')}`);
  }
  // The page falls back to the original when the reconstruction fails to load, which would compare the original
  // With itself and pass, so the engine that actually ran is checked.
  const engine = await page.evaluate(() => window.paperio2engine);
  if (engine !== variant) {
    throw new Error(`The ${variant} page ran the ${String(engine)} engine.`);
  }
  return page;
}

export async function runScenario(browser: Browser, scenario: Scenario, variants: readonly Variant[] = VARIANTS): Promise<ScenarioResult> {
  const pages = await Promise.all(variants.map(async (variant) => openVariant(browser, variant, scenario)));
  const [original, reconstruction] = pages;
  if (!original || !reconstruction) {
    throw new Error('Expected one page per variant');
  }
  let lastSnapshot: DifferentialSnapshot | undefined;
  const playerPath: string[] = [];
  let startFacts = '';
  let drawCalls = 0;
  function result(divergence: Divergence | null, framesCompared: number): ScenarioResult {
    return { coverage: coverageOf(lastSnapshot), divergence, drawCalls, framesCompared, playerDeaths: lastSnapshot?.removed.filter((unit) => unit.isPlayer) ?? [], playerPath, startFacts };
  }
  try {
    for (let frame = 0; frame < scenario.frames; frame++) {
      if (frame === scenario.startFrame) {
        startFacts = await original.evaluate(() => window.__differential.facts());
      }
      await Promise.all(pages.map(async (page) => applyFrameInput(page, scenario, frame)));
      const [originalFrame, reconstructionFrame] = await Promise.all(pages.map(async (page) => stepPage(page)));
      if (!originalFrame || !reconstructionFrame) {
        throw new Error('Expected one frame result per variant');
      }
      drawCalls += originalFrame.callCount;
      if (originalFrame.hash !== reconstructionFrame.hash) {
        return result(await describeTraceDivergence(original, reconstruction, frame), frame);
      }
      if (frame % SNAPSHOT_INTERVAL_FRAMES === 0 || frame === scenario.frames - 1) {
        const [originalSnapshot, reconstructionSnapshot] = await Promise.all(pages.map(async (page) => page.evaluate(() => window.__differential.snapshot())));
        const left = String(JSON.stringify(originalSnapshot));
        const right = String(JSON.stringify(reconstructionSnapshot));
        if (left !== right) {
          return result({ frame, original: left, reconstruction: right, what: 'game state snapshot' }, frame);
        }
        if (originalSnapshot) {
          lastSnapshot = originalSnapshot;
          if (frame % PLAYER_PATH_INTERVAL_FRAMES === 0) {
            const playerUnit = originalSnapshot.units.find((unit) => unit.isPlayer);
            playerPath.push(playerUnit ? `${String(frame)}:${playerUnit.x.toFixed(0)},${playerUnit.y.toFixed(0)} area ${playerUnit.baseSquare.toFixed(0)}` : `${String(frame)}:-`);
          }
        }
      }
    }
    const [originalPixels, reconstructionPixels] = await Promise.all(pages.map(async (page) => page.evaluate(() => window.__differential.canvasHash())));
    if (originalPixels !== reconstructionPixels) {
      return result({ frame: scenario.frames, original: String(originalPixels), reconstruction: String(reconstructionPixels), what: 'canvas pixels' }, scenario.frames);
    }
    return result(null, scenario.frames);
  } finally {
    await Promise.all(pages.map(async (page) => page.browserContext().close()));
  }
}

export async function stepPage(page: Page, frameMilliseconds = FRAME_MILLISECONDS): Promise<DifferentialFrameResult> {
  return page.evaluate(async (milliseconds: number) => window.__differential.step(milliseconds), frameMilliseconds);
}

async function answerRequest(request: HTTPRequest, pageOrigin: string): Promise<void> {
  if (!request.url().startsWith(`${pageOrigin}/`)) {
    await request.abort();
    return;
  }
  try {
    const { body, status, type } = await serveFile(request.url());
    await request.respond({ body, contentType: type, status });
  } catch {
    await request.abort();
  }
}

function coverageOf(snapshot: DifferentialSnapshot | undefined): Coverage {
  const removed = snapshot?.removed ?? [];
  const bots = removed.filter((unit) => !unit.isPlayer);
  const playerNames = new Set(removed.filter((unit) => unit.isPlayer).map((unit) => unit.name));
  return {
    botDeaths: bots.length,
    botKillsByBots: bots.filter((unit) => unit.killer !== null && unit.killer !== unit.name && !playerNames.has(unit.killer) && unit.killer !== snapshot?.player).length,
    playerCaptures: snapshot?.playerCaptures ?? 0,
    playerDeaths: removed.length - bots.length,
    playerKilledByBots: removed.filter((unit) => unit.isPlayer && unit.killer !== null && unit.killer !== unit.name).length,
    untypedBotSpawns: snapshot?.untypedBotSpawns ?? 0
  };
}

async function describeTraceDivergence(original: Page, reconstruction: Page, frame: number): Promise<Divergence> {
  const [originalTrace, reconstructionTrace] = await Promise.all([original, reconstruction].map(async (page) => page.evaluate(() => [...window.__differential.frameTrace()])));
  const left = originalTrace ?? [];
  const right = reconstructionTrace ?? [];
  const dumpDirectory = process.env['DIFFERENTIAL_DUMP'];
  if (dumpDirectory) {
    await writeFile(join(dumpDirectory, 'original.txt'), left.join('\n'));
    await writeFile(join(dumpDirectory, 'reconstruction.txt'), right.join('\n'));
  }
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    if (left[index] !== right[index]) {
      return {
        frame,
        original: left[index] ?? '<end of frame>',
        reconstruction: right[index] ?? '<end of frame>',
        what: `draw call ${String(index)} of ${String(left.length)} / ${String(right.length)}`
      };
    }
  }
  return { frame, original: 'hash differs', reconstruction: 'hash differs', what: 'trace hash' };
}

// Every request is answered from the repository files inside the browser, and any request to another host fails.
// Nothing goes over the network, so nothing on the machine can rewrite a response either: a real HTTP server let
// A desktop ad blocker inject a userscript into the page, and its one Math.random call shifted the seeded stream.
async function interceptHost(page: Page, pageOrigin: string): Promise<void> {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    answerRequest(request, pageOrigin).catch((error: unknown) => {
      console.error(error);
    });
  });
}

async function serveFile(url: string): Promise<ServedFile> {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const [, variant, ...rest] = pathname.split('/');
  const relativePath = normalize(rest.join('/'));
  if ((variant !== 'original' && variant !== 'reconstruction') || relativePath.startsWith('..')) {
    return { body: Buffer.from('not found'), status: HTTP_NOT_FOUND, type: 'text/plain' };
  }
  const filePath = join(SITE_ROOT, relativePath);
  return { body: await readFile(filePath), status: HTTP_OK, type: CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream' };
}
