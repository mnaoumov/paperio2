/**
 * @file
 *
 * The in-page half of the differential test. {@link installDeterminism} is serialized by puppeteer and runs in
 * the page before any of its own scripts, so it must stay self-contained: no imports, no closures over module
 * scope, nothing esbuild would rewrite into a helper call.
 *
 * It removes every source of nondeterminism the engine reads, so two loads of the page with the same seed and
 * the same input script must produce the same frames:
 *
 * - `Math.random` becomes a seeded mulberry32.
 * - `performance.now`, `Date.now` and a zero-argument `new Date()` read a virtual clock.
 * - `requestAnimationFrame`, `setTimeout` and `setInterval` go into one virtual scheduler that only the test
 *   advances, one frame at a time. Promise chains settle between callbacks, but the page never yields to the event
 *   loop mid-frame, so no network or load event can interleave differently from one run to the next.
 * - An image's `src` write is held to the end of the frame, and the held images then load one at a time in request
 *   order, so asset timing cannot decide whether a skin is drawn on a given frame.
 *
 * And it records what each frame did: every `CanvasRenderingContext2D`, `Path2D` and `CanvasGradient` call and
 * property write, with its arguments, folded into a hash. That trace is name-agnostic, so it compares the
 * obfuscated original and the renamed reconstruction directly.
 */

export interface DifferentialFrameResult {
  readonly callCount: number;
  readonly hash: string;
}

export interface DifferentialPageApi {
  canvasHash: () => string;
  facts: () => string;
  frameTrace: () => readonly string[];
  key: (keyCode: number, isDown: boolean) => void;
  snapshot: () => DifferentialSnapshot;
  step: (milliseconds: number) => Promise<DifferentialFrameResult>;
}

declare global {
  interface Window {
    __differential: DifferentialPageApi;
    paperio2api: PaperIo2PageApi;
    /** Which engine `index.html`'s engine switch loaded. */
    paperio2engine?: 'original' | 'reconstruction';
  }
}

export interface DifferentialRemovedUnit {
  readonly death: unknown;
  readonly frame: number;
  readonly isPlayer: boolean;
  readonly killer: null | string;
  readonly name: string;
}

export interface DifferentialSnapshot {
  readonly cycle: number;
  readonly player: null | string;
  readonly playerCaptures: number;
  readonly removed: readonly DifferentialRemovedUnit[];
  readonly stopped: boolean;
  readonly units: readonly DifferentialUnitSnapshot[];
}

export interface DifferentialUnitSnapshot {
  readonly baseSquare: number;
  readonly dead: boolean;
  readonly direction: number;
  readonly isPlayer: boolean;
  readonly killer: null | string;
  readonly name: string;
  readonly percent: number;
  readonly trailSegments: number;
  readonly x: number;
  readonly y: number;
}

export interface InstallDeterminismParams {
  readonly seed: number;
}

/** The one call the harness makes on the game's own `window.paperio2api`: what the shim's Play button calls. */
export interface PaperIo2PageApi {
  startGame: () => void;
}

export function installDeterminism(params: InstallDeterminismParams): void {
  /* eslint-disable no-magic-numbers, no-bitwise -- mulberry32 and FNV-1a are bit mixers by definition, and their constants are the algorithms'; the 4 ms interval clamp is the browser's. */
  let randomState = params.seed >>> 0;
  let randomCalls = 0;
  Math.random = function random(): number {
    randomCalls++;
    randomState = (randomState + 0x6D2B79F5) | 0;
    let mixed = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };

  const EPOCH_MILLISECONDS = Date.UTC(2026, 0, 1);
  const MIN_INTERVAL_MILLISECONDS = 4;
  const MAX_CALLBACKS_PER_STEP = 100_000;
  const MICROTASK_HOPS = 16;
  let clock = 0;

  type Callable = (...args: unknown[]) => unknown;
  type Constructor = new (...args: unknown[]) => object;
  function isCallable(value: unknown): value is Callable {
    return typeof value === 'function';
  }

  const RealDate = Date;
  Object.defineProperty(RealDate, 'now', { configurable: true, value: () => EPOCH_MILLISECONDS + clock });
  const VirtualDate = new Proxy(RealDate, {
    apply(): string {
      return new RealDate(EPOCH_MILLISECONDS + clock).toString();
    },
    construct(target: Constructor, args: unknown[], newTarget: Constructor): object {
      return Reflect.construct(target, args.length === 0 ? [EPOCH_MILLISECONDS + clock] : args, newTarget);
    }
  });
  Object.defineProperty(window, 'Date', { configurable: true, value: VirtualDate, writable: true });
  Object.defineProperty(performance, 'now', { configurable: true, value: () => clock });

  interface VirtualTimer {
    callback: () => void;
    due: number;
    period: null | number;
    sequence: number;
  }
  const timers = new Map<number, VirtualTimer>();
  let nextTimerId = 1;
  let nextSequence = 0;
  interface AnimationFrameRequest {
    callback: (time: number) => void;
    id: number;
  }
  let animationFrames: AnimationFrameRequest[] = [];

  function toCallback(handler: unknown, args: unknown[]): () => void {
    return () => {
      if (isCallable(handler)) {
        Reflect.apply(handler, window, args);
      }
    };
  }

  function addTimer(handler: unknown, delay: unknown, args: unknown[], isInterval: boolean): number {
    const milliseconds = Math.max(0, Number(delay) || 0);
    const id = nextTimerId++;
    timers.set(id, {
      callback: toCallback(handler, args),
      due: clock + milliseconds,
      period: isInterval ? Math.max(MIN_INTERVAL_MILLISECONDS, milliseconds) : null,
      sequence: nextSequence++
    });
    return id;
  }

  function clearTimer(id: unknown): void {
    timers.delete(Number(id));
  }

  function define(name: string, value: unknown): void {
    Object.defineProperty(window, name, { configurable: true, value, writable: true });
  }

  define('setTimeout', (handler: unknown, delay?: unknown, ...args: unknown[]) => addTimer(handler, delay, args, false));
  define('setInterval', (handler: unknown, delay?: unknown, ...args: unknown[]) => addTimer(handler, delay, args, true));
  define('clearTimeout', clearTimer);
  define('clearInterval', clearTimer);
  define('requestAnimationFrame', (callback: (time: number) => void) => {
    const id = nextTimerId++;
    animationFrames.push({ callback, id });
    return id;
  });
  define('cancelAnimationFrame', (id: unknown) => {
    animationFrames = animationFrames.filter((frame) => frame.id !== Number(id));
  });

  const channel = new MessageChannel();
  const yieldResolvers: (() => void)[] = [];
  channel.port1.onmessage = (): void => {
    yieldResolvers.shift()?.();
  };
  // Lets the promise chains a callback started settle before the next callback runs, without yielding to the
  // Event loop, where a network or load event could interleave differently from run to run.
  async function flushMicrotasks(): Promise<void> {
    for (let hop = 0; hop < MICROTASK_HOPS; hop++) {
      await Promise.resolve();
    }
  }
  function yieldTask(): Promise<void> {
    return new Promise((resolve) => {
      yieldResolvers.push(resolve);
      channel.port2.postMessage(null);
    });
  }

  // An image's `src` write is held back to the end of the frame, then the held images load one at a time, in the
  // Order the page asked for them, so a load event can neither land mid-frame nor overtake another one.
  interface HeldImage {
    image: HTMLImageElement;
    source: unknown;
  }
  const heldImages: HeldImage[] = [];
  const imageSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  function writeImageSource(image: HTMLImageElement, source: unknown): void {
    imageSource?.set?.call(image, source);
  }
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    enumerable: true,
    get(this: HTMLImageElement): unknown {
      return imageSource?.get?.call(this);
    },
    set(this: HTMLImageElement, value: unknown): void {
      heldImages.push({ image: this, source: value });
    }
  });
  async function loadHeldImages(): Promise<void> {
    for (let held = heldImages.shift(); held; held = heldImages.shift()) {
      const { image, source } = held;
      await new Promise<void>((resolve) => {
        image.addEventListener('load', () => {
          resolve();
        }, { once: true });
        image.addEventListener('error', () => {
          resolve();
        }, { once: true });
        writeImageSource(image, source);
      });
      await yieldTask();
    }
  }

  const trace: string[] = [];
  const objectIds = new WeakMap<object, string>();
  const objectCounters = new Map<string, number>();
  function idOf(value: object): string {
    let id = objectIds.get(value);
    if (id === undefined) {
      const typeName = Object.prototype.toString.call(value).slice(8, -1);
      const seen = objectCounters.get(typeName) ?? 0;
      objectCounters.set(typeName, seen + 1);
      id = `${typeName}#${String(seen)}`;
      objectIds.set(value, id);
    }
    return id;
  }
  function describe(value: unknown): string {
    if (typeof value === 'number') {
      return Object.is(value, -0) ? '-0' : String(value);
    }
    if (typeof value === 'string') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map(describe).join(',')}]`;
    }
    if (typeof value === 'object' && value !== null) {
      return idOf(value);
    }
    return String(value);
  }

  function traceMethod(prototype: object, propertyName: string, descriptor: PropertyDescriptor, method: Callable): void {
    function traced(this: object, ...args: unknown[]): unknown {
      trace.push(`${idOf(this)}.${propertyName}(${args.map(describe).join(',')})`);
      return Reflect.apply(method, this, args);
    }
    Object.defineProperty(prototype, propertyName, { ...descriptor, value: traced });
  }
  function traceSetter(prototype: object, propertyName: string, descriptor: PropertyDescriptor, setter: Callable): void {
    const getter: unknown = Reflect.get(descriptor, 'get');
    if (!isCallable(getter)) {
      // Every canvas property with a setter has a getter; a write-only one would be traced by nothing here.
      return;
    }
    Object.defineProperty(prototype, propertyName, {
      ...descriptor,
      get: getter,
      set(this: object, value: unknown): void {
        trace.push(`${idOf(this)}.${propertyName}=${describe(value)}`);
        Reflect.apply(setter, this, [value]);
      }
    });
  }
  function instrument(prototype: object): void {
    for (const propertyName of Object.getOwnPropertyNames(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);
      if (!descriptor || propertyName === 'constructor') {
        continue;
      }
      const method: unknown = descriptor.value;
      const setter: unknown = Reflect.get(descriptor, 'set');
      if (isCallable(method)) {
        traceMethod(prototype, propertyName, descriptor, method);
      } else if (isCallable(setter)) {
        traceSetter(prototype, propertyName, descriptor, setter);
      }
    }
  }
  instrument(CanvasRenderingContext2D.prototype);
  instrument(Path2D.prototype);
  instrument(CanvasGradient.prototype);
  const RealPath2D = Path2D;
  define(
    'Path2D',
    new Proxy(RealPath2D, {
      construct(_target: typeof Path2D, args: unknown[]): object {
        const [source] = args;
        const path = typeof source === 'string' || source instanceof RealPath2D ? new RealPath2D(source) : new RealPath2D();
        trace.push(`new ${idOf(path)}(${args.map(describe).join(',')})`);
        return path;
      }
    })
  );

  function hashOf(lines: readonly string[]): string {
    let first = 0x811C9DC5;
    let second = 5381;
    for (const line of lines) {
      for (let index = 0; index < line.length; index++) {
        const code = line.charCodeAt(index);
        first = Math.imul(first ^ code, 0x01000193);
        second = (Math.imul(second, 33) + code) | 0;
      }
      first = Math.imul(first ^ 10, 0x01000193);
    }
    return (first >>> 0).toString(16).padStart(8, '0') + (second >>> 0).toString(16).padStart(8, '0');
  }

  let lastFrameTrace: readonly string[] = [];
  let callbacksThisStep = 0;
  async function runGuarded(callback: () => void): Promise<void> {
    if (++callbacksThisStep > MAX_CALLBACKS_PER_STEP) {
      throw new Error(`more than ${String(MAX_CALLBACKS_PER_STEP)} callbacks in one frame: a timer loop never yields`);
    }
    callback();
    await flushMicrotasks();
  }

  async function step(milliseconds: number): Promise<DifferentialFrameResult> {
    trace.length = 0;
    callbacksThisStep = 0;
    const target = clock + milliseconds;
    for (;;) {
      let nextId: null | number = null;
      let next: null | VirtualTimer = null;
      for (const [id, timer] of timers) {
        if (timer.due <= target && (next === null || timer.due < next.due || (timer.due === next.due && timer.sequence < next.sequence))) {
          next = timer;
          nextId = id;
        }
      }
      if (next === null || nextId === null) {
        break;
      }
      clock = Math.max(clock, next.due);
      if (next.period === null) {
        timers.delete(nextId);
      } else {
        next.due += next.period;
        next.sequence = nextSequence++;
      }
      await runGuarded(next.callback);
    }
    clock = target;
    const frames = animationFrames;
    animationFrames = [];
    const frameTime = clock;
    for (const frame of frames) {
      await runGuarded(() => {
        frame.callback(frameTime);
      });
    }
    trackUnits();
    await yieldTask();
    await loadHeldImages();
    lastFrameTrace = [...trace];
    return { callCount: trace.length, hash: hashOf(trace) };
  }

  function pressKey(keyCode: number, isDown: boolean): void {
    const event = new KeyboardEvent(isDown ? 'keydown' : 'keyup', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'keyCode', { value: keyCode });
    Object.defineProperty(event, 'which', { value: keyCode });
    document.body.dispatchEvent(event);
  }

  function canvasHash(): string {
    const canvas = document.querySelector('canvas');
    return canvas ? hashOf([canvas.toDataURL()]) : 'no-canvas';
  }

  // The obfuscator kept property names, so both builds expose the same fields. `undefined` and `null` are folded
  // Together: the strict conversion gave some fields a `null` default where the original left them unset, which
  // Is only a behavior change if something tells the two apart, and the draw trace catches that.
  function read(owner: unknown, ...keys: string[]): unknown {
    let value = owner;
    for (const propertyName of keys) {
      if (typeof value !== 'object' || value === null) {
        return null;
      }
      value = Reflect.get(value, propertyName);
    }
    return value ?? null;
  }
  function count(owner: unknown, ...keys: string[]): number {
    const value = read(owner, ...keys);
    return Array.isArray(value) ? value.length : 0;
  }
  // Dead units leave `game.units` on the frame they die, so deaths are recorded here, every frame, rather than
  // Read from a periodic snapshot that would miss them.
  const removed: DifferentialRemovedUnit[] = [];
  let frameNumber = 0;
  let previousUnits = new Set<unknown>();
  let previousPlayer: unknown = null;
  let previousPlayerSquare: null | number = null;
  let playerCaptures = 0;
  function primitive(value: unknown): unknown {
    return typeof value === 'object' || typeof value === 'function' || value === undefined ? null : value;
  }
  function trackUnits(): void {
    const game = read(window, 'paperio2api', 'game');
    const units = read(game, 'units');
    const current = new Set<unknown>(Array.isArray(units) ? units : []);
    for (const unit of previousUnits) {
      if (!current.has(unit)) {
        const killer = read(unit, 'killer');
        removed.push({
          death: primitive(read(unit, 'death')),
          frame: frameNumber,
          isPlayer: unit === previousPlayer,
          killer: killer === null ? null : String(read(killer, 'name')),
          name: String(read(unit, 'name'))
        });
      }
    }
    const player = read(game, 'player');
    const playerSquare = player !== null && current.has(player) ? Number(read(player, 'base', 'square')) : null;
    if (player === previousPlayer && playerSquare !== null && previousPlayerSquare !== null && playerSquare > previousPlayerSquare) {
      playerCaptures++;
    }
    previousUnits = current;
    previousPlayer = player;
    previousPlayerSquare = playerSquare;
    frameNumber++;
  }
  function snapshot(): DifferentialSnapshot {
    const game = read(window, 'paperio2api', 'game');
    const units = read(game, 'units');
    const player = read(game, 'player');
    return {
      cycle: Number(read(game, 'cycle')),
      player: player === null ? null : String(read(player, 'name')),
      playerCaptures,
      removed,
      stopped: Boolean(read(game, 'stopped')),
      units: Array.isArray(units)
        ? units.map((unit: unknown) => ({
          baseSquare: Number(read(unit, 'base', 'square')),
          dead: Boolean(read(unit, 'death')),
          direction: Number(read(unit, 'direction')),
          isPlayer: unit === player,
          killer: read(unit, 'killer') === null ? null : String(read(unit, 'killer', 'name')),
          name: String(read(unit, 'name')),
          percent: Number(read(unit, 'percent')),
          trailSegments: count(unit, 'track', 'polyline', 'segments'),
          x: Number(read(unit, 'position', 'x')),
          y: Number(read(unit, 'position', 'y'))
        }))
        : []
    };
  }

  const api: DifferentialPageApi = {
    canvasHash,
    facts: () => {
      const canvas = document.querySelector('canvas');
      return JSON.stringify({ canvas: [canvas?.clientWidth, canvas?.clientHeight, canvas?.width, canvas?.height], dpr: devicePixelRatio, inner: [innerWidth, innerHeight], languages: navigator.languages, randomCalls, ua: navigator.userAgent });
    },
    frameTrace: () => lastFrameTrace,
    key: pressKey,
    snapshot,
    step
  };
  define('__differential', api);
  /* eslint-enable no-magic-numbers, no-bitwise -- end of the instrumentation. */
}
