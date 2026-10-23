/**
 * @file
 *
 * The per-game stats log: a header, a sample every {@link STATS_SAMPLE_MILLISECONDS} of game time and an event line for
 * each capture, loss, kill, death and win, as JSONL. It is a `Game.frameObservers` entry that only reads: it never
 * writes game state and never draws `Math.random`, so a game with a log plays exactly as one without. Events are found
 * by comparing each frame with the one before, so the engine carries no hook for it.
 */

import type { Except } from 'type-fest';

import type {
  StatsEndLine,
  StatsEventBase,
  StatsEventLine,
  StatsHeaderLine,
  StatsLine,
  StatsOutcome,
  StatsSampleLine,
  StatsSteer,
  StatsZone
} from './format.ts';

import {
  KILL_REASON_NAMES,
  SLOW_FRAME_MILLISECONDS,
  STATS_FORMAT_VERSION,
  STATS_SAMPLE_MILLISECONDS
} from './format.ts';

/** What the log reads of the game clock. */
export interface StatsClock {
  now(): number;
}

/** A frame's timings, as `Game.updateMetrics` records them. */
export interface StatsFrameMetric {
  readonly frameTime: number;
  readonly renderTime: number;
  readonly updateTime: number;
}

/** What the log reads of the game. */
export interface StatsGame {
  readonly clock: StatsClock;
  readonly frameObservers: (() => void)[];
  readonly metrics: readonly StatsFrameMetric[];
  readonly pendingGameOver: null | StatsPendingGameOver;
  readonly player: null | StatsUnit;
  readonly practice: unknown;
  /** The game clock's time when the run started. */
  readonly startTime: number;
  readonly units: readonly StatsUnit[];
}

/** The header's fields that the game does not know. */
export type StatsHeaderInput = Except<StatsHeaderLine, 'format' | 'sampleMilliseconds' | 'type'>;

/** What the log reads of a death delay: its reason, `KILL_REASON_WIN` for a win. */
export interface StatsPendingGameOver {
  readonly reason?: number | undefined;
}

/** What the log reads of a point. */
export interface StatsPoint {
  readonly x: number;
  readonly y: number;
}

/** What the log reads of a trail. */
export interface StatsTrack {
  readonly length: number;
}

/** What the log reads of a unit. */
export interface StatsUnit {
  readonly base: unknown;
  readonly death: boolean;
  readonly in: unknown;
  readonly killer: null | StatsUnit;
  readonly name: string;
  readonly percent: number;
  readonly position: StatsPoint;
  readonly track: StatsTrack;
}

/** A capture or a loss smaller than this share of the arena is no event: sliding along the base's edge makes many. */
export const STATS_AREA_EVENT_THRESHOLD = 0.0001;

const PERCENT_SCALE = 100;
const MILLISECONDS_PER_SECOND = 1000;
const TIME_DIGITS = 3;
const PERCENT_DIGITS = 4;
const POSITION_DIGITS = 0;
const FRAME_TIME_DIGITS = 2;

const DECIMAL_BASE = 10;

/** How the game ended, once it has. */
interface StatsEnding {
  readonly killer: null | string;
  readonly outcome: StatsOutcome;
  readonly reason: null | string;
}

/** Frame-time totals over a span of frames. */
class FrameWindow {
  public count = 0;
  public max = 0;
  public renderTotal = 0;
  public slow = 0;
  public total = 0;
  public updateTotal = 0;

  public add(metric: StatsFrameMetric): void {
    this.count++;
    this.total += metric.frameTime;
    this.max = Math.max(this.max, metric.frameTime);
    this.renderTotal += metric.renderTime;
    this.updateTotal += metric.updateTime;
    if (metric.frameTime > SLOW_FRAME_MILLISECONDS) {
      this.slow++;
    }
  }

  public mean(total: number): number {
    return this.count ? total / this.count : 0;
  }
}

export class StatsLog {
  /**
   * How the game ended so far.
   *
   * @returns `quit` until the player dies or wins.
   */
  public get outcome(): StatsOutcome {
    return this.ending?.outcome ?? 'quit';
  }

  /**
   * The player's share of the arena on the last frame seen.
   *
   * @returns The share, in percent.
   */
  public get percent(): number {
    return this.lastPercent;
  }

  /**
   * The game time on the last frame seen.
   *
   * @returns Seconds since the run started.
   */
  public get seconds(): number {
    return this.lastTime / MILLISECONDS_PER_SECOND;
  }

  private best = 0;
  private captures = 0;
  private ended = false;
  private ending: null | StatsEnding = null;
  private readonly frameTotals = new FrameWindow();
  private kills = 0;
  private lastMetric: null | StatsFrameMetric = null;
  private lastPercent = 0;
  private lastTime = 0;
  private readonly lines: string[] = [];
  private nextSample = 0;
  private practiceSeen = false;

  private previousPlayer: null | StatsUnit = null;
  private previousShare = 0;
  private previousUnits: readonly StatsUnit[] = [];
  private sampleWindow = new FrameWindow();
  /**
   * Starts a log and attaches it to the game's frame observers.
   *
   * @param game - The game.
   * @param header - The header's fields the game does not know.
   * @param steering - Who steers right now.
   */
  public constructor(private readonly game: StatsGame, header: StatsHeaderInput, private readonly steering: () => StatsSteer) {
    this.push({ ...header, format: STATS_FORMAT_VERSION, sampleMilliseconds: STATS_SAMPLE_MILLISECONDS, type: 'header' } satisfies StatsHeaderLine);
    game.frameObservers.push(this.observer);
  }

  /**
   * Detaches the log and writes its last line. Later calls change nothing.
   *
   * @returns The whole log.
   */
  public finish(): string {
    if (!this.ended) {
      this.ended = true;
      const index = this.game.frameObservers.indexOf(this.observer);
      if (index >= 0) {
        this.game.frameObservers.splice(index, 1);
      }
      const totals = this.frameTotals;
      this.push(
        {
          best: round(this.best, PERCENT_DIGITS),
          captures: this.captures,
          frames: totals.count,
          frameTimeMax: round(totals.max, FRAME_TIME_DIGITS),
          frameTimeMean: round(totals.mean(totals.total), FRAME_TIME_DIGITS),
          killer: this.ending?.killer ?? null,
          kills: this.kills,
          outcome: this.outcome,
          pct: round(this.lastPercent, PERCENT_DIGITS),
          reason: this.ending?.reason ?? null,
          slowFrames: totals.slow,
          t: round(this.seconds, TIME_DIGITS),
          type: 'end'
        } satisfies StatsEndLine
      );
    }
    return this.text();
  }

  /** Reads the frame just played. Called after every frame while the log is attached. */
  public observe(): void {
    const { game } = this;
    const player = game.player;
    if (!player || this.ending?.outcome === 'win') {
      return;
    }
    const time = game.clock.now() - game.startTime;
    const metric = game.metrics.at(-1) ?? null;
    if (metric && metric !== this.lastMetric) {
      this.lastMetric = metric;
      this.sampleWindow.add(metric);
      this.frameTotals.add(metric);
    }
    if (game.practice && !this.practiceSeen) {
      this.practiceSeen = true;
      this.event({ ...this.at(time), event: 'practice' });
    }
    if (player !== this.previousPlayer) {
      // A practice respawn restores a copy of the game: a new player, and the clock put back to the checkpoint.
      if (this.previousPlayer && time < this.lastTime) {
        this.event({ ...this.at(time), event: 'rewind', from: round(this.seconds, TIME_DIGITS) });
        this.ending = null;
        this.nextSample = time;
      }
      this.previousPlayer = player;
      this.previousShare = player.percent;
      this.previousUnits = game.units.slice();
    }
    this.lastTime = time;
    if (player.death) {
      this.recordDeath(time, player);
      return;
    }
    this.recordAreaChange(time, player.percent);
    this.recordKills(time, player);
    this.lastPercent = player.percent * PERCENT_SCALE;
    this.best = Math.max(this.best, this.lastPercent);
    if (game.pendingGameOver?.reason === 0) {
      this.ending = { killer: null, outcome: 'win', reason: KILL_REASON_NAMES[0] ?? 'win' };
      this.event({ ...this.at(time), event: 'win' });
    }
    if (time >= this.nextSample) {
      this.sample(time, player);
      this.nextSample = Math.max(this.nextSample + STATS_SAMPLE_MILLISECONDS, time);
    }
  }

  /**
   * The log so far.
   *
   * @returns One JSON object per line.
   */
  public text(): string {
    return this.lines.map((line: string) => `${line}\n`).join('');
  }

  private at(time: number): StatsEventBase {
    return { t: round(time / MILLISECONDS_PER_SECOND, TIME_DIGITS), type: 'event' };
  }

  private event(line: StatsEventLine): void {
    this.push(line);
  }

  private readonly observer = (): void => {
    this.observe();
  };

  private push(line: StatsLine): void {
    this.lines.push(JSON.stringify(line));
  }

  private recordAreaChange(time: number, share: number): void {
    const change = share - this.previousShare;
    if (Math.abs(change) < STATS_AREA_EVENT_THRESHOLD) {
      return;
    }
    this.previousShare = share;
    const pct = round(share * PERCENT_SCALE, PERCENT_DIGITS);
    if (change > 0) {
      this.captures++;
      this.event({ ...this.at(time), event: 'capture', gained: round(change * PERCENT_SCALE, PERCENT_DIGITS), pct });
    } else {
      this.event({ ...this.at(time), event: 'lost', lost: round(-change * PERCENT_SCALE, PERCENT_DIGITS), pct });
    }
  }

  private recordDeath(time: number, player: StatsUnit): void {
    if (this.ending) {
      return;
    }
    const reasonCode = this.game.pendingGameOver?.reason;
    const reason = reasonCode === undefined ? null : KILL_REASON_NAMES[reasonCode] ?? `reason ${String(reasonCode)}`;
    const killer = player.killer && player.killer !== player ? player.killer.name : null;
    this.ending = { killer, outcome: 'death', reason };
    this.event({ ...this.at(time), event: 'death', killer, pct: round(this.lastPercent, PERCENT_DIGITS), reason });
  }

  private recordKills(time: number, player: StatsUnit): void {
    const { units } = this.game;
    if (units.length < this.previousUnits.length || units.some((unit: StatsUnit, index: number) => unit !== this.previousUnits[index])) {
      for (const unit of this.previousUnits) {
        if (unit.death && unit.killer === player && !units.includes(unit)) {
          this.kills++;
          this.event({ ...this.at(time), event: 'kill', victim: unit.name });
        }
      }
      this.previousUnits = units.slice();
    }
  }

  private sample(time: number, player: StatsUnit): void {
    const { units } = this.game;
    const window = this.sampleWindow;
    this.sampleWindow = new FrameWindow();
    this.push(
      {
        frames: window.count,
        frameTimeMax: round(window.max, FRAME_TIME_DIGITS),
        frameTimeMean: round(window.mean(window.total), FRAME_TIME_DIGITS),
        pct: round(player.percent * PERCENT_SCALE, PERCENT_DIGITS),
        rank: 1 + units.filter((unit: StatsUnit) => unit !== player && unit.percent > player.percent).length,
        renderTime: round(window.mean(window.renderTotal), FRAME_TIME_DIGITS),
        slowFrames: window.slow,
        steer: this.steering(),
        t: round(time / MILLISECONDS_PER_SECOND, TIME_DIGITS),
        trail: round(player.track.length, POSITION_DIGITS),
        type: 'sample',
        units: units.length,
        updateTime: round(window.mean(window.updateTotal), FRAME_TIME_DIGITS),
        x: round(player.position.x, POSITION_DIGITS),
        y: round(player.position.y, POSITION_DIGITS),
        zone: zoneOf(player)
      } satisfies StatsSampleLine
    );
  }
}

function round(value: number, digits: number): number {
  const scale = DECIMAL_BASE ** digits;
  return Math.round(value * scale) / scale;
}

function zoneOf(unit: StatsUnit): StatsZone {
  if (unit.in === unit.base) {
    return 'own';
  }
  return unit.in === null ? 'open' : 'enemy';
}
