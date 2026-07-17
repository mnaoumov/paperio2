/**
 * @file
 *
 * Readable, typed reconstruction of the Paper.io 2 game engine — the original
 * minified/obfuscated `app2.js`, recovered to meaningful names and strict
 * types. This is the bundle entry: esbuild wraps it (plus preact + js-cookie)
 * into the self-contained browser IIFE `dist/app2.js`. The ambient `window`/DOM
 * augmentations live in `global.d.ts`.
 */

import Cookies from 'js-cookie';
import {
  createElement,
  render
} from 'preact';

import type { Config } from './engine.ts';
import type { LanguagesData } from './i18n.ts';
import type { SkinSource } from './skins/skin.ts';

import { BOT_NAMES } from './bot-names.ts';
import { defaultConfig } from './engine.ts';
import { NamePool } from './entities/units.ts';
import { createGameApi } from './game-api.ts';
import {
  buildLanguageList,
  findDefaultLanguage
} from './i18n.ts';
import {
  AchievementStore,
  BotScoreLabel,
  SchemeCycler
} from './scoring.ts';
import {
  ImageAssetSet,
  SvgAssetSet
} from './skins/asset.ts';
import { GameSkinManager } from './skins/manager.ts';
import { ensureNonNullable } from './type-guards.ts';
import { App } from './ui.ts';

// `NamePool.release` mutates its pool (pushes names back), so hand it a fresh
// Copy each game rather than the shared exported constant.
const botNames = [...BOT_NAMES];
const GAME_ENEMY_KILL_DELAY_MS = 2000;
const GAME_SELF_KILL_DELAY_MS = 1000;
const gameConfig = { ...defaultConfig, enemyKillDelay: GAME_ENEMY_KILL_DELAY_MS, followKiller: true, selfKillDelay: GAME_SELF_KILL_DELAY_MS };
const languagesPromise = fetch('assets/languages.json').then((response: Response) => response.json());
const skinsPromise = fetch('assets/skins/skins.json').then((response: Response) => response.json());

// `ts-reset` types `Response.json()` as `Promise<unknown>`, so the fetched
// Payloads arrive untyped. This validates the trusted shipped-asset shapes at
// The boundary (an object map of languages + an array of skins) and narrows
// Them for the rest of the module — analogous to the null-guard helpers.
function assertLoadedAssets(loadedAssets: [unknown, unknown]): asserts loadedAssets is [LanguagesData, SkinSource[]] {
  const [languages, skins] = loadedAssets;
  if (typeof languages !== 'object' || languages === null || !Array.isArray(skins)) {
    throw new Error('Unexpected assets payload from languages.json / skins.json');
  }
}

function createSkinManager(config: Config, canvas: HTMLCanvasElement, skins: SkinSource[]): GameSkinManager {
  const imageAssetSet = new ImageAssetSet(config);
  const svgAssetSet = new SvgAssetSet(config, canvas, 'assets/skins/', skins);
  const gameSkinManager = new GameSkinManager(imageAssetSet, svgAssetSet, 1);
  return gameSkinManager;
}

// The `iife` output format esbuild produces does not support top-level `await`,
// So the await lives in this async entry, invoked once; `.catch(console.error)`
// Reports a rejected bootstrap instead of an unhandled rejection.
async function main(): Promise<void> {
  const loadedAssets = await Promise.all([languagesPromise, skinsPromise]);
  assertLoadedAssets(loadedAssets);
  const [languages, skins] = loadedAssets;
  buildLanguageList(languages);
  const schemeCycler = new SchemeCycler(BotScoreLabel);
  const achievementStore = new AchievementStore([]);
  achievementStore.load();
  const api = createGameApi(gameConfig, ensureNonNullable(findDefaultLanguage()), (config: Config, canvas: HTMLCanvasElement) => createSkinManager(config, canvas, skins), new NamePool(botNames, Math.random()), schemeCycler, achievementStore);
  if (api) {
    window.paperio2api = api;
  }
  render(
    createElement(App, {
      api,
      skins,
      storage: Cookies
    }),
    ensureNonNullable(document.getElementById('game'))
  );
}

main().catch(console.error);
