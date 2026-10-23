/**
 * @file
 *
 * Compares stats logs side by side: the page's (a human's game, downloaded from the menu's Extras) and the benchmark's
 * (`npm run benchmark -- --stats <dir>`), which share one JSONL format. A file may hold several games, each starting
 * at its header line, as the menu's Download all writes them.
 *
 * `npm run stats:report -- <file or directory>... [--every 30]`
 *
 * It prints a summary row per game, then the area curves: each game's share of the arena every `--every` seconds of
 * game time.
 */

import {
  readdir,
  readFile,
  stat
} from 'node:fs/promises';
import {
  basename,
  join
} from 'node:path';
import { parseArgs } from 'node:util';

import type {
  StatsEndLine,
  StatsEventLine,
  StatsHeaderLine,
  StatsLine,
  StatsSampleLine
} from '../../src/stats/format.ts';

interface Game {
  readonly end: null | StatsEndLine;
  readonly events: readonly StatsEventLine[];
  readonly header: StatsHeaderLine;
  readonly label: string;
  readonly samples: readonly StatsSampleLine[];
}

/** A game while its lines are read. */
interface ParsedGame {
  end: null | StatsEndLine;
  readonly events: StatsEventLine[];
  readonly header: StatsHeaderLine;
  readonly samples: StatsSampleLine[];
}

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_DIGITS = 2;
const MEDIAN_DIVISOR = 2;
const PERCENT_DIGITS = 2;
const PERCENT_SCALE = 100;
// eslint-disable-next-line no-magic-numbers -- the minutes the summary reads the area at.
const MILESTONE_MINUTES: readonly number[] = [1, 2, 5, 10];

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    every: { default: '30', type: 'string' }
  }
});

const games: Game[] = [];
for (const path of positionals) {
  for (const file of await listFiles(path)) {
    games.push(...parseGames(await readFile(file, 'utf8'), basename(file)));
  }
}
if (games.length === 0) {
  print('No games found. Pass .jsonl files or directories holding them.');
  process.exitCode = 1;
} else {
  print(summary(games));
  print('');
  print(curves(games, Math.max(1, Number(values.every))));
}

function areaAt(game: Game, seconds: number): null | number {
  let last: null | StatsSampleLine = null;
  for (const sample of game.samples) {
    if (sample.t > seconds) {
      break;
    }
    last = sample;
  }
  const lastSample = game.samples.at(-1);
  // The last sample stands for the span up to the next one.
  if (!last || !lastSample || lastSample.t + game.header.sampleMilliseconds / MILLISECONDS_PER_SECOND < seconds) {
    return null;
  }
  return last.pct;
}

function curves(list: readonly Game[], every: number): string {
  const longest = Math.max(...list.map((game: Game) => game.end?.t ?? game.samples.at(-1)?.t ?? 0));
  const lines = [`| Time | ${list.map((game: Game) => game.label).join(' | ')} |`, `| --- | ${list.map(() => '---').join(' | ')} |`];
  for (let seconds = every; seconds <= longest; seconds += every) {
    lines.push(`| ${formatTime(seconds)} | ${
      list.map((game: Game) => {
        const area = areaAt(game, seconds);
        return area === null ? '' : `${area.toFixed(PERCENT_DIGITS)}%`;
      }).join(' | ')
    } |`);
  }
  return lines.join('\n');
}

function formatTime(seconds: number): string {
  const whole = Math.round(seconds);
  return `${String(Math.floor(whole / SECONDS_PER_MINUTE))}:${String(whole % SECONDS_PER_MINUTE).padStart(SECONDS_DIGITS, '0')}`;
}

async function listFiles(path: string): Promise<string[]> {
  if (!(await stat(path)).isDirectory()) {
    return [path];
  }
  return (await readdir(path)).filter((name: string) => name.endsWith('.jsonl')).sort().map((name: string) => join(path, name));
}

function median(numbers: readonly number[]): null | number {
  if (numbers.length === 0) {
    return null;
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / MEDIAN_DIVISOR);
  return sorted.length % MEDIAN_DIVISOR ? sorted[middle] ?? null : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / MEDIAN_DIVISOR;
}

function outcomeText(game: Game): string {
  const { end } = game;
  if (!end) {
    return 'unfinished';
  }
  if (end.outcome === 'death') {
    return `died (${end.reason ?? '?'}${end.killer ? `, by ${end.killer}` : ''})`;
  }
  return end.outcome === 'win' ? 'won' : 'left';
}

function parseGames(text: string, fileName: string): Game[] {
  const list: Game[] = [];
  let current: null | ParsedGame = null;
  let index = 0;
  function close(): void {
    if (current) {
      index++;
      list.push({ ...current, label: `${fileName}#${String(index)} (${current.header.pilot})` });
    }
  }
  for (const raw of text.split('\n')) {
    if (!raw.trim()) {
      continue;
    }
    const line = JSON.parse(raw) as StatsLine;
    if (line.type === 'header') {
      close();
      current = { end: null, events: [], header: line, samples: [] };
    } else if (current) {
      if (line.type === 'sample') {
        current.samples.push(line);
      } else if (line.type === 'event') {
        current.events.push(line);
      } else {
        current.end = line;
      }
    }
  }
  close();
  return list;
}

function print(text: string): void {
  process.stdout.write(`${text}\n`);
}

function summary(list: readonly Game[]): string {
  const lines = [
    `| Game | Enemies | Time | Outcome | Final | Best | ${MILESTONE_MINUTES.map((minutes: number) => `At ${String(minutes)} min`).join(' | ')} | Captures (median) | Kills | Lost | Frame mean / max | Slow frames |`,
    `| --- | --- | --- | --- | --- | --- | ${MILESTONE_MINUTES.map(() => '---').join(' | ')} | --- | --- | --- | --- | --- |`
  ];
  for (const game of list) {
    const captures = game.events.flatMap((event: StatsEventLine) => event.event === 'capture' ? [event.gained] : []);
    const lost = game.events.reduce((total: number, event: StatsEventLine) => total + (event.event === 'lost' ? event.lost : 0), 0);
    const kills = game.events.filter((event: StatsEventLine) => event.event === 'kill').length;
    const end = game.end;
    const lastSample = game.samples.at(-1);
    const medianCapture = median(captures);
    const { enemies } = game.header;
    lines.push(
      [
        '',
        game.label,
        `${enemies.mode}${enemies.mode === 'original' ? '' : `:${enemies.vision}`}`,
        formatTime(end?.t ?? lastSample?.t ?? 0),
        outcomeText(game),
        `${(end?.pct ?? lastSample?.pct ?? 0).toFixed(PERCENT_DIGITS)}%`,
        `${(end?.best ?? 0).toFixed(PERCENT_DIGITS)}%`,
        ...MILESTONE_MINUTES.map((minutes: number) => {
          const area = areaAt(game, minutes * SECONDS_PER_MINUTE);
          return area === null ? '-' : `${area.toFixed(PERCENT_DIGITS)}%`;
        }),
        `${String(captures.length)} (${medianCapture === null ? '-' : `${medianCapture.toFixed(PERCENT_DIGITS)}%`})`,
        String(kills),
        `${lost.toFixed(PERCENT_DIGITS)}%`,
        end ? `${end.frameTimeMean.toFixed(1)} / ${end.frameTimeMax.toFixed(0)} ms` : '-',
        end?.frames ? `${String(end.slowFrames)} (${(end.slowFrames / end.frames * PERCENT_SCALE).toFixed(1)}%)` : '-',
        ''
      ].join(' | ').trim()
    );
  }
  return lines.join('\n');
}
