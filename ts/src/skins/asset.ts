import type { Config } from '../engine.ts';
import type {
  AssetContent,
  SkinColors,
  SkinSource
} from './skin.ts';

import {
  brighten,
  hexToRgb,
  hsvToHex,
  rgbToHsv,
  scaleValue,
  setValue
} from '../shared/color-utils.ts';
import { noop } from '../shared/noop.ts';
import {
  assertNonNullable,
  ensureNonNullable
} from '../type-guards.ts';
import {
  Avatar,
  PatternAsset
} from './layers.ts';

export const COLOR_PALETTE: string[] = ['#3b5998', '#8b9dc3', '#2a4d69', '#4b86b4', '#8dbdff', '#64a1f4', '#3b7dd8', '#843b62', '#8874a3', '#8d5524', '#c68642', '#f1c27d', '#f77f00', '#fcbf49', '#ffe066', '#65737e', '#a7adba', '#4a7c59', '#1a936f', '#88d498', '#2a9d8f', '#68b0ab', '#99e550', '#6abe30', '#4b692f', '#8f974a', '#8a6f30', '#524b24', '#d62828', '#fe4a49', '#ed6a5a', '#ff3377', '#ff77aa', '#ff99cc', '#b23a48', '#fcb9b2'];

// `pool` is an abstract field: the base Asset never sets it (each concrete
// Subclass assigns its own narrower pool in its constructor), so the abstract
// Declaration keeps the type non-null for every reader without a base
// Class-field initializer that strict init would reject. Asset is never
// Instantiated directly (only SvgAsset / ImageAsset are), so `abstract` is
// Runtime-neutral.

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
