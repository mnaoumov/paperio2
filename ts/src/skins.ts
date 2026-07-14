import type {
  Config,
  Game
} from './engine.ts';
import type { Unit } from './entities/units.ts';
import type { ParticleColor } from './particles.ts';

import {
  brighten,
  hexToRgb,
  hsvToHex,
  rgbToHsv,
  scaleValue,
  setValue
} from './shared/color-utils.ts';
import { PERCENT_MAX } from './shared/constants.ts';
import { noop } from './shared/noop.ts';
import { createRandomGenerator } from './shared/random.ts';
import {
  assertNonNullable,
  ensureNonNullable
} from './type-guards.ts';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve: (value: HTMLImageElement) => void) => {
    const element = document.createElement('img');
    element.src = src;
    element.onload = (): void => {
      resolve(element);
    };
  });
}

// Declaration merge: SkinManager (defined later in the file, still `any`-typed by another
// Worker) is only missing these two members as far as `Game` is concerned. Merging adds them
// Without touching that class's body.
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface ShieldSkinAssets {
  get(name: string): Asset;
}

export interface SkinLayerPivot {
  x?: number;
  y?: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface SkinLayerDescriptor {
  direction?: string;
  level?: number;
  pivot?: SkinLayerPivot;
  rotation?: number;
  scale?: number;
  src?: HTMLCanvasElement | HTMLImageElement;
  url?: string;
  x?: number;
  y?: number;
}
export const PIVOT_DEFAULT = 0.5;

export interface Pivot {
  x: number;
  y: number;
}
export class SkinLayer {
  public config: Config;
  public direction: string;
  public image: HTMLCanvasElement | null;
  public level: number;
  public pivot: Pivot;

  public rotation: number;
  public scale: number;
  public src: HTMLCanvasElement | HTMLImageElement | null;
  public url: string;
  public x: number;
  public y: number;
  public constructor(config: Config, descriptor: SkinLayerDescriptor, onReady?: (skinLayer: SkinLayer) => void) {
    this.level = 0;
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.direction = '';
    this.rotation = 0;
    this.url = '';
    this.src = null;
    this.image = null;
    this.config = config;
    Object.assign(this, descriptor);
    this.pivot = { x: PIVOT_DEFAULT, y: PIVOT_DEFAULT, ...descriptor.pivot };
    let imagePromise: null | Promise<HTMLImageElement>;
    if (this.url) {
      imagePromise = loadImage(this.url);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- this.src is populated by Object.assign above, which the type system does not track.
    } else if (this.src) {
      imagePromise = Promise.resolve(this.src);
    } else {
      imagePromise = null;
    }
    if (imagePromise) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises -- fire-and-forget image load matching the original engine; the source is applied when it resolves.
      imagePromise.then((image: HTMLImageElement) => {
        this.src = image;
        this.rescale(1);
        if (onReady) {
          onReady(this);
        }
      });
    }
  }

  public rescale(scale: number): void {
    const {
      maxScale,
      trackWidth
    } = this.config;
    const baseSize = trackWidth * maxScale;
    const src = this.src;
    if (!src) {
      return;
    }
    const sourceWidth = 'naturalWidth' in src ? src.naturalWidth || src.width : src.width;
    const sourceHeight = 'naturalHeight' in src ? src.naturalHeight || src.height : src.height;
    const scaleRatio = baseSize * scale * this.scale / sourceWidth;
    const targetWidth = Math.trunc(sourceWidth * scaleRatio);
    const targetHeight = Math.trunc(sourceHeight * scaleRatio);
    const scaleX = targetWidth / sourceWidth;
    const scaleY = targetHeight / sourceHeight;
    const element = document.createElement('canvas');
    element.width = targetWidth;
    element.height = targetHeight;
    const context = element.getContext('2d');
    if (!context) {
      return;
    }
    context.scale(scaleX, scaleY);
    context.drawImage(src, 0, 0);
    this.image = element;
  }
}
let svgElement: SVGSVGElement | undefined;
export interface PatternSource {
  scale?: number;
  url?: string;
}
export class PatternAsset {
  public pattern: CanvasPattern | null;
  public ready: boolean;
  public scale: number;
  public src: HTMLImageElement | null;
  public url: string;
  public constructor(config: Config, canvas: HTMLCanvasElement, baseUrl: string, source: PatternSource = {}, onReady?: () => void) {
    this.url = baseUrl + String(source.url);
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- a source scale of 0 is degenerate and must fall back to 1, so the falsy-triggering || is intentional.
    this.scale = source.scale || 1;
    this.src = null;
    this.ready = false;
    this.pattern = null;
    const {
      maxScale
    } = config;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- fire-and-forget image load matching the original engine; the pattern is built when it resolves.
    loadImage(this.url).then((spatialGrid2: HTMLImageElement) => {
      this.src = spatialGrid2;
      const sourceWidth = Math.trunc(spatialGrid2.naturalWidth || spatialGrid2.width);
      const sourceHeight = Math.trunc(spatialGrid2.naturalHeight || spatialGrid2.height);
      const scaleRatio = maxScale * PERCENT_MAX * this.scale / sourceWidth;
      if (sourceWidth === 0) {
        console.warn(`${this.url} has no width`);
      }
      if (sourceHeight === 0) {
        console.warn(`${this.url} has no heigth`);
      }
      const targetWidth = Math.floor(sourceWidth * scaleRatio) || 1;
      const targetHeight = Math.floor(sourceHeight * scaleRatio) || 1;
      const element = document.createElement('canvas');
      element.width = targetWidth;
      element.height = targetHeight;
      const elementContext = element.getContext('2d');
      if (!elementContext) {
        return;
      }
      elementContext.drawImage(spatialGrid2, 0, 0, targetWidth + 1, targetHeight + 1);
      const canvasContext = canvas.getContext('2d');
      if (!canvasContext) {
        return;
      }
      this.pattern = canvasContext.createPattern(element, 'repeat');
      const inverseScale = 1 / maxScale;
      svgElement ??= document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const transformMatrix = svgElement.createSVGMatrix().scale(inverseScale, inverseScale);
      if (this.pattern?.setTransform) {
        this.pattern.setTransform(transformMatrix);
      }
      this.ready = true;
      if (onReady) {
        onReady();
      }
    });
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface AvatarDescriptor {
  layers?: SkinLayerDescriptor[];
  scale?: number;
  x?: number;
  y?: number;
}
export class Avatar {
  public backLayers: SkinLayer[];
  public frontLayers: SkinLayer[];
  public layers: SkinLayer[];
  public ready: boolean;
  public scale: number;
  public x: number;
  public y: number;
  public constructor(config: Config, baseUrl: string, descriptor: AvatarDescriptor, onReady?: () => void) {
    this.layers = [];
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.ready = false;
    Object.assign(this, descriptor);
    let i2 = 0;
    const onLayerReady = (layer: SkinLayer): void => {
      layer.rescale(this.scale);
      if (this.layers.length === ++i2) {
        this.ready = true;
        if (onReady) {
          onReady();
        }
      }
    };
    const layerDescriptors: SkinLayerDescriptor[] = descriptor.layers ?? [];
    this.layers = layerDescriptors.map((layerDescriptor: SkinLayerDescriptor) => {
      const resolvedDescriptor: SkinLayerDescriptor = { ...layerDescriptor };
      const resolvedUrl = layerDescriptor.url && `${baseUrl}${layerDescriptor.url}`;
      if (resolvedUrl) {
        resolvedDescriptor.url = resolvedUrl;
      }
      return new SkinLayer(config, resolvedDescriptor, onLayerReady);
    });
    this.frontLayers = this.layers.filter((layer: SkinLayer) => layer.level >= 1).sort((layerA: SkinLayer, layerB: SkinLayer) => layerA.level - layerB.level);
    this.backLayers = this.layers.filter((layer: SkinLayer) => layer.level < 1).sort((layerA: SkinLayer, layerB: SkinLayer) => layerB.level - layerA.level);
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface DisplayLayerEntry {
  display: Avatar;
  layer: SkinLayer;
}
export class DisplayList {
  public backLayers: DisplayLayerEntry[];
  public displays: Avatar[];
  public frontLayers: DisplayLayerEntry[];
  public maxScale: number;
  public get ready(): boolean {
    return this.displays.every((display: Avatar) => display.ready);
  }

  public constructor() {
    this.displays = [];
    this.frontLayers = [];
    this.backLayers = [];
    this.maxScale = 0;
  }

  public add(display: Avatar): void {
    this.displays.push(display);
    this.sort();
  }

  public remove(display: Avatar): void {
    this.displays = this.displays.filter((other: Avatar) => other !== display);
    this.sort();
  }

  public sort(): void {
    this.frontLayers = ([] as DisplayLayerEntry[]).concat(...this.displays.map((display: Avatar) =>
      display.frontLayers.map((layer: SkinLayer) => ({
        display,
        layer
      }))
    )).sort((entryA: DisplayLayerEntry, entryB: DisplayLayerEntry) => entryA.layer.level - entryB.layer.level);
    this.backLayers = ([] as DisplayLayerEntry[]).concat(...this.displays.map((display: Avatar) =>
      display.backLayers.map((layer: SkinLayer) => ({
        display,
        layer
      }))
    )).sort((entryA: DisplayLayerEntry, entryB: DisplayLayerEntry) => entryB.layer.level - entryA.layer.level);
    this.maxScale = Math.max(...this.frontLayers.map((entry: DisplayLayerEntry) => entry.display.scale * entry.layer.scale));
  }
}

// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface SkinColors {
  back: string;
  main: string;
  nick: string;
  particles: ParticleColor[];
  plate: string;
}
export interface SkinSource {
  avatar?: AvatarDescriptor;
  colors?: Partial<SkinColors>;
  name: string;
  pattern?: PatternSource;
}

export const COLOR_PALETTE: string[] = ['#3b5998', '#8b9dc3', '#2a4d69', '#4b86b4', '#8dbdff', '#64a1f4', '#3b7dd8', '#843b62', '#8874a3', '#8d5524', '#c68642', '#f1c27d', '#f77f00', '#fcbf49', '#ffe066', '#65737e', '#a7adba', '#4a7c59', '#1a936f', '#88d498', '#2a9d8f', '#68b0ab', '#99e550', '#6abe30', '#4b692f', '#8f974a', '#8a6f30', '#524b24', '#d62828', '#fe4a49', '#ed6a5a', '#ff3377', '#ff77aa', '#ff99cc', '#b23a48', '#fcb9b2'];
export interface AssetContent {
  color?: string;
  colors?: SkinColors;
  display?: Avatar;
  pattern?: PatternAsset;
  roundedFlag?: HTMLCanvasElement | HTMLImageElement;
}
export class Skin {
  public assets: Asset[];
  public colors: SkinColors;
  public config: Config | undefined;
  public container: DisplayList;
  public name: string | undefined;
  public pattern: null | PatternAsset;
  public user: undefined | Unit;
  public constructor() {
    this.config = undefined;
    this.user = undefined;
    this.name = undefined;
    this.assets = [];
    this.colors = {
      back: 'black',
      main: 'black',
      nick: 'black',
      particles: ['black'],
      plate: 'black'
    };
    this.pattern = null;
    this.container = new DisplayList();
  }

  public addAsset(asset: Asset): void {
    if (asset.content.colors) {
      this.colors = asset.content.colors;
    }
    if (asset.content.pattern) {
      this.pattern = asset.content.pattern;
    }
    if (asset.content.display) {
      this.container.add(asset.content.display);
    }
    this.assets.push(asset);
  }

  public removeAsset(asset: Asset): void {
    if (asset.content.display) {
      this.container.remove(asset.content.display);
    }
    const index = this.assets.indexOf(asset);
    if (index !== -1) {
      this.assets.splice(index, 1);
    }
  }
}
// `pool` is an abstract field: the base Asset never sets it (each concrete
// Subclass assigns its own narrower pool in its constructor), so the abstract
// Declaration keeps the type non-null for every reader without a base
// Class-field initializer that strict init would reject. Asset is never
// Instantiated directly (only SvgAsset / ImageAsset are), so `abstract` is
// Runtime-neutral.
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export abstract class Asset {
  public content: AssetContent;
  public loadingStarted: boolean;
  public name: string;
  public abstract pool: AssetSet;
  public ready: boolean;
  public constructor(name: string) {
    this.loadingStarted = false;
    this.name = name;
    this.content = {};
    this.ready = false;
  }

  public load(): void {
    noop();
  }
}
export class SvgAsset extends Asset {
  public override pool: ImageAssetSet;
  public source: SkinColors;
  public constructor(pool: ImageAssetSet, name: string, source: SkinColors) {
    super(name);
    this.pool = pool;
    this.source = source;
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class ImageAsset extends Asset {
  public override pool: SvgAssetSet;
  public source: SkinSource;
  public constructor(pool: SvgAssetSet, name: string, source: SkinSource) {
    super(name);
    this.pool = pool;
    this.source = source;
  }

  public override load(): void {
    if (this.loadingStarted) {
      return;
    }
    this.loadingStarted = true;
    const updateReady = (): void => {
      this.ready = !!this.content.display && this.content.display.ready && (this.content.pattern ? this.content.pattern.ready : true);
    };
    const {
      source
    } = this;
    if (source.colors) {
      this.content.colors = { back: '#000000', main: '#000000', nick: '#000000', particles: ['#000000'], plate: '#000000', ...source.colors };
    }
    if (source.pattern) {
      this.content.pattern = new PatternAsset(ensureNonNullable(this.pool.config), this.pool.view, this.pool.path, source.pattern, updateReady);
    }
    if (source.avatar) {
      this.content.display = new Avatar(ensureNonNullable(this.pool.config), this.pool.path, source.avatar, updateReady);
    }
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class AssetSet {
  public assets: Asset[];
  public config: Config | undefined;
  public name: string;
  public constructor(name: string) {
    this.config = undefined;
    this.name = name;
    this.assets = [];
  }

  public get(name?: string, requireReady?: boolean): Asset | null {
    const asset = this.assets.find((candidate: Asset) => candidate.name === name && (requireReady ? candidate.ready : true));
    if (!asset) {
      return null;
    }
    asset.load();
    return asset;
  }
}
export const BACK_VALUE_SCALE = 0.75;
export const NICK_VALUE_SCALE = 0.5;
export const DARK_PLATE_BRIGHTEN_FACTOR = 2;
export const PLATE_VALUE_THRESHOLD = 50;
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class ImageAssetSet extends AssetSet {
  public constructor(config: Config) {
    super('colors');
    this.config = config;
    this.add(COLOR_PALETTE);
  }

  public add(colors: string[]): void {
    const {
      config
    } = this;
    this.assets.push(...colors.map((color: string) => {
      const rgb = hexToRgb(color);
      const hsv = rgbToHsv(rgb);
      const backHsv = scaleValue(hsv, BACK_VALUE_SCALE);
      const back = hsvToHex(backHsv);
      const nickHsv = scaleValue(hsv, NICK_VALUE_SCALE);
      const nick = hsvToHex(nickHsv);
      const darkPlateHsv = brighten(hsv, DARK_PLATE_BRIGHTEN_FACTOR);
      const darkPlate = hsvToHex(darkPlateHsv);
      const skinColors = {
        back,
        main: color,
        nick,
        /* eslint-disable no-magic-numbers -- HSV value levels (100..20) for the particle color ramp. */
        particles: [hsvToHex(setValue(hsv, 100)), hsvToHex(setValue(hsv, 90)), hsvToHex(setValue(hsv, 80)), hsvToHex(setValue(hsv, 70)), hsvToHex(setValue(hsv, 60)), hsvToHex(setValue(hsv, 50)), hsvToHex(setValue(hsv, 40)), hsvToHex(setValue(hsv, 30)), hsvToHex(setValue(hsv, 20))],
        /* eslint-enable no-magic-numbers -- end of the particle color-ramp value levels. */
        plate: hsv.v > PLATE_VALUE_THRESHOLD ? nick : darkPlate
      };
      const svgAsset = new SvgAsset(this, color, skinColors);
      svgAsset.content.colors = skinColors;
      if (config) {
        svgAsset.content.display = new Avatar(config, '', {
          layers: [{
            src: createColorTile(skinColors.nick, skinColors.nick)
          }, {
            level: 1,
            src: createColorTile(skinColors.main, skinColors.back)
          }]
        });
      }
      svgAsset.ready = true;
      svgAsset.name = color;
      return svgAsset;
    }));
  }

  public loadAsset<T>(asset: T): T {
    return asset;
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export class SvgAssetSet extends AssetSet {
  public path: string;
  public view: HTMLCanvasElement;
  public constructor(config: Config, canvas: HTMLCanvasElement, path: string, sources: SkinSource[], shouldPreload = false) {
    super('classic');
    this.config = config;
    this.view = canvas;
    this.path = path;
    this.add(sources);
    if (shouldPreload) {
      for (const asset of this.assets) {
        asset.load();
      }
    }
  }

  public add(sources: SkinSource[]): void {
    this.assets.push(...sources.map((source: SkinSource) => new ImageAsset(this, source.name, source)));
  }
}
export const COLOR_TILE_SIZE = 100;
export const COLOR_TILE_INSET = 10;
export const COLOR_TILE_INNER_SIZE = 80;
export function createColorTile(mainColor: string, backColor: string): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = COLOR_TILE_SIZE;
  element.height = COLOR_TILE_SIZE;
  const context = element.getContext('2d');
  assertNonNullable(context);
  context.fillStyle = backColor;
  context.fillRect(0, 0, COLOR_TILE_SIZE, COLOR_TILE_SIZE);
  context.fillStyle = mainColor;
  context.fillRect(COLOR_TILE_INSET, COLOR_TILE_INSET, COLOR_TILE_INNER_SIZE, COLOR_TILE_INNER_SIZE);
  return element;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
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
