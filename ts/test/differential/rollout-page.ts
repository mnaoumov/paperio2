import type {
  RolloutFrame,
  RolloutRequest,
  RolloutResult
} from '../../src/rollout/protocol.ts';

export interface RolloutTestApi {
  captureSnapshot(): Snapshot;
  encodeSnapshot(snapshot: Snapshot): Promise<string>;
  readonly game: RolloutTestGame;
  rollout(request: RolloutRequest, signal?: AbortSignal): Promise<RolloutResult>;
}

export interface RolloutTestGame {
  readonly clock: TestClock;
  readonly config: TestConfig;
  readonly controller: TestController;
  readonly direction: Point;
  particles: unknown[];
  pause(): void;
  readonly pendingGameOver: null | object;
  readonly player: null | TestUnit;
  readonly units: TestUnit[];
  update(milliseconds: number): void;
  visible: boolean;
}

interface Point {
  readonly constructor: TestVectorClass;
  normalize(): void;
  x: number;
  y: number;
}

interface Snapshot {
  readonly graph: SnapshotGraph;
  readonly nameManagerSeed: number;
  readonly nextId: number;
  readonly rngSeed: number;
  readonly skinManagerSeed: number;
}

interface SnapshotGraph {
  readonly pool: readonly Point[];
}

interface TestClock {
  now(): number;
  setNow(time: number): void;
}

interface TestConfig {
  botsCount: number;
  unitSpeed: number;
}

interface TestController {
  down: boolean;
  lastMouse: null;
  left: boolean;
  mouse: null;
  right: boolean;
  up: boolean;
}

interface TestFsm {
  change(state: string): void;
  state: string;
}

interface TestPolygon {
  readonly segments: TestSegment[];
}

interface TestSegment {
  readonly end: Point;
  readonly start: Point;
}

interface TestSkin {
  name: string;
}

interface TestTerritory {
  readonly polygon: TestPolygon;
}

interface TestTrack {
  readonly polyline: TestPolygon;
}

interface TestUnit {
  readonly base: TestTerritory;
  direction: number;
  fsm: null | TestFsm;
  in: null | TestTerritory;
  readonly isPlayer: boolean;
  readonly name: string;
  readonly position: Point;
  readonly skin: TestSkin;
  target: null | Point;
  readonly track: TestTrack;
}

interface TestVectorClass {
  alloc(x?: number, y?: number): Point;
  pooled(): readonly Point[];
}

declare global {
  interface Window {
    __poolAllocations: number;
    __readRolloutFrame(game: RolloutTestGame, frame: number, randomState: number): RolloutFrame;
    __rollout: RolloutTestApi;
    __rolloutIdentity(): boolean;
  }
}
