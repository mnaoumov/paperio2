import { now } from './math-utils.ts';

/** The real time source and timer functions a {@link GameClock} runs on, injectable for tests. */
export interface ClockHost {
  clearTimeout(handle: number): void;
  now(): number;
  setTimeout(callback: () => void, delay: number): number;
}

interface ClockTimer {
  readonly callback: () => void;
  /** When the timer falls due, in game time. */
  readonly due: number;
  /** The armed host timer, `null` while the clock is paused. */
  handle: null | number;
}

const browserHost: ClockHost = {
  clearTimeout(handle: number): void {
    clearTimeout(handle);
  },
  now,
  setTimeout(callback: () => void, delay: number): number {
    return setTimeout(callback, delay);
  }
};

/**
 * The game's clock: real time minus every span spent paused, so game logic that reads it sees no jump across a
 * pause, and a timer set on it neither fires during a pause nor late after it.
 *
 * Until the first pause it returns the real time unchanged (minus a zero offset, which is exact), and arms each
 * timer as one host `setTimeout` with the delay it was given, so a game that is never paused behaves bit for bit
 * like the original engine, which read the real clock directly.
 */
export class GameClock {
  public get isPaused(): boolean {
    return this.pausedAt !== null;
  }

  private readonly host: ClockHost;
  private pausedAt: null | number = null;
  private pausedTotal = 0;

  private readonly timers = new Set<ClockTimer>();

  public constructor(host: ClockHost = browserHost) {
    this.host = host;
  }

  /**
   * Reads the game time.
   *
   * @returns The current game time: frozen while paused, and never counting a paused span.
   */
  public now(): number {
    return (this.pausedAt ?? this.host.now()) - this.pausedTotal;
  }

  /**
   * Stops the clock and suspends its timers.
   *
   * @returns `false` when it was already paused.
   */
  public pause(): boolean {
    if (this.pausedAt !== null) {
      return false;
    }
    this.pausedAt = this.host.now();
    for (const timer of this.timers) {
      if (timer.handle !== null) {
        this.host.clearTimeout(timer.handle);
        timer.handle = null;
      }
    }
    return true;
  }

  /**
   * Restarts the clock and re-arms each timer with the game time it still had to run.
   *
   * @returns `false` when it was not paused.
   */
  public resume(): boolean {
    if (this.pausedAt === null) {
      return false;
    }
    this.pausedTotal += this.host.now() - this.pausedAt;
    this.pausedAt = null;
    const gameTime = this.now();
    for (const timer of this.timers) {
      this.arm(timer, Math.max(0, timer.due - gameTime));
    }
    return true;
  }

  /**
   * Runs `callback` once `delay` milliseconds of game time have passed.
   *
   * @param callback - What to run.
   * @param delay - How long to wait, in milliseconds of game time.
   */
  public setTimeout(callback: () => void, delay: number): void {
    const timer: ClockTimer = {
      callback,
      due: this.now() + delay,
      handle: null
    };
    this.timers.add(timer);
    if (this.pausedAt === null) {
      this.arm(timer, delay);
    }
  }

  private arm(timer: ClockTimer, delay: number): void {
    timer.handle = this.host.setTimeout(() => {
      this.timers.delete(timer);
      timer.callback();
    }, delay);
  }
}
