/**
 * @file
 *
 * The frame-time benchmark: plays the served game in real time, in Chrome, for a while in each mode and reports how
 * often a frame was dropped, against the original as a baseline. Unlike the differential harness it uses no virtual
 * clock: the page is served over a real `localhost` HTTP server (a secure context, so the in-game recorder works), and
 * frames come from Chrome's own `requestAnimationFrame`. A probe loop beside the game's records every frame's
 * timestamp, and on the reconstruction the autopilot's and the recorder's hooks are timed too.
 *
 * `npm run benchmark:frames -- --modes original,off,whitebox,blackbox,recording --seconds 60 [--profile] [--visible] [--size 1920x1080]`
 *
 * Modes: `original` (the original engine), `off` (the reconstruction, no pilot), `whitebox`, `blackbox`, and
 * `recording` (the reconstruction with the in-game recorder taking, steered by the whitebox pilot). In `original` and
 * `off` the mouse flies the player in a wide circle. A run that ends is started again, so the whole span is play. A
 * frame counts as dropped when its interval is over 1.5 of the median interval, which is the display's refresh period
 * on a page that keeps up. `--profile` adds the functions that took the most CPU time, from a CPU profile of the span.
 */

import type { Server } from 'node:http';
import type {
  Browser,
  Page,
  Protocol
} from 'puppeteer-core';

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import {
  extname,
  join,
  normalize,
  resolve
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { launch } from 'puppeteer-core';

type Mode = 'blackbox' | 'off' | 'original' | 'recording' | 'whitebox';

/** What the page-side probe collects. */
interface Probe {
  bestPercent: number;
  hooks: Record<string, number[]>;
  intervals: number[];
  longTasks: number[];
  restarts: number;
}

interface ProbeResult {
  /** The largest share of the arena the player held, so a pilot that stopped playing shows. */
  readonly bestPercent: number;
  readonly hooks: Readonly<Record<string, readonly number[]>>;
  readonly intervals: readonly number[];
  readonly longTasks: readonly number[];
  readonly restarts: number;
}

interface ProbeWindow extends Window {
  __probe?: Probe;
}

interface Served {
  readonly origin: string;
  readonly server: Server;
}

const MODES: readonly Mode[] = ['original', 'off', 'whitebox', 'blackbox', 'recording'];
const REPO_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const BOOT_DELAY_MILLISECONDS = 2000;
const DROP_FACTOR = 1.5;
/** A hook call longer than this leaves a 60 Hz frame no time to render in. */
const FRAME_BUDGET_MILLISECONDS = 10;
const FULL_TURN = Math.PI + Math.PI;
const HALF = 0.5;
const MILLISECONDS_IN_SECOND = 1000;
const MOUSE_RADIUS = 200;
const MOUSE_STEP_MILLISECONDS = 50;
/** The mouse goes round once in this many seconds, which flies the player in a wide loop. */
const MOUSE_TURN_SECONDS = 7;
const NOT_FOUND = 404;
const OK = 200;
const P95 = 0.95;
const P99 = 0.99;
const PERCENT = 100;
const PROBE_POLL_MILLISECONDS = 250;
const PROFILE_TOP = 30;
const TWO_DIGITS = 2;
const WORST_COUNT = 5;

const { values } = parseArgs({
  options: {
    modes: { default: MODES.join(','), type: 'string' },
    profile: { default: false, type: 'boolean' },
    seconds: { default: '60', type: 'string' },
    size: { default: '1920x1080', type: 'string' },
    visible: { default: false, type: 'boolean' }
  }
});

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((done) => {
    setTimeout(done, milliseconds);
  });
}

/**
 * The functions that took the most CPU time of their own in a profile, and the most in total.
 *
 * @param mode - The mode profiled.
 * @param profile - The profile from `Profiler.stop`.
 * @returns The report.
 */
function describeProfile(mode: Mode, profile: Protocol.Profiler.Profile): string {
  const sampleCounts = new Map<number, number>();
  for (const id of profile.samples ?? []) {
    sampleCounts.set(id, (sampleCounts.get(id) ?? 0) + 1);
  }
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parents = new Map<number, number>();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) {
      parents.set(child, node.id);
    }
  }
  const self = new Map<string, number>();
  const total = new Map<string, number>();
  const sampleCount = profile.samples?.length ?? 0;
  for (const [id, count] of sampleCounts) {
    const node = nodes.get(id);
    if (!node) {
      continue;
    }
    self.set(profileLabel(node), (self.get(profileLabel(node)) ?? 0) + count);
    const seen = new Set<string>();
    for (let current: number | undefined = id; current !== undefined; current = parents.get(current)) {
      const ancestor = nodes.get(current);
      if (ancestor && !seen.has(profileLabel(ancestor))) {
        seen.add(profileLabel(ancestor));
        total.set(profileLabel(ancestor), (total.get(profileLabel(ancestor)) ?? 0) + count);
      }
    }
  }
  function top(counts: Map<string, number>): string {
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, PROFILE_TOP).map(([name, count]) => `    ${(PERCENT * count / Math.max(1, sampleCount)).toFixed(1)}% ${name}`).join('\n');
  }
  return `${mode} profile, self:\n${top(self)}\n  total:\n${top(total)}`;
}

async function installProbe(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    const probeWindow: ProbeWindow = window;
    const probe: Probe = { bestPercent: 0, hooks: {}, intervals: [], longTasks: [], restarts: 0 };
    probeWindow.__probe = probe;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        probe.longTasks.push(entry.duration);
      }
    }).observe({ type: 'longtask' });
    let last = 0;
    function tick(time: number): void {
      if (last > 0) {
        probe.intervals.push(time - last);
      }
      last = time;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

async function main(): Promise<void> {
  const modes = values.modes.split(',').map((mode) => {
    const known = MODES.find((candidate) => candidate === mode);
    if (!known) {
      throw new Error(`Unknown mode ${mode}; expected one of ${MODES.join(', ')}.`);
    }
    return known;
  });
  const [width = 0, height = 0] = values.size.split('x').map(Number);
  const seconds = Number(values.seconds);
  const { origin, server } = await serve();
  const executablePath = process.env['CHROME_PATH'];
  const browser = await launch({
    args: [`--window-size=${String(width)},${String(height)}`, '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
    headless: !values.visible,
    ...executablePath ? { executablePath } : { channel: 'chrome' }
  });
  try {
    for (const mode of modes) {
      print(summarize(mode, await measure(browser, origin, mode, seconds, width, height)));
    }
  } finally {
    await browser.close();
    server.close();
  }
}

async function measure(browser: Browser, origin: string, mode: Mode, seconds: number, width: number, height: number): Promise<ProbeResult> {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ height, width });
  const storage: Record<string, string> = {};
  if (mode === 'whitebox' || mode === 'blackbox' || mode === 'recording') {
    storage['paperio2.autopilot'] = mode === 'recording' ? 'whitebox' : mode;
  }
  await page.evaluateOnNewDocument((entries: Readonly<Record<string, string>>) => {
    localStorage.clear();
    for (const [key, value] of Object.entries(entries)) {
      localStorage.setItem(key, value);
    }
  }, storage);
  await installProbe(page);
  await page.goto(`${origin}/index.html${mode === 'original' ? '?original' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => 'paperio2api' in window && document.querySelector('canvas') !== null);
  await delay(BOOT_DELAY_MILLISECONDS);
  await page.evaluate(() => {
    window.paperio2api.startGame();
  });
  await page.waitForFunction(() => Boolean(Reflect.get(Object(window.paperio2api.game), 'player')));
  if (mode === 'recording') {
    await page.keyboard.press('KeyV');
  }
  await startTiming(page);
  const session = values.profile ? await page.createCDPSession() : null;
  if (session) {
    await session.send('Profiler.enable');
    await session.send('Profiler.start');
  }
  const startedAt = performance.now();
  const deadline = startedAt + seconds * MILLISECONDS_IN_SECOND;
  while (performance.now() < deadline) {
    if (mode === 'original' || mode === 'off') {
      const angle = FULL_TURN * (performance.now() - startedAt) / (MOUSE_TURN_SECONDS * MILLISECONDS_IN_SECOND);
      await page.mouse.move(width * HALF + Math.cos(angle) * MOUSE_RADIUS, height * HALF + Math.sin(angle) * MOUSE_RADIUS);
    }
    await delay(MOUSE_STEP_MILLISECONDS);
  }
  if (session) {
    const { profile } = await session.send('Profiler.stop');
    print(describeProfile(mode, profile));
  }
  const result = await page.evaluate(() => {
    const probe = (window as ProbeWindow).__probe;
    // The first interval spans the setup, which ran between two frames, so it is no frame of play.
    return probe ? { bestPercent: probe.bestPercent, hooks: probe.hooks, intervals: probe.intervals.slice(1), longTasks: probe.longTasks, restarts: probe.restarts } : null;
  });
  await context.close();
  if (!result) {
    throw new Error(`${mode}: the probe did not install.`);
  }
  return result;
}

function print(text: string): void {
  process.stdout.write(`${text}\n`);
}

function profileLabel(node: Protocol.Profiler.ProfileNode): string {
  return `${node.callFrame.functionName || '(anonymous)'} ${node.callFrame.url.split('/').at(-1) ?? ''}:${String(node.callFrame.lineNumber + 1)}`;
}

function quantile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? Number.NaN;
}

async function serve(): Promise<Served> {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const file = normalize(join(REPO_ROOT, path.endsWith('/') ? `${path}index.html` : path));
    if (!file.startsWith(REPO_ROOT)) {
      response.writeHead(NOT_FOUND).end();
      return;
    }
    readFile(file).then((body) => {
      response.writeHead(OK, { 'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    }, () => {
      response.writeHead(NOT_FOUND).end();
    });
  });
  await new Promise<void>((done) => {
    server.listen(0, 'localhost', done);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('The server has no port.');
  }
  return { origin: `http://localhost:${String(address.port)}`, server };
}

/**
 * Clears what the probe saw while the page booted, times the reconstruction's hooks from now on, keeps the player's
 * best share, and starts a run again when one ends.
 *
 * @param page - The page.
 */
async function startTiming(page: Page): Promise<void> {
  await page.evaluate((pollMilliseconds: number) => {
    const probe = (window as ProbeWindow).__probe;
    if (!probe) {
      return;
    }
    probe.intervals.length = 0;
    probe.longTasks.length = 0;
    function isMethod(value: unknown): value is (...args: unknown[]) => unknown {
      return typeof value === 'function';
    }
    function timed(owner: object, name: string, label: string): void {
      const original: unknown = Reflect.get(owner, name);
      if (!probe || !isMethod(original) || Reflect.get(original, '__timed')) {
        return;
      }
      const samples = probe.hooks[label] ?? [];
      probe.hooks[label] = samples;
      const method = original;
      function timedMethod(this: unknown, ...args: unknown[]): unknown {
        const start = performance.now();
        try {
          return Reflect.apply(method, this, args);
        } finally {
          samples.push(performance.now() - start);
        }
      }
      Reflect.set(timedMethod, '__timed', true);
      Reflect.set(owner, name, timedMethod);
    }
    setInterval(() => {
      const game: unknown = window.paperio2api.game;
      if (!game || typeof game !== 'object') {
        return;
      }
      for (const [field, label] of [['autopilot', 'autopilot'], ['videoRecorder', 'recorder']] as const) {
        const hook: unknown = Reflect.get(game, field);
        if (hook && typeof hook === 'object') {
          timed(hook, 'beforeInput', `${label}.beforeInput`);
          timed(hook, 'afterFrame', `${label}.afterFrame`);
        }
      }
      const autopilot: unknown = Reflect.get(game, 'autopilot');
      for (const [field, method] of [['blackbox', 'decide'], ['whitebox', 'steer']] as const) {
        const pilot: unknown = autopilot && typeof autopilot === 'object' ? Reflect.get(autopilot, field) : null;
        if (pilot && typeof pilot === 'object') {
          timed(pilot, method, `${field}.${method}`);
        }
      }
      timed(game, 'runFrame', 'game.runFrame');
      const player: unknown = Reflect.get(game, 'player');
      const percent: unknown = player && typeof player === 'object' ? Reflect.get(player, 'percent') : 0;
      probe.bestPercent = Math.max(probe.bestPercent, typeof percent === 'number' ? percent : 0);
      if (!player && document.querySelector('canvas')) {
        probe.restarts++;
        window.paperio2api.startGame();
      }
    }, pollMilliseconds);
  }, PROBE_POLL_MILLISECONDS);
}

function summarize(mode: Mode, result: ProbeResult): string {
  const sorted = [...result.intervals].sort((a, b) => a - b);
  const median = quantile(sorted, HALF);
  const dropped = result.intervals.filter((interval) => interval > median * DROP_FACTOR).length;
  const totalMilliseconds = result.intervals.reduce((sum, interval) => sum + interval, 0);
  const lines = [
    `${mode}: ${String(result.intervals.length)} frames over ${(totalMilliseconds / MILLISECONDS_IN_SECOND).toFixed(1)} s, median ${median.toFixed(TWO_DIGITS)} ms, p95 ${quantile(sorted, P95).toFixed(TWO_DIGITS)} ms, p99 ${quantile(sorted, P99).toFixed(TWO_DIGITS)} ms, max ${(sorted.at(-1) ?? 0).toFixed(1)} ms; dropped ${String(dropped)} (${(PERCENT * dropped / Math.max(1, result.intervals.length)).toFixed(TWO_DIGITS)}%); long tasks ${String(result.longTasks.length)} (max ${Math.max(0, ...result.longTasks).toFixed(0)} ms); restarts ${String(result.restarts)}; best ${(PERCENT * result.bestPercent).toFixed(1)}% of the arena`
  ];
  let elapsed = 0;
  const worst = result.intervals.map((interval) => {
    elapsed += interval;
    return { at: elapsed - interval, interval };
  }).sort((a, b) => b.interval - a.interval).slice(0, WORST_COUNT);
  lines.push(`  worst: ${worst.map(({ at, interval }) => `${interval.toFixed(0)} ms at ${(at / MILLISECONDS_IN_SECOND).toFixed(1)} s`).join(', ')}`);
  for (const [name, samples] of Object.entries(result.hooks)) {
    lines.push(`  ${name}: ${summarizeHook(samples)}`);
  }
  return lines.join('\n');
}

function summarizeHook(samples: readonly number[]): string {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = sorted.reduce((sum, sample) => sum + sample, 0);
  const over = sorted.filter((sample) => sample > FRAME_BUDGET_MILLISECONDS).length;
  return `n ${String(sorted.length)}, mean ${(total / Math.max(1, sorted.length)).toFixed(TWO_DIGITS)} ms, p95 ${quantile(sorted, P95).toFixed(TWO_DIGITS)} ms, max ${(sorted.at(-1) ?? 0).toFixed(1)} ms, over ${String(FRAME_BUDGET_MILLISECONDS)} ms ${String(over)}`;
}

await main();
