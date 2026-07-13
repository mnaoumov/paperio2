/**
 * @file
 *
 * Readable, typed reconstruction of the Paper.io 2 game engine — the original
 * minified/obfuscated `app2.js`, recovered to meaningful names and strict
 * types. esbuild bundles this plus preact + js-cookie into `dist/app2.js`.
 */

import Cookies from 'js-cookie';
import {
  createElement,
  render
} from 'preact';

import type {
  Config,
  LanguagesData,
  SkinSource
} from './engine.ts';

import { BOT_NAMES } from './bot-names.ts';
import {
  AchievementStore,
  App,
  BotScoreLabel,
  buildLanguageList,
  createGameApi,
  defaultConfig,
  findDefaultLanguage,
  GameSkinManager,
  ImageAssetSet,
  NamePool,
  SchemeCycler,
  SvgAssetSet
} from './engine.ts';
import { ensureNonNullable } from './type-guards.ts';
// The ad-network integration this offline copy strips out (see `index.html`).
interface AdNetworkApi {
  hideAds?: () => void;
  showAds?: () => void;
}

// The `gtag`/GTM-style event queue some ad/analytics integrations install.
interface DataLayerEntry {
  event: string;
  productKey: string;
  publisher: string;
}

interface Paper2Results {
  bestPercent?: number;
  build?: number;
  kills: number;
  reason?: number;
  score: number;
  scores?: Paper2ResultsScores;
  time: number;
  top?: number;
}

// The scores payload some other page-level script may leave on `window`
// After posting game results — read-only from this file's perspective.
interface Paper2ResultsScores {
  accumulator?: number;
  kills?: number;
}
// --- ambient augmentations for dynamic globals the engine touches ---
// (js-cookie's own types now come from `@types/js-cookie`; only the engine's
// Own payload/window shapes are declared here.)
// Mirrors the achievements/challenges cookie payload (see `AchievementStore`
// Below) — named here (rather than only inside the engine IIFE) so the
// `Window.paperio_challenges` augmentation below can reference it.
// The shop/skins-unlock integration this offline copy strips out.
interface ShopApi {
  autoCheckUnlock: () => void;
}

type StoredChallenges = Record<string, boolean>;

declare global {
  // `better-typescript-lib` narrows `getElementById` to `Element | null`, which
  // Drops the `.style`/`.value` members every call site in this file relies on
  // (each id maps to a real `HTMLElement`). Restore lib.dom's `HTMLElement`
  // Return so those accesses type without a cast.
  interface Document {
    getElementById(elementId: string): HTMLElement | null;
  }
  // Real `HTMLElement` (unlike its `HTMLInputElement`/`HTMLSelectElement`
  // Subclasses) has no `.value` in `lib.dom` — needed for the one config-form
  // Callsite that reads it off a plain `document.getElementById()` result.
  interface HTMLElement {
    value: string;
  }
  interface Navigator {
    browserLanguage?: string;
    userLanguage?: string;
  }
  // `Object.entries(x)` on an `any`/untyped argument resolves TypeScript's
  // Generic `entries<T>` overload with `T` un-inferable, defaulting the values
  // To `unknown`, which then poison the `createElement` prop object literals
  // Built from the result. Both of this file's two `Object.entries()` call
  // Sites pass untyped arguments, so a non-generic overload here fixes both.
  interface ObjectConstructor {
    entries(source: object): [string, boolean | number | string][];
  }

  interface Window {
    // The ad-network integration this offline copy strips out (see the
    // Project's `index.html` shim) — every call site guards with `if
    // (window.ads && window.ads.showAds)`, so both members stay optional.
    ads?: AdNetworkApi;
    dataLayer?: DataLayerEntry[];
    // Classic Google Analytics `ga()`; every call site in this file passes
    // Exactly `("send", "event", category, action)`.
    ga?: (command: string, hitType: string, eventCategory: string, eventAction: string) => void;
    paper2_results: Paper2Results;
    paperio_challenges?: StoredChallenges;
    // `GameApi`'s own shape lives inside the engine IIFE below (it reaches
    // Deep into `Game` and friends) — bridged through `object` here rather
    // Than duplicating that whole type graph at this top level, since nothing
    // In this file reads `window.paperio2api` back (only the offline shim in
    // `index.html`, outside this compilation, calls into it at runtime).
    paperio2api?: object;
    playerId?: number;
    // The shop/skins-unlock integration this offline copy strips out.
    shop?: ShopApi;
    ShowPreroll?: () => void;
  }
}

(function main(): void {
  'use strict';

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
  // Them for the rest of the closure — analogous to the null-guard helpers.
  function assertLoadedAssets(loadedAssets: [unknown, unknown]): asserts loadedAssets is [LanguagesData, SkinSource[]] {
    const [languages, skins] = loadedAssets;
    if (typeof languages !== 'object' || languages === null || !Array.isArray(skins)) {
      throw new Error('Unexpected assets payload from languages.json / skins.json');
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-floating-promises -- fire-and-forget bootstrap matching the original engine; the game is rendered once the assets resolve.
  Promise.all([languagesPromise, skinsPromise]).then((loadedAssets: [unknown, unknown]) => {
    assertLoadedAssets(loadedAssets);
    const [languages, skins] = loadedAssets;
    buildLanguageList(languages);
    function createSkinManager(config: Config, canvas: HTMLCanvasElement): GameSkinManager {
      const imageAssetSet = new ImageAssetSet(config);
      const svgAssetSet = new SvgAssetSet(config, canvas, 'assets/skins/', skins);
      const gameSkinManager = new GameSkinManager(imageAssetSet, svgAssetSet, 1);
      return gameSkinManager;
    }
    const schemeCycler = new SchemeCycler(BotScoreLabel);
    const achievementStore = new AchievementStore([]);
    achievementStore.load();
    const api = createGameApi(gameConfig, ensureNonNullable(findDefaultLanguage()), createSkinManager, new NamePool(botNames, Math.random()), schemeCycler, achievementStore);
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
  });
})();
