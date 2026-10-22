/**
 * @file
 *
 * The enemy modes: alternative state tables for the bots, built from the original `botStates` and never editing them,
 * plus a difficulty and a bot count that go through the config the engine already honours. Original puts every bot
 * back on `botStates` and `Game.enemies` back to `null`, so the engine runs exactly as the shipped one does.
 *
 * Crossing a trail kills the trail's OWNER, never the unit that crosses it (`Trail.handleIntersect`), and a capture
 * kills a unit it encloses while that unit is in its base, or encloses its trail start or capital. Every mode below is
 * built on those two rules.
 */
/* eslint-disable perfectionist/sort-modules -- module-level initialization order: the mode tables are built at load and register themselves in the maps above them, so the declarations stay in dependency order rather than alphabetical. */

import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

import type {
  EnemyHooks,
  Game
} from '../engine.ts';
import type {
  BotStateContext,
  BotStateHandlers,
  BotStates,
  StateMachine
} from './bot-ai.ts';
import type {
  Player,
  Unit
} from './units.ts';

import { Vector } from '../geometry/vector.ts';
import {
  AGGRO_RANGE_FACTOR,
  botStates,
  enterCut,
  enterExit,
  isBotInDanger,
  updateCapture,
  updateCut,
  updateExit
} from './bot-ai.ts';
import { Bot } from './units.ts';

export type EnemyMode = 'avoid' | 'chase' | 'civil-war' | 'free-for-all' | 'grabbers' | 'mixed' | 'original' | 'pack' | 'passive' | 'suicidal';

export interface EnemySettings {
  /** How many bots, or `null` for the original 15. */
  readonly count: null | number;
  /** A fixed bot level from 0 (timid) to 1 (hardest), or `null` to ramp with the player's share as the original does. */
  readonly level: null | number;
  readonly mode: EnemyMode;
  /** How much of the player the bots see, in the modes that look for it. */
  readonly vision: EnemyVision;
}

/**
 * Whitebox bots know where the player is everywhere; blackbox bots see it only within their own view range of their
 * own position.
 */
export type EnemyVision = 'blackbox' | 'whitebox';

export const ENEMY_MODES: readonly EnemyMode[] = ['original', 'avoid', 'chase', 'suicidal', 'passive', 'grabbers', 'pack', 'free-for-all', 'civil-war', 'mixed'];
export const ENEMY_VISIONS: readonly EnemyVision[] = ['whitebox', 'blackbox'];
/** The modes the vision setting applies to. */
export const VISION_MODES: readonly EnemyMode[] = ['avoid', 'chase', 'pack'];
/** The menu's difficulty steps; `null` ramps with the player's share. */
// eslint-disable-next-line no-magic-numbers -- the menu's difficulty steps are the data itself.
export const ENEMY_LEVELS: readonly (null | number)[] = [null, 0, 0.25, 0.5, 0.75, 1];
/** The menu's bot counts; `null` is the original 15. */
// eslint-disable-next-line no-magic-numbers -- the menu's bot counts are the data itself.
export const ENEMY_COUNTS: readonly (null | number)[] = [null, 0, 5, 10, 20, 30];
export const DEFAULT_ENEMY_SETTINGS: EnemySettings = { count: null, level: null, mode: 'original', vision: 'whitebox' };

/** Each config's `botLevel` and `botsCount` before the settings first touched them, which `null` settings restore. */
const configBaselines = new WeakMap<Game['config'], ConfigBaseline>();
/** A polygon needs three points to enclose anything. */
const MIN_POLYGON_POINTS = 3;
/** A trail needs two points to hook back over. */
const MIN_HOOK_POINTS = 2;
/** An avoiding bot turns home once the player is this share of its view range from its head or its trail. */
const AVOID_RANGE_FACTOR = 0.75;
/** An avoiding bot stays in its base while the player is within this share of its view range. */
const AVOID_HOLD_FACTOR = 1;
/** A hunter whose prey is home gives up once its own trail is this many view ranges long. */
const CHASE_GIVE_UP_FACTOR = 1.5;
/** A suicidal bot heads straight out for this share of its view range before it hooks back over its trail. */
const SUICIDE_RUN_FACTOR = 0.6;
/** How far ahead of a head a suicidal bot puts itself, in world units. */
const SUICIDE_LEAD = 60;
/** A suicidal bot throws itself in front of heads within this share of its view range. */
const SUICIDE_VICTIM_FACTOR = 0.8;
/** The point of its own trail a suicidal bot turns back to, as a share of the trail. */
const SUICIDE_HOOK_SHARE = 0.5;
/** Land grabbers are this much greedier than the original's greediest bot, and as reckless as its most reckless one. */
const GRABBER_GREED_FACTOR = 1.6;
/** How many bots a pack sends: one at the trail, the rest across the player's way home. */
const PACK_SIZE = 3;
/** A civil-war bot keeps this far from the player's head and trail, in world units. */
const CIVIL_WAR_CLEARANCE = 70;
/** A civil-war bot turns home once the player is within this share of its view range. */
const CIVIL_WAR_HOME_FACTOR = 1;
const STEP_DISTANCE = 25;

interface ConfigBaseline {
  readonly botLevel: number;
  readonly botsCount: number;
}

interface EnemyModeDefinition {
  readonly adjustPersonality?: (bot: Bot) => void;
  readonly canForceAttack: boolean;
  readonly id: string;
  readonly states: BotStates;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

const definitions = new Map<BotStates, EnemyModeDefinition>();
const definitionsById = new Map<string, EnemyModeDefinition>();

function never(): boolean {
  return false;
}

function define(id: string, states: BotStates, options: Partial<Pick<EnemyModeDefinition, 'adjustPersonality' | 'canForceAttack'>> = {}): EnemyModeDefinition {
  const definition: EnemyModeDefinition = { canForceAttack: options.canForceAttack ?? false, id, states, ...options.adjustPersonality ? { adjustPersonality: options.adjustPersonality } : {} };
  definitions.set(states, definition);
  definitionsById.set(id, definition);
  return definition;
}

/**
 * The original's `cut`, `exit` and `capture` with another test for leaving them to hunt, and its `idle`, `back` and
 * `capital` as they are.
 *
 * @param shouldAttack - Whether a bot outside its base, or leaving it, switches to `attack`.
 * @returns The handlers.
 */
function originalWith(shouldAttack: (unit: Bot) => boolean): BotStates {
  return {
    back: ensureNonNullable(botStates['back']),
    capital: ensureNonNullable(botStates['capital']),
    capture: {
      update: (unit) => updateCapture(unit, shouldAttack)
    },
    cut: {
      enter: (unit) => enterCut(unit),
      update: (unit, context) => updateCut(unit, context)
    },
    exit: {
      enter: (unit) => enterExit(unit),
      update: (unit, context) => updateExit(unit, context, shouldAttack)
    },
    idle: ensureNonNullable(botStates['idle'])
  };
}

const giveUpAttack: BotStateHandlers = {
  enter: () => ({}),
  update: () => 'idle'
};

/**
 * The player, when the bot can see it under the vision.
 *
 * @param unit - The bot.
 * @param vision - The vision.
 * @returns The player, or `null`.
 */
function seenPlayer(unit: Bot, vision: EnemyVision): null | Player {
  const { player } = unit.game;
  if (!player || player.death) {
    return null;
  }
  if (vision === 'whitebox') {
    return player;
  }
  return distanceToUnit(unit.position, player) <= unit.vrange ? player : null;
}

/**
 * The distance from a point to a unit's head or the nearest point of its trail.
 *
 * @param point - The point.
 * @param unit - The unit.
 * @returns The distance.
 */
function distanceToUnit(point: Point, unit: Unit): number {
  return Math.min(distanceBetween(point, unit.position), distanceToPoints(point, unit.track.simplyline));
}

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToPoints(point: Point, points: readonly Point[]): number {
  let nearest = Infinity;
  for (const other of points) {
    nearest = Math.min(nearest, distanceBetween(point, other));
  }
  return nearest;
}

function nearestOf<T extends Point>(point: Point, points: readonly T[]): null | T {
  let nearest: null | T = null;
  let nearestDistance = Infinity;
  for (const other of points) {
    const distance = distanceBetween(point, other);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = other;
    }
  }
  return nearest;
}

/**
 * How close the player is to the bot's head or trail, or `Infinity` when the bot cannot see it.
 *
 * @param unit - The bot.
 * @param vision - The vision.
 * @returns The distance.
 */
function playerThreatDistance(unit: Bot, vision: EnemyVision): number {
  const player = seenPlayer(unit, vision);
  if (!player) {
    return Infinity;
  }
  return Math.min(distanceBetween(player.position, unit.position), distanceToPoints(player.position, unit.track.simplyline));
}

/**
 * The nearest other living unit whose head is within range of the bot's.
 *
 * @param unit - The bot.
 * @param range - The range.
 * @returns The unit, or `null`.
 */
function nearestHead(unit: Bot, range: number): null | Unit {
  let nearest: null | Unit = null;
  let nearestDistance = range;
  for (const other of unit.game.units) {
    const distance = distanceBetween(other.position, unit.position);
    if (other !== unit && !other.death && distance < nearestDistance) {
      nearest = other;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function pointAhead(unit: Unit, distance: number): Vector {
  return unit.position.clone().add(new Vector(Math.cos(unit.direction) * distance, Math.sin(unit.direction) * distance));
}

/**
 * Avoid you: the player and its trail are danger. The bots never attack, stay home while the player is near and turn
 * home as soon as it nears their loop.
 *
 * @param vision - The vision.
 * @returns The mode.
 */
function createAvoid(vision: EnemyVision): EnemyModeDefinition {
  const base = originalWith(never);
  function threatened(unit: Bot, factor: number): boolean {
    return playerThreatDistance(unit, vision) < unit.vrange * factor;
  }
  return define(`avoid-${vision}`, {
    ...base,
    attack: giveUpAttack,
    capture: {
      update(unit, context) {
        if (unit.in !== unit.base && threatened(unit, AVOID_RANGE_FACTOR)) {
          return 'back';
        }
        return ensureNonNullable(base['capture']).update(unit, context);
      }
    },
    cut: {
      enter: (unit) => enterCut(unit),
      update(unit, context) {
        if (unit.in === unit.base && threatened(unit, AVOID_HOLD_FACTOR)) {
          return 'idle';
        }
        return updateCut(unit, context);
      }
    },
    exit: {
      enter: (unit) => enterExit(unit),
      update(unit, context) {
        if (unit.in === unit.base && threatened(unit, AVOID_HOLD_FACTOR)) {
          return 'idle';
        }
        return updateExit(unit, context, never);
      }
    },
    idle: {
      enter: () => ({}),
      update(unit, context) {
        if (unit.in === unit.base && threatened(unit, AVOID_HOLD_FACTOR)) {
          unit.target = null;
          return undefined;
        }
        return ensureNonNullable(botStates['idle']).update(unit, context);
      }
    }
  });
}

/**
 * Chase you: every bot that sees the player hunts its trail, or lurks at its head while it is home. The original's
 * trail-length trigger and aggro range do not apply, and a hunter never gives up for its own safety.
 *
 * @param vision - The vision.
 * @returns The mode.
 */
function createChase(vision: EnemyVision): EnemyModeDefinition {
  function sees(unit: Bot): boolean {
    return seenPlayer(unit, vision) !== null;
  }
  return define(`chase-${vision}`, {
    ...originalWith(sees),
    attack: {
      enter: () => ({}),
      update(unit) {
        const player = seenPlayer(unit, vision);
        if (!player) {
          return 'idle';
        }
        const nearest = nearestOf(unit.position, player.track.simplyline);
        if (nearest) {
          unit.target = nearest;
          return undefined;
        }
        if (unit.in !== unit.base && unit.track.length > unit.vrange * CHASE_GIVE_UP_FACTOR) {
          return 'back';
        }
        unit.target = player.position;
        return undefined;
      }
    }
  });
}

/**
 * Suicidal: a bot heads straight out, throws its trail in front of the nearest head it sees so that unit crosses it,
 * and otherwise hooks back over its own trail.
 *
 * @returns The mode.
 */
function createSuicidal(): EnemyModeDefinition {
  const base = originalWith(never);
  return define('suicidal', {
    ...base,
    attack: giveUpAttack,
    capture: {
      update(unit) {
        if (unit.in === unit.base) {
          return 'idle';
        }
        const victim = nearestHead(unit, unit.vrange * SUICIDE_VICTIM_FACTOR);
        const { simplyline } = unit.track;
        if (victim) {
          unit.target = pointAhead(victim, SUICIDE_LEAD);
        } else if (unit.track.length < unit.vrange * SUICIDE_RUN_FACTOR || simplyline.length < MIN_HOOK_POINTS) {
          unit.target = pointAhead(unit, STEP_DISTANCE);
        } else {
          unit.target = ensureNonNullable(simplyline[Math.floor(simplyline.length * SUICIDE_HOOK_SHARE)]);
        }
        return undefined;
      }
    }
  });
}

/**
 * Passive: the bots never leave their bases. One that is out when the mode starts finishes its loop and stays home.
 *
 * @returns The mode.
 */
function createPassive(): EnemyModeDefinition {
  return define('passive', {
    ...originalWith(never),
    attack: giveUpAttack,
    idle: {
      enter: () => ({}),
      update(unit) {
        if (unit.in === unit.base) {
          unit.target = null;
          return undefined;
        }
        return 'back';
      }
    }
  });
}

/**
 * Land grabbers: maximum greed, no attacks; they race the player for space.
 *
 * @returns The mode.
 */
function createGrabbers(): EnemyModeDefinition {
  return define('grabbers', {
    ...originalWith(never),
    attack: giveUpAttack
  }, {
    adjustPersonality(bot: Bot): void {
      const { botGreedMax, botSafetyMin } = bot.game.config;
      bot.greed = botGreedMax * GRABBER_GREED_FACTOR;
      bot.safety = botSafetyMin;
    }
  });
}

/**
 * Pack hunters: while the player has a trail, the bots nearest its head that see it hunt together, one at the trail
 * and the others across its way home.
 *
 * @param vision - The vision.
 * @returns The mode.
 */
function createPack(vision: EnemyVision): EnemyModeDefinition {
  /**
   * The bot's place in the pack: how many pack bots are nearer the player's head, or `Infinity` when there is no hunt
   * for it.
   *
   * @param unit - The bot.
   * @returns The rank.
   */
  function rank(unit: Bot): number {
    const player = seenPlayer(unit, vision);
    if (!player || player.track.simplyline.length === 0) {
      return Infinity;
    }
    const own = distanceBetween(unit.position, player.position);
    let nearer = 0;
    unit.game.units.forEach((other: Unit, index: number) => {
      if (other === unit || !(other instanceof Bot) || other.death || !isPackBot(other)) {
        return;
      }
      const distance = distanceBetween(other.position, player.position);
      if (distance < own || (distance === own && index < unit.game.units.indexOf(unit))) {
        nearer++;
      }
    });
    return nearer;
  }
  function hunts(unit: Bot): boolean {
    return rank(unit) < PACK_SIZE;
  }
  return define(`pack-${vision}`, {
    ...originalWith(hunts),
    attack: {
      enter: () => ({}),
      update(unit) {
        const place = rank(unit);
        const player = seenPlayer(unit, vision);
        if (place >= PACK_SIZE || !player) {
          return 'idle';
        }
        if (place === 0) {
          unit.target = nearestOf(unit.position, player.track.simplyline);
          return undefined;
        }
        const home = player.baseNearestPoint ?? player.position;
        const share = place / PACK_SIZE;
        unit.target = new Vector(player.position.x + (home.x - player.position.x) * share, player.position.y + (home.y - player.position.y) * share);
        return undefined;
      }
    }
  });
}

function isPackBot(bot: Bot): boolean {
  return definitions.get(ensureNonNullable(bot.fsm).states)?.id.startsWith('pack-') ?? false;
}

/**
 * The unit whose trail the bot is in aggro range of, nearest first, by the original's range formula.
 *
 * @param unit - The bot.
 * @param includePlayer - Whether the player is prey.
 * @returns The prey, or `null`.
 */
function preyInRange(unit: Bot, includePlayer: boolean): null | Unit {
  let prey: null | Unit = null;
  let preyDistance = Infinity;
  for (const other of unit.game.units) {
    if (other === unit || other.death || other.track.simplyline.length === 0 || (!includePlayer && other === unit.game.player)) {
      continue;
    }
    const aggroRange = Math.max(unit.vrange, other.vrange) * unit.aggro * AGGRO_RANGE_FACTOR;
    const distance = distanceToPoints(unit.position, other.track.simplyline);
    if (distance < aggroRange && distance < preyDistance) {
      prey = other;
      preyDistance = distance;
    }
  }
  return prey;
}

function createHuntEveryone(includePlayer: boolean): BotStates {
  return {
    ...originalWith((unit) => preyInRange(unit, includePlayer) !== null),
    attack: {
      // The engine's forced attack on a long player trail enters this state too, with no prey in range.
      enter(unit): BotStateContext {
        const prey = preyInRange(unit, includePlayer) ?? (includePlayer ? unit.game.player : null);
        return prey ? { prey } : {};
      },
      update(unit, context): string | undefined {
        const { prey } = context;
        if (!prey || prey.death || !unit.game.units.includes(prey) || prey.track.simplyline.length === 0) {
          return 'idle';
        }
        if (prey.track.length < unit.game.config.botAttackTrackLength && isBotInDanger(unit)) {
          return 'idle';
        }
        unit.target = nearestOf(unit.position, prey.track.simplyline);
        return undefined;
      }
    }
  };
}

/**
 * Free-for-all: `attack` picks whichever unit's trail is in range, bot or player.
 *
 * @returns The mode.
 */
function createFreeForAll(): EnemyModeDefinition {
  return define('free-for-all', createHuntEveryone(true), { canForceAttack: true });
}

/**
 * Civil war: the bots hunt each other and ignore the player. They keep clear of its head and trail, turn home early
 * when it is near, and do not close a loop that would enclose its head while home, its trail start or its capital.
 * That avoidance is a steering rule, not an engine rule, so it is not complete: a bot that cannot turn in time can
 * still cross the player's trail, and a loop's real capture follows the base's edge, which the check approximates.
 *
 * @returns The mode.
 */
function createCivilWar(): EnemyModeDefinition {
  const states: BotStates = {};
  const hunting = createHuntEveryone(false);
  for (const name of Object.keys(hunting)) {
    const handlers = ensureNonNullable(hunting[name]);
    states[name] = {
      ...handlers,
      update: (unit, context): string | undefined => civilWarStep(unit, name, () => handlers.update(unit, context))
    };
  }
  return define('civil-war', states);
}

function civilWarStep(unit: Bot, state: string, inner: () => string | undefined): string | undefined {
  const player = unit.game.player;
  if (!player || player.death || unit.in === unit.base) {
    return inner();
  }
  const threat = playerThreatDistance(unit, 'whitebox');
  if (state === 'capture' && threat < unit.vrange * CIVIL_WAR_HOME_FACTOR && !wouldEnclosePlayer(unit, player)) {
    return 'back';
  }
  const next = inner();
  if (next !== undefined) {
    return next;
  }
  if (state === 'back' && wouldEnclosePlayer(unit, player)) {
    unit.target = pointAhead(unit, STEP_DISTANCE);
  }
  steerClear(unit, player);
  return undefined;
}

/**
 * Turns the bot away from the player's head and trail when its next step heads into them.
 *
 * @param unit - The bot.
 * @param player - The player.
 */
function steerClear(unit: Bot, player: Player): void {
  const obstacles = [player.position, ...player.track.simplyline];
  const nearest = nearestOf(unit.position, obstacles);
  if (!nearest || !unit.target || distanceBetween(nearest, unit.position) > CIVIL_WAR_CLEARANCE) {
    return;
  }
  const awayX = unit.position.x - nearest.x;
  const awayY = unit.position.y - nearest.y;
  const toTargetX = unit.target.x - unit.position.x;
  const toTargetY = unit.target.y - unit.position.y;
  if (awayX * toTargetX + awayY * toTargetY >= 0) {
    return;
  }
  const length = Math.hypot(awayX, awayY) || 1;
  unit.target = new Vector(unit.position.x + awayX / length * STEP_DISTANCE, unit.position.y + awayY / length * STEP_DISTANCE);
}

/**
 * Whether closing the bot's loop now would enclose the player's head while home, its trail start or its capital,
 * approximating the capture by the bot's trail closed through its nearest base point.
 *
 * @param unit - The bot.
 * @param player - The player.
 * @returns Whether it would.
 */
function wouldEnclosePlayer(unit: Bot, player: Player): boolean {
  const loop: Point[] = [...unit.track.simplyline];
  if (unit.baseNearestPoint) {
    loop.push(unit.baseNearestPoint);
  }
  if (loop.length < MIN_POLYGON_POINTS) {
    return false;
  }
  const points: Point[] = [];
  if (player.in === player.base) {
    points.push(player.position);
  }
  if (player.track.polyline.start) {
    points.push(player.track.polyline.start);
  }
  if (player.cities[0]) {
    points.push(player.cities[0].position);
  }
  return points.some((point) => isInside(point, loop));
}

function isInside(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = ensureNonNullable(polygon[index]);
    const b = ensureNonNullable(polygon[previous]);
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

const MIXED_POOL: readonly EnemyModeDefinition[] = [
  { canForceAttack: true, id: 'original', states: botStates },
  createAvoid('whitebox'),
  createAvoid('blackbox'),
  createChase('whitebox'),
  createChase('blackbox'),
  createSuicidal(),
  createPassive(),
  createGrabbers(),
  createPack('whitebox'),
  createPack('blackbox'),
  createFreeForAll(),
  createCivilWar()
];
definitions.set(botStates, ensureNonNullable(MIXED_POOL[0]));

/** Every state table a bot can run, the original's first, so a snapshot can share them rather than copy them. */
export const ENEMY_STATE_TABLES: readonly BotStates[] = MIXED_POOL.map((definition) => definition.states);

/**
 * The name a save stores a state table under.
 *
 * @param value - Any object the save meets.
 * @returns The id, or `undefined` for an object that is no state table.
 */
export function enemyStateTableId(value: object): string | undefined {
  for (const [states, definition] of definitions) {
    if (states === value) {
      return definition.id;
    }
  }
  return undefined;
}

/**
 * The state table a save names.
 *
 * @param id - The id {@link enemyStateTableId} gave.
 * @returns The table, or `undefined` for an id this build does not have.
 */
export function enemyStateTableById(id: string): BotStates | undefined {
  return id === 'original' ? botStates : definitionsById.get(id)?.states;
}

/**
 * How many bots run each mode, for the debug overlay: the one place the mixed mode's draw shows.
 *
 * @param game - The game.
 * @returns For example `chase-whitebox 4, passive 2`.
 */
export function describeEnemyModes(game: Game): string {
  const counts = new Map<string, number>();
  for (const unit of game.units) {
    if (unit instanceof Bot && unit.fsm) {
      const id = definitions.get(unit.fsm.states)?.id ?? 'original';
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts].map(([id, count]) => `${id} ${String(count)}`).join(', ');
}

function definitionFor(settings: EnemySettings): EnemyModeDefinition | null {
  switch (settings.mode) {
    case 'avoid':
    case 'chase':
    case 'pack':
      return ensureNonNullable(definitionsById.get(`${settings.mode}-${settings.vision}`));
    case 'mixed':
    case 'original':
      return null;
    default:
      return ensureNonNullable(definitionsById.get(settings.mode));
  }
}

/**
 * The engine hooks for the settings, or `null` for the original bots.
 *
 * @param game - The game.
 * @param settings - The settings.
 * @returns The hooks.
 */
function createHooks(game: Game, settings: EnemySettings): EnemyHooks | null {
  if (settings.mode === 'original') {
    return null;
  }
  const single = definitionFor(settings);
  function definitionOf(bot: Bot): EnemyModeDefinition {
    return definitions.get(ensureNonNullable(bot.fsm).states) ?? ensureNonNullable(MIXED_POOL[0]);
  }
  return {
    adjustPersonality(bot: Bot): void {
      definitionOf(bot).adjustPersonality?.(bot);
    },
    canForceAttack(bot: Bot): boolean {
      return definitionOf(bot).canForceAttack;
    },
    tableFor(bot: Bot): BotStates {
      if (single) {
        return single.states;
      }
      // A mixed bot keeps the table it drew, through a snapshot's restore too; only a new bot draws one.
      return bot.fsm?.states ?? drawMixedTable(game);
    }
  };
}

function drawMixedTable(game: Game): BotStates {
  return ensureNonNullable(MIXED_POOL[Math.floor(game.rng() * MIXED_POOL.length)]).states;
}

/**
 * Applies the settings to the game at once: the config's level and bot count, the engine hooks, and every living
 * bot's state table. A bot whose current state the new table lacks starts over from `idle`.
 *
 * @param game - The game.
 * @param settings - The settings.
 */
export function applyEnemySettings(game: Game, settings: EnemySettings): void {
  const { config } = game;
  let baseline = configBaselines.get(config);
  if (!baseline) {
    baseline = { botLevel: config.botLevel, botsCount: config.botsCount };
    configBaselines.set(config, baseline);
  }
  config.botLevel = settings.level ?? baseline.botLevel;
  config.botsCount = settings.count ?? baseline.botsCount;
  game.enemies = createHooks(game, settings);
  for (const unit of game.units) {
    if (unit instanceof Bot && unit.fsm) {
      setTable(unit.fsm, settings.mode === 'mixed' ? drawMixedTable(game) : game.enemies?.tableFor(unit) ?? botStates);
    }
  }
}

function setTable(fsm: StateMachine, table: BotStates): void {
  if (fsm.states === table) {
    return;
  }
  fsm.states = table;
  if (!table[fsm.state]) {
    fsm.state = '';
    fsm.change('idle');
  }
}

/**
 * Puts every bot on the table the current settings give it. A restore calls it, because a snapshot's bots keep the
 * tables they ran when it was taken, while the settings are the page's, not the game's.
 *
 * @param game - The game.
 */
export function syncBotStates(game: Game): void {
  for (const unit of game.units) {
    if (unit instanceof Bot && unit.fsm) {
      setTable(unit.fsm, game.enemies?.tableFor(unit) ?? botStates);
    }
  }
}

/**
 * Reads settings back from their stored text, falling back to the defaults field by field.
 *
 * @param text - The stored JSON, or `null`.
 * @returns The settings.
 */
export function parseEnemySettings(text: null | string): EnemySettings {
  let value: unknown;
  try {
    value = text ? JSON.parse(text) : null;
  } catch {
    value = null;
  }
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_ENEMY_SETTINGS;
  }
  const mode: unknown = Reflect.get(value, 'mode');
  const vision: unknown = Reflect.get(value, 'vision');
  const level: unknown = Reflect.get(value, 'level');
  const count: unknown = Reflect.get(value, 'count');
  return {
    count: ENEMY_COUNTS.find((candidate) => candidate !== null && candidate === count) ?? null,
    level: ENEMY_LEVELS.find((candidate) => candidate !== null && candidate === level) ?? null,
    mode: ENEMY_MODES.find((candidate) => candidate === mode) ?? DEFAULT_ENEMY_SETTINGS.mode,
    vision: ENEMY_VISIONS.find((candidate) => candidate === vision) ?? DEFAULT_ENEMY_SETTINGS.vision
  };
}
/* eslint-enable perfectionist/sort-modules -- end of the dependency-ordered declarations. */
