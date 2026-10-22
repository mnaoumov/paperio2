/**
 * @file
 *
 * A full snapshot of a running game, and its restore: what checkpoints and saves are made of.
 *
 * A snapshot is an identity-preserving deep clone of every `Game` field that changes while it plays, together with
 * the state that lives outside `Game` but decides what happens next: the three seeded generators (the game's, the
 * name pool's and the skin manager's), which skins are in use and by whom, the vector pool, the id counter and the
 * game clock. Restoring clones it again, so one snapshot can be restored any number of times, and writes it all
 * back, so the game continues exactly as it did from the moment the snapshot was taken.
 *
 * What is shared rather than cloned is what never changes during play or is not the game's to rewind: functions,
 * the DOM, images and canvas patterns, skins and their assets, the config, the language, the input controller and
 * the stores. A `Path2D` is copied, because a trail extends its path in place.
 *
 * The clone walks the graph with a work list rather than recursion: a territory's points link to their segments and
 * on to the next point, a chain thousands deep.
 */

import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

import type { Game } from './engine.ts';
import type { PendingTimer } from './shared/game-clock.ts';

import { Controller } from './controller.ts';
import { botStates } from './entities/bot-ai.ts';
import {
  NamePool,
  Unit
} from './entities/units.ts';
import { Vector } from './geometry/vector.ts';
import {
  Achievement,
  AchievementStore,
  SchemeCycler
} from './scoring.ts';
import { GameClock } from './shared/game-clock.ts';
import {
  peekNextId,
  setNextId
} from './shared/ids.ts';
import {
  readRandomSeed,
  writeRandomSeed
} from './shared/random.ts';
import { Asset } from './skins/asset.ts';
import { DisplayList } from './skins/layers.ts';
import { SkinManager } from './skins/manager.ts';
import { Skin } from './skins/skin.ts';

export interface GameSnapshot {
  /** The game time when the snapshot was taken. */
  readonly clockTime: number;
  readonly graph: SnapshotGraph;
  readonly nameManagerPool: readonly string[];
  readonly nameManagerSeed: number;
  readonly nextId: number;
  readonly rngSeed: number;
  readonly skinManagerSeed: number;
  /** Every skin in use, in the skin manager's order. */
  readonly skinsInUse: readonly Skin[];
  /**
   * The game clock's timers that had not fired, such as a death delay. Each callback reads the game rather than
   * closing over anything the snapshot clones, so restoring re-arms them as they were.
   */
  readonly timers: readonly PendingTimer[];
  /** The skin manager's unused skin names, in its key order, which `randomAssetName` draws from. */
  readonly unusedSkinNames: readonly string[];
  /** The skin manager's skins in use, by name, in its key order. */
  readonly usedSkins: readonly UsedSkinsEntry[];
}

/** The `Game` fields a snapshot carries: everything that changes as the game plays. */
export interface SnapshotFields {
  angle: Game['angle'];
  border: Game['border'];
  bots: Game['bots'];
  botSpawnLimited: Game['botSpawnLimited'];
  currMetric: Game['currMetric'];
  cycle: Game['cycle'];
  direction: Game['direction'];
  events: Game['events'];
  fakeMouse: Game['fakeMouse'];
  fpsSequence: Game['fpsSequence'];
  keyboard: Game['keyboard'];
  labels: Game['labels'];
  last: Game['last'];
  level: Game['level'];
  metrics: Game['metrics'];
  mouse: Game['mouse'];
  notifications: Game['notifications'];
  origin: Game['origin'];
  particles: Game['particles'];
  pendingGameOver: Game['pendingGameOver'];
  player: Game['player'];
  qas: Game['qas'];
  quality: Game['quality'];
  scale: Game['scale'];
  space: Game['space'];
  spawnSuspend: Game['spawnSuspend'];
  square: Game['square'];
  startTime: Game['startTime'];
  stats: Game['stats'];
  tailRecovered: Game['tailRecovered'];
  timeAccumulated: Game['timeAccumulated'];
  timings: Game['timings'];
  topListChanged: Game['topListChanged'];
  units: Game['units'];
}

/** The part of a snapshot that is cloned as one graph, so an object reachable from two places stays one object. */
export interface SnapshotGraph {
  readonly fields: SnapshotFields;
  /** The vectors waiting in the vector pool. */
  readonly pool: readonly Vector[];
  /** For each entry of {@link GameSnapshot.skinsInUse}, the unit that skin belongs to. */
  readonly skinUsers: readonly (undefined | Unit)[];
}

export interface UsedSkinsEntry {
  readonly name: string;
  readonly skins: readonly Skin[];
}

/**
 * Tells whether a snapshot taken now could be restored faithfully: at any time between frames while the game runs,
 * pending game timers included.
 *
 * @param game - The game.
 * @returns `true` when {@link captureSnapshot} may be called.
 */
export function canCaptureSnapshot(game: Game): boolean {
  return !game.stopped;
}

/**
 * Takes a full snapshot of the game. Call it between frames.
 *
 * @param game - The game.
 * @returns The snapshot.
 */
export function captureSnapshot(game: Game): GameSnapshot {
  const { skinManager } = game;
  const usedSkins = Object.keys(skinManager.usedBy).map((name: string): UsedSkinsEntry => ({ name, skins: [...ensureNonNullable(skinManager.usedBy[name])] }));
  const skinsInUse = usedSkins.flatMap((entry) => entry.skins);
  const graph: SnapshotGraph = {
    fields: readFields(game),
    pool: Vector.pooled(),
    skinUsers: skinsInUse.map((skin: Skin) => skin.user)
  };
  return {
    clockTime: game.clock.now(),
    graph: cloneSnapshotGraph(game, graph),
    nameManagerPool: [...game.nameManager.pool],
    nameManagerSeed: readRandomSeed(game.nameManager.rng),
    nextId: peekNextId(),
    rngSeed: readRandomSeed(game.rng),
    skinManagerSeed: readRandomSeed(skinManager.rng),
    skinsInUse,
    timers: game.clock.readTimers(),
    unusedSkinNames: Object.keys(skinManager.unusedAssets),
    usedSkins
  };
}

/**
 * Deep-clones a value, keeping identity: an object reachable twice is cloned once, and cycles are kept. Objects
 * `isShared` accepts are not cloned, nor are functions; a `Path2D` is copied.
 *
 * @param value - The value to clone.
 * @param isShared - Picks the objects the clone keeps pointing at rather than copying.
 * @param isEmptied - Picks the array properties the clone starts empty instead of copying.
 * @returns The clone.
 */
export function cloneGraph<T>(value: T, isShared: (object: object) => boolean, isEmptied: (owner: object, key: PropertyKey) => boolean = () => false): T {
  const copies = new Map<object, object>();
  const pending: [source: object, target: object][] = [];
  function copyOf(source: unknown): unknown {
    if (typeof source !== 'object' || source === null || isShared(source)) {
      return source;
    }
    const existing = copies.get(source);
    if (existing) {
      return existing;
    }
    let target: object;
    if (source instanceof Path2D) {
      target = new Path2D(source);
      copies.set(source, target);
      return target;
    }
    if (Array.isArray(source)) {
      target = [];
    } else if (source instanceof Map) {
      target = new Map();
    } else if (source instanceof Set) {
      target = new Set();
    } else {
      const prototype = Reflect.getPrototypeOf(source);
      if (prototype === null) {
        throw new Error('A snapshot cannot hold a null-prototype object');
      }
      target = Object.create<object>(prototype);
    }
    copies.set(source, target);
    pending.push([source, target]);
    return target;
  }
  const clone = copyOf(value);
  for (let entry = pending.pop(); entry; entry = pending.pop()) {
    const [source, target] = entry;
    if (source instanceof Map && target instanceof Map) {
      for (const [key, item] of source) {
        target.set(copyOf(key), copyOf(item));
      }
    } else if (source instanceof Set && target instanceof Set) {
      for (const item of source) {
        target.add(copyOf(item));
      }
    } else if (Array.isArray(source) && Array.isArray(target)) {
      for (let index = 0; index < source.length; index++) {
        target[index] = copyOf(source[index]);
      }
    } else {
      // Every own property in the game's graph is a plain enumerable field, so a write is a faithful copy, and it is
      // Several times faster than copying property descriptors over the hundred thousand objects of a snapshot.
      for (const key of Object.keys(source)) {
        Reflect.set(target, key, isEmptied(source, key) ? [] : copyOf(Reflect.get(source, key)));
      }
    }
  }

  return clone as T;
}

/**
 * Puts the game back to a snapshot. Call it between frames. The game timers pending now are cancelled, so a death
 * delay that was running is forgotten, and the snapshot's own are set again with the time they had left.
 *
 * @param game - The game.
 * @param snapshot - A snapshot taken of this game, or loaded into it.
 */
export function restoreSnapshot(game: Game, snapshot: GameSnapshot): void {
  const graph = cloneSnapshotGraph(game, snapshot.graph);
  game.clock.clearTimers();
  game.clock.setNow(snapshot.clockTime);
  for (const timer of snapshot.timers) {
    game.clock.setTimeout(timer.callback, timer.delay);
  }
  Object.assign(game, graph.fields);
  Vector.space = game.space;
  Vector.restorePool(graph.pool);
  setNextId(snapshot.nextId);
  writeRandomSeed(game.rng, snapshot.rngSeed);
  game.nameManager.pool = [...snapshot.nameManagerPool];
  writeRandomSeed(game.nameManager.rng, snapshot.nameManagerSeed);
  const { skinManager } = game;
  writeRandomSeed(skinManager.rng, snapshot.skinManagerSeed);
  skinManager.usedBy = {};
  for (const { name, skins } of snapshot.usedSkins) {
    skinManager.usedBy[name] = [...skins];
  }
  skinManager.unusedAssets = {};
  for (const name of snapshot.unusedSkinNames) {
    skinManager.unusedAssets[name] = ensureNonNullable(skinManager.assets[name]);
  }
  snapshot.skinsInUse.forEach((skin: Skin, index: number) => {
    skin.user = graph.skinUsers[index];
  });
}

function cloneSnapshotGraph(game: Game, graph: SnapshotGraph): SnapshotGraph {
  const sharedInstances = new Set<object>([botStates, game, game.config, game.language]);
  return cloneGraph(graph, (object: object) => {
    if (sharedInstances.has(object) || object instanceof Node || object instanceof CanvasPattern || object instanceof CanvasGradient) {
      return true;
    }
    return object instanceof Skin || object instanceof Asset || object instanceof DisplayList || object instanceof SkinManager || object instanceof Achievement || object instanceof AchievementStore || object instanceof SchemeCycler || object instanceof NamePool || object instanceof Controller || object instanceof GameClock;
  }, isUnitLog);
}

// `Unit.log` gains the unit's position every frame and is read nowhere, so a snapshot keeps it empty rather than
// Copying a list that grows for as long as the unit lives.
function isUnitLog(owner: object, key: PropertyKey): boolean {
  return owner instanceof Unit && key === 'log';
}

function readFields(game: Game): SnapshotFields {
  return {
    angle: game.angle,
    border: game.border,
    bots: game.bots,
    botSpawnLimited: game.botSpawnLimited,
    currMetric: game.currMetric,
    cycle: game.cycle,
    direction: game.direction,
    events: game.events,
    fakeMouse: game.fakeMouse,
    fpsSequence: game.fpsSequence,
    keyboard: game.keyboard,
    labels: game.labels,
    last: game.last,
    level: game.level,
    metrics: game.metrics,
    mouse: game.mouse,
    notifications: game.notifications,
    origin: game.origin,
    particles: game.particles,
    pendingGameOver: game.pendingGameOver,
    player: game.player,
    qas: game.qas,
    quality: game.quality,
    scale: game.scale,
    space: game.space,
    spawnSuspend: game.spawnSuspend,
    square: game.square,
    startTime: game.startTime,
    stats: game.stats,
    tailRecovered: game.tailRecovered,
    timeAccumulated: game.timeAccumulated,
    timings: game.timings,
    topListChanged: game.topListChanged,
    units: game.units
  };
}
