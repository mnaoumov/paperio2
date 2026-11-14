/**
 * @file
 *
 * Proves the menu's list of runs in a real page: each run's recording and stats log share one row, a run with only one
 * of the two still gets a row that says which is missing, the run's start never wraps inside a word at any width the menu
 * can have (the Delete confirmation included), and Delete all spares the runs marked Keep.
 */

import type {
  Browser,
  Page
} from 'puppeteer-core';

import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import type { Scenario } from './harness.ts';

import {
  INTEGRATION_TEST_TIMEOUT_MILLISECONDS,
  scaleIntegrationTimeout
} from '../../scripts/integration-timeout.ts';
import {
  launchBrowser,
  openVariant,
  stepPage,
  TS_ROOT
} from './harness.ts';

const TIMEOUT_MILLISECONDS = INTEGRATION_TEST_TIMEOUT_MILLISECONDS;
const MAX_WAIT_FRAMES = 300;
/** IndexedDB answers in real time, outside the page's virtual scheduler, so a wait gives it some. */
const STORAGE_SETTLE_MILLISECONDS = 20;
const BOOT_POLL_MILLISECONDS = 50;
const UNSCALED_BOOT_TIMEOUT_MILLISECONDS = 60_000;
const BOOT_TIMEOUT_MILLISECONDS = scaleIntegrationTimeout(UNSCALED_BOOT_TIMEOUT_MILLISECONDS);
/** The phone widths and the desktop width the menu is checked at. */
const WIDTHS = [320, 375, 1280] as const;
const HEIGHT = 800;
const SCENARIO: Scenario = { expectedCoverage: {}, frames: 0, keys: [], name: 'runs list', seed: 7, startFrame: 0 };
/** Where the test leaves its screenshots when `RUNS_SCREENSHOT_DIR` names a folder. */
const SCREENSHOT_DIR = process.env['RUNS_SCREENSHOT_DIR'];

interface RowFacts {
  readonly id: string;
  readonly stats: string;
  readonly videos: readonly string[];
}

interface StartFacts {
  readonly height: number;
  readonly lineHeight: number;
  readonly overflows: boolean;
  readonly rowOverflows: boolean;
  readonly text: string;
}

async function click(page: Page, selector: string): Promise<void> {
  await page.evaluate((target: string) => {
    const element = document.querySelector(target);
    if (!(element instanceof HTMLElement)) {
      throw new Error(`No ${target}`);
    }
    element.click();
  }, selector);
  await stepPage(page);
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function reload(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'load' });
  const deadline = performance.now() + BOOT_TIMEOUT_MILLISECONDS;
  while (!await page.evaluate(() => 'paperio2api' in window && document.querySelector('canvas') !== null)) {
    if (performance.now() > deadline) {
      throw new Error('The page did not boot again after the reload');
    }
    await delay(BOOT_POLL_MILLISECONDS);
  }
}

async function rows(page: Page): Promise<RowFacts[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.run-row')).map((row: Element) => ({
      id: row.getAttribute('data-id') ?? '',
      stats: row.querySelector('.run-stats-details')?.textContent ?? '',
      videos: Array.from(row.querySelectorAll('.run-video-details')).map((line: Element) => line.textContent)
    }))
  );
}

/**
 * Seeds the two stores the way the page writes them: four runs, newest first A (video and log), B (a video whose log
 * is gone), C (a log alone, kept) and D (video and log). Every recording is marked with its run.
 *
 * @param page - The page.
 */
async function seed(page: Page): Promise<void> {
  await page.evaluate(async () => {
    async function open(name: string, stores: readonly [string, string | string[]][]): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = (): void => {
          for (const [store, keyPath] of stores) {
            if (!request.result.objectStoreNames.contains(store)) {
              request.result.createObjectStore(store, { keyPath });
            }
          }
        };
        request.onsuccess = (): void => {
          resolve(request.result);
        };
        request.onerror = (): void => {
          reject(request.error ?? new Error('open failed'));
        };
      });
    }
    async function put(database: IDBDatabase, store: string, records: readonly object[]): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(store, 'readwrite');
        for (const record of records) {
          transaction.objectStore(store).put(record);
        }
        transaction.oncomplete = (): void => {
          resolve();
        };
        transaction.onerror = (): void => {
          reject(transaction.error ?? new Error('write failed'));
        };
      });
      database.close();
    }
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#eefaf5';
      context.fillRect(0, 0, 160, 90);
      context.fillStyle = '#a05cd6';
      context.beginPath();
      context.arc(80, 45, 18, 0, Math.PI * 2);
      context.fill();
    }
    const thumbnail = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve);
    });
    const hour = 3_600_000;
    const now = Date.now();
    const start = { A: now - hour, B: now - 2 * hour, C: now - 3 * hour, D: now - 4 * hour };
    function recording(id: string, runId: string, startedAt: number, minutes: number, megabytes: number): object {
      return {
        auto: true,
        bytes: megabytes * 1_048_576,
        codec: 'avc',
        decoderConfig: null,
        durationMilliseconds: minutes * 60_000,
        fps: 30,
        height: 720,
        id,
        runId,
        startedAt: startedAt + 5,
        status: 'finished',
        thumbnail,
        updatedAt: now,
        width: 1280
      };
    }
    function log(id: string, startedAt: number, seconds: number, keep = false): object {
      return { id, ...keep ? { keep } : {}, outcome: 'death', percent: 12.34, pilot: 'human', seconds, startedAt, text: `{"type":"header","run":"${id}"}\n` };
    }
    await put(await open('paperio2-video', [['recordings', 'id'], ['chunks', ['recordingId', 'seq']]]), 'recordings', [
      recording('video-a', 'A', start.A, 3.4, 20.4),
      recording('video-b', 'B', start.B, 9.65, 56.1),
      recording('video-d', 'D', start.D, 0.95, 5.2)
    ]);
    await put(await open('paperio2-stats', [['games', 'id']]), 'games', [log('A', start.A, 204), log('C', start.C, 222, true), log('D', start.D, 57)]);
  });
}

async function startFacts(page: Page): Promise<StartFacts[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.run-row')).map((row: Element) => {
      const start = row.querySelector('.run-start');
      if (!(start instanceof HTMLElement) || !(row instanceof HTMLElement)) {
        throw new Error('A run row without its start');
      }
      return {
        height: start.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(start).lineHeight) || Number.parseFloat(getComputedStyle(start).fontSize) * 1.3,
        overflows: start.scrollWidth > start.clientWidth + 1,
        rowOverflows: row.scrollWidth > row.clientWidth + 1,
        text: start.textContent
      };
    })
  );
}

async function stepUntil(page: Page, done: () => Promise<boolean>, what: string): Promise<void> {
  for (let frame = 0; !await done(); frame++) {
    if (frame > MAX_WAIT_FRAMES) {
      throw new Error(`No ${what} within ${String(MAX_WAIT_FRAMES)} frames`);
    }
    await stepPage(page);
    await delay(STORAGE_SETTLE_MILLISECONDS);
  }
}

async function text(page: Page, selector: string): Promise<string> {
  return page.evaluate((target: string) => document.querySelector(target)?.textContent ?? '', selector);
}

describe('the runs list', () => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    await promisify(execFile)(process.execPath, ['build.mjs'], { cwd: TS_ROOT });
    browser = await launchBrowser();
  }, TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    await browser?.close();
  });

  it('lists one row per run, keeps the start on one line at every width, and deletes all but the kept runs', async () => {
    if (!browser) {
      throw new Error('The browser did not start');
    }
    const page = await openVariant(browser, 'reconstruction', SCENARIO, { storage: { 'paperio2.extras': 'open' }, traceCanvas: false });
    try {
      await seed(page);
      await reload(page);
      await stepUntil(page, async () => (await rows(page)).length === 4, 'four runs in the menu');

      const listed = await rows(page);
      expect(listed.map((row: RowFacts) => row.id)).toEqual(['A', 'B', 'C', 'D']);
      expect(listed[0]?.videos).toEqual(['Video 3:24 · 20.4 MB · auto']);
      expect(listed[0]?.stats).toBe('Stats human · 3:24 · 12.34% · died');
      expect(listed[1]?.stats, 'a run whose log is gone says so').toBe('No stats log');
      expect(listed[2]?.videos, 'a run with no recording says so').toEqual(['No video']);
      expect(await text(page, '.run-row[data-id="C"] .run-keep')).toBe('Kept');
      expect(await page.evaluate(() => document.getElementById('stats-logs')), 'no separate stats section is left').toBeNull();

      // The confirm state's wider button is what squeezed the start in the original report.
      await click(page, '.run-row[data-id="A"] .run-delete');
      expect(await text(page, '.run-row[data-id="A"] .run-delete')).toBe('Delete?');
      for (const width of WIDTHS) {
        await page.setViewport({ deviceScaleFactor: 1, height: HEIGHT, width });
        await stepPage(page);
        for (const facts of await startFacts(page)) {
          expect(facts.overflows, `${facts.text} fits its column at ${String(width)} px`).toBe(false);
          expect(facts.height, `${facts.text} stays on one line at ${String(width)} px`).toBeLessThan(facts.lineHeight * 1.5);
          expect(facts.rowOverflows, `the row of ${facts.text} fits at ${String(width)} px`).toBe(false);
        }
        const detailsCut = await page.evaluate(() => Array.from(document.querySelectorAll('.run-video-details, .run-stats-details')).some((line: Element) => line.scrollWidth > line.clientWidth + 1));
        expect(detailsCut, `every video and stats line shows in full at ${String(width)} px`).toBe(false);
        if (SCREENSHOT_DIR) {
          await mkdir(SCREENSHOT_DIR, { recursive: true });
          await page.evaluate(() => {
            document.getElementById('runs')?.scrollIntoView({ block: 'center' });
          });
          await page.screenshot({ path: join(SCREENSHOT_DIR, `runs-${String(width)}.png`) });
        }
      }

      expect(await text(page, '#runs-delete-all')).toBe('Delete all except kept');
      await click(page, '#runs-delete-all');
      expect(await text(page, '#runs-delete-all')).toBe('Delete 3 run(s)?');
      await click(page, '#runs-delete-all');
      await stepUntil(page, async () => (await rows(page)).length === 1, 'only the kept run left');
      expect((await rows(page)).map((row: RowFacts) => row.id)).toEqual(['C']);
      const stored = await page.evaluate(async () => {
        async function keys(name: string, store: string): Promise<IDBValidKey[]> {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(name);
            request.onsuccess = (): void => {
              resolve(request.result);
            };
            request.onerror = (): void => {
              reject(request.error ?? new Error('open failed'));
            };
          });
          return new Promise((resolve, reject) => {
            const request = database.transaction(store, 'readonly').objectStore(store).getAllKeys();
            request.onsuccess = (): void => {
              database.close();
              resolve(request.result);
            };
            request.onerror = (): void => {
              reject(request.error ?? new Error('read failed'));
            };
          });
        }
        return { games: await keys('paperio2-stats', 'games'), recordings: await keys('paperio2-video', 'recordings') };
      });
      expect(stored).toEqual({ games: ['C'], recordings: [] });
    } finally {
      await page.browserContext().close();
    }
  }, TIMEOUT_MILLISECONDS);
});
