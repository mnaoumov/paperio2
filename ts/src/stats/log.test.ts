import {
  describe,
  expect,
  it
} from 'vitest';

import type { StatsLine } from './format.ts';
import type {
  StatsFrameMetric,
  StatsGame,
  StatsHeaderInput,
  StatsPendingGameOver,
  StatsPoint,
  StatsTrack
} from './log.ts';

import { StatsLog } from './log.ts';

interface FakeGame extends StatsGame {
  metrics: StatsFrameMetric[];
  now: number;
  pendingGameOver: null | StatsPendingGameOver;
  player: FakeUnit | null;
  practice: unknown;
  units: FakeUnit[];
}

interface FakeUnit {
  base: object;
  death: boolean;
  in: null | object;
  killer: FakeUnit | null;
  name: string;
  percent: number;
  position: StatsPoint;
  track: StatsTrack;
}

const FRAME = 16;
const SLOW_FRAME = 50;
const HEADER: StatsHeaderInput = {
  build: 704,
  commit: 'abc1234',
  enemies: { count: null, level: null, mode: 'original', vision: 'whitebox' },
  pilot: 'human',
  recordingMode: false,
  seed: null,
  startedAt: '2026-10-22T00:00:00.000Z',
  viewport: { devicePixelRatio: 1, height: 720, width: 1280 }
};

function createGame(): FakeGame {
  const player = createUnit('me', 0.01);
  const bot = createUnit('bot', 0.02);
  const game: FakeGame = {
    clock: { now: (): number => game.now },
    frameObservers: [],
    metrics: [],
    now: 1000,
    pendingGameOver: null,
    player,
    practice: null,
    startTime: 1000,
    units: [player, bot]
  };
  return game;
}

function createUnit(name: string, percent: number): FakeUnit {
  const base = {};
  return { base, death: false, in: base, killer: null, name, percent, position: { x: 10.4, y: 20.6 }, track: { length: 0 } };
}

function frame(game: FakeGame, frameTime = FRAME): void {
  game.now += frameTime;
  game.metrics.push({ frameTime, renderTime: 2, updateTime: 1 });
  for (const observer of game.frameObservers) {
    observer();
  }
}

function parse(text: string): StatsLine[] {
  return text.trim().split('\n').map((line: string) => JSON.parse(line) as StatsLine);
}

describe('StatsLog', () => {
  it('writes a header, a sample every 250 ms of game time and an end line', () => {
    const game = createGame();
    const log = new StatsLog(game, HEADER, () => 'human');
    for (let index = 0; index < 60; index++) {
      frame(game);
    }
    const lines = parse(log.finish());
    expect(lines[0]).toMatchObject({ format: 1, pilot: 'human', sampleMilliseconds: 250, type: 'header' });
    const samples = lines.filter((line: StatsLine) => line.type === 'sample');
    expect(samples.length).toBe(4);
    expect(samples[0]).toMatchObject({ pct: 1, rank: 2, steer: 'human', units: 2, x: 10, y: 21, zone: 'own' });
    expect(lines.at(-1)).toMatchObject({ frames: 60, outcome: 'quit', type: 'end' });
    expect(game.frameObservers).toHaveLength(0);
  });

  it('counts the frames between samples and the slow ones', () => {
    const game = createGame();
    const log = new StatsLog(game, HEADER, () => 'pilot');
    frame(game);
    frame(game, SLOW_FRAME);
    for (let index = 0; index < 20; index++) {
      frame(game);
    }
    const samples = parse(log.finish()).filter((line: StatsLine) => line.type === 'sample');
    expect(samples[1]).toMatchObject({ frameTimeMax: SLOW_FRAME, slowFrames: 1, steer: 'pilot' });
  });

  it('logs a capture, a loss and the zone, ignoring slivers', () => {
    const game = createGame();
    const log = new StatsLog(game, HEADER, () => 'human');
    const player = game.player;
    if (!player) {
      throw new Error('no player');
    }
    frame(game);
    player.in = null;
    player.percent = 0.01005;
    frame(game);
    player.percent = 0.03;
    frame(game);
    player.percent = 0.025;
    frame(game);
    const events = parse(log.finish()).filter((line: StatsLine) => line.type === 'event');
    expect(events).toEqual([
      { event: 'capture', gained: 2, pct: 3, t: 0.048, type: 'event' },
      { event: 'lost', lost: 0.5, pct: 2.5, t: 0.064, type: 'event' }
    ]);
  });

  it('logs a kill by the player and its death with the killer and reason', () => {
    const game = createGame();
    const log = new StatsLog(game, HEADER, () => 'human');
    const [player, bot] = game.units;
    if (!player || !bot) {
      throw new Error('no units');
    }
    frame(game);
    bot.death = true;
    bot.killer = player;
    game.units = [player];
    frame(game);
    const killer = createUnit('hunter', 0.05);
    game.units = [killer];
    player.death = true;
    player.killer = killer;
    game.pendingGameOver = { reason: 3 };
    frame(game);
    frame(game);
    const lines = parse(log.finish());
    expect(lines.filter((line: StatsLine) => line.type === 'event')).toEqual([
      { event: 'kill', t: 0.032, type: 'event', victim: 'bot' },
      { event: 'death', killer: 'hunter', pct: 1, reason: 'trail cut', t: 0.048, type: 'event' }
    ]);
    expect(lines.at(-1)).toMatchObject({ killer: 'hunter', kills: 1, outcome: 'death', reason: 'trail cut' });
  });

  it('logs a win once', () => {
    const game = createGame();
    const log = new StatsLog(game, HEADER, () => 'human');
    frame(game);
    game.pendingGameOver = { reason: 0 };
    frame(game);
    frame(game);
    const lines = parse(log.finish());
    expect(lines.filter((line: StatsLine) => line.type === 'event')).toEqual([{ event: 'win', t: 0.032, type: 'event' }]);
    expect(lines.at(-1)).toMatchObject({ outcome: 'win', reason: 'win' });
  });

  it('logs practice and a respawn that puts the clock back, and plays on after it', () => {
    const game = createGame();
    const log = new StatsLog(game, HEADER, () => 'human');
    game.practice = {};
    for (let index = 0; index < 20; index++) {
      frame(game);
    }
    const player = game.player;
    if (!player) {
      throw new Error('no player');
    }
    player.death = true;
    frame(game);
    const respawned = createUnit('me', 0.01);
    game.player = respawned;
    game.units = [respawned];
    game.now = 1100;
    frame(game);
    const lines = parse(log.finish());
    expect(lines.filter((line: StatsLine) => line.type === 'event').map((line: StatsLine) => 'event' in line ? line.event : '')).toEqual(['practice', 'death', 'rewind']);
    expect(lines.at(-1)).toMatchObject({ outcome: 'quit' });
  });
});
