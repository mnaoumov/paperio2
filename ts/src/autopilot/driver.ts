/**
 * @file
 *
 * The autopilot's link to the game: it attaches to `Game.autopilot`, asks its pilot for a direction before every
 * update and writes that direction as the controller's pointer, the same input a mouse or a touch gives, so the
 * autopilot obeys the player's speed, turn rate and angle steps. It hands control back to a human on a steering key, a
 * touch or a mouse press on the game, never on a mouse that only moves, and the blackbox pilot gets the canvas's pixels after every rendered frame and nothing else.
 */

import type {
  AutopilotHook,
  Game
} from '../engine.ts';
import type { BlackboxDebug } from './blackbox.ts';
import type { Point } from './plane.ts';
import type { RolloutPlanner } from './rollout-planner.ts';
import type { AutopilotWorker } from './worker-client.ts';

import {
  KEY_A,
  KEY_ARROW_DOWN,
  KEY_ARROW_LEFT,
  KEY_ARROW_RIGHT,
  KEY_ARROW_UP,
  KEY_D,
  KEY_S,
  KEY_W
} from '../controller.ts';
import { BlackboxPilot } from './blackbox.ts';
import { HALF } from './plane.ts';
import { WhiteboxPilot } from './whitebox.ts';

export type AutopilotMode = 'blackbox' | 'off' | 'whitebox';

/** The modes the menu offers, in order. */
export const AUTOPILOT_MODES: readonly AutopilotMode[] = ['off', 'whitebox', 'blackbox'];

/** How far from the screen's centre the steering pointer is put, in CSS pixels; only its direction matters. */
const POINTER_REACH = 100;
/** The blackbox pilot sees the frame scaled down by this factor. */
export const BLACKBOX_DOWNSCALE = 4;
const STEERING_KEY_CODES: readonly number[] = [KEY_ARROW_LEFT, KEY_ARROW_UP, KEY_ARROW_RIGHT, KEY_ARROW_DOWN, KEY_A, KEY_D, KEY_S, KEY_W];

/** Turns a canvas into the pixels the blackbox pilot sees. */
export type FrameGrabber = (view: HTMLCanvasElement) => ImageData | null;

export class Autopilot implements AutopilotHook {
  /** The blackbox pilot, when it runs on this thread; with a worker it runs there and this is `null`. */
  public readonly blackbox: BlackboxPilot | null;
  /** Whether the whitebox keeps planning while a human steers, for the overlay; set while the overlay is shown. */
  public coach = false;

  /** Whether the autopilot is steering; a human's steering input clears it, and {@link Autopilot.engage} sets it. */
  public engaged = true;
  /** Told when {@link Autopilot.engaged} changes. */
  public onEngagedChange: ((engaged: boolean) => void) | null = null;
  /** Told after every rendered frame, for the debug overlay. */
  public onFrame: (() => void) | null = null;
  /** The experimental planner that checks the whitebox's loops in engine rollouts, when one is attached. */
  public rolloutPlanner: null | RolloutPlanner = null;
  public readonly whitebox: null | WhiteboxPilot;
  /**
   * What the blackbox pilot saw last, for the overlay, from whichever thread it runs on.
   *
   * @returns The pilot's view, or `null` before it has seen a frame.
   */
  public get blackboxDebug(): BlackboxDebug | null {
    return this.blackbox?.debug ?? this.workerDebug;
  }

  private direction: null | Point = null;
  /** Counts the takeovers, so a worker's decision on a frame from before one is dropped. */
  private epoch = 0;
  /** Whether a frame is being scaled for the worker's blackbox pilot. */
  private frameScaling = false;
  private readonly grabFrame: FrameGrabber;
  private readonly listeners: (() => void)[] = [];
  private workerDebug: BlackboxDebug | null = null;

  /**
   * Creates an autopilot; {@link Autopilot.attach} puts it in the game.
   *
   * @param game - The game.
   * @param mode - The pilot.
   * @param grabFrame - Reads the canvas for a blackbox pilot on this thread.
   * @param worker - Runs the heavy work off this thread: the blackbox pilot itself, or the whitebox's loop plans. With
   *   `null` everything runs in the frame, frame for frame, as the benchmark needs.
   */
  public constructor(public readonly game: Game, public readonly mode: Exclude<AutopilotMode, 'off'>, grabFrame: FrameGrabber = grabDownscaledFrame, private readonly worker: AutopilotWorker | null = null) {
    this.whitebox = mode === 'whitebox' ? new WhiteboxPilot() : null;
    this.blackbox = mode === 'blackbox' && !worker ? new BlackboxPilot() : null;
    this.grabFrame = grabFrame;
    if (worker && this.whitebox) {
      this.whitebox.planner = (input, answer): void => {
        worker.plan(input, answer);
      };
    }
    if (worker) {
      worker.onDirection = (reply): void => {
        if (reply.epoch !== this.epoch || !this.engaged) {
          return;
        }
        this.workerDebug = reply.debug;
        this.direction = reply.direction;
      };
    }
  }

  public afterFrame(): void {
    if (this.mode === 'blackbox' && this.engaged) {
      if (this.blackbox) {
        const frame = this.grabFrame(this.game.view);
        if (frame) {
          this.direction = this.blackbox.decide(frame);
        }
      } else {
        this.sendFrameToWorker();
      }
    }
    this.onFrame?.();
  }

  /** Attaches to the game and listens for a human taking over. */
  public attach(): void {
    this.game.autopilot = this;
    this.listenForTakeover();
  }

  public beforeInput(): void {
    if (!this.engaged) {
      // Assist: while a human steers, the whitebox still plans, so the overlay can show the loop it would fly.
      if (this.coach) {
        this.whitebox?.steer(this.game);
      }
      return;
    }
    if (this.whitebox) {
      this.direction = this.whitebox.steer(this.game);
    }
    if (!this.direction) {
      return;
    }
    const { controller, view } = this.game;
    controller.mouse = {
      x: view.clientWidth * HALF + this.direction.x * POINTER_REACH,
      y: view.clientHeight * HALF + this.direction.y * POINTER_REACH
    };
    this.game.keyboard = null;
  }

  /** Detaches from the game and stops listening. */
  public detach(): void {
    if (this.game.autopilot === this) {
      this.game.autopilot = null;
    }
    for (const remove of this.listeners.splice(0)) {
      remove();
    }
    this.worker?.terminate();
  }

  /** Hands control back to a human. */
  public disengage(): void {
    this.setEngaged(false);
  }

  /** Takes control from a human. */
  public engage(): void {
    this.whitebox?.reset();
    this.blackbox?.reset();
    if (this.worker && this.mode === 'blackbox') {
      this.epoch++;
      this.worker.reset();
    }
    this.setEngaged(true);
  }

  private listen<K extends keyof WindowEventMap>(target: Window, type: K, listener: (event: WindowEventMap[K]) => void): void;
  private listen<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, listener: (event: HTMLElementEventMap[K]) => void): void;
  private listen(target: HTMLElement | Window, type: string, listener: (event: Event) => void): void {
    target.addEventListener(type, listener, false);
    this.listeners.push(() => {
      target.removeEventListener(type, listener, false);
    });
  }

  private listenForTakeover(): void {
    this.listen(window, 'keydown', (event: KeyboardEvent) => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- the engine steers by keyCode, and so does the joystick's synthetic event.
      if (STEERING_KEY_CODES.includes(event.keyCode)) {
        this.disengage();
      }
    });
    this.listen(this.game.view, 'touchstart', () => {
      this.disengage();
    });
    // A mouse that only moves never takes over: the pointer rests over the game after the menu's click, and a nudge
    // handed the run to a human who was not steering. A press on the game, a click or the start of a drag, does.
    this.listen(this.game.view, 'mousedown', (event: MouseEvent) => {
      if (event.isTrusted) {
        this.disengage();
      }
    });
  }

  /**
   * Hands the frame just drawn, scaled down, to the worker's blackbox pilot. The worker reads only the newest frame it
   * has when it is free, so the pilot decides as often as it can keep up with and on the latest view, and the frame
   * never waits for it. `createImageBitmap` scales and copies the canvas without waiting for the GPU the way reading
   * its pixels here would; its scaling gives the same pixels as `grabDownscaledFrame`.
   */
  private sendFrameToWorker(): void {
    const { worker } = this;
    const { view } = this.game;
    const width = Math.floor(view.width / BLACKBOX_DOWNSCALE);
    const height = Math.floor(view.height / BLACKBOX_DOWNSCALE);
    if (!worker || this.frameScaling || width < 1 || height < 1) {
      return;
    }
    this.frameScaling = true;
    const epoch = this.epoch;
    createImageBitmap(view, { resizeHeight: height, resizeQuality: 'low', resizeWidth: width }).then((frame) => {
      this.frameScaling = false;
      worker.sendFrame(frame, epoch, this.coach);
    }, () => {
      this.frameScaling = false;
    });
  }

  private setEngaged(engaged: boolean): void {
    if (this.engaged === engaged) {
      return;
    }
    this.engaged = engaged;
    this.direction = null;
    this.onEngagedChange?.(engaged);
  }
}

let grabCanvas: HTMLCanvasElement | null = null;

/**
 * The canvas as the blackbox pilot sees it: scaled down, as RGBA pixels.
 *
 * @param view - The game's canvas.
 * @returns The pixels, or `null` when the canvas has no size yet.
 */
export function grabDownscaledFrame(view: HTMLCanvasElement): ImageData | null {
  const width = Math.floor(view.width / BLACKBOX_DOWNSCALE);
  const height = Math.floor(view.height / BLACKBOX_DOWNSCALE);
  if (width < 1 || height < 1) {
    return null;
  }
  grabCanvas ??= document.createElement('canvas');
  if (grabCanvas.width !== width || grabCanvas.height !== height) {
    grabCanvas.width = width;
    grabCanvas.height = height;
  }
  const context = grabCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.drawImage(view, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}
