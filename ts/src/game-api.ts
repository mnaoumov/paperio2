import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

import type { AutopilotMode } from './autopilot/driver.ts';
import type {
  Config,
  GameResults
} from './engine.ts';
import type { EnemySettings } from './entities/enemy-modes.ts';
import type { NamePool } from './entities/units.ts';
import type { Language } from './i18n.ts';
import type {
  RolloutRequest,
  RolloutResult
} from './rollout/protocol.ts';
import type {
  AchievementStore,
  SchemeCycler
} from './scoring.ts';
import type { SeededRandom } from './seed.ts';
import type { GameSkinManager } from './skins/manager.ts';
import type { GameSnapshot } from './snapshot.ts';

import { Autopilot } from './autopilot/driver.ts';
import { startAutopilotWorker } from './autopilot/worker-client.ts';
import {
  Controller,
  KeyboardModeSwitch
} from './controller.ts';
import {
  FRAME_DURATION_MILLISECONDS,
  Game,
  HALF_DIVISOR
} from './engine.ts';
import {
  applyEnemySettings,
  DEFAULT_ENEMY_SETTINGS
} from './entities/enemy-modes.ts';
import { renderGame } from './game-render.ts';
import { Border } from './geometry/border.ts';
import { SpatialGrid } from './geometry/spatial-grid.ts';
import { Vector } from './geometry/vector.ts';
import { russianLanguage } from './i18n.ts';
import { RolloutPlanner } from './autopilot/rollout-planner.ts';
import { rollout } from './rollout/client.ts';
import {
  decodeSave,
  encodeSave
} from './save-format.ts';
import { now } from './shared/math-utils.ts';
import {
  captureSnapshot,
  restoreSnapshot
} from './snapshot.ts';
import { StatsLog } from './stats/log.ts';

export interface GameApi {
  /**
   * Attaches a demo autopilot to the live game, already steering. With `offMainThread` its heavy work runs in a worker
   * where the page can run one, so it never holds up a frame; without it every decision is made in its own frame, as
   * the benchmark needs to replay a seed. With `rolloutChecked` (experimental) the whitebox checks each loop in an engine
   * rollout first (`autopilot/rollout-planner.ts`); a benchmark waits for `rolloutPlanner.pending` between frames.
   */
  attachAutopilot: (mode: Exclude<AutopilotMode, 'off'>, offMainThread?: boolean, rolloutChecked?: boolean) => Autopilot;
  /** Takes a full snapshot of the live game, between frames. */
  captureSnapshot: () => GameSnapshot;
  /** The config every game is created with, there before the game is, so a page can change it ahead of the first frame. */
  config: Config;
  create: (view: HTMLCanvasElement) => void;
  /**
   * Starts a stats log of the live game (see `stats/log.ts`), attached until its `finish`.
   *
   * @param pilot - Who starts the game: `human`, or the demo pilot's mode.
   */
  createStatsLog: (pilot: string) => StatsLog;
  /** Reads a snapshot back from {@link GameApi.encodeSnapshot}'s text, ready for {@link GameApi.restoreSnapshot}. */
  decodeSnapshot: (payload: string) => Promise<GameSnapshot>;
  /** Encodes a snapshot as the compressed text a saved game stores. */
  encodeSnapshot: (snapshot: GameSnapshot, name?: string) => Promise<string>;
  game: Game;
  prepare: (onPrepared?: () => void) => void;
  preparing: boolean;
  /** Puts the live game back to a snapshot of it, between frames. */
  restoreSnapshot: (snapshot: GameSnapshot) => void;
  /** Experimental fixed-step engine continuation in an opaque sandbox; see rollout/README.md for supported starts. */
  rollout: (request: RolloutRequest, signal?: AbortSignal) => Promise<RolloutResult>;
  /** The page's speedrun seed (`?seed=`), or `null`; with one, every Play starts from the game as preparation left it. */
  seed: null | string;
  /** Switches the enemy mode, difficulty and bot count, at once if the game exists, else when it is created. */
  setEnemySettings: (settings: EnemySettings) => void;
  /** `completePreparation` finishes the prepare phase before the player spawns, however long it takes. */
  start: (playerName?: string, skinName?: string, bestScore?: number, onGameOver?: (results: GameResults) => void, extraLives?: number, completePreparation?: boolean) => void;
  startGame?: () => void;
}
export const BORDER_RADIUS_FACTOR = 0.95;
export const EXTRA_LIFE_LABEL_DURATION_MS = 5000;
export interface SpeedrunSeed {
  readonly random: SeededRandom;
  readonly text: string;
}

interface SeededStart {
  readonly random: number;
  readonly snapshot: GameSnapshot;
}

export function createGameApi(config: Config, language: Language, createSkinManager: (config: Config, view: HTMLCanvasElement) => GameSkinManager, namePool: NamePool, schemeCycler: SchemeCycler, achievementStore: AchievementStore, speedrunSeed: null | SpeedrunSeed = null): GameApi | null {
  const gameApi = {} as GameApi;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Path2D feature-detection for old browsers; lib.dom types it as always-defined but it may be absent at runtime.
  if (Path2D) {
    let enemySettings = DEFAULT_ENEMY_SETTINGS;
    // With a seed, the game as preparation left it: the menu's bots then play on real time, so every Play goes back here.
    let seededStart: null | SeededStart = null;
    gameApi.config = config;
    gameApi.rollout = (request, signal): Promise<RolloutResult> => rollout(gameApi.game, request, signal);
    gameApi.seed = speedrunSeed?.text ?? null;
    gameApi.create = (view: HTMLCanvasElement): void => {
      seededStart = null;
      const {
        arenaSize,
        borderPoints,
        quadSize
      } = config;
      const spatialGrid2 = new SpatialGrid(arenaSize, arenaSize, quadSize);
      Vector.space = spatialGrid2;
      const vector = new Vector(arenaSize / HALF_DIVISOR, arenaSize / HALF_DIVISOR);
      const radius = Math.min(vector.x, vector.y) * BORDER_RADIUS_FACTOR;
      const border = Border.circular(vector, borderPoints, radius);
      const skinManager = createSkinManager(config, view);
      const game = new Game(config, view, spatialGrid2, border, skinManager, null, namePool, new Controller(view, new KeyboardModeSwitch()), language.lng, schemeCycler, achievementStore, Math.random());
      skinManager.game = game;
      game.renderer = renderGame;
      gameApi.game = game;
      applyEnemySettings(game, enemySettings);
      /* eslint-disable no-magic-numbers -- keyboard keyCodes for the debug toggle combos (Shift/Alt/Q/B/M and G). */
      game.controller.addSet([16, 18, 81, 66, 77], () => {
        game.debug = !game.debug;
      });
      game.controller.addButton(71, () => {
        game.debugGraph = !game.debugGraph;
      });
      /* eslint-enable no-magic-numbers -- end of the debug-combo keyCode literals. */
    };
    gameApi.setEnemySettings = (settings: EnemySettings): void => {
      enemySettings = settings;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the game exists only once the canvas has mounted; until then the settings wait for `create`.
      if (gameApi.game) {
        applyEnemySettings(gameApi.game, settings);
      }
    };
    gameApi.attachAutopilot = (mode: Exclude<AutopilotMode, 'off'>, offMainThread = false, rolloutChecked = false): Autopilot => {
      const autopilot = new Autopilot(gameApi.game, mode, undefined, offMainThread ? startAutopilotWorker() : null);
      if (rolloutChecked && autopilot.whitebox) {
        const planner = new RolloutPlanner(() => gameApi.game.player?.name ?? null, (request) => rollout(gameApi.game, request));
        autopilot.whitebox.planner = planner.plan;
        autopilot.rolloutPlanner = planner;
      }
      autopilot.attach();
      return autopilot;
    };
    gameApi.createStatsLog = (pilot: string): StatsLog => {
      const { game } = gameApi;
      return new StatsLog(game, {
        build: game.build,
        commit: typeof BUILD_COMMIT === 'string' ? BUILD_COMMIT : null,
        enemies: enemySettings,
        pilot,
        seed: gameApi.seed,
        startedAt: new Date().toISOString(),
        viewport: { devicePixelRatio: window.devicePixelRatio, height: window.innerHeight, width: window.innerWidth }
      }, () => game.autopilot instanceof Autopilot && game.autopilot.engaged ? 'pilot' : 'human');
    };
    gameApi.captureSnapshot = (): GameSnapshot => captureSnapshot(gameApi.game);
    gameApi.restoreSnapshot = (snapshot: GameSnapshot): void => {
      restoreSnapshot(gameApi.game, snapshot);
    };
    gameApi.encodeSnapshot = async (snapshot: GameSnapshot, name = ''): Promise<string> => encodeSave(gameApi.game, snapshot, { id: '', name, percent: gameApi.game.player?.percent ?? 0, playtime: snapshot.clockTime - gameApi.game.startTime, savedAt: Date.now() });
    gameApi.decodeSnapshot = async (payload: string): Promise<GameSnapshot> => decodeSave(gameApi.game, payload);
    gameApi.preparing = true;
    let i2 = 0;
    let prepareIntervalId: number | undefined;
    function keepSeededStart(): void {
      if (speedrunSeed && !seededStart) {
        seededStart = { random: speedrunSeed.random.readState(), snapshot: captureSnapshot(gameApi.game) };
      }
    }
    function returnToSeededStart(): void {
      if (speedrunSeed && seededStart) {
        restoreSnapshot(gameApi.game, seededStart.snapshot);
        speedrunSeed.random.writeState(seededStart.random);
      }
    }
    function runPrepareBatch(): void {
      const {
        prepareMult
      } = config;
      let {
        prepareBatchCount
      } = config;
      while (prepareBatchCount--) {
        gameApi.game.update(FRAME_DURATION_MILLISECONDS * prepareMult + Math.random());
        i2++;
      }
    }
    gameApi.prepare = (onPrepared?: () => void): void => {
      const {
        game: gameApi2
      } = gameApi;
      function finishPreparation(): void {
        keepSeededStart();
        gameApi.preparing = false;
        gameApi2.visible = true;
        if (!gameApi2.looped) {
          gameApi2.loop();
        }
        if (onPrepared) {
          onPrepared();
        }
      }
      if (speedrunSeed) {
        // Spread over intervals, preparation interleaves with timers and frames whose timing differs from page to page,
        // So a seed's map would too. In one go nothing runs in between: the menu shows a moment later, on the seed's map.
        while (i2 <= config.prepareCounter) {
          runPrepareBatch();
        }
        finishPreparation();
        return;
      }
      prepareIntervalId = setInterval(() => {
        if (namePool.aviable()) {
          runPrepareBatch();
          if (i2 > config.prepareCounter) {
            clearInterval(prepareIntervalId);
            finishPreparation();
          }
        }
      }, 0);
    };
    gameApi.start = (playerName?: string, skinName?: string, bestScore?: number, onGameOver?: (results: GameResults) => void, extraLives?: number, completePreparation = false): void => {
      const game = gameApi.game;
      if (gameApi.preparing) {
        clearInterval(prepareIntervalId);
        const startTime = now();
        while (i2 < config.prepareCounter) {
          runPrepareBatch();
          // Past the budget the loop fast-forwards the rest with the player already in play. A practice run cannot
          // Afford that: the player would leave its base before its first checkpoint, so it prepares in full.
          if (!completePreparation && now() - startTime > config.maxPreparingTime) {
            break;
          }
        }
      }
      returnToSeededStart();
      game.best = bestScore ?? null;
      game.spawnPlayer(playerName, skinName, extraLives);
      if (extraLives) {
        ensureNonNullable(game.player).addLabel({
          color: '#7fed4c',
          text: russianLanguage.lng.extraLife,
          time: EXTRA_LIFE_LABEL_DURATION_MS
        });
      }
      if (onGameOver) {
        game.gameOverCallback = onGameOver;
      }
      gameApi.preparing = false;
      game.visible = true;
      if (!game.looped) {
        game.loop();
      }
      window.focus();
    };
    return gameApi;
  }
  return null;
}
