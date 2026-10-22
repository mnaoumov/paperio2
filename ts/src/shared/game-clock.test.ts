import {
  describe,
  expect,
  it
} from 'vitest';

import type { ClockHost } from './game-clock.ts';

import { GameClock } from './game-clock.ts';

interface FakeTimer {
  readonly callback: () => void;
  readonly delay: number;
  readonly due: number;
}

/** A manual real clock and timer queue, advanced by `advance`. */
class FakeHost implements ClockHost {
  public readonly armed: FakeTimer[] = [];
  public time = 0;
  private nextHandle = 1;
  private readonly timers = new Map<number, FakeTimer>();

  public advance(milliseconds: number): void {
    const target = this.time + milliseconds;
    for (;;) {
      const next = [...this.timers].filter(([, timer]) => timer.due <= target).sort(([, left], [, right]) => left.due - right.due)[0];
      if (!next) {
        break;
      }
      const [handle, timer] = next;
      this.timers.delete(handle);
      this.time = timer.due;
      timer.callback();
    }
    this.time = target;
  }

  public clearTimeout(handle: number): void {
    this.timers.delete(handle);
  }

  public now(): number {
    return this.time;
  }

  public setTimeout(callback: () => void, delay: number): number {
    const timer = { callback, delay, due: this.time + delay };
    this.armed.push(timer);
    const handle = this.nextHandle++;
    this.timers.set(handle, timer);
    return handle;
  }
}

const TEN_MINUTES = 600_000;

describe('GameClock', () => {
  it('reads the real clock unchanged until the first pause', () => {
    const host = new FakeHost();
    host.time = 1234.5678;
    const clock = new GameClock(host);
    expect(clock.now()).toBe(1234.5678);
    expect(clock.isPaused).toBe(false);
  });

  it('arms a timer as one host timer with the given delay while never paused', () => {
    const host = new FakeHost();
    const clock = new GameClock(host);
    clock.setTimeout(() => undefined, 2000);
    expect(host.armed.map((timer) => timer.delay)).toEqual([2000]);
  });

  it('freezes while paused and never counts the paused span', () => {
    const host = new FakeHost();
    host.time = 100;
    const clock = new GameClock(host);
    expect(clock.pause()).toBe(true);
    host.advance(TEN_MINUTES);
    expect(clock.now()).toBe(100);
    expect(clock.resume()).toBe(true);
    host.advance(16);
    expect(clock.now()).toBe(116);
  });

  it('accumulates several pauses', () => {
    const host = new FakeHost();
    const clock = new GameClock(host);
    host.advance(10);
    clock.pause();
    host.advance(1000);
    clock.resume();
    host.advance(10);
    clock.pause();
    host.advance(TEN_MINUTES);
    clock.resume();
    host.advance(5);
    expect(clock.now()).toBe(25);
  });

  it('reports a pause or resume that changes nothing', () => {
    const clock = new GameClock(new FakeHost());
    expect(clock.resume()).toBe(false);
    expect(clock.pause()).toBe(true);
    expect(clock.pause()).toBe(false);
    expect(clock.resume()).toBe(true);
    expect(clock.resume()).toBe(false);
  });

  it('does not fire a timer during a pause, nor late after it', () => {
    const host = new FakeHost();
    const clock = new GameClock(host);
    const firedAt: number[] = [];
    clock.setTimeout(() => {
      firedAt.push(clock.now());
    }, 2000);
    host.advance(500);
    clock.pause();
    host.advance(TEN_MINUTES);
    expect(firedAt).toEqual([]);
    clock.resume();
    host.advance(1499);
    expect(firedAt).toEqual([]);
    host.advance(1);
    expect(firedAt).toEqual([2000]);
  });

  it('holds a timer set while paused until the resume', () => {
    const host = new FakeHost();
    const clock = new GameClock(host);
    const firedAt: number[] = [];
    clock.pause();
    clock.setTimeout(() => {
      firedAt.push(clock.now());
    }, 1000);
    host.advance(TEN_MINUTES);
    expect(firedAt).toEqual([]);
    clock.resume();
    host.advance(1000);
    expect(firedAt).toEqual([1000]);
  });

  it('fires each timer once', () => {
    const host = new FakeHost();
    const clock = new GameClock(host);
    let fired = 0;
    clock.setTimeout(() => {
      fired++;
    }, 100);
    host.advance(100);
    clock.pause();
    clock.resume();
    host.advance(TEN_MINUTES);
    expect(fired).toBe(1);
  });

  it('moves the game time with setNow, running or paused', () => {
    const host = new FakeHost();
    const clock = new GameClock(host);
    host.advance(5000);
    clock.setNow(1200);
    expect(clock.now()).toBe(1200);
    host.advance(300);
    expect(clock.now()).toBe(1500);
    clock.pause();
    clock.setNow(400);
    host.advance(TEN_MINUTES);
    expect(clock.now()).toBe(400);
    clock.resume();
    host.advance(100);
    expect(clock.now()).toBe(500);
  });

  it('lists pending timers with the game time they still have, so setting them again puts them back', () => {
    const host = new FakeHost();
    const clock = new GameClock(host);
    const fired: string[] = [];
    clock.setTimeout(() => {
      fired.push('first');
    }, 1000);
    clock.setTimeout(() => {
      fired.push('second');
    }, 3000);
    host.advance(400);
    clock.pause();
    const pending = clock.readTimers();
    expect(pending.map((timer) => timer.delay)).toEqual([600, 2600]);
    clock.clearTimers();
    clock.resume();
    for (const timer of pending) {
      clock.setTimeout(timer.callback, timer.delay);
    }
    host.advance(599);
    expect(fired).toEqual([]);
    host.advance(1);
    expect(fired).toEqual(['first']);
    host.advance(2000);
    expect(fired).toEqual(['first', 'second']);
  });

  it('cancels every pending timer with clearTimers', () => {
    const host = new FakeHost();
    const clock = new GameClock(host);
    let fired = 0;
    clock.setTimeout(() => {
      fired++;
    }, 100);
    clock.pause();
    clock.setTimeout(() => {
      fired++;
    }, 100);
    expect(clock.pendingTimers).toBe(2);
    clock.clearTimers();
    expect(clock.pendingTimers).toBe(0);
    clock.resume();
    host.advance(TEN_MINUTES);
    expect(fired).toBe(0);
  });
});
