import type { Config } from '../engine.ts';
import type { Unit } from '../entities/units.ts';
import type { ParticleColor } from '../particles.ts';
import type { Asset } from './asset.ts';
import type {
  Avatar,
  AvatarDescriptor,
  PatternAsset,
  PatternSource
} from './layers.ts';

import { DisplayList } from './layers.ts';

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

// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
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
