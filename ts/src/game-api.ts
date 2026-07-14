import type {
  Config,
  GameResults
} from './engine.ts';
import type { NamePool } from './entities.ts';
import type { Language } from './i18n.ts';
import type {
  AchievementStore,
  SchemeCycler
} from './scoring.ts';
import type { GameSkinManager } from './skins.ts';

import {
  Controller,
  KeyboardModeSwitch
} from './controller.ts';
import {
  FRAME_DURATION_MILLISECONDS,
  Game,
  HALF_DIVISOR
} from './engine.ts';
import { renderGame } from './game-render.ts';
import {
  Border,
  SpatialGrid,
  Vector
} from './geometry.ts';
import { russianLanguage } from './i18n.ts';
import { now } from './shared/math-utils.ts';
import { ensureNonNullable } from './type-guards.ts';

export interface GameApi {
  create: (view: HTMLCanvasElement) => void;
  game: Game;
  prepare: (onPrepared?: () => void) => void;
  preparing: boolean;
  start: (playerName?: string, skinName?: string, bestScore?: number, onGameOver?: (results: GameResults) => void, extraLives?: number) => void;
  startGame?: () => void;
}
export const BORDER_RADIUS_FACTOR = 0.95;
export const EXTRA_LIFE_LABEL_DURATION_MS = 5000;
export function createGameApi(config: Config, language: Language, createSkinManager: (config: Config, view: HTMLCanvasElement) => GameSkinManager, namePool: NamePool, schemeCycler: SchemeCycler, achievementStore: AchievementStore): GameApi | null {
  const gameApi = {} as GameApi;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Path2D feature-detection for old browsers; lib.dom types it as always-defined but it may be absent at runtime.
  if (Path2D) {
    gameApi.create = (view: HTMLCanvasElement): void => {
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
      /* eslint-disable no-magic-numbers -- keyboard keyCodes for the debug toggle combos (Shift/Alt/Q/B/M and G). */
      game.controller.addSet([16, 18, 81, 66, 77], () => {
        game.debug = !game.debug;
      });
      game.controller.addButton(71, () => {
        game.debugGraph = !game.debugGraph;
      });
      /* eslint-enable no-magic-numbers -- end of the debug-combo keyCode literals. */
    };
    gameApi.preparing = true;
    let i2 = 0;
    let prepareIntervalId: number | undefined;
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
      prepareIntervalId = setInterval(() => {
        if (namePool.aviable()) {
          runPrepareBatch();
          if (i2 > config.prepareCounter) {
            clearInterval(prepareIntervalId);
            gameApi.preparing = false;
            gameApi2.visible = true;
            if (!gameApi2.looped) {
              gameApi2.loop();
            }
            if (onPrepared) {
              onPrepared();
            }
          }
        }
      }, 0);
    };
    gameApi.start = (playerName?: string, skinName?: string, bestScore?: number, onGameOver?: (results: GameResults) => void, extraLives?: number): void => {
      const game = gameApi.game;
      if (gameApi.preparing) {
        clearInterval(prepareIntervalId);
        const startTime = now();
        while (i2 < config.prepareCounter) {
          runPrepareBatch();
          if (now() - startTime > config.maxPreparingTime) {
            break;
          }
        }
      }
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
