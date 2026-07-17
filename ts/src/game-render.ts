import type {
  Config,
  Game,
  MetricEvents
} from './engine.ts';
import type { Trail } from './entities/territory-trail.ts';
import type {
  City,
  Unit
} from './entities/units.ts';
import type {
  Particle,
  TextParticle
} from './particles.ts';
import type { Asset } from './skins/asset.ts';
import type {
  Avatar,
  DisplayLayerEntry,
  DisplayList,
  SkinLayer
} from './skins/layers.ts';
import type { Skin } from './skins/skin.ts';

import {
  DOUBLE_FACTOR,
  HALF_DIVISOR,
  MAX_METRICS_SAMPLES
} from './engine.ts';
import { TOP_LIST_RANK_LIMIT } from './entities/units.ts';
import { Vector } from './geometry/vector.ts';
import {
  FULL_TURN,
  IMAGE_CENTER_DIVISOR,
  QUARTER_TURN
} from './shared/constants.ts';
import {
  assertNonNullable,
  ensureNonNullable
} from './type-guards.ts';

export const UNIT_NAME_FONT_SIZE = 24;
export const UNIT_NAME_OUTLINE_WIDTH = 4;
export const UNIT_NAME_ZOOM_NUDGE = 1.001;
export const RECORDING_LABEL_BLINK_MODULO = 2;
export const UNIT_NAME_OFFSET_Y = -12;
export const UNIT_NAME_LINE_WIDTH_DIVISOR = 4;
export const UNIT_NAME_NICK_SHADOW_DIVISOR = 3;
export const UNIT_NAME_SHADOW_OFFSET = 2;
export const CROWN_BASE_OFFSET = 24;
export const CROWN_ZOOM_OFFSET = -10;
export const CROWN_OFFSET_A = -4;
export const CROWN_OFFSET_B = -12;
export const DEGREES_TO_RADIANS = 0.0174533;
export const TRAIL_UNDERLAY_WIDTH_EXTRA = 2;
export const AVATAR_VIEW_PADDING_FACTOR = 4;
export const UNIT_NAME_VIEW_PADDING_FACTOR = 20;
export const TRAIL_ALPHA = 0.6;
export const ARENA_BORDER_OFFSET_FACTOR = 3;
export const MINIMAP_CALC_MULT_A = 8;
export const MINIMAP_CALC_MULT_B = 3;
export const MINIMAP_STROKE_WIDTH_FACTOR = 3;
export const LEADERBOARD_ROW_HEIGHT_FACTOR = 1.3;
export const LEADERBOARD_ROW_COUNT = 8;
export const LEADERBOARD_BAR_GAP_FACTOR = 0.05;
export const LEADERBOARD_SHADOW_OFFSET_FACTOR = 3;
export const LEADERBOARD_FLAG_HEIGHT_FACTOR = 0.8;
export const LEADERBOARD_FLAG_OFFSET_DIVISOR = 4;
export const TEXT_BASELINE_NUDGE_FACTOR = 1.1;
export const LEADERBOARD_PLAYER_ROW_INDEX = 6;
export const SCORE_BAR_MIN_FILL = 0.25;
export const SCORE_BAR_FILL_RANGE = 0.75;
export const KILL_COUNT_Y_OFFSET = 4;
export const KILL_COUNT_BG_WIDTH_FACTOR = 1.5;
export const KILL_COUNT_ICON_X_FACTOR = 1.4;
export const KILL_COUNT_TEXT_X_FACTOR = 1.25;
export const KILL_COUNT_TEXT_Y_FACTOR = 0.03;
export const QUEST_NOTIFICATION_PADDING_FACTOR = 5;
export const QUEST_NOTIFICATION_SHADOW_BLUR = 10;
export const DEBUG_VIEW_SCALE = 0.5;
export const DEBUG_OVERLAY_START_Y = 160;
export const DEBUG_OVERLAY_INDENT_X = 10;
export const DEBUG_OVERLAY_INDENT_STEP = 20;
export const DEBUG_OVERLAY_LINE_HEIGHT = 20;
export const DEBUG_LEVEL_DECIMAL_DIGITS = 3;
export const DEBUG_GRAPH_WIDTH_DIVISOR = 3;
export const DEBUG_GRAPH_HEIGHT = 100;
export const TARGET_FRAME_TIME_MILLISECONDS = 16.67;
export const DEBUG_GRAPH_HEADROOM_FACTOR = 1.1;
export const DEBUG_GRAPH_EVENT_LINE_WIDTH = 0.5;
let cachedGradient: CanvasGradient | undefined;
export interface SizedGridLike {
  height: number;
  width: number;
}
export function getVerticalGradient(context: CanvasRenderingContext2D, spatialGrid2: SizedGridLike, topColor: string, bottomColor: string): CanvasGradient | undefined {
  cachedGradient = context.createLinearGradient(spatialGrid2.width / HALF_DIVISOR, 0, spatialGrid2.width / HALF_DIVISOR, spatialGrid2.height);
  cachedGradient.addColorStop(0, topColor);
  cachedGradient.addColorStop(1, bottomColor);
  return cachedGradient;
}
export function strokePath(context: CanvasRenderingContext2D, path: Path2D, strokeColor: string, lineWidth: number): void {
  context.strokeStyle = strokeColor;
  context.lineWidth = lineWidth;
  context.stroke(path);
}
export function strokeTrail(context: CanvasRenderingContext2D, strokeStyle: CanvasPattern | string, trail: Trail, _unused: Vector, lineWidth: number): void {
  if (trail.polyline.segments.length) {
    context.lineWidth = lineWidth;
    context.strokeStyle = strokeStyle;
    context.stroke(trail.polyline.path);
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function drawUnitName(context: CanvasRenderingContext2D, unit: Unit, zoom: number, scale: number, fontFamily: string): void {
  const {
    devicePixelRatio
  } = window;
  const fontSize = scale * UNIT_NAME_FONT_SIZE / devicePixelRatio;
  const outlineWidth = scale * UNIT_NAME_OUTLINE_WIDTH / devicePixelRatio;
  context.save();
  context.translate(unit.position.x, unit.position.y);
  context.scale(UNIT_NAME_ZOOM_NUDGE / zoom, UNIT_NAME_ZOOM_NUDGE / zoom);
  context.font = `${String(fontSize)}px ${fontFamily}`;
  context.textAlign = 'center';
  context.textBaseline = 'bottom';
  let name = unit.name;
  if (unit === unit.game.player) {
    if (new Date().getSeconds() % RECORDING_LABEL_BLINK_MODULO === 0) {
      if (unit.game.recording) {
        name = 'Recording';
      } else if (unit.game.replaying) {
        name = 'Replaying';
      }
    }
  }
  const textOffsetY = Math.trunc(zoom * UNIT_NAME_OFFSET_Y);
  const outlineColor = '#363331';
  context.lineWidth = outlineWidth / UNIT_NAME_LINE_WIDTH_DIVISOR;
  context.strokeStyle = outlineColor;
  context.shadowColor = outlineColor;
  context.shadowBlur = outlineWidth / HALF_DIVISOR;
  context.strokeText(name, 0, textOffsetY);
  context.fillStyle = outlineColor;
  context.fillText(name, UNIT_NAME_SHADOW_OFFSET, textOffsetY + UNIT_NAME_SHADOW_OFFSET);
  let nameColor = '#dddddd';
  const shieldAsset = unit.skin.assets.find((asset: Asset) => asset.pool.name === 'shields');
  if (shieldAsset) {
    nameColor = ensureNonNullable(shieldAsset.content.color);
  }
  context.fillStyle = nameColor;
  context.shadowColor = nameColor;
  context.shadowBlur = outlineWidth / UNIT_NAME_NICK_SHADOW_DIVISOR;
  context.fillText(name, 0, textOffsetY);
  context.restore();
}
/* eslint-disable no-magic-numbers, no-implicit-coercion -- crown glyph path geometry: unnameable coordinate data. */
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function createCrownPath(): Path2D {
  const path2D = new Path2D();
  const size = 5;
  path2D.moveTo(size * -3, size * -3);
  path2D.lineTo(size * -1, size * -1);
  path2D.lineTo(size * 0, size * -3);
  path2D.lineTo(size * 1, size * -1);
  path2D.lineTo(size * 3, size * -3);
  path2D.lineTo(size * 2, size * 1);
  path2D.lineTo(size * -2, size * 1);
  path2D.closePath();
  return path2D;
}
/* eslint-enable no-magic-numbers, no-implicit-coercion -- crown glyph path geometry: unnameable coordinate data. */
export const crownPath = createCrownPath();
export function drawCrown(context: CanvasRenderingContext2D, unit: Unit, zoom: number, scale: number): void {
  const {
    devicePixelRatio
  } = window;
  const verticalOffset = scale * CROWN_BASE_OFFSET / devicePixelRatio;
  context.save();
  context.translate(unit.position.x, unit.position.y);
  context.scale(1 / (zoom * devicePixelRatio), 1 / (zoom * devicePixelRatio));
  context.fillStyle = '#ffff00';
  context.strokeStyle = '#ff8800';
  context.lineJoin = 'round';
  context.lineWidth = 1;
  context.translate(0, zoom * CROWN_ZOOM_OFFSET * devicePixelRatio);
  context.translate(0, -verticalOffset * devicePixelRatio);
  context.scale(scale, scale);
  context.translate(0, CROWN_OFFSET_A);
  context.translate(0, CROWN_OFFSET_B);
  context.fill(crownPath);
  context.stroke(crownPath);
  context.restore();
}
/* eslint-disable no-magic-numbers, no-implicit-coercion -- face glyph path geometry: unnameable coordinate data. */
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function createFacePath(): Path2D {
  const path2D = new Path2D();
  const size = 1.6;
  path2D.moveTo(size * 0, size * -7);
  path2D.lineTo(size * 5, size * -6);
  path2D.lineTo(size * 7, size * -3);
  path2D.lineTo(size * 6, size * 2);
  path2D.lineTo(size * 4, size * 3);
  path2D.lineTo(size * 3, size * 6);
  path2D.lineTo(size * 0, size * 7);
  path2D.lineTo(size * -3, size * 6);
  path2D.lineTo(size * -4, size * 3);
  path2D.lineTo(size * -6, size * 2);
  path2D.lineTo(size * -7, size * -3);
  path2D.lineTo(size * -5, size * -6);
  path2D.closePath();
  path2D.arc(size * -3, size * -1, size * 2, 0, Math.PI * 2, true);
  path2D.closePath();
  path2D.arc(size * 3, size * -1, size * 2, 0, Math.PI * 2, true);
  path2D.closePath();
  path2D.moveTo(size * 0, size * 1);
  path2D.lineTo(size * -2, size * 3);
  path2D.lineTo(size * 0, size * 4);
  path2D.lineTo(size * 2, size * 3);
  path2D.closePath();
  return path2D;
}
/* eslint-enable no-magic-numbers, no-implicit-coercion -- face glyph path geometry: unnameable coordinate data. */
export const facePath = createFacePath();
export function drawFaceIcon(context: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  context.save();
  context.fillStyle = '#ffffffcc';
  context.translate(x, y);
  context.scale(scale, scale);
  context.fill(facePath);
  context.restore();
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface AvatarBearer {
  direction?: number;
  position: Vector;
  skin: Skin;
  target?: null | Vector;
}
export function drawSkinLayer(config: Config, context: CanvasRenderingContext2D, unit: AvatarBearer, skinLayer: Avatar, skinLayer2: SkinLayer): void {
  const {
    trackWidth
  } = config;
  if (skinLayer2.image) {
    const imageWidth = skinLayer2.image.width;
    const imageHeight = skinLayer2.image.height;
    const imageScale = trackWidth * skinLayer.scale * skinLayer2.scale / imageWidth;
    context.save();
    context.translate(unit.position.x, unit.position.y - config.baseHeight * skinLayer2.level);
    context.rotate(ensureNonNullable(unit.direction) + QUARTER_TURN);
    context.translate((skinLayer.x + skinLayer2.x) * trackWidth, (skinLayer.y + skinLayer2.y) * trackWidth);
    let rotation = 0;
    if (skinLayer2.direction === 'target') {
      const point = (unit.target ?? new Vector(0, 0)).clone().sub(unit.position);
      const targetAngle = Math.atan2(point.y, point.x);
      rotation += targetAngle - ensureNonNullable(unit.direction);
    }
    if (skinLayer2.direction === 'billboard') {
      rotation += -ensureNonNullable(unit.direction) - QUARTER_TURN;
    }
    if (skinLayer2.rotation) {
      rotation += skinLayer2.rotation * DEGREES_TO_RADIANS;
    }
    if (rotation) {
      context.rotate(rotation);
    }
    context.scale(imageScale, imageScale);
    context.translate(imageWidth * -skinLayer2.pivot.x, imageHeight * -skinLayer2.pivot.y);
    context.drawImage(skinLayer2.image, 0, 0);
    context.restore();
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function drawAvatarLayers(config: Config, context: CanvasRenderingContext2D, unit: AvatarBearer, avatar: DisplayList, isFront: boolean): void {
  const list4 = isFront ? avatar.frontLayers : avatar.backLayers;
  list4.forEach((layerEntry: DisplayLayerEntry) => {
    drawSkinLayer(config, context, unit, layerEntry.display, layerEntry.layer);
  });
}
export function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, cornerRadii: [number, number, number, number], strokeWidth?: number): void {
  const [topLeftRadius, topRightRadius, bottomRightRadius, bottomLeftRadius] = cornerRadii;
  context.beginPath();
  context.moveTo(x + topLeftRadius, y);
  context.lineTo(x + width - topRightRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + topRightRadius);
  context.lineTo(x + width, y + height - bottomRightRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - bottomRightRadius, y + height);
  context.lineTo(x + bottomLeftRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - bottomLeftRadius);
  context.lineTo(x, y + topLeftRadius);
  context.quadraticCurveTo(x, y, x + topLeftRadius, y);
  context.closePath();
  context.fill();
  if (strokeWidth) {
    context.strokeStyle = '#00000099';
    context.lineWidth = strokeWidth;
    context.stroke();
  }
}
export function fillPath(context: CanvasRenderingContext2D, path: Path2D, fillStyle: CanvasPattern | string): void {
  context.fillStyle = fillStyle;
  context.fill(path);
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
interface Bounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface HasBounds {
  bounds: Bounds;
}
interface RenderContext {
  backHeight: number;
  barHeight: number;
  barWidth: number;
  boundsInView: (target: HasBounds, padding?: number) => boolean;
  calcMult: (a: number, b: number) => number;
  ctx: CanvasRenderingContext2D | null;
  devicePixelRatio: number;
  fontSize: number;
  game: Game;
  halfBarHeight: number;
  halfBarWidth: number;
  origin: Vector;
  padding: number;
  pointInView: (point: Vector, padding?: number) => boolean;
  scale: number;
  scaler: number;
  strokeWidth: number;
  uiFont: string;
  view: HTMLCanvasElement;
  viewHeight: number;
  viewScreenHeight: number;
  viewScreenWidth: number;
  viewWidth: number;
}
export function drawBaseFills(renderContext: RenderContext): void {
  const {
    boundsInView,
    game
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    trackWidth
  } = game.config;
  game.units.forEach((unit: Unit) => {
    if (boundsInView({ bounds: ensureNonNullable(unit.base.polygon.bounds) }, trackWidth) || game.debugView) {
      fillPath(ctx, unit.base.polygon.path, unit.skin.pattern?.pattern ?? unit.skin.colors.main);
    }
  });
}
export function drawTrailUnderlays(renderContext: RenderContext): void {
  const {
    boundsInView,
    game
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    trackWidth
  } = game.config;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'destination-out';
  game.units.forEach((unit: Unit) => {
    const {
      start
    } = unit.track.polyline;
    if (start) {
      if (boundsInView(unit.track.polyline, trackWidth)) {
        strokeTrail(ctx, unit.skin.colors.main, unit.track, unit.position, trackWidth);
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.clip(unit.base.polygon.path);
        strokeTrail(ctx, unit.skin.pattern?.pattern ?? unit.skin.colors.main, unit.track, unit.position, trackWidth + TRAIL_UNDERLAY_WIDTH_EXTRA);
        ctx.restore();
      }
    }
  });
  ctx.restore();
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function drawAvatarFrontLayers(renderContext: RenderContext): void {
  const {
    game,
    pointInView
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    trackWidth
  } = game.config;
  game.units.forEach((city: Unit) => {
    if (pointInView(city.position, trackWidth * AVATAR_VIEW_PADDING_FACTOR)) {
      drawAvatarLayers(game.config, ctx, city, city.skin.container, true);
    }
  });
}
export function drawUnitNames(renderContext: RenderContext): void {
  const {
    game,
    pointInView,
    scale,
    scaler
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    font,
    trackWidth
  } = game.config;
  game.units.forEach((unit: Unit) => {
    if (pointInView(unit.position, trackWidth * UNIT_NAME_VIEW_PADDING_FACTOR) || game.debugView) {
      drawUnitName(ctx, unit, scale, scaler, font);
    }
  });
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function drawAvatarBackLayers(renderContext: RenderContext): void {
  const {
    game,
    pointInView
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    trackWidth
  } = game.config;
  game.units.forEach((city: Unit) => {
    if (pointInView(city.position, trackWidth * AVATAR_VIEW_PADDING_FACTOR)) {
      drawAvatarLayers(game.config, ctx, city, city.skin.container, false);
    }
  });
}
export function drawTrails(renderContext: RenderContext): void {
  const {
    boundsInView,
    game
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    trackWidth
  } = game.config;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = TRAIL_ALPHA;
  game.units.forEach((unit: Unit) => {
    if (unit.in !== unit.base) {
      if (boundsInView(unit.track.polyline, trackWidth)) {
        strokeTrail(ctx, game.tailRecovered && unit === game.player ? '#f00' : unit.skin.colors.main, unit.track, unit.position, trackWidth);
      }
    }
  });
  ctx.restore();
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function drawBaseBacks(renderContext: RenderContext): void {
  const {
    boundsInView,
    game
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    trackWidth
  } = game.config;
  game.units.forEach((unit: Unit) => {
    if (boundsInView({ bounds: ensureNonNullable(unit.base.polygon.bounds) }, trackWidth)) {
      fillPath(ctx, unit.base.polygon.path, unit.skin.colors.back);
    }
  });
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function drawArenaBackground(renderContext: RenderContext): void {
  const {
    game,
    viewScreenHeight,
    viewScreenWidth
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    arenaColor,
    backgroundBottomColor,
    backgroundTopColor,
    baseHeight,
    borderColor
  } = game.config;
  fillPath(ctx, game.border.polygon.path, arenaColor);
  ctx.translate(0, baseHeight * ARENA_BORDER_OFFSET_FACTOR);
  fillPath(ctx, game.border.polygon.path, borderColor);
  ctx.translate(0, baseHeight * -ARENA_BORDER_OFFSET_FACTOR);
  const backgroundGradient = getVerticalGradient(ctx, game.space, backgroundTopColor, backgroundBottomColor);
  if (backgroundGradient) {
    ctx.fillStyle = backgroundGradient;
  }
  ctx.fillRect(viewScreenWidth / -HALF_DIVISOR, viewScreenHeight / -HALF_DIVISOR, game.space.width + viewScreenWidth, game.space.height + viewScreenHeight);
}
export function drawParticles(renderContext: RenderContext): void {
  const {
    game,
    pointInView
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    trackWidth
  } = game.config;
  ctx.save();
  game.particles.forEach((particle: Particle) => {
    if (particle.time > 0 && pointInView(particle.position, trackWidth)) {
      particle.draw(ctx);
    }
  });
  ctx.restore();
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function drawLabels(renderContext: RenderContext): void {
  const {
    game,
    scale,
    scaler
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    font
  } = game.config;
  ctx.scale(1 / scale, 1 / scale);
  game.labels.forEach((label: TextParticle) => {
    label.draw(ctx, font, scale, scaler);
  });
  ctx.scale(scale, scale);
}
export function drawLeaderMarker(renderContext: RenderContext): void {
  const {
    game,
    scale,
    scaler
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const topUnit = game.units[0];
  if (topUnit) {
    drawCrown(ctx, topUnit, scale, scaler);
  }
}
export function drawMinimap(renderContext: RenderContext): void {
  const {
    calcMult,
    game,
    padding,
    scaler,
    viewScreenHeight,
    viewScreenWidth
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  assertNonNullable(game.player);
  const minimapSize = viewScreenWidth / calcMult(MINIMAP_CALC_MULT_A, MINIMAP_CALC_MULT_B);
  const minimapStrokeWidth = game.space.width / minimapSize * scaler * MINIMAP_STROKE_WIDTH_FACTOR;
  ctx.save();
  ctx.translate(viewScreenWidth - padding - minimapSize, viewScreenHeight - padding - minimapSize);
  ctx.scale(minimapSize / game.space.width, minimapSize / game.space.height);
  fillPath(ctx, game.border.polygon.path, '#c2d6cdaa');
  fillPath(ctx, game.player.base.polygon.path, game.player.skin.colors.main);
  strokePath(ctx, game.player.base.polygon.path, game.player.skin.colors.back, minimapStrokeWidth / HALF_DIVISOR);
  strokeTrail(ctx, game.player.skin.colors.back, game.player.track, game.player.position, minimapStrokeWidth / HALF_DIVISOR);
  const borderColor = game.units.some((unit: Unit) => !game.isPlayer(unit) && unit.in === ensureNonNullable(game.player).base) ? '#ff0000' : '#00000099';
  strokePath(ctx, game.border.polygon.path, borderColor, minimapStrokeWidth);
  ctx.beginPath();
  ctx.arc(game.player.position.x, game.player.position.y, minimapStrokeWidth, 0, FULL_TURN);
  ctx.fillStyle = game.player.skin.colors.nick;
  ctx.fill();
  const flagAsset = game.player.skin.assets.find((asset: Asset) => asset.pool.name === 'flags');
  const spatialGrid2 = flagAsset?.content.roundedFlag;
  if (spatialGrid2) {
    game.player.cities.forEach((city: City) => {
      ctx.save();
      ctx.translate(city.position.x, city.position.y);
      ctx.scale(DOUBLE_FACTOR, DOUBLE_FACTOR);
      ctx.drawImage(spatialGrid2, -spatialGrid2.width / IMAGE_CENTER_DIVISOR, -spatialGrid2.height / IMAGE_CENTER_DIVISOR);
      ctx.restore();
    });
  }
  ctx.restore();
}
let spatialGrid: HTMLCanvasElement | null = null;
window.addEventListener('resize', () => {
  spatialGrid = null;
}, false);
export function drawLeaderboard(renderContext: RenderContext): void {
  const {
    devicePixelRatio
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  if (!spatialGrid) {
    spatialGrid = document.createElement('canvas');
    spatialGrid.width = Math.trunc(renderContext.barWidth);
    spatialGrid.height = Math.trunc(renderContext.barHeight * LEADERBOARD_ROW_HEIGHT_FACTOR * LEADERBOARD_ROW_COUNT);
  }
  if (renderContext.game.topListChanged) {
    renderContext.game.topListChanged = false;
    const context = spatialGrid.getContext('2d');
    if (context) {
      context.save();
      context.clearRect(0, 0, spatialGrid.width, spatialGrid.height);
      context.translate(-ctx.canvas.width + spatialGrid.width, 0);
      context.scale(1 / devicePixelRatio, 1 / devicePixelRatio);
      drawLeaderboardRows(context, renderContext);
      context.restore();
    }
  }
  ctx.save();
  ctx.resetTransform();
  ctx.drawImage(spatialGrid, ctx.canvas.width - spatialGrid.width, 0);
  ctx.restore();
}
export function drawLeaderboardRows(context: CanvasRenderingContext2D, renderContext: RenderContext): void {
  const {
    backHeight,
    barHeight,
    barWidth,
    game,
    halfBarHeight,
    halfBarWidth,
    padding,
    strokeWidth,
    uiFont,
    viewScreenWidth
  } = renderContext;
  let previousBarWidth: number | undefined;
  const topUnit = game.units[0];
  const topScore = topUnit && ensureNonNullable(topUnit.schemes).scores();
  let isPlayerListed = false;
  for (let i2 = 0; i2 < TOP_LIST_RANK_LIMIT; i2++) {
    const unit = game.units[i2];
    if (unit) {
      if (game.isPlayer(unit)) {
        isPlayerListed = true;
      }
      drawLeaderboardRow(unit, i2 + 1, i2, ensureNonNullable(topScore));
    }
  }
  if (!isPlayerListed && game.player && !game.player.death) {
    const playerIndex = game.units.findIndex((unit: Unit) => game.isPlayer(unit));
    drawLeaderboardRow(game.player, playerIndex + 1, LEADERBOARD_PLAYER_ROW_INDEX, ensureNonNullable(topScore));
  }
  function drawLeaderboardRow(unit: Unit, rank: number, rowIndex: number, maxScore: number): void {
    const rowY = padding + rowIndex * (barHeight * LEADERBOARD_ROW_HEIGHT_FACTOR);
    const score = ensureNonNullable(unit.schemes).scores();
    let scoreBarWidth = halfBarWidth * (score / maxScore);
    if (previousBarWidth && scoreBarWidth > previousBarWidth - halfBarWidth * LEADERBOARD_BAR_GAP_FACTOR) {
      scoreBarWidth = previousBarWidth - halfBarWidth * LEADERBOARD_BAR_GAP_FACTOR;
    }
    previousBarWidth = scoreBarWidth;
    const barRightOffset = halfBarWidth + scoreBarWidth;
    let barX = viewScreenWidth - barRightOffset;
    const cornerRadii: [number, number, number, number] = [halfBarHeight, 0, 0, halfBarHeight];
    context.fillStyle = '#00000022';
    drawRoundedRect(context, barX + backHeight, rowY + backHeight * LEADERBOARD_SHADOW_OFFSET_FACTOR, barWidth, barHeight, cornerRadii);
    context.fillStyle = unit.skin.colors.back;
    drawRoundedRect(context, barX, rowY + backHeight, barWidth, barHeight, cornerRadii, strokeWidth);
    context.fillStyle = unit.skin.colors.main;
    drawRoundedRect(context, barX, rowY, barWidth, barHeight, cornerRadii, strokeWidth);
    const flagAsset = unit.skin.assets.find((asset: Asset) => asset.pool.name === 'flags');
    const flagImage = flagAsset?.content.roundedFlag;
    if (flagImage) {
      const flagHeight = barHeight * LEADERBOARD_FLAG_HEIGHT_FACTOR;
      const flagOffsetX = barHeight / LEADERBOARD_FLAG_OFFSET_DIVISOR;
      const flagScale = flagHeight / flagImage.height;
      context.save();
      context.translate(barX + flagOffsetX, rowY + barHeight / HALF_DIVISOR);
      context.scale(flagScale, flagScale);
      context.drawImage(flagImage, 0, -flagImage.height / HALF_DIVISOR);
      context.restore();
      barX += flagHeight;
    }
    context.fillStyle = unit.skin.colors.plate;
    context.font = uiFont;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(`${String(rank)} – ${ensureNonNullable(unit.schemes).print()} ${unit.name}`, barX + halfBarHeight, rowY + halfBarHeight * TEXT_BASELINE_NUDGE_FACTOR);
  }
}
export function renderScoreBar(renderContext: RenderContext): void {
  const {
    backHeight,
    barHeight,
    barWidth,
    game,
    halfBarHeight,
    padding,
    strokeWidth,
    uiFont
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const {
    player
  } = game;
  assertNonNullable(player);
  ctx.fillStyle = '#00000022';
  drawRoundedRect(ctx, 0, padding, barWidth, barHeight + backHeight, [0, (barHeight + backHeight) / HALF_DIVISOR, (barHeight + backHeight) / HALF_DIVISOR, 0]);
  const scoreRatio = game.best ? Math.min(1, ensureNonNullable(player.schemes).scores() / game.best) : 1;
  const fillWidth = barWidth * (SCORE_BAR_MIN_FILL + scoreRatio * SCORE_BAR_FILL_RANGE);
  ctx.fillStyle = player.skin.colors.back;
  drawRoundedRect(ctx, 0, padding + backHeight, fillWidth, barHeight, [0, halfBarHeight, halfBarHeight, 0], strokeWidth);
  ctx.fillStyle = player.skin.colors.main;
  drawRoundedRect(ctx, 0, padding, fillWidth, barHeight, [0, halfBarHeight, halfBarHeight, 0], strokeWidth);
  ctx.fillStyle = player.skin.colors.plate;
  ctx.font = uiFont;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(ensureNonNullable(player.schemes).print(), halfBarHeight, padding + halfBarHeight * TEXT_BASELINE_NUDGE_FACTOR);
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function renderBestScore(renderContext: RenderContext): void {
  const {
    backHeight,
    barHeight,
    game,
    padding,
    uiFont
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  ctx.font = uiFont;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const bestText = `${game.language.bestTxt} ${ensureNonNullable(ensureNonNullable(game.player).schemes).print(game.best ?? undefined)}`;
  ctx.fillStyle = '#00000066';
  ctx.fillText(bestText, padding / HALF_DIVISOR, padding + barHeight + backHeight + padding / HALF_DIVISOR);
}
export function renderKillCount(renderContext: RenderContext): void {
  const {
    backHeight,
    barHeight,
    fontSize,
    game,
    halfBarHeight,
    padding,
    scaler,
    uiFont
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  const killsY = padding + barHeight + backHeight + fontSize + padding / HALF_DIVISOR + KILL_COUNT_Y_OFFSET;
  ctx.font = uiFont;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const killsText = `x${String(ensureNonNullable(game.player).statistics.kills)}`;
  ctx.fillStyle = '#00000088';
  drawRoundedRect(ctx, 0, killsY, barHeight * KILL_COUNT_BG_WIDTH_FACTOR + ctx.measureText(killsText).width, barHeight, [0, halfBarHeight, halfBarHeight, 0]);
  drawFaceIcon(ctx, barHeight * KILL_COUNT_ICON_X_FACTOR / HALF_DIVISOR, killsY + barHeight / HALF_DIVISOR, scaler);
  ctx.fillStyle = '#ffffffcc';
  ctx.fillText(killsText, barHeight * KILL_COUNT_TEXT_X_FACTOR, killsY + halfBarHeight + barHeight * KILL_COUNT_TEXT_Y_FACTOR);
}
export function renderQuestNotification(renderContext: RenderContext): void {
  const {
    backHeight,
    barHeight,
    fontSize,
    game,
    padding,
    uiFont,
    viewScreenWidth
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  if (game.notifications.length) {
    const quest = ensureNonNullable(game.notifications[0]);
    if (quest.ready) {
      ctx.save();
      ctx.font = uiFont;
      const notificationHeight = fontSize * DOUBLE_FACTOR + padding;
      const notificationY = quest.position() * (notificationHeight + padding) - notificationHeight;
      const textWidth = Math.max(ctx.measureText(quest.title).width, ctx.measureText(quest.description).width);
      const iconSize = fontSize * DOUBLE_FACTOR;
      const notificationWidth = textWidth + padding * QUEST_NOTIFICATION_PADDING_FACTOR + iconSize;
      const inset = padding / HALF_DIVISOR;
      ctx.fillStyle = '#00000088';
      drawRoundedRect(ctx, (viewScreenWidth - notificationWidth) / HALF_DIVISOR, notificationY, notificationWidth, notificationHeight, [(barHeight + backHeight) / HALF_DIVISOR, (barHeight + backHeight) / HALF_DIVISOR, (barHeight + backHeight) / HALF_DIVISOR, (barHeight + backHeight) / HALF_DIVISOR]);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(quest.title, (viewScreenWidth - notificationWidth) / HALF_DIVISOR + notificationWidth / HALF_DIVISOR + iconSize / HALF_DIVISOR, notificationY + inset);
      ctx.fillStyle = '#ffffff88';
      ctx.shadowColor = '#ffffff88';
      ctx.shadowBlur = 1;
      ctx.font = uiFont;
      ctx.fillText(quest.description, (viewScreenWidth - notificationWidth) / HALF_DIVISOR + notificationWidth / HALF_DIVISOR + iconSize / HALF_DIVISOR, notificationY + inset + fontSize);
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = QUEST_NOTIFICATION_SHADOW_BLUR;
      if (quest.image) {
        ctx.drawImage(quest.image, (viewScreenWidth - notificationWidth) / HALF_DIVISOR + inset, notificationY + inset, iconSize, iconSize);
      }
      ctx.restore();
    }
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function renderGame(game: Game): void {
  const renderContext = game.getRenderContext();
  if (!renderContext) {
    return;
  }
  const {
    baseHeight
  } = game.config;
  let {
    origin,
    scale
  } = renderContext;
  const {
    devicePixelRatio,
    viewHeight,
    viewWidth
  } = renderContext;
  const ctx = ensureNonNullable(renderContext.ctx);
  if (game.debugView) {
    scale = DEBUG_VIEW_SCALE;
    origin = game.space.center;
  }
  ctx.resetTransform();
  ctx.clearRect(0, 0, viewWidth, viewHeight);
  const offsetX = origin.x * scale - viewWidth / HALF_DIVISOR;
  const offsetY = origin.y * scale - viewHeight / HALF_DIVISOR;
  ctx.translate(-offsetX, -offsetY);
  ctx.scale(scale, scale);
  ctx.translate(0, -baseHeight);
  drawBaseFills(renderContext);
  drawTrailUnderlays(renderContext);
  ctx.translate(0, baseHeight);
  ctx.globalCompositeOperation = 'destination-over';
  drawAvatarBackLayers(renderContext);
  drawTrails(renderContext);
  drawBaseBacks(renderContext);
  drawArenaBackground(renderContext);
  ctx.globalCompositeOperation = 'source-over';
  drawAvatarFrontLayers(renderContext);
  drawUnitNames(renderContext);
  drawParticles(renderContext);
  drawLabels(renderContext);
  drawLeaderMarker(renderContext);
  ctx.resetTransform();
  ctx.scale(1 / devicePixelRatio, 1 / devicePixelRatio);
  if (game.player) {
    drawLeaderboard(renderContext);
    renderScoreBar(renderContext);
    renderBestScore(renderContext);
    renderKillCount(renderContext);
    drawMinimap(renderContext);
    renderQuestNotification(renderContext);
  }
  if (game.debug || game.recording || game.replaying) {
    renderDebugOverlay(game);
  }
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
interface Metric {
  events: MetricEvents;
  frameTime: number;
  renderTime: number;
  updateTime: number;
}
export function renderDebugOverlay(game: Game): void {
  const {
    view
  } = game;
  const context = view.getContext('2d');
  if (!context) {
    return;
  }
  const overlayContext = context;
  context.fillStyle = '#000000';
  context.strokeStyle = '#ffffff';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  let lineY = game.quality * DEBUG_OVERLAY_START_Y;
  drawStatLine(`Update time: ${game.stats.ut.toFixed(1)}`);
  drawStatLine(`AI time: ${game.stats.ait.toFixed(1)}`, 1);
  drawStatLine(`Spawn time: ${game.stats.st.toFixed(1)}`, 1);
  drawStatLine(`Render time: ${game.stats.rt.toFixed(1)}`);
  drawStatLine(`FPS: ${String(Math.round(game.stats.fps))}`);
  drawStatLine(`Quality: ${String(game.quality)}`);
  drawStatLine();
  drawStatLine(`Units: ${String(game.units.length)}`);
  drawStatLine(`Level: ${game.level.toFixed(DEBUG_LEVEL_DECIMAL_DIGITS)}`);
  drawStatLine();
  drawStatLine(`Particles: ${String(game.particles.length)}`);
  drawStatLine();
  if (game.recording) {
    drawStatLine(`Recording: ${game.recording.duration().toFixed(1)} s`);
  }
  if (game.replaying) {
    drawStatLine(`Replaying: ${game.replaying.currentlyPlaying().toFixed(1)}/${game.replaying.duration().toFixed(1)} s`);
  }
  if (game.debugGraph) {
    const graphWidth = view.width / DEBUG_GRAPH_WIDTH_DIVISOR;
    const graphHeight = DEBUG_GRAPH_HEIGHT;
    const path2D = new Path2D();
    const path2D2 = new Path2D();
    const path2D3 = new Path2D();
    const path2D4 = new Path2D();
    path2D4.moveTo(0, 0);
    let maxFrameTime = TARGET_FRAME_TIME_MILLISECONDS;
    game.metrics.forEach((metric: Metric) => {
      maxFrameTime = Math.max(maxFrameTime, metric.frameTime);
    });
    maxFrameTime *= DEBUG_GRAPH_HEADROOM_FACTOR;
    const xStep = graphWidth / (MAX_METRICS_SAMPLES - 1);
    const yScale = graphHeight / maxFrameTime;
    context.save();
    context.translate((view.width - graphWidth) / HALF_DIVISOR, graphHeight);
    context.fillStyle = '#00000033';
    context.fillRect(0, -graphHeight, graphWidth, graphHeight);
    game.metrics.forEach((metric: Metric, index: number) => {
      path2D.lineTo(xStep * index, -metric.updateTime * yScale);
      path2D2.lineTo(xStep * index, -metric.renderTime * yScale);
      path2D4.lineTo(xStep * index, -(metric.updateTime + metric.renderTime) * yScale);
      path2D3.lineTo(xStep * index, -metric.frameTime * yScale);
    });
    path2D4.lineTo(xStep * (game.metrics.length - 1), 0);
    context.lineWidth = 1;
    const targetFrameTimeY = yScale * TARGET_FRAME_TIME_MILLISECONDS;
    context.strokeStyle = 'red';
    context.beginPath();
    context.moveTo(0, -targetFrameTimeY);
    context.lineTo(graphWidth, -targetFrameTimeY);
    context.stroke();
    context.fillStyle = '#ffff00a0';
    context.fill(path2D4);
    context.strokeStyle = '#990099cc';
    context.stroke(path2D);
    context.strokeStyle = '#009900cc';
    context.stroke(path2D2);
    context.strokeStyle = '#0000ffcc';
    context.stroke(path2D3);
    context.lineWidth = DEBUG_GRAPH_EVENT_LINE_WIDTH;
    game.metrics.forEach((metric: Metric, index: number) => {
      const {
        kills,
        returns
      } = metric.events;
      if (returns || kills) {
        if (kills) {
          context.strokeStyle = '#99000040';
        } else {
          context.strokeStyle = '#00000040';
        }
        context.beginPath();
        context.moveTo(xStep * index, 0);
        context.lineTo(xStep * index, -graphHeight);
        context.stroke();
      }
    });
    context.restore();
  }
  function drawStatLine(text = '', indentLevel = 0): void {
    if (text) {
      overlayContext.strokeText(text, DEBUG_OVERLAY_INDENT_X + indentLevel * DEBUG_OVERLAY_INDENT_STEP, lineY);
      overlayContext.fillText(text, DEBUG_OVERLAY_INDENT_X + indentLevel * DEBUG_OVERLAY_INDENT_STEP, lineY);
    }
    lineY += game.quality * DEBUG_OVERLAY_LINE_HEIGHT;
  }
}
