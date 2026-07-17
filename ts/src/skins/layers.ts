import type { Config } from '../engine.ts';

import { PERCENT_MAX } from '../shared/constants.ts';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve: (value: HTMLImageElement) => void) => {
    const element = document.createElement('img');
    element.src = src;
    element.onload = (): void => {
      resolve(element);
    };
  });
}

// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
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
