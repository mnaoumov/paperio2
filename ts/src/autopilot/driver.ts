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
import type { Point } from './plane.ts';

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
  public readonly blackbox: BlackboxPilot | null;
  /** Whether the whitebox keeps planning while a human steers, for the overlay; set while the overlay is shown. */
  public coach = false;
  /** Whether the autopilot is steering; a human's steering input clears it, and {@link Autopilot.engage} sets it. */
  public engaged = true;
  /** Told when {@link Autopilot.engaged} changes. */
  public onEngagedChange: ((engaged: boolean) => void) | null = null;
  /** Told after every rendered frame, for the debug overlay. */
  public onFrame: (() => void) | null = null;
  public readonly whitebox: null | WhiteboxPilot;
  private direction: null | Point = null;
  private readonly grabFrame: FrameGrabber;
  private readonly listeners: (() => void)[] = [];

  public constructor(public readonly game: Game, public readonly mode: Exclude<AutopilotMode, 'off'>, grabFrame: FrameGrabber = grabDownscaledFrame) {
    this.whitebox = mode === 'whitebox' ? new WhiteboxPilot() : null;
    this.blackbox = mode === 'blackbox' ? new BlackboxPilot() : null;
    this.grabFrame = grabFrame;
  }

  public afterFrame(): void {
    if (this.blackbox && this.engaged) {
      const frame = this.grabFrame(this.game.view);
      if (frame) {
        this.direction = this.blackbox.decide(frame);
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
  }

  /** Hands control back to a human. */
  public disengage(): void {
    this.setEngaged(false);
  }

  /** Takes control from a human. */
  public engage(): void {
    this.whitebox?.reset();
    this.blackbox?.reset();
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
