/**
 * @file
 *
 * Maps the arena's coordinates to a page overlay's CSS pixels the way the game's camera does, for the canvases drawn
 * over the game (the autopilot's overlay, the ghost). They are their own canvases, so the in-game recorder, which
 * records the game's canvas, never sees them.
 */

import type { Game } from './engine.ts';

import { REFERENCE_DIAGONAL_SQUARED } from './engine.ts';

export interface PlanePoint {
  readonly x: number;
  readonly y: number;
}

const HALF = 0.5;

/**
 * The camera's mapping from the arena to CSS pixels: centred on `origin`, at the game's zoom.
 *
 * @param game - The game.
 * @param origin - The camera's centre; `game.origin` is where the last frame was drawn from.
 * @returns The mapping.
 */
export function worldToScreen(game: Game, origin: PlanePoint): (point: PlanePoint) => PlanePoint {
  const { clientHeight, clientWidth } = game.view;
  const viewWidth = Math.trunc(clientWidth * game.quality);
  const viewHeight = Math.trunc(clientHeight * game.quality);
  const scale = game.scale * Math.hypot(viewWidth, viewHeight) / Math.sqrt(REFERENCE_DIAGONAL_SQUARED);
  const toCss = viewWidth > 0 ? clientWidth / viewWidth : 1;
  return (point: PlanePoint): PlanePoint => ({
    x: ((point.x - origin.x) * scale + viewWidth * HALF) * toCss,
    y: ((point.y - origin.y) * scale + viewHeight * HALF) * toCss
  });
}
