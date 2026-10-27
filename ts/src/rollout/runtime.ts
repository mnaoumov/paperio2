import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

import type { SkinSource } from '../skins/skin.ts';
import type { RolloutResult } from './protocol.ts';
import type { RolloutTransfer } from './transfer.ts';

import { BOT_NAMES } from '../bot-names.ts';
import { Controller } from '../controller.ts';
import { Game } from '../engine.ts';
import { NamePool } from '../entities/units.ts';
import { Border } from '../geometry/border.ts';
import { SpatialGrid } from '../geometry/spatial-grid.ts';
import { Vector } from '../geometry/vector.ts';
import { decodeSave } from '../save-format.ts';
import {
  AchievementStore,
  BotScoreLabel,
  SchemeCycler
} from '../scoring.ts';
import { createSeededRandom } from '../seed.ts';
import { GameClock } from '../shared/game-clock.ts';
import { noop } from '../shared/noop.ts';
import {
  ImageAssetSet,
  SvgAssetSet
} from '../skins/asset.ts';
import { GameSkinManager } from '../skins/manager.ts';
import { restoreSnapshot } from '../snapshot.ts';
import {
  MAX_ROLLOUT_CHARACTERS,
  ROLLOUT_STEP_MS,
  ROLLOUT_TIMEOUT_MS,
  validateRollout
} from './protocol.ts';
import {
  readRolloutFrame,
  validateRolloutWorld
} from './state.ts';

const HALF = 2;
const BORDER_RADIUS_FACTOR = 0.95;

class RolloutAchievementStore extends AchievementStore {
  public override save(): void {
    noop();
  }
}

function assertSkins(value: unknown[]): asserts value is SkinSource[] {
  if (value.some((entry) => typeof entry !== 'object' || entry === null)) {
    throw new Error('Invalid skin assets');
  }
}

async function run(transfer: RolloutTransfer): Promise<RolloutResult> {
  validateRollout(transfer.request);
  if (transfer.payload.length > MAX_ROLLOUT_CHARACTERS) {
    throw new Error('Rollout transfer is too large');
  }
  const started = performance.now();
  const { config, request } = transfer;
  const canvas = document.createElement('canvas');
  const loaded: unknown = JSON.parse(ROLLOUT_SKINS_SOURCE);
  if (!Array.isArray(loaded)) {
    throw new Error('Invalid skin assets');
  }
  // The same trusted, shipped metadata used by main.ts. No live assets cross the realm boundary.
  assertSkins(loaded);
  const skins = loaded;
  const manager = new GameSkinManager(new ImageAssetSet(config), new SvgAssetSet(config, canvas, 'assets/skins/', skins), 1);
  const space = new SpatialGrid(config.arenaSize, config.arenaSize, config.quadSize);
  Vector.space = space;
  const center = new Vector(config.arenaSize / HALF, config.arenaSize / HALF);
  let time = 0;
  const clock = new GameClock({ clearTimeout: noop, now: (): number => time, setTimeout: (): number => 0 });
  const game = new Game(config, canvas, space, Border.circular(center, config.borderPoints, center.x * BORDER_RADIUS_FACTOR), manager, null, new NamePool([...BOT_NAMES], 1), new Controller(canvas), transfer.language, new SchemeCycler(BotScoreLabel), new RolloutAchievementStore([]), 1, clock);
  manager.game = game;
  clearInterval(game.updateParticlesId);
  const snapshot = await decodeSave(game, transfer.payload);
  time = snapshot.clockTime;
  restoreSnapshot(game, snapshot);
  if (game.player) {
    Object.defineProperty(game.player, 'moveTo', { value: transfer.moveTo });
  }
  game.visible = transfer.visible;
  const random = createSeededRandom(request.randomState);
  Math.random = random.next;
  const initialSquare = game.player?.base.square ?? 0;
  const frames = [];
  let death: RolloutResult['death'] = null;
  let inputIndex = 0;
  for (let frame = 0; frame < request.frames; frame++) {
    validateRolloutWorld(game);
    if (performance.now() - started > ROLLOUT_TIMEOUT_MS) {
      throw new Error('Rollout exceeded its time budget');
    }
    const input = request.inputs[inputIndex];
    if (input?.frame === frame) {
      game.direction.x = input.x;
      game.direction.y = input.y;
      game.direction.normalize();
      inputIndex++;
    }
    time += ROLLOUT_STEP_MS;
    game.update(ROLLOUT_STEP_MS);
    validateRolloutWorld(game);
    frames.push(readRolloutFrame(game, frame, random.readState()));
    if (game.pendingGameOver) {
      death = { frame, reason: ensureNonNullable(game.pendingGameOver.reason), time: game.clock.now() };
      break;
    }
  }
  return { death, elapsedMs: performance.now() - started, frames, growth: (game.player?.base.square ?? 0) - initialSquare };
}

window.addEventListener('message', (event: MessageEvent<RolloutTransfer>) => {
  const port = ensureNonNullable(event.ports[0]);
  run(event.data).then((result) => {
    port.postMessage({ result });
  }).catch((error: unknown) => {
    port.postMessage({ error: String(error) });
  });
}, { once: true });
