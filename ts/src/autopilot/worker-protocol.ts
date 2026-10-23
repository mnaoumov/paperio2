/**
 * @file
 *
 * The messages between the page and the autopilot's worker (`worker.ts`), which runs the work that would otherwise hold
 * up a frame: the blackbox pilot's reading of every frame, and the whitebox pilot's loop plans.
 */

import type { BlackboxDebug } from './blackbox.ts';
import type { Point } from './plane.ts';
import type {
  PlanInput,
  PlannedLoop
} from './whitebox.ts';

/** What the worker answers. */
export type AutopilotWorkerReply = DirectionReply | PlanReply;

/** What the page asks the worker. */
export type AutopilotWorkerRequest = FrameRequest | PlanRequest | ResetRequest;

/** The blackbox pilot's decision on one frame. */
export interface DirectionReply {
  /** The pilot's view of the frame, when it was asked for. */
  readonly debug: BlackboxDebug | null;
  /** The direction to steer, or `null` to keep the last one. */
  readonly direction: null | Point;
  /** The epoch of the frame it decided on. */
  readonly epoch: number;
  readonly kind: 'direction';
}

/** One frame for the blackbox pilot: the canvas, scaled down. */
export interface FrameRequest {
  /** Whether to send the pilot's view back, for the overlay. */
  readonly debug: boolean;
  /** Counts the page's resets, so a decision on a frame from before one is dropped. */
  readonly epoch: number;
  readonly frame: ImageBitmap;
  readonly kind: 'frame';
}

/** A loop plan for the whitebox pilot. */
export interface PlanReply {
  readonly id: number;
  readonly kind: 'plan';
  readonly plan: null | PlannedLoop;
}

export interface PlanRequest {
  readonly id: number;
  readonly input: PlanInput;
  readonly kind: 'plan';
}

/** Makes the blackbox pilot forget its loop and its bearings. */
export interface ResetRequest {
  readonly kind: 'reset';
}
