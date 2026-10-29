export const MAX_ROLLOUT_FRAMES = 1200;
export const ROLLOUT_STEP_MS = 20;
export const MIN_ROLLOUT_STEP_MS = 1;
/** Just above two 60 fps frames, the longest single update a live frame takes without being split. */
export const MAX_ROLLOUT_STEP_MS = 34;
export const MAX_ROLLOUT_CHARACTERS = 4_000_000;
export const ROLLOUT_TIMEOUT_MS = 30_000;
export const MAX_ROLLOUT_UNITS = 64;
export const MAX_ROLLOUT_SEGMENTS = 20_000;
const MAX_RANDOM_STATE = 0xffff_ffff;
const MAX_INPUT_MAGNITUDE = 1_000_000;

export interface RolloutDeath {
  readonly frame: number;
  readonly reason: number;
  readonly time: number;
}

export interface RolloutFrame {
  readonly death: null | number;
  readonly frame: number;
  readonly kills: number;
  readonly randomState: number;
  readonly returns: number;
  readonly time: number;
  readonly units: readonly RolloutUnit[];
}

export interface RolloutInput {
  readonly frame: number;
  readonly x: number;
  readonly y: number;
}

export interface RolloutReply {
  readonly error?: string;
  readonly result?: RolloutResult;
}

export interface RolloutRequest {
  readonly frames: number;
  /**
   * Starts even with live particles, which the transfer leaves out anyway. Their callbacks draw from the live
   * `Math.random`, so the live game's random stream then no longer matches this forecast: for planning, not parity.
   */
  readonly ignoreParticles?: boolean | undefined;
  readonly inputs: readonly RolloutInput[];
  /** Explicit mulberry32 state. Native Math.random has no readable state. */
  readonly randomState: number;
  /** The length of every frame, {@link ROLLOUT_STEP_MS} when left out; `1000 / 60` matches a 60 fps live game. */
  readonly stepMs?: number | undefined;
}

export interface RolloutResult {
  readonly death: null | RolloutDeath;
  readonly elapsedMs: number;
  readonly frames: readonly RolloutFrame[];
  readonly growth: number;
}

export interface RolloutUnit {
  readonly angle: number;
  readonly context: readonly (null | number)[];
  readonly id: number;
  readonly inOwnBase: boolean;
  readonly name: string;
  readonly square: number;
  readonly state: null | string;
  readonly target: null | readonly number[];
  readonly territory: string;
  readonly trail: string;
  readonly x: number;
  readonly y: number;
}

export function validateRollout(request: RolloutRequest): void {
  if (
    !Number.isInteger(request.frames) || request.frames < 1 || request.frames > MAX_ROLLOUT_FRAMES
    || !Number.isInteger(request.randomState) || request.randomState < 0 || request.randomState > MAX_RANDOM_STATE
    || request.inputs.length > request.frames
    || (request.stepMs !== undefined && !(request.stepMs >= MIN_ROLLOUT_STEP_MS && request.stepMs <= MAX_ROLLOUT_STEP_MS))
  ) {
    throw new Error('Invalid rollout bounds');
  }
  let previous = -1;
  for (const input of request.inputs) {
    if (
      !Number.isInteger(input.frame) || input.frame <= previous || input.frame >= request.frames
      || !Number.isFinite(input.x) || !Number.isFinite(input.y) || Math.hypot(input.x, input.y) === 0
      || Math.hypot(input.x, input.y) > MAX_INPUT_MAGNITUDE
    ) {
      throw new Error('Invalid rollout input');
    }
    previous = input.frame;
  }
}
