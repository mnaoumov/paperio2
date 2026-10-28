/**
 * @file
 *
 * What the rollout fidelity benchmark (`rollout-fidelity.ts`) touches inside the page, beyond the differential
 * harness's own `window.paperio2api` types: the game it flies by hand and the rollout reader it records with.
 */

import type {
  RolloutFrame,
  RolloutRequest,
  RolloutResult
} from '../../src/rollout/protocol.ts';

export interface FidelityApi {
  captureSnapshot(): unknown;
  readonly game: FidelityGame;
  restoreSnapshot(snapshot: unknown): void;
  rollout(request: RolloutRequest): Promise<RolloutResult>;
}

export interface FidelityGame {
  autopilot: FidelityHook | null;
  readonly clock: FidelityClock;
  readonly controller: FidelityController;
  readonly direction: FidelityDirection;
  particles: unknown[];
  readonly pendingGameOver: null | object;
  readonly player: FidelityUnit | null;
  readonly units: readonly FidelityUnit[];
}

/** The moment every rollout and live flight of one situation starts from. */
export interface FidelityStart {
  /** The game clock. */
  readonly clock: number;
  /** The page's virtual clock, which every restore warps back to. */
  readonly host: number;
  readonly pilot: unknown;
  readonly random: number;
  readonly snapshot: unknown;
}

interface FidelityClock {
  now(): number;
  readonly pendingTimers: number;
}

interface FidelityController {
  down: boolean;
  lastMouse: unknown;
  left: boolean;
  mouse: unknown;
  right: boolean;
  up: boolean;
}

interface FidelityDirection {
  normalize(): void;
  x: number;
  y: number;
}

interface FidelityHook {
  afterFrame(): void;
  beforeInput(): void;
}

interface FidelityPoint {
  readonly x: number;
  readonly y: number;
}

interface FidelityPolygon {
  readonly segments: readonly FidelitySegment[];
}

interface FidelitySegment {
  readonly start: FidelityPoint;
}

interface FidelityTerritory {
  readonly polygon: FidelityPolygon;
}

interface FidelityUnit {
  readonly base: FidelityTerritory;
  readonly in: unknown;
  readonly name: string;
  readonly position: FidelityPoint;
}

declare global {
  interface Window {
    __fidelity: FidelityApi;
    __fidelityFrame(game: FidelityGame, frame: number, randomState: number): RolloutFrame;
    __fidelityStart?: FidelityStart;
  }
}
