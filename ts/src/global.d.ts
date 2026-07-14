/**
 * @file
 *
 * Ambient global augmentations for the dynamic `window`/DOM globals the engine
 * touches, plus the page-level payload shapes (ad-network / analytics / shop /
 * challenge-cookie / results). Kept in a `.d.ts` so it augments the global scope
 * for every module in the program without being imported at runtime (esbuild
 * erases it). The `export {}` makes this a module so `declare global` augments
 * rather than redeclares.
 */

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

// The shop/skins-unlock integration this offline copy strips out.
interface ShopApi {
  autoCheckUnlock: () => void;
}

// Mirrors the achievements/challenges cookie payload (see `AchievementStore`).
type StoredChallenges = Record<string, boolean>;

declare global {
  // `better-typescript-lib` narrows `getElementById` to `Element | null`, which
  // Drops the `.style`/`.value` members every call site in the engine relies on
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
  // Built from the result. Both of the UI's two `Object.entries()` call sites
  // Pass untyped arguments, so a non-generic overload here fixes both.
  interface ObjectConstructor {
    entries(source: object): [string, boolean | number | string][];
  }

  interface Window {
    // The ad-network integration this offline copy strips out (see the
    // Project's `index.html` shim) — every call site guards with `if
    // (window.ads && window.ads.showAds)`, so both members stay optional.
    ads?: AdNetworkApi;
    dataLayer?: DataLayerEntry[];
    // Classic Google Analytics `ga()`; every call site passes exactly
    // `("send", "event", category, action)`.
    ga?: (command: string, hitType: string, eventCategory: string, eventAction: string) => void;
    paper2_results: Paper2Results;
    paperio_challenges?: StoredChallenges;
    // `GameApi`'s own shape lives in `game-api.ts` (it reaches deep into `Game`
    // And friends) — bridged through `object` here rather than duplicating that
    // Whole type graph, since nothing in the bundle reads `window.paperio2api`
    // Back (only the offline shim in `index.html`, outside this compilation,
    // Calls into it at runtime).
    paperio2api?: object;
    playerId?: number;
    // The shop/skins-unlock integration this offline copy strips out.
    shop?: ShopApi;
    ShowPreroll?: () => void;
  }
}

export {};
