/**
 * @file
 *
 * Saved games: a snapshot written to `localStorage` under a name, and read back into a running game.
 *
 * A save is a versioned JSON document. The snapshot's object graph goes through the graph codec, with the objects
 * that live outside it named by a tag: the game, its config and language, the bot state table, and each skin by its
 * name, so a save loads into any game that has the same skins. A `Path2D` is rebuilt from its owner's points. The
 * document is gzipped and base64-encoded, which takes a mid-game save from megabytes of JSON to a few hundred
 * kilobytes, and a save that would still not fit is refused rather than half written.
 *
 * Three things a checkpoint keeps are left out of a save, because none of them changes what happens next: the
 * particles (sparks, whose only callbacks do nothing), the quest notifications (which hold loading images) and the
 * vector pool (whose vectors are all spares).
 */

import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

import type { Game } from './engine.ts';
import type { EncodedGraph } from './shared/graph-codec.ts';
import type {
  GameSnapshot,
  SnapshotGraph,
  UsedSkinsEntry
} from './snapshot.ts';

import { GAME_BUILD } from './engine.ts';
import {
  botStates,
  StateMachine
} from './entities/bot-ai.ts';
import {
  Territory,
  Trail
} from './entities/territory-trail.ts';
import {
  Bot,
  City,
  Player,
  Unit
} from './entities/units.ts';
import { Border } from './geometry/border.ts';
import { ContourPoints } from './geometry/contour-points.ts';
import {
  Polygon,
  Polyline,
  Segment
} from './geometry/shapes.ts';
import { SpatialGrid } from './geometry/spatial-grid.ts';
import { Vector } from './geometry/vector.ts';
import { TextParticle } from './particles.ts';
import {
  Achievement,
  AchievementStore,
  AchievementTracker,
  BotScoreLabel,
  SchemeCycler,
  Scoreboard,
  ScoreLabel
} from './scoring.ts';
import {
  decodeGraph,
  encodeGraph
} from './shared/graph-codec.ts';
import { Skin } from './skins/skin.ts';

export const SAVE_FORMAT = 'paperio2-save';
export const SAVE_FORMAT_VERSION = 2;
/** The longest save payload written, in characters: `localStorage` holds about five million per origin. */
export const MAX_SAVE_CHARACTERS = 4_000_000;
export const SAVE_INDEX_KEY = 'paperio2.saves';
export const SAVE_KEY_PREFIX = 'paperio2.save.';
const PAYLOAD_PREFIX = 'gz:';
const BASE64_CHUNK = 0x8000;
// A save's id is its time plus six random base-36 digits, so two saves in one millisecond do not collide.
const ID_RADIX = 36;
const ID_SUFFIX_START = 2;
const ID_SUFFIX_END = 8;

/** What the menu lists for a save, but its size. */
export interface SaveDetails {
  readonly id: string;
  readonly name: string;
  /** The player's share of the arena, 0 to 1. */
  readonly percent: number;
  /** The run's playtime, in milliseconds of game time. */
  readonly playtime: number;
  /** When it was saved, in milliseconds since the epoch. */
  readonly savedAt: number;
}

/** What the menu lists for a save. */
export interface SaveSummary extends SaveDetails {
  readonly characters: number;
}

interface AchievementTag {
  readonly achievement: string;
}

interface EncodedSnapshot {
  readonly clockTime: number;
  readonly graph: EncodedGraph;
  readonly nameManagerPool: readonly string[];
  readonly nameManagerSeed: number;
  readonly nextId: number;
  readonly rngSeed: number;
  readonly skinManagerSeed: number;
  /** The name of each skin the graph refers to, by the index its tags carry. */
  readonly skinNames: readonly string[];
  /** The indexes of {@link GameSnapshot.skinsInUse}, in order. */
  readonly skinsInUse: readonly number[];
  readonly unusedSkinNames: readonly string[];
  readonly usedSkins: readonly EncodedUsedSkins[];
}

interface EncodedUsedSkins {
  readonly name: string;
  readonly skins: readonly number[];
}

type ExternalTag = 'achievements' | 'botStates' | 'config' | 'game' | 'language' | 'path' | 'schemes' | AchievementTag | SkinTag;

interface SaveDocument {
  readonly build: number;
  readonly format: string;
  readonly snapshot: EncodedSnapshot;
  readonly summary: SaveDetails;
  readonly version: number;
}

interface SkinTag {
  readonly skin: number;
}

const CLASSES: readonly (readonly [string, object])[] = [
  ['AchievementTracker', AchievementTracker.prototype],
  ['Border', Border.prototype],
  ['Bot', Bot.prototype],
  ['BotScoreLabel', BotScoreLabel.prototype],
  ['City', City.prototype],
  ['ContourPoints', ContourPoints.prototype],
  ['Player', Player.prototype],
  ['Polygon', Polygon.prototype],
  ['Polyline', Polyline.prototype],
  ['Scoreboard', Scoreboard.prototype],
  ['ScoreLabel', ScoreLabel.prototype],
  ['Segment', Segment.prototype],
  ['SpatialGrid', SpatialGrid.prototype],
  ['StateMachine', StateMachine.prototype],
  ['Territory', Territory.prototype],
  ['TextParticle', TextParticle.prototype],
  ['Trail', Trail.prototype],
  ['Unit', Unit.prototype],
  ['Vector', Vector.prototype]
];
const CLASS_NAMES: ReadonlyMap<object, string> = new Map(CLASSES.map(([name, prototype]) => [prototype, name]));
const CLASS_PROTOTYPES: ReadonlyMap<string, object> = new Map(CLASSES);

/**
 * Decodes a save payload into a snapshot of `game`, ready for `restoreSnapshot`.
 *
 * @param game - The game it is loaded into, whose skin manager supplies the skins.
 * @param payload - The text from {@link encodeSave}.
 * @returns The snapshot.
 */
export async function decodeSave(game: Game, payload: string): Promise<GameSnapshot> {
  if (!payload.startsWith(PAYLOAD_PREFIX)) {
    throw new Error('This is not a saved game');
  }
  const parsed: unknown = JSON.parse(await base64ToGunzip(payload.slice(PAYLOAD_PREFIX.length)));
  if (!isSaveDocument(parsed)) {
    throw new Error('This is not a saved game');
  }
  if (parsed.version !== SAVE_FORMAT_VERSION || parsed.build !== GAME_BUILD) {
    throw new Error(`This save was made by another version of the game (format ${String(parsed.version)}, build ${String(parsed.build)})`);
  }
  const encoded = parsed.snapshot;
  const skins = encoded.skinNames.map((name: string) => createSkin(game, name));
  const pathOwners: object[] = [];
  const root = decodeGraph(encoded.graph, {
    classPrototypes: CLASS_PROTOTYPES,
    decodeExternal: (tag: unknown, owner: object): unknown => {
      if (tag === 'path') {
        pathOwners.push(owner);
        return null;
      }
      if (isSkinTag(tag)) {
        return ensureNonNullable(skins[tag.skin]);
      }
      if (isAchievementTag(tag)) {
        return ensureNonNullable(game.achievementsProfile.achievements.find((achievement: Achievement) => achievement.name === tag.achievement));
      }
      return externalObjectOf(game, tag);
    }
  });
  if (!isSnapshotRoot(root)) {
    throw new Error('The saved game is damaged');
  }
  for (const owner of pathOwners) {
    rebuildPath(owner);
  }
  const graph: SnapshotGraph = { fields: root.fields, pool: [], skinUsers: root.skinUsers };
  return {
    clockTime: encoded.clockTime,
    graph,
    nameManagerPool: encoded.nameManagerPool,
    nameManagerSeed: encoded.nameManagerSeed,
    nextId: encoded.nextId,
    rngSeed: encoded.rngSeed,
    skinManagerSeed: encoded.skinManagerSeed,
    skinsInUse: encoded.skinsInUse.map((index: number) => ensureNonNullable(skins[index])),
    timers: [],
    unusedSkinNames: encoded.unusedSkinNames,
    usedSkins: encoded.usedSkins.map((entry: EncodedUsedSkins) => ({ name: entry.name, skins: entry.skins.map((index: number) => ensureNonNullable(skins[index])) }))
  };
}

/**
 * Deletes a save.
 *
 * @param id - The save's id.
 * @param storage - Where the saves live.
 */
export function deleteSave(id: string, storage: Storage = localStorage): void {
  storage.removeItem(SAVE_KEY_PREFIX + id);
  storage.setItem(SAVE_INDEX_KEY, JSON.stringify(listSaves(storage).filter((summary: SaveSummary) => summary.id !== id)));
}

/**
 * Encodes a snapshot as the compressed text a save stores.
 *
 * @param game - The game the snapshot was taken of.
 * @param snapshot - The snapshot.
 * @param summary - What the menu will list for it.
 * @returns The payload.
 */
export async function encodeSave(game: Game, snapshot: GameSnapshot, summary: SaveDetails): Promise<string> {
  if (snapshot.timers.length > 0) {
    // A timer's callback is code, which a save cannot hold.
    throw new Error('A game cannot be saved while a death delay runs');
  }
  const skins: Skin[] = [...snapshot.skinsInUse];
  function skinIndex(skin: Skin): number {
    let index = skins.indexOf(skin);
    if (index === -1) {
      index = skins.push(skin) - 1;
    }
    return index;
  }
  const root = {
    fields: { ...snapshot.graph.fields, notifications: [], particles: [] },
    skinUsers: snapshot.graph.skinUsers
  };
  const graph = encodeGraph(root, {
    classNames: CLASS_NAMES,
    encodeExternal: (value: object): ExternalTag | undefined => {
      if (value instanceof Skin) {
        return { skin: skinIndex(value) };
      }
      if (value instanceof Path2D) {
        return 'path';
      }
      if (value instanceof Achievement) {
        return { achievement: value.name };
      }
      return externalTagOf(game, value);
    }
  });
  const document: SaveDocument = {
    build: GAME_BUILD,
    format: SAVE_FORMAT,
    snapshot: {
      clockTime: snapshot.clockTime,
      graph,
      nameManagerPool: snapshot.nameManagerPool,
      nameManagerSeed: snapshot.nameManagerSeed,
      nextId: snapshot.nextId,
      rngSeed: snapshot.rngSeed,
      skinManagerSeed: snapshot.skinManagerSeed,
      skinNames: skins.map((skin: Skin) => ensureNonNullable(skin.name)),
      skinsInUse: snapshot.skinsInUse.map(skinIndex),
      unusedSkinNames: snapshot.unusedSkinNames,
      usedSkins: snapshot.usedSkins.map((entry: UsedSkinsEntry) => ({ name: entry.name, skins: entry.skins.map(skinIndex) }))
    },
    summary,
    version: SAVE_FORMAT_VERSION
  };
  return PAYLOAD_PREFIX + await gzipToBase64(JSON.stringify(document));
}

/**
 * Lists the saves, newest first.
 *
 * @param storage - Where the saves live.
 * @returns Their summaries; none when the storage cannot be read.
 */
export function listSaves(storage: Storage = localStorage): SaveSummary[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SAVE_INDEX_KEY) ?? '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isSaveSummary).sort((left: SaveSummary, right: SaveSummary) => right.savedAt - left.savedAt);
  } catch {
    return [];
  }
}

/**
 * Reads one save's payload.
 *
 * @param id - The save's id.
 * @param storage - Where the saves live.
 * @returns The payload for {@link decodeSave}.
 */
export function readSave(id: string, storage: Storage = localStorage): string {
  const payload = storage.getItem(SAVE_KEY_PREFIX + id);
  if (payload === null) {
    throw new Error('That save is gone');
  }
  return payload;
}

/**
 * Saves a snapshot under a name.
 *
 * @param game - The game the snapshot was taken of.
 * @param snapshot - The snapshot.
 * @param name - The name the menu shows.
 * @param storage - Where the saves live.
 * @returns The new save's summary.
 */
export async function writeSave(game: Game, snapshot: GameSnapshot, name: string, storage: Storage = localStorage): Promise<SaveSummary> {
  const player = game.player;
  const summary = {
    id: `${String(Date.now())}-${Math.random().toString(ID_RADIX).slice(ID_SUFFIX_START, ID_SUFFIX_END)}`,
    name,
    percent: player?.percent ?? 0,
    playtime: snapshot.clockTime - game.startTime,
    savedAt: Date.now()
  };
  const payload = await encodeSave(game, snapshot, summary);
  if (payload.length > MAX_SAVE_CHARACTERS) {
    throw new Error(`This game is too big to save (${String(payload.length)} characters, the limit is ${String(MAX_SAVE_CHARACTERS)})`);
  }
  const saved: SaveSummary = { ...summary, characters: payload.length };
  try {
    storage.setItem(SAVE_KEY_PREFIX + summary.id, payload);
    storage.setItem(SAVE_INDEX_KEY, JSON.stringify([...listSaves(storage), saved]));
  } catch (error) {
    storage.removeItem(SAVE_KEY_PREFIX + summary.id);
    throw new Error(`The browser's storage is full or blocked: ${String(error)}`, { cause: error });
  }
  return saved;
}

async function base64ToGunzip(text: string): Promise<string> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function createSkin(game: Game, name: string): Skin {
  const entry = game.skinManager.assets[name];
  if (!entry) {
    throw new Error(`This save uses a skin this game does not have: ${name}`);
  }
  entry.asset.load();
  const skin = new Skin();
  skin.addAsset(entry.asset);
  skin.name = name;
  return skin;
}

function externalObjectOf(game: Game, tag: unknown): unknown {
  switch (tag) {
    case 'achievements':
      return game.achievementsProfile;
    case 'botStates':
      return botStates;
    case 'config':
      return game.config;
    case 'game':
      return game;
    case 'language':
      return game.language;
    case 'schemes':
      return game.schemesManager;
    default:
      throw new Error(`Unknown reference in the saved game: ${String(JSON.stringify(tag))}`);
  }
}

function externalTagOf(game: Game, value: object): ExternalTag | undefined {
  if (value === game) {
    return 'game';
  }
  if (value === game.config) {
    return 'config';
  }
  if (value === game.language) {
    return 'language';
  }
  if (value === botStates) {
    return 'botStates';
  }
  if (value instanceof SchemeCycler) {
    return 'schemes';
  }
  if (value instanceof AchievementStore) {
    return 'achievements';
  }
  return undefined;
}

async function gzipToBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + BASE64_CHUNK));
  }
  return btoa(binary);
}

function isAchievementTag(tag: unknown): tag is AchievementTag {
  return typeof tag === 'object' && tag !== null && typeof Reflect.get(tag, 'achievement') === 'string';
}

function isSaveDocument(value: unknown): value is SaveDocument {
  return typeof value === 'object' && value !== null && Reflect.get(value, 'format') === SAVE_FORMAT && typeof Reflect.get(value, 'snapshot') === 'object';
}

function isSaveSummary(value: unknown): value is SaveSummary {
  return typeof value === 'object' && value !== null && typeof Reflect.get(value, 'id') === 'string' && typeof Reflect.get(value, 'name') === 'string' && typeof Reflect.get(value, 'savedAt') === 'number';
}

function isSkinTag(tag: unknown): tag is SkinTag {
  return typeof tag === 'object' && tag !== null && typeof Reflect.get(tag, 'skin') === 'number';
}

function isSnapshotRoot(value: unknown): value is Pick<SnapshotGraph, 'fields' | 'skinUsers'> {
  return typeof value === 'object' && value !== null && typeof Reflect.get(value, 'fields') === 'object' && Array.isArray(Reflect.get(value, 'skinUsers'));
}

function rebuildPath(owner: object): void {
  if (owner instanceof Polyline) {
    const path = new Path2D();
    if (owner.start) {
      path.moveTo(owner.start.x, owner.start.y);
    }
    for (const segment of owner.segments) {
      path.lineTo(segment.end.x, segment.end.y);
    }
    owner.path = path;
  } else if (owner instanceof Polygon || owner instanceof Territory) {
    owner.calcPath();
  }
}
