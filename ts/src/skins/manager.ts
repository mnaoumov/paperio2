import type { Game } from '../engine.ts';
import type {
  Asset,
  AssetSet,
  ImageAssetSet,
  SvgAssetSet
} from './asset.ts';

import { createRandomGenerator } from '../shared/random.ts';
import {
  assertNonNullable,
  ensureNonNullable
} from '../type-guards.ts';
import { Skin } from './skin.ts';

// Declaration merge: SkinManager (defined later in the file, still `any`-typed by another
// Worker) is only missing these two members as far as `Game` is concerned. Merging adds them
// Without touching that class's body.

export interface ShieldSkinAssets {
  get(name: string): Asset;
}

export interface SkinManagerAssetEntry {
  asset: Asset;
  tag: string;
}
export type SkinManagerAssetMap = Record<string, SkinManagerAssetEntry>;
export type SkinManagerUsageMap = Record<string, Skin[]>;
// `isFlagSkinManager` / `shieldSkinAssets` are kept as a type-only interface
// Merge rather than class fields: they are never assigned, and the
// `'shieldSkinAssets' in skinManager` guard relies on them being absent at
// Runtime. A real class field is emitted (as `undefined` via esbuild's
// `__publicField`), which would make that guard always true and crash; the
// Project bans `declare` class properties, so an interface merge is the only
// Way to keep these two members type-only.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, perfectionist/sort-modules -- see the comment above: these two members must stay type-only, unachievable as class fields under this build; declaration order is kept dependency-ordered.
export interface SkinManager {
  isFlagSkinManager?: boolean;
  shieldSkinAssets?: ShieldSkinAssets;
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- coupled half of the type-only interface merge above (see that comment).
export abstract class SkinManager {
  public assets: SkinManagerAssetMap;
  public game?: Game;
  public rng: (n?: number) => number;
  public unusedAssets: SkinManagerAssetMap;
  public usedBy: SkinManagerUsageMap;
  public constructor(seed?: number) {
    this.usedBy = {};
    this.assets = {};
    this.unusedAssets = {};
    this.rng = createRandomGenerator(ensureNonNullable(seed));
  }

  public available(tag?: string): number {
    const list4 = Object.values(this.unusedAssets);
    if (tag) {
      return list4.filter((entry: SkinManagerAssetEntry) => entry.tag === tag).length;
    }
    return list4.length;
  }

  public get(name?: string, tag?: string): Skin {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- name may be an empty string, which must trigger the fallback; `??=` would not.
    if (!name) {
      name = this.randomAssetName(tag);
    }
    assertNonNullable(name);
    const asset = ensureNonNullable(this.assets[name]).asset;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing an entry from a string-keyed Record; setting undefined would leave a stale key that available()/randomAssetName would still enumerate.
    delete this.unusedAssets[name];
    asset.load();
    const skin = new Skin();
    skin.addAsset(asset);
    skin.name = name;
    this.usedBy[name] = (this.usedBy[name] ?? []).concat(skin);
    return skin;
  }

  public getCitySkin(_name?: string): Skin | undefined {
    return undefined;
  }

  public abstract getPlayerSkin(name?: string): Skin;

  public has(name: string): boolean {
    return name in this.unusedAssets;
  }

  public randomAssetName(tag?: string, unusedOnly = true): string | undefined {
    const assetMap = unusedOnly ? this.unusedAssets : this.assets;
    let list4 = Object.keys(assetMap);
    if (tag) {
      list4 = list4.filter((name: string) => ensureNonNullable(assetMap[name]).tag === tag);
    }
    const index = this.rng(list4.length);
    const name = list4[index];
    return name;
  }

  public registerAsset(asset: Asset, tag: string): void {
    const entry: SkinManagerAssetEntry = {
      asset,
      tag
    };
    this.assets[asset.name] = entry;
    this.unusedAssets[asset.name] = entry;
  }

  public registerAssets(assetSet: AssetSet, tag: string): void {
    for (const asset of assetSet.assets) {
      this.registerAsset(asset, tag);
    }
  }

  public release(skin: Skin): void {
    const name = ensureNonNullable(skin.name);
    const remaining = ensureNonNullable(this.usedBy[name]).filter((usedSkin: Skin) => usedSkin !== skin);
    this.usedBy[name] = remaining;
    if (remaining.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing the usage entry for a string-keyed Record.
      delete this.usedBy[name];
      this.unusedAssets[name] = ensureNonNullable(this.assets[name]);
    }
  }

  public reskin(name: string): void {
    const skins = this.usedBy[name];
    if (skins) {
      for (const skin of skins) {
        ensureNonNullable(skin.user).setSkin(this.get());
      }
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing the usage entry for a string-keyed Record.
      delete this.usedBy[name];
    }
  }
}
export const BOT_COLORED_SKIN_CHANCE = 0.25;
export class GameSkinManager extends SkinManager {
  public constructor(imageAssetSet: ImageAssetSet, svgAssetSet: SvgAssetSet, seed?: number) {
    super(seed);
    this.registerAssets(imageAssetSet, 'colored');
    this.registerAssets(svgAssetSet, 'classic');
  }

  public getBotSkin(): Skin {
    const tagOrder = this.rng() < BOT_COLORED_SKIN_CHANCE ? ['colored', 'classic'] : ['classic', 'colored'];
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- randomAssetName returns `string | undefined`; the `||` intentionally falls through on any falsy result (including an empty asset name) to try the second tag.
    const name = this.randomAssetName(tagOrder[0], true) || this.randomAssetName(tagOrder[1]);
    return this.get(name);
  }

  public override getPlayerSkin(name?: string): Skin {
    if (!name) {
      return this.get(undefined, 'colored');
    }
    this.reskin(name);
    return this.get(name);
  }
}
