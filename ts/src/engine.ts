import type { PointerState } from './controller.ts';
import type {
  Label,
  NamePool,
  ShapeOwner,
  TrailCrossing,
  TrailIntersectionRecord,
  Unit
} from './entities.ts';
import type { LanguageStrings } from './i18n.ts';
import type {
  AchievementStore,
  Quest,
  SchemeCycler
} from './scoring.ts';
import type {
  Asset,
  SkinManager
} from './skins.ts';

import { Controller } from './controller.ts';
import {
  Bot,
  City,
  fromCharCode,
  MILLISECONDS_IN_MINUTE,
  Player,
  Territory
} from './entities.ts';
import {
  angleToVector,
  Border,
  createCirclePoints,
  Polygon,
  Polyline,
  Segment,
  SpatialGrid,
  Vector
} from './geometry.ts';
import { LANGUAGE_CODE_LENGTH } from './i18n.ts';
import {
  Particle,
  spawnScoreParticles,
  TextParticle
} from './particles.ts';
import { AchievementTracker } from './scoring.ts';
import {
  FULL_TURN,
  KILL_REASON_CAPITAL_SURROUNDED,
  KILL_REASON_EXIT_POINT,
  KILL_REASON_SURROUNDED,
  KILL_REASON_SYSTEM,
  KILL_REASON_TRAIL,
  KILL_REASON_WIN,
  MILLISECONDS_IN_SECOND,
  PERCENT_MAX,
  TURN_SPEED_RADIANS_PER_SECOND
} from './shared/constants.ts';
import {
  clamp,
  easeOutCubic,
  intervalOverlap,
  isBetween,
  isNearlyEqual,
  isNearlyZero,
  lerp,
  now
} from './shared/math-utils.ts';
import { noop } from './shared/noop.ts';
import { createRandomGenerator } from './shared/random.ts';
import {
  assertNonNullable,
  ensureNonNullable
} from './type-guards.ts';

// --- shared structural types inferred from usage across the engine ---

// DeathReasons[8] ("убит разделением со столицей" / separated-from-capital) has
// No constant here — no code path ever produces reason code 8. Codes 0-7 are all used.
export const FRAMES_PER_SECOND = 60;
export const FRAME_DURATION_MILLISECONDS = MILLISECONDS_IN_SECOND / FRAMES_PER_SECOND;
// eslint-disable-next-line no-magic-numbers -- two-frame threshold (2x the single-frame duration).
export const TWO_FRAME_DURATION_MILLISECONDS = FRAME_DURATION_MILLISECONDS * 2;

/* eslint-disable no-magic-numbers -- encoded domain-lock character-delta data + property-name char indices; individual bytes are not nameable. */
export const ENCODED_EXPECTED_HOST: [number, number[], number[]] = [46, [0, 51, 4, 4, 6, 1, 2, 1, 1], [5, 1, 5, 2, 6, 3, 4, 0, 7, 3, 8, 2]];
export const ENCODED_REDIRECT_HOST: [number, number[], number[]] = [45, [0, 1, 51, 2, 2, 4, 4, 2, 1, 2], [8, 2, 8, 4, 9, 0, 5, 7, 1, 3, 7, 6]];
export const DOMAIN_LOCK_CHAR_DELTAS: number[] = [0, 11, 3, 2, 34, 1, 1, 2, 3, 1, 3, 2, 1, 1, 2, 1, 1];
export function decodeDomainLockString(encoded: [number, number[], number[]]): string {
  return fromCharCode(...encoded[2].map((charIndex: number) =>
    encoded[1].reduce((sum: number, delta: number, index: number) => {
      if (index <= charIndex) {
        return sum + delta;
      }
      return sum;
    }, encoded[0])
  ));
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export function decodeDomainLockProperty(charIndices: number[]): string {
  return fromCharCode(...charIndices.map((charIndex: number) =>
    DOMAIN_LOCK_CHAR_DELTAS.reduce((sum: number, delta: number, index: number) => {
      if (index <= charIndex) {
        return sum + delta;
      }
      return sum;
    }, 47)
  ));
}
{
  const expectedHost = decodeDomainLockString(ENCODED_EXPECTED_HOST);
  const redirectHost = decodeDomainLockString(ENCODED_REDIRECT_HOST);
  // These decode to the property names "host", "replace" and "location" respectively; the
  // Original reflects them off `window` at runtime as a domain-lock. Typed against the real
  // Location members via literal-key assertions (the decoded strings are known constants).
  const hostKey = decodeDomainLockProperty([8, 12, 15, 16]);
  const replaceKey = decodeDomainLockProperty([14, 7, 13, 10, 4, 6, 7]);
  const redirectUrlPrefix = decodeDomainLockProperty([8, 16, 16, 13, 1, 0, 0]);
  const redirectUrlSeparator = decodeDomainLockProperty([0, 3, 5, 6, 2]);
  const locationKey = decodeDomainLockProperty([10, 12, 6, 4, 16, 9, 12, 11]);
  /* eslint-enable no-magic-numbers -- end of encoded domain-lock data. */
  const currentHost = window[locationKey as 'location'][hostKey as 'host'];
  if (currentHost === expectedHost) {
    Player.prototype.moveTo = true;
  } else {
    setTimeout(() => {
      window[locationKey as 'location'][replaceKey as 'replace'](redirectUrlPrefix + redirectHost + redirectUrlSeparator + currentHost);
    }, (Math.PI + Math.random()) * MILLISECONDS_IN_MINUTE);
  }
}
export const MAX_METRICS_SAMPLES = 240;
// eslint-disable-next-line import-x/export -- engine declarations kept in dependency order; `Config` is a valid TypeScript declaration merge that import-x false-positives as a duplicate export.
export interface Config {
  arenaColor: string;
  arenaSize: number;
  backgroundBottomColor: string;
  backgroundTopColor: string;
  baseCount: number;
  baseHeight: number;
  baseRadius: number;
  borderColor: string;
  borderPoints: number;
  botAggroMax: number;
  botAggroMin: number;
  botAttackTrackLength: number;
  botDefMax: number;
  botDefMin: number;
  botGreedMax: number;
  botGreedMin: number;
  botLevel: number;
  botSafetyMax: number;
  botSafetyMin: number;
  botsCount: number;
  enemyKillDelay: number;
  followKiller: boolean;
  font: string;
  maxPreparingTime: number;
  maxScale: number;
  minScale: number;
  nearPlayerBotSpawnCount: number;
  noPlayerBotLevel: number;
  observerScale: number;
  platesStrokeWidth: number;
  prepareAcceleration: number;
  prepareBatchCount: number;
  prepareCounter: number;
  prepareMult: number;
  quadSize: number;
  selfKillDelay: number;
  spawnTimeout: number;
  startBotLevel: number;
  trackWidth: number;
  unitSpeed: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface CitiesManager {
  get(countryCode: string): string;
}
export interface LeaderboardCountryEntry {
  country: string;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface Leaderboard {
  countries: LeaderboardCountryEntry[];
}
export interface Recorder {
  duration(): number;
  write(): void;
}
export interface Replayer {
  currentlyPlaying(): number;
  duration(): number;
  read(): boolean;
  skip?: boolean;
  skipping(): boolean;
  start: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface MetricEvents {
  kills: number;
  returns: number;
}

interface Metric {
  events: MetricEvents;
  frameTime: number;
  renderTime: number;
  updateTime: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface GameOverResult {
  readonly best: null | number;
  readonly bestPercent: number;
  readonly build: number;
  readonly game: Game;
  readonly image: string | undefined;
  readonly kills: number;
  readonly name: string;
  readonly newBest: boolean;
  readonly percent: number;
  readonly reason: number;
  readonly score: number;
  readonly time: number;
  readonly top: number;
}

interface Bounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface BoundedShape {
  bounds: Bounds;
}
interface RenderContext {
  backHeight: number;
  barHeight: number;
  barWidth: number;
  boundsInView: (shape: BoundedShape, margin?: number) => boolean;
  calcMult: (a: number, b: number) => number;
  ctx: CanvasRenderingContext2D | null;
  devicePixelRatio: number;
  fontSize: number;
  game: Game;
  halfBarHeight: number;
  halfBarWidth: number;
  origin: Vector;
  padding: number;
  pointInView: (point: Vector, margin?: number) => boolean;
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
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface Intersection {
  distance: number;
  overlay: boolean;
  point: Vector;
  segment: Segment;
  zn: number;
}
export interface IntersectionGroup {
  intersections: Intersection[];
  point: Vector;
}
export interface ShapeOwnerIntersection {
  index: number;
  owner: ShapeOwner;
  point: Vector;
  segment: Segment;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface ComebackMergeParams {
  readonly endPoint: Vector;
  readonly endT: number;
  readonly enter: Segment;
  readonly leave: Segment;
  readonly owner: Territory;
  readonly startPoint: Vector;
  readonly startT: number;
}
export type Shape = Polygon | Polyline;
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface GameStats {
  ait: number;
  fps: number;
  rt: number;
  st: number;
  ut: number;
}
export interface GameTimings {
  aiEndTime: number;
  aiStartTime: number;
  renderEndTime: number;
  renderStartTime: number;
  spawnEndTime: number;
  spawnStartTime: number;
  updateEndTime: number;
  updateStartTime: number;
}
export const GAME_BUILD = 704;
export const PARTICLE_CLEANUP_INTERVAL_MS = 500;
export const AD_PIXEL_DELAY_BASE_MINUTES = 2;
export const PODIUM_BRONZE_INDEX = 2;
export const HALF_DIVISOR = 2;
export const DOUBLE_FACTOR = 2;
export const SCORE_PREVIEW_MARGIN_FACTOR = 0.95;
export const SCORE_PREVIEW_OUTLINE_OFFSET_FACTOR = -2;
export const BORDER_DOUBLE_INTERSECTION_COUNT = 2;
export const REFERENCE_DIAGONAL_SQUARED = 2455780;
export const CAMERA_FOLLOW_STEP_DIVISOR = 30;
export const LANDSCAPE_ASPECT_WIDTH = 16;
export const LANDSCAPE_ASPECT_HEIGHT = 9;
export const FONT_SIZE_CALC_A = 20;
export const FONT_SIZE_CALC_B = 30;
export const BACK_HEIGHT_FACTOR = 4;
export const PADDING_FACTOR = 16;
export const HALF_BAR_HEIGHT_FACTOR = 0.75;
export const BAR_WIDTH_CALC_A = 4;
export const BAR_WIDTH_CALC_B = 2.25;
export const SPAWN_SPACING_MULT_MAX = 3;
export const SPAWN_SPACING_MULT_DEFAULT = 2;
export const BOUNDS_SPAWN_OUTER_FACTOR = 10;
export const BOUNDS_SPAWN_INNER_FACTOR = 4;
export const CENTER_SPAWN_RADIUS_DIVISOR = 3;
export const PLAYER_SPAWN_MIN_FACTOR = 12;
export const PLAYER_SPAWN_MAX_FACTOR = 16;
export const PLAYER_AUTO_RETURN_CHANCE = 0.0005;
export const MAX_DELTA_MILLISECONDS = 10000;
export const REPLAY_PREPARE_EXTRA_FRAMES = 120;
export const REPLAY_MAX_DELTA_MILLISECONDS = 100;
export const FRAME_SNAP_LOWER_FACTOR = 0.9;
export const FRAME_SNAP_UPPER_FACTOR = 1.1;
export const MAX_ACCUMULATED_FRAMES = 10;
export const BEST_PERCENT_SCALE = 10000;
export const XOR_ENCODE_KEY = 42;
export const MAX_SPAWN_ATTEMPTS = 50;
export const SCALE_QUANTIZATION_STEPS = 20;
export const UPDATE_JITTER_FACTOR = 0.01;
export const ANGLE_QUANTIZATION_SCALE = 127;
export const ANGLE_QUANTIZATION_OFFSET = 254;
export const VRANGE_FACTOR = 0.8;
export const LABEL_STACK_OFFSET_Y = -35;
export const LABEL_SPACING_Y = -10;
export const QUEST_STATE_COMPLETE = 3;
export const BOT_TYPE_2 = 2;
export const BOT_TYPE_3 = 3;
export const BOT1_AGGRO_MULT = 1.25;
export const BOT2_GREED_MIN_MULT = 2;
export const BOT_GREED_MAX_MULT = 1.1;
export const BOT2_SAFETY_MULT = 0.75;
export const BOT3_AGGRO_MULT = 0.75;
export const BOT3_GREED_MIN_MULT = 4;
export const BOT3_SAFETY_MULT = 0.5;
export const BOT3_DEF_MULT = 2;
export const SCALE_LERP_DIVISOR = 400;
export const WIN_PERCENT_THRESHOLD = 0.9999;
export const BOUNDS_SPAWN_CHANCE = 0.3;
export const QUALITY_STEP = 0.1;
export const QUALITY_QUANTIZATION_STEPS = 10;
export interface BoundsCarrier {
  bounds: Bounds;
}
export interface TerritoryVictim {
  base: Territory;
  poly: Polygon;
}
export class Game {
  public achievementsProfile: AchievementStore;
  public angle = 0;
  public best: null | number;
  public border: Border;
  public bots: number[];
  public botSpawnLimited: boolean;
  public build: number;
  public citiesManager: CitiesManager | null;
  public config: Config;
  public controller: Controller;
  public currMetric: Metric | null;
  public cycle: number;
  public debug: boolean;
  public debugGraph: boolean;
  public debugView: boolean;
  public direction: Vector;
  public events: MetricEvents;
  public fakeMouse: null | Vector;
  public fpsSequence: number[];
  public gameOverCallback: ((result: GameOverResult) => void) | null;
  public isTest: boolean;
  public keyboard?: null | Partial<PointerState>;
  public labels: TextParticle[];
  public language: LanguageStrings;
  public last: number;
  public leaderboard: Leaderboard | null;
  public level: number;
  public looped: boolean;
  public metrics: Metric[];
  public mouse: Vector;
  public nameManager: NamePool;
  public notifications: Quest[];
  public origin: null | Vector = null;
  public particles: Particle[];
  public player: null | Player;
  public playerDeathCallback: (() => void) | null;
  public qas: Record<string, boolean>;
  public quality: number;
  public recording: null | Recorder;
  public renderer: ((game: Game) => void) | null;
  public replaying?: null | Replayer;
  public rng: (n?: number) => number;
  public scale: number;
  public schemesManager: SchemeCycler;
  public seed: number;
  public skinManager: SkinManager;
  public space: SpatialGrid;
  public spawnSuspend: number;
  public square: number;
  public startTime = 0;
  public stats: GameStats;
  public stopped: boolean;
  public tailRecovered: boolean;
  public timeAccumulated: number;
  public timings: GameTimings;
  public topListChanged: boolean;
  public units: Unit[];
  public updateParticlesId: number;
  public view: HTMLCanvasElement;
  public visible: boolean;
  public get renderContext(): RenderContext | undefined {
    return this.getRenderContext();
  }

  public constructor(config: Config, canvas: HTMLCanvasElement, space: SpatialGrid, border: Border, skinManager: SkinManager, gameOverCallback: ((result: GameOverResult) => void) | null, nameManager: NamePool, controller: Controller, language: LanguageStrings, schemesManager: SchemeCycler, achievementsProfile: AchievementStore, seed: number) {
    this.best = null;
    this.isTest = false;
    this.playerDeathCallback = null;
    this.tailRecovered = false;
    this.topListChanged = false;
    this.citiesManager = null;
    this.renderer = null;
    this.rng = createRandomGenerator(seed);
    this.build = GAME_BUILD;
    this.config = config;
    this.language = language;
    this.controller = controller;
    this.skinManager = skinManager;
    this.nameManager = nameManager;
    this.achievementsProfile = achievementsProfile;
    this.space = space;
    this.view = canvas;
    this.border = border;
    this.player = null;
    this.units = [];
    this.mouse = new Vector();
    this.direction = new Vector(1, 0);
    this.recording = null;
    this.replaying = null;
    this.cycle = 0;
    this.seed = seed;
    this.botSpawnLimited = false;
    delete this.keyboard;
    this.fakeMouse = null;
    this.labels = [];
    this.notifications = [];
    this.scale = config.maxScale;
    this.square = this.border.polygon.square();
    this.gameOverCallback = gameOverCallback;
    this.visible = false;
    this.stopped = false;
    this.debugView = false;
    this.leaderboard = null;
    this.level = 0;
    this.bots = [0, 0, 0, 0];
    this.debug = false;
    this.debugGraph = false;
    this.spawnSuspend = 0;
    this.particles = [];
    this.metrics = [];
    this.currMetric = null;
    this.schemesManager = schemesManager;
    this.last = 0;
    this.timeAccumulated = 0;
    this.looped = false;
    this.border.polygon.calcPath();
    this.quality = 1;
    this.fpsSequence = [];
    this.qas = {
      q5: true,
      q6: true,
      q7: true,
      q8: true,
      q9: true
    };
    window.addEventListener('resize', noop, false);
    this.stats = {
      ait: 0,
      fps: 0,
      rt: 0,
      st: 0,
      ut: 0
    };
    this.timings = {
      aiEndTime: 0,
      aiStartTime: 0,
      renderEndTime: 0,
      renderStartTime: 0,
      spawnEndTime: 0,
      spawnStartTime: 0,
      updateEndTime: 0,
      updateStartTime: 0
    };
    this.events = {
      kills: 0,
      returns: 0
    };
    this.updateParticlesId = setInterval(() => {
      this.particles = this.particles.filter((particle: Particle) => particle.time > 0);
    }, PARTICLE_CLEANUP_INTERVAL_MS);
  }

  public addCity(unit: Unit): void {
    const name = ensureNonNullable(unit.skin.assets.find((asset: Asset) => asset.pool.name === 'flags')).name;
    const city = new City(ensureNonNullable(this.citiesManager).get(name), false, unit.position.clone(), unit);
    if (this.skinManager.isFlagSkinManager) {
      const citySkin = this.skinManager.getCitySkin(name);
      city.skin = citySkin ?? null;
    }
    unit.cities.push(city);
  }

  public addPlayer(player: Player): void {
    this.quality = 1;
    this.fpsSequence = [];
    player.achievements = new AchievementTracker(this.achievementsProfile, 'classic');
    this.addUnit(player);
    this.player = player;
    setTimeout(() => {
      const element = document.createElement('img');
      element.src = 'https://gameads.io/adspixel.png';
    }, (AD_PIXEL_DELAY_BASE_MINUTES + Math.random()) * MILLISECONDS_IN_MINUTE);
    this.debug = player.name === 'dratest';
  }

  public addUnit(unit: Unit): void {
    this.units.push(unit);
  }

  public alert(text?: string, color?: string): void {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty color string should fall back to black, matching the original.
    this.labels.push(new TextParticle(ensureNonNullable(text), color || '#000000', this.player));
  }

  public changeShields(): void {
    const {
      countries: leaderboard
    } = ensureNonNullable(this.leaderboard);
    const goldCountry = leaderboard[0]?.country;
    const silverCountry = leaderboard[1]?.country;
    const bronzeCountry = leaderboard[PODIUM_BRONZE_INDEX]?.country;
    this.units.forEach((unit: Unit) => {
      const shieldAsset = unit.skin.assets.find((asset: Asset) => asset.pool.name === 'shields');
      const flagAsset = unit.skin.assets.find((asset: Asset) => asset.pool.name === 'flags');
      if (shieldAsset && flagAsset) {
        let shieldName = 'gray';
        switch (flagAsset.name) {
          case bronzeCountry:
            shieldName = 'bronze';
            break;
          case goldCountry:
            shieldName = 'gold';
            break;
          case silverCountry:
            shieldName = 'silver';
            break;
          default:
            break;
        }
        if (shieldAsset.name !== shieldName) {
          unit.skin.removeAsset(shieldAsset);
          if ('shieldSkinAssets' in this.skinManager) {
            unit.skin.addAsset(this.skinManager.shieldSkinAssets.get(shieldName));
          }
        }
      }
    });
  }

  public checkBaseCommits(): void {
    this.units.forEach((unit: Unit) => {
      const polygon = unit.base.polygon;
      polygon.segments.forEach((segment: Segment) => {
        const {
          end,
          start
        } = segment;
        const startSegment = start.segments.find((candidate: Segment) => candidate === segment);
        const endSegment = end.segments.find((candidate: Segment) => candidate === segment);
        if (!startSegment || !endSegment) {
          throw new Error('точки сегмента не закоммичены');
        }
      });
    });
  }

  public checkSegments(): void {
    this.space.segmentsCount();
  }

  public finishPrepare(): void {
    const targetCycle = this.replaying ? this.replaying.start : this.config.prepareCounter;
    while (this.cycle < targetCycle) {
      this.update();
    }
  }

  public gameOver(reason?: number): void {
    const player = ensureNonNullable(this.player);
    if (!player.win) {
      let minX = Infinity;
      let maxX = 0;
      let minY = Infinity;
      let maxY = 0;
      player.base.polygon.segments.forEach((segment: Segment) => {
        const {
          x,
          y
        } = segment.start;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });
      const width = maxX - minX;
      const height = maxY - minY;
      const maxDimension = Math.max(width, height);
      const vector = new Vector(minX + width / HALF_DIVISOR, minY + height / HALF_DIVISOR);
      const canvasSize = 500;
      const scale = canvasSize * SCORE_PREVIEW_MARGIN_FACTOR / maxDimension;
      const sizeUnit = canvasSize / PERCENT_MAX;
      let dataUrl: string | undefined;
      if (typeof document !== 'undefined') {
        const element = document.createElement('canvas');
        element.width = canvasSize;
        element.height = canvasSize;
        const context = ensureNonNullable(element.getContext('2d'));
        context.scale(scale, scale);
        context.translate(canvasSize / HALF_DIVISOR / scale - vector.x, canvasSize / HALF_DIVISOR / scale - vector.y);
        context.translate(0, sizeUnit / scale);
        context.fillStyle = player.skin.colors.back;
        context.fill(player.base.polygon.path);
        context.translate(0, sizeUnit * SCORE_PREVIEW_OUTLINE_OFFSET_FACTOR / scale);
        context.fillStyle = player.skin.pattern?.pattern ?? player.skin.colors.main;
        context.fill(player.base.polygon.path);
        dataUrl = element.toDataURL('image/png');
      }
      const result: GameOverResult = {
        best: this.best,
        bestPercent: player.bestPercent,
        build: this.build,
        game: this,
        image: dataUrl,
        kills: player.statistics.kills,
        name: player.name,
        newBest: ensureNonNullable(player.schemes).result() > (this.best ?? 0),
        percent: player.percent,
        reason: ensureNonNullable(reason),
        score: ensureNonNullable(player.schemes).result(),
        time: now() - this.startTime,
        top: player.top
      };
      if (reason === KILL_REASON_WIN) {
        player.win = true;
      }
      if (player.achievements) {
        player.achievements.finish();
      }
      if (this.playerDeathCallback) {
        this.playerDeathCallback();
      }
      setTimeout(() => {
        if (reason === KILL_REASON_WIN) {
          this.kill(player, undefined, reason);
        }
        this.player = null;
        if (this.gameOverCallback) {
          this.gameOverCallback(result);
        }
      }, reason === KILL_REASON_TRAIL || reason === KILL_REASON_EXIT_POINT || reason === KILL_REASON_SURROUNDED ? this.config.enemyKillDelay : this.config.selfKillDelay);
    }
  }

  public getMovement(deltaMilliseconds: number, unit: Unit): Segment[] {
    const {
      unitSpeed
    } = this.config;
    const list4: Segment[] = [];
    const vector: null | undefined | Vector = unit.movement();
    if (!vector) {
      return list4;
    }
    vector.mulScalar(unitSpeed * deltaMilliseconds / MILLISECONDS_IN_SECOND);
    const vector2 = angleToVector(unit.direction);
    let turnAngle = Math.atan2(vector2.x * vector.y - vector.x * vector2.y, vector2.dot(vector));
    vector2.release();
    const maxTurnThisFrame = TURN_SPEED_RADIANS_PER_SECOND * deltaMilliseconds / MILLISECONDS_IN_SECOND / (unit.smoothness || 1);
    if (Math.abs(turnAngle) > maxTurnThisFrame) {
      turnAngle = maxTurnThisFrame * Math.sign(turnAngle);
    }
    unit.direction += turnAngle;
    const displacement = angleToVector(unit.direction).mulScalar(unitSpeed * deltaMilliseconds / MILLISECONDS_IN_SECOND);
    let segment = new Segment(unit.position, unit.position.clone().add(displacement));
    displacement.release();
    let list5: Intersection[] = this.border.intersections(segment);
    while (list5.length) {
      let intersection: Intersection;
      const vector3 = ensureNonNullable(segment.vector);
      if (list5.length === BORDER_DOUBLE_INTERSECTION_COUNT) {
        const vector6 = ensureNonNullable(ensureNonNullable(list5[0]).segment.vector);
        const angle = Math.atan2(vector3.x * vector6.y - vector6.x * vector3.y, vector3.dot(vector6));
        intersection = angle > 0 ? ensureNonNullable(list5[0]) : ensureNonNullable(list5[1]);
      } else {
        intersection = ensureNonNullable(list5[0]);
      }
      const {
        point: intersectionPoint,
        segment: borderSegment
      } = intersection;
      const vector4 = ensureNonNullable(borderSegment.vector);
      const angle2 = Math.atan2(vector3.x * vector4.y - vector4.x * vector3.y, vector3.dot(vector4));
      if (angle2 < 0) {
        break;
      }
      if (!isNearlyZero(intersection.distance)) {
        const segment2 = new Segment(segment.start, intersectionPoint);
        list4.push(segment2);
      }
      segment = new Segment(intersectionPoint, segment.end);
      const vector5 = ensureNonNullable(segment.vector);
      const slideVector = Vector.clone(vector4).normalize().mulScalar(vector5.dot(vector4) / vector4.magnitude());
      segment = new Segment(intersectionPoint, intersectionPoint.clone().add(slideVector));
      slideVector.release();
      list5 = this.border.intersections(segment);
    }
    list4.push(segment);
    return list4;
  }

  public getRenderContext(): RenderContext | undefined {
    const {
      view
    } = this;
    const {
      font
    } = this.config;
    const context = view.getContext('2d');
    const clientWidth = view.clientWidth;
    const clientHeight = view.clientHeight;
    const viewWidth = Math.trunc(clientWidth * this.quality);
    const viewHeight = Math.trunc(clientHeight * this.quality);
    if (view.width !== viewWidth || view.height !== viewHeight) {
      view.width = viewWidth;
      view.height = viewHeight;
    }
    const {
      devicePixelRatio
    } = window;
    const viewScreenWidth = viewWidth * devicePixelRatio;
    const viewScreenHeight = viewHeight * devicePixelRatio;
    const scaler = Math.sqrt(viewScreenWidth * viewScreenWidth + viewScreenHeight * viewScreenHeight) / Math.sqrt(REFERENCE_DIAGONAL_SQUARED);
    const scale = this.scale * scaler / devicePixelRatio;
    let vector: Vector;
    if (this.player) {
      vector = this.player.position;
      if (this.player.killer && this.config.followKiller) {
        vector = this.player.killer.position;
      }
    } else {
      vector = this.space.center;
    }
    if (this.origin && (!this.player || this.player.killer)) {
      const distance = this.origin.distance(vector);
      const stepDistance = distance / CAMERA_FOLLOW_STEP_DIVISOR;
      const offset = vector.clone().sub(this.origin).normalize().mulScalar(stepDistance);
      vector = this.origin.add(offset);
    }
    this.origin = vector.clone();
    const left = vector.x - viewWidth / HALF_DIVISOR / scale;
    const right = vector.x + viewWidth / HALF_DIVISOR / scale;
    const top = vector.y - viewHeight / HALF_DIVISOR / scale;
    const bottom = vector.y + viewHeight / HALF_DIVISOR / scale;
    const fontSize = Math.trunc(calcMult(FONT_SIZE_CALC_A, FONT_SIZE_CALC_B) * scaler);
    const strokeWidth = this.config.platesStrokeWidth * scaler;
    const backHeight = Math.trunc(scaler * BACK_HEIGHT_FACTOR);
    const uiFont = `${String(fontSize)}px ${font}`;
    const padding = Math.trunc(scaler * PADDING_FACTOR);
    const halfBarHeight = Math.trunc(fontSize * HALF_BAR_HEIGHT_FACTOR);
    const barHeight = halfBarHeight * DOUBLE_FACTOR;
    const barWidth = Math.trunc(viewScreenWidth / calcMult(BAR_WIDTH_CALC_A, BAR_WIDTH_CALC_B));
    const halfBarWidth = Math.trunc(barWidth / HALF_DIVISOR);
    return {
      backHeight,
      barHeight,
      barWidth,
      boundsInView,
      calcMult,
      ctx: context,
      devicePixelRatio,
      fontSize,
      game: this,
      halfBarHeight,
      halfBarWidth,
      origin: vector,
      padding,
      pointInView,
      scale,
      scaler,
      strokeWidth,
      uiFont,
      view,
      viewHeight,
      viewScreenHeight,
      viewScreenWidth,
      viewWidth
    };
    function pointInView(point: Vector, margin = 0): boolean {
      return isBetween(left - margin, right + margin, point.x) && isBetween(top - margin, bottom + margin, point.y);
    }
    function boundsInView(boundsObject: BoundsCarrier, margin = 0): boolean {
      return intervalOverlap(boundsObject.bounds.left - margin, boundsObject.bounds.right + margin, left, right) > 0 && intervalOverlap(boundsObject.bounds.top - margin, boundsObject.bounds.bottom + margin, top, bottom) > 0;
    }
    function calcMult(a: number, b: number): number {
      const landscapeAspectRatio = LANDSCAPE_ASPECT_WIDTH / LANDSCAPE_ASPECT_HEIGHT;
      const portraitAspectRatio = LANDSCAPE_ASPECT_HEIGHT / LANDSCAPE_ASPECT_WIDTH;
      const clampedAspectRatio = clamp(portraitAspectRatio, landscapeAspectRatio, viewScreenWidth / viewScreenHeight);
      const delta = a - b;
      const aspectSpan = portraitAspectRatio - landscapeAspectRatio;
      const offset = -(delta * landscapeAspectRatio + aspectSpan * a);
      return -(offset + delta * clampedAspectRatio) / aspectSpan;
    }
  }

  public getSpawnPosition(spawnMode?: 'bounds' | 'center' | 'player' | 'random', unitRadius?: number): undefined | Vector {
    const {
      center
    } = this.space;
    const {
      radius
    } = this.border;
    const {
      baseRadius
    } = this.config;
    let center2 = center;
    if (spawnMode === 'player' && !this.player) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- a 0 radius is degenerate and must fall through to baseRadius, so the falsy `||` fallback is intentional.
    unitRadius = unitRadius || baseRadius;
    const spacingMultiplier = this.player ? lerp(SPAWN_SPACING_MULT_MAX, 1, this.player.percent) : SPAWN_SPACING_MULT_DEFAULT;
    const minDistance = unitRadius + baseRadius * DOUBLE_FACTOR;
    const minDistanceSquared = minDistance * minDistance;
    const trailDistance = unitRadius + baseRadius * DOUBLE_FACTOR * spacingMultiplier;
    const trailDistanceSquared = trailDistance * trailDistance;
    let spawnDistance;
    switch (spawnMode) {
      case 'bounds':
        spawnDistance = lerp(Math.max(0, radius - (unitRadius + baseRadius * BOUNDS_SPAWN_OUTER_FACTOR)), Math.max(0, radius - (unitRadius + baseRadius * BOUNDS_SPAWN_INNER_FACTOR)), Math.random());
        break;
      case 'center':
        spawnDistance = lerp(0, radius / CENTER_SPAWN_RADIUS_DIVISOR, Math.random());
        break;
      case 'player':
        spawnDistance = lerp(baseRadius * PLAYER_SPAWN_MIN_FACTOR, baseRadius * PLAYER_SPAWN_MAX_FACTOR, Math.random());
        center2 = ensureNonNullable(this.player).position;
        break;
      default:
        spawnDistance = lerp(0, Math.max(0, radius - (unitRadius + baseRadius)), Math.random());
        break;
    }
    const offset = Vector.alloc(0, spawnDistance).rotate(Math.random() * FULL_TURN);
    const vector = center2.clone().add(offset);
    offset.release();
    if (vector.distance(center) > radius - (unitRadius + baseRadius)) {
      return;
    }
    for (const unit of this.units) {
      if (unit.base.polygon.inside(vector)) {
        return;
      }
      if (
        unit.base.polygon.simplify.some((vertex: Vector) => {
          return vector.distance2(vertex) < minDistanceSquared;
        })
      ) {
        return;
      }
      if (
        unit.track.simplyline.some((trailPoint: Vector) => {
          return vector.distance2(trailPoint) < trailDistanceSquared;
        })
      ) {
        return;
      }
    }
    return vector;
  }

  public handleReturn(unit: Unit): boolean | undefined {
    if (unit.death) {
      return;
    }
    this.events.returns++;
    const polyline = unit.track.polyline.clone();
    const {
      base: unit2
    } = unit;
    const startIndex = unit2.polygon.segments.findIndex((segment: Segment) => segment.start === polyline.start);
    const endIndex = unit2.polygon.segments.findIndex((segment: Segment) => segment.start === polyline.end);
    const fromIndex = Math.min(endIndex, startIndex);
    const toIndex = Math.max(endIndex, startIndex);
    if (fromIndex !== startIndex) {
      polyline.reverse();
    }
    const trackPoints = polyline.points();
    const polygon = unit2.polygon.points();
    const list4 = polygon.splice(fromIndex, toIndex - fromIndex + 1, ...trackPoints);
    list4.shift();
    list4.pop();
    list4.reverse();
    list4.push(...trackPoints);
    const polygon2 = new Polygon(list4);
    let polygon3: Polygon;
    if (polygon2.rawSquare() < 0) {
      polygon3 = new Polygon(polygon.reverse());
      unit2.polygon.unsplice(polyline, fromIndex, toIndex);
    } else {
      polygon3 = polygon2;
      unit2.polygon.splice(polyline, fromIndex, toIndex);
    }
    unit2.square += polygon3.square();
    unit2.polygon.calcPath();
    this.units.filter((otherUnit: Unit) => otherUnit !== unit).forEach((unit3: Unit) => {
      if (!unit3.death) {
        if (unit3.in === unit3.base && polygon3.inside(unit3.position)) {
          this.kill(unit3, unit, KILL_REASON_SURROUNDED);
        }
        if (unit3.track.polyline.start && polygon3.inside(unit3.track.polyline.start)) {
          this.kill(unit3, unit, KILL_REASON_EXIT_POINT);
        }
        if (unit3.cities[0] && polygon3.inside(unit3.cities[0].position)) {
          this.kill(unit3, unit, KILL_REASON_CAPITAL_SURROUNDED);
        }
      }
    });
    let list5: ShapeOwnerIntersection[] = [];
    const segments = unit.track.polyline.segments;
    const length = segments.length;
    const list6: TerritoryVictim[] = [];
    for (let i2 = 0; i2 <= length; i2++) {
      const point = i2 === length ? ensureNonNullable(segments[i2 - 1]).end : ensureNonNullable(segments[i2]).start;
      const crossingSegments = point.segments.filter((segment: Segment) => ensureNonNullable(segment.shape).owner !== unit.track && ensureNonNullable(segment.shape).owner !== unit.base && segment.start === point);
      if (crossingSegments.length) {
        let list7: ShapeOwnerIntersection[] = crossingSegments.map((segment: Segment) => ({
          index: i2,
          owner: ensureNonNullable(ensureNonNullable(segment.shape).owner),
          point,
          segment
        }));
        if (list5.length === 0) {
          const intersectionRecord = unit.track.intersections.find((record: TrailIntersectionRecord) => record.point.equal(point));
          if (!intersectionRecord) {
            return false;
          }
          list5 = list7.filter((intersection: ShapeOwnerIntersection) => {
            const list8 = intersectionRecord.intersections.filter((crossing: TrailCrossing) => crossing.base === intersection.owner);
            if (!list8.length) {
              return false;
            }
            return ensureNonNullable(list8[list8.length - 1]).enter;
          });
        } else {
          const list8 = list5.filter((intersection: ShapeOwnerIntersection) =>
            list7.some((otherIntersection: ShapeOwnerIntersection) => {
              return otherIntersection.owner === intersection.owner;
            })
          );
          if (list8.length) {
            const enterIntersection = ensureNonNullable(list8[0]);
            const leaveIntersection = ensureNonNullable(list7.find((intersection: ShapeOwnerIntersection) => intersection.owner === enterIntersection.owner));
            const mergeComeback = (params: ComebackMergeParams): void => {
              const {
                endPoint,
                endT,
                owner,
                startPoint,
                startT
              } = params;
              let {
                enter,
                leave
              } = params;
              if (enter.shape !== owner.polygon) {
                enter = ensureNonNullable(owner.polygon.segments.find((segment: Segment) => segment.start === startPoint));
              }
              if (leave.shape !== owner.polygon) {
                leave = ensureNonNullable(owner.polygon.segments.find((segment: Segment) => segment.start === endPoint));
              }
              if (enter === leave) {
                return;
              }
              const points = unit.track.polyline.points().splice(startT, endT - startT + 1);
              const enterIndex = owner.polygon.segments.findIndex((segment: Segment) => segment === enter);
              const leaveIndex = owner.polygon.segments.findIndex((segment: Segment) => segment === leave);
              const mergeStartIndex = Math.min(leaveIndex, enterIndex);
              const mergeEndIndex = Math.max(leaveIndex, enterIndex);
              if (mergeStartIndex !== enterIndex) {
                points.reverse();
              }
              const list10 = owner.polygon.points();
              const list11 = list10.splice(mergeStartIndex, mergeEndIndex - mergeStartIndex + 1, ...points);
              list11.shift();
              list11.pop();
              list11.push(...points.slice().reverse());
              const polygon4 = new Polygon(list11);
              const polygon5 = new Polygon(list10);
              let polygon6: Polygon;
              if ((owner.unit.in === owner.unit.base && polygon4.inside(owner.unit.position)) || (owner.unit.in !== owner.unit.base && polygon4.inside(ensureNonNullable(owner.unit.track.polyline.start)))) {
                owner.polygon.right(points, mergeStartIndex, mergeEndIndex);
                polygon6 = polygon5;
              } else {
                owner.polygon.left(points, mergeStartIndex, mergeEndIndex);
                polygon6 = polygon4;
              }
              owner.square -= polygon6.square();
              owner.polygon.calcPath();
              list6.push({
                base: owner,
                poly: polygon6
              });
              this.units.forEach((unit3: Unit) => {
                if (owner.unit !== unit3 && unit3.in === owner && polygon6.inside(unit3.position)) {
                  unit3.in = null;
                }
              });
            };
            if (!(enterIntersection.owner instanceof Territory)) {
              throw new Error('Это не база');
            }
            mergeComeback({
              endPoint: leaveIntersection.point,
              endT: leaveIntersection.index,
              enter: enterIntersection.segment,
              leave: leaveIntersection.segment,
              owner: enterIntersection.owner,
              startPoint: enterIntersection.point,
              startT: enterIntersection.index
            });
            const intersectionRecord2 = ensureNonNullable(unit.track.intersections.find((record: TrailIntersectionRecord) => record.point.equal(point)));
            const list9 = intersectionRecord2.intersections.filter((crossing: TrailCrossing) => crossing.base === enterIntersection.owner);
            if (list9.length === 1 || !ensureNonNullable(list9[list9.length - 1]).enter) {
              list7 = list7.filter((intersection: ShapeOwnerIntersection) => intersection.owner !== enterIntersection.owner);
            }
          }
          list5 = list7;
        }
      }
    }
    this.units.forEach((unit3: Unit) => {
      if (unit !== unit3 && polygon3.inside(unit3.position)) {
        unit3.in = unit.base;
      }
    });
    const increment = (unit.base.square - unit.lastSquare) / this.square;
    if (unit.schemes) {
      unit.schemes.comeback({
        game: this,
        increment,
        rise: polygon3,
        victims: list6
      });
    }
    return undefined;
  }

  public handleUnitMovements(deltaMilliseconds?: number): void {
    this.units.slice().forEach((unit: Unit) => {
      if (unit.death) {
        return;
      }
      const list4 = this.getMovement(ensureNonNullable(deltaMilliseconds), unit);
      if (unit === this.player && !this.player.moveTo && unit.in === null && Math.random() < PLAYER_AUTO_RETURN_CHANCE) {
        unit.in = unit.base;
      }
      while (list4.length) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- unit.death may be set to true by kill() via handleIntersect in a prior loop iteration; TS control-flow narrowing from the top-of-function guard is stale.
        if (unit.death) {
          return;
        }
        const segment = ensureNonNullable(list4.shift());
        const list5: Intersection[] = this.space.intersections(segment);
        const list6: IntersectionGroup[] = [];
        list5.forEach((intersection: Intersection) => {
          const groupIndex = list6.findIndex((group: IntersectionGroup) => group.point.equal(intersection.point));
          if (groupIndex === -1) {
            list6.push({
              intersections: [intersection],
              point: intersection.point
            });
          } else {
            const group = ensureNonNullable(list6[groupIndex]);
            if (intersection.point !== group.point) {
              if (intersection.point.cell) {
                if (group.point.cell) {
                  throw new Error('Бывает ли такое?');
                } else {
                  group.point = intersection.point;
                }
              } else {
                intersection.point = group.point;
              }
            }
            group.intersections.push(intersection);
          }
        });
        list5.forEach((intersection: Intersection) => {
          intersection.distance = segment.start.distance2(intersection.point);
        });
        list5.sort((intersectionA: Intersection, intersectionB: Intersection) => intersectionA.distance - intersectionB.distance);
        const list7: Intersection[][] = [];
        let list8: Intersection[] | null = null;
        let lastDistance = -1;
        list5.forEach((intersection: Intersection) => {
          if (!isNearlyEqual(intersection.distance, lastDistance)) {
            list8 = [];
            lastDistance = intersection.distance;
            list7.push(list8);
          }
          ensureNonNullable(list8).push(intersection);
        });
        list7.forEach((list9: Intersection[]) => {
          const list10: Shape[] = [];
          list9.forEach((intersection: Intersection) => {
            const {
              shape
            } = intersection.segment;
            if (shape && !list10.includes(shape)) {
              list10.push(shape);
            }
          });
          while (list10.length) {
            const inShapeIndex = list10.findIndex((shape: Shape) => shape.owner === unit.in);
            if (inShapeIndex > 0) {
              const firstShape = ensureNonNullable(list10[0]);
              list10[0] = ensureNonNullable(list10[inShapeIndex]);
              list10[inShapeIndex] = firstShape;
            }
            const trackShapeIndex = list10.findIndex((shape: Shape) => ensureNonNullable(shape.owner).isTrack);
            if (trackShapeIndex > 0) {
              const firstShape2 = ensureNonNullable(list10[0]);
              list10[0] = ensureNonNullable(list10[trackShapeIndex]);
              list10[trackShapeIndex] = firstShape2;
            }
            const shape = ensureNonNullable(list10.shift());
            const list11: Intersection[] = [];
            list9.forEach((intersection: Intersection) => {
              if (intersection.segment.shape === shape) {
                list11.push(intersection);
              }
            });
            while (!unit.death && list11.length) {
              list11.sort((intersectionA: Intersection, intersectionB: Intersection) => {
                if (unit.in) {
                  return intersectionB.zn - intersectionA.zn;
                }
                return intersectionA.zn - intersectionB.zn;
              });
              const intersection = ensureNonNullable(list11.shift());
              if (intersection.segment.shape && !ensureNonNullable(shape.owner).unit.death) {
                ensureNonNullable(shape.owner).handleIntersect(intersection, unit, segment);
              }
            }
          }
        });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- unit.death may be set to true by kill() via handleIntersect above; TS control-flow narrowing from the top-of-function guard is stale.
        if (unit.death) {
          return;
        }
        const {
          end
        } = segment;
        if (unit.in !== unit.base) {
          unit.track.add(end);
        }
        unit.position = end;
        if (this.visible && !list4.length && unit.in && unit.in !== unit.base) {
          const particle = Particle.nom(unit, segment, this.config.trackWidth);
          this.particles.push(particle);
        }
      }
    });
  }

  public isPlayer(unit?: Unit): boolean {
    return unit === this.player;
  }

  public kill(unit?: Unit, unit2?: Unit, reason?: number): void {
    assertNonNullable(unit);
    if (unit.death) {
      return;
    }
    if (this.isTest) {
      const deathReasons: string[] = ['выигрыш', 'самопересечение', 'убит об стену', 'убит пересечением трека', 'убит захватом точки выхода', 'убит окружением', 'удален системой', 'убит откружением столицы', 'убит разделением со столицей'];
      // eslint-disable-next-line no-console -- test-mode death-reason logging, restored verbatim from the original app2.js; `isTest` is never enabled at runtime.
      console.log(`${unit.name} убит${unit2 ? ` ${unit2.name}` : ''} (${ensureNonNullable(deathReasons[ensureNonNullable(reason)])})`);
    }
    this.events.kills++;
    unit.death = true;
    this.skinManager.release(unit.skin);
    this.units.forEach((otherUnit: Unit) => {
      if (otherUnit !== unit && otherUnit.in === unit.base) {
        otherUnit.in = null;
      }
    });
    if (reason !== KILL_REASON_SYSTEM) {
      spawnScoreParticles(unit, null, unit.track.polyline.segments);
      spawnScoreParticles(unit, null, unit.base.polygon.segments);
    }
    unit.track.remove();
    unit.base.remove();
    const index = this.units.findIndex((candidate: Unit) => candidate === unit);
    this.units.splice(index, 1);
    unit.killer = unit2 ?? null;
    if (unit2) {
      unit2.scores.kills = unit.scores.kills + unit.scores.accumulator;
      if (unit2.schemes) {
        unit2.schemes.kill(unit, reason);
      }
      if (unit2.achievements) {
        unit2.achievements.onKill(unit);
      }
      unit2.statistics.kills++;
    }
    unit.onScoreChanged();
    if (unit2) {
      unit2.onScoreChanged();
    }
    if (reason !== KILL_REASON_WIN && unit === this.player) {
      this.gameOver(reason);
    }
  }

  public loop(): void {
    const currentTime = now();
    if (this.stopped) {
      return;
    }
    if (!this.debugView && (this.visible || this.cycle < this.config.prepareCounter)) {
      this.looped = true;
      if (this.last === 0) {
        this.last = currentTime;
      }
      let deltaMilliseconds = currentTime - this.last;
      if (deltaMilliseconds < 1) {
        deltaMilliseconds = 1;
      }
      this.updateMetrics(deltaMilliseconds);
      if (deltaMilliseconds > MAX_DELTA_MILLISECONDS) {
        deltaMilliseconds = MAX_DELTA_MILLISECONDS;
      }
      this.timings.updateStartTime = now();
      this.stepSimulation(deltaMilliseconds);
      this.timings.updateEndTime = now();
    }
    this.timings.renderStartTime = now();
    if (this.visible) {
      this.render();
    }
    this.timings.renderEndTime = now();
    this.last = currentTime;
    requestAnimationFrame(() => {
      this.loop();
    });
  }

  public post(): void {
    const paper2Results = window.paper2_results;
    const scores = paper2Results.scores;
    const payload = {
      best: (paper2Results.bestPercent && Math.round(paper2Results.bestPercent * BEST_PERCENT_SCALE)) ?? 0,
      build: paper2Results.build ?? 0,
      kills: paper2Results.kills,
      lng: getLanguageCode(),
      name: ensureNonNullable(this.player).name,
      persent: Math.round(paper2Results.score * PERCENT_MAX),
      player: window.playerId ?? 0,
      reason: paper2Results.reason ?? 0,
      scores: {
        accumulator: scores?.accumulator ?? 0,
        kills: scores?.kills ?? 0
      },
      time: Math.round(paper2Results.time / MILLISECONDS_IN_SECOND),
      top: paper2Results.top ?? 0
    };
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- fire-and-forget POST matching the original engine; the offline build has no results endpoint, so the promise is intentionally unobserved.
    fetch('/newpaperio/ajax/results.php', {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- escape() is the exact legacy encoding the original server protocol expects; a modern replacement would change the transmitted bytes.
      body: xorEncode(escape(JSON.stringify(payload))),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST'
    });
    function getLanguageCode(): string {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty-string language code must fall through to the next candidate, so `||` (falsy fallback) is intentional here.
      return (navigator.languages[0] || navigator.userLanguage || navigator.language || navigator.browserLanguage || 'en').slice(0, LANGUAGE_CODE_LENGTH).toUpperCase();
    }
    function xorEncode(text: string): string {
      let encoded = '';
      for (let i2 = 0; i2 < text.length; i2++) {
        const charCode = text.charCodeAt(i2);
        // eslint-disable-next-line no-bitwise -- XOR cipher is the intended encoding; bitwise is required.
        const encodedCharCode = charCode ^ XOR_ENCODE_KEY;
        encoded += String.fromCharCode(encodedCharCode);
      }
      return encoded;
    }
  }

  public prepareAndUpdate(deltaMilliseconds?: number): void {
    if (this.preparing()) {
      let prepareAcceleration = this.config.prepareAcceleration;
      while (this.preparing() && prepareAcceleration > 0) {
        this.update(TWO_FRAME_DURATION_MILLISECONDS);
        prepareAcceleration--;
      }
    } else {
      // eslint-disable-next-line no-console -- prepare-phase frame-delta debug logging, restored verbatim from the original app2.js.
      console.log(deltaMilliseconds);
      this.update(deltaMilliseconds);
    }
  }

  public preparing(): boolean {
    return this.cycle < this.config.prepareCounter;
  }

  public readInput(deltaMilliseconds?: number): void {
    if (this.controller.pressed()) {
      this.keyboard = { ...this.controller.mouse };
      const maxTurnThisFrame = TURN_SPEED_RADIANS_PER_SECOND * ensureNonNullable(deltaMilliseconds) / MILLISECONDS_IN_SECOND;
      if (ensureNonNullable(this.controller.keyboardModeSwitch).mode2) {
        let horizontalInput = 0;
        if (this.controller.left) {
          horizontalInput = -1;
        }
        if (this.controller.right) {
          horizontalInput = 1;
        }
        if (horizontalInput) {
          this.direction.rotate(horizontalInput * maxTurnThisFrame);
        }
      } else {
        const vector = new Vector();
        if (this.controller.up) {
          vector.add(new Vector(0, -1));
        }
        if (this.controller.down) {
          vector.add(new Vector(0, 1));
        }
        if (this.controller.left) {
          vector.add(new Vector(-1, 0));
        }
        if (this.controller.right) {
          vector.add(new Vector(1, 0));
        }
        if (vector.magnitude()) {
          let turnAngle = Math.atan2(this.direction.x * vector.y - vector.x * this.direction.y, this.direction.x * vector.x + this.direction.y * vector.y);
          if (Math.abs(turnAngle) > maxTurnThisFrame) {
            turnAngle = Math.sign(turnAngle) * maxTurnThisFrame;
          }
          this.direction.rotate(turnAngle);
        }
      }
    } else if (this.controller.mouse) {
      if (!this.keyboard || (this.keyboard.x !== this.controller.mouse.x && this.keyboard.y !== this.controller.mouse.y)) {
        this.keyboard = null;
        this.direction = new Vector(this.controller.mouse.x, this.controller.mouse.y).sub(new Vector(this.view.clientWidth / HALF_DIVISOR, this.view.clientHeight / HALF_DIVISOR)).normalize();
      }
    } else if (!this.keyboard && this.controller.lastMouse) {
      this.direction = new Vector(this.controller.lastMouse.x, this.controller.lastMouse.y).sub(new Vector(this.view.clientWidth / HALF_DIVISOR, this.view.clientHeight / HALF_DIVISOR)).normalize();
    }
  }

  public recoverTail(): void {
    const player = this.player;
    if (player && player.in === player.base && !player.base.polygon.inside(player.position)) {
      if (!player.moveTo) {
        return;
      }
      const nearestSegment = player.base.polygon.segments.reduce((closest: Segment, segment: Segment) => closest.start.distance2(player.position) < segment.start.distance2(player.position) ? closest : segment);
      const vector = nearestSegment.start.clone().sub(player.position);
      const distance = vector.magnitude();
      player.position = vector.mulScalar(1 + 1 / distance).add(player.position);
      player.track.remove();
      if (this.debug) {
        player.game.alert('Tail is recovered');
        // eslint-disable-next-line no-console -- tail-recovery debug logging (only when `this.debug`), restored verbatim from the original app2.js.
        console.log(`Recovering tail, cycle: ${String(this.cycle)}`);
        this.tailRecovered = true;
      } else if (window.ga) {
        window.ga('send', 'event', 'error', 'tailRecovered');
      }
    }
  }

  public render(): void {
    if (this.renderer) {
      this.renderer(this);
    }
  }

  public setLeaderboard(leaderboard?: Leaderboard): void {
    if (leaderboard) {
      this.leaderboard = leaderboard;
      this.changeShields();
    }
  }

  public spawnBot(spawnMode?: 'bounds' | 'center' | 'player' | 'random'): void {
    const {
      baseCount,
      baseRadius,
      botsCount,
      spawnTimeout
    } = this.config;
    if (this.botSpawnLimited) {
      if (this.spawnSuspend > 0) {
        return;
      }
      this.spawnSuspend = spawnTimeout * (1 + this.rng());
    }
    if (this.units.length - (this.player ? 1 : 0) >= botsCount) {
      return;
    }
    if (!this.nameManager.aviable()) {
      return;
    }
    if (!this.skinManager.available()) {
      return;
    }
    const spawnPosition = this.getSpawnPosition(spawnMode);
    if (!spawnPosition) {
      return;
    }
    const botTypeCounts: number[] = [0, 0, 0, 0];
    // eslint-disable-next-line no-magic-numbers -- bot-type distribution weight tables: each row is a fixed weighted bag of bot-type ids selected by game level; the individual cells are not separately nameable.
    const list4: number[][] = [[1, 2, 2, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 2, 2, 2, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0], [1, 1, 2, 2, 2, 2, 3, 3, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 2, 2, 2, 2, 2, 3, 0, 0, 0, 0, 0, 0]];
    this.units.forEach((unit: Unit) => {
      if (unit !== this.player) {
        botTypeCounts[unit.type] = ensureNonNullable(botTypeCounts[unit.type]) + 1;
      }
    });
    this.bots = [...botTypeCounts];
    const typeDistribution = ensureNonNullable(list4[Math.round(this.level * (list4.length - 1))]);
    let distributionIndex = -1;
    while (ensureNonNullable(botTypeCounts[ensureNonNullable(typeDistribution[++distributionIndex])]) > 0) {
      const decrementType = ensureNonNullable(typeDistribution[distributionIndex]);
      botTypeCounts[decrementType] = ensureNonNullable(botTypeCounts[decrementType]) - 1;
    }
    const botType = ensureNonNullable(typeDistribution[distributionIndex]);
    const botName = ensureNonNullable(this.nameManager.get());
    const bot = new Bot(this, botType, botName, spawnPosition, createCirclePoints(spawnPosition, baseCount, baseRadius), undefined, this.schemesManager);
    const botSkin = this.skinManager.get();
    bot.setSkin(botSkin);
    this.addUnit(bot);
    this.bots[botType] = ensureNonNullable(this.bots[botType]) + 1;
  }

  public spawnPlayer(playerName?: string, skinName?: string, areaPercent?: number): void {
    const {
      baseCount,
      baseRadius,
      botsCount,
      maxScale,
      minScale
    } = this.config;
    const killUnitToMakeRoom = (): void => {
      if (this.units.length) {
        this.kill(this.units[Math.trunc(this.units.length / HALF_DIVISOR)], undefined, KILL_REASON_SYSTEM);
      }
    };
    if (this.units.length && this.units.length >= botsCount) {
      killUnitToMakeRoom();
    }
    let spawnPosition: undefined | Vector;
    let i2 = 0;
    const spawnRadius = areaPercent ? Math.sqrt(this.square * areaPercent / Math.PI) : baseRadius;
    while (!spawnPosition) {
      if (i2++ > MAX_SPAWN_ATTEMPTS) {
        i2 = 0;
        killUnitToMakeRoom();
      }
      spawnPosition = this.getSpawnPosition('random', spawnRadius);
    }
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty player name must fall through to the default name, so the falsy `||` fallback is intentional.
    const player = new Player(this, playerName || this.language.defaultPlayerName, spawnPosition, createCirclePoints(spawnPosition, baseCount, spawnRadius), undefined, this.schemesManager);
    const playerSkin = this.skinManager.getPlayerSkin(skinName);
    player.setSkin(playerSkin);
    this.addPlayer(player);
    this.scale = maxScale - Math.trunc(player.base.square / this.square * SCALE_QUANTIZATION_STEPS) / SCALE_QUANTIZATION_STEPS * (maxScale - minScale);
    this.startTime = now();
  }

  public stepSimulation(deltaMilliseconds: number): void {
    if (this.replaying || this.recording) {
      if (this.cycle < this.config.prepareCounter + REPLAY_PREPARE_EXTRA_FRAMES && deltaMilliseconds > REPLAY_MAX_DELTA_MILLISECONDS) {
        deltaMilliseconds = REPLAY_MAX_DELTA_MILLISECONDS;
      }
      if (deltaMilliseconds > FRAME_DURATION_MILLISECONDS * FRAME_SNAP_LOWER_FACTOR && deltaMilliseconds < FRAME_DURATION_MILLISECONDS * FRAME_SNAP_UPPER_FACTOR) {
        deltaMilliseconds = FRAME_DURATION_MILLISECONDS;
      }
      this.timeAccumulated += deltaMilliseconds;
      if (this.preparing()) {
        this.prepareAndUpdate(FRAME_DURATION_MILLISECONDS);
        this.timeAccumulated = 0;
      } else if (this.replaying && this.replaying.skip && this.replaying.skipping()) {
        let prepareAcceleration = this.config.prepareAcceleration;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- this.replaying may be cleared by update() during the loop; TS narrowing from the enclosing guard is stale.
        while (this.replaying && this.replaying.skipping() && prepareAcceleration-- > 0) {
          this.update(FRAME_DURATION_MILLISECONDS);
        }
        this.timeAccumulated = 0;
      } else {
        if (this.timeAccumulated > FRAME_DURATION_MILLISECONDS * MAX_ACCUMULATED_FRAMES) {
          this.timeAccumulated = FRAME_DURATION_MILLISECONDS * MAX_ACCUMULATED_FRAMES;
        }
        while (this.timeAccumulated >= FRAME_DURATION_MILLISECONDS) {
          this.timeAccumulated -= FRAME_DURATION_MILLISECONDS;
          this.update(FRAME_DURATION_MILLISECONDS);
        }
      }
    } else if (this.visible) {
      const maxStepMilliseconds = FRAME_DURATION_MILLISECONDS * DOUBLE_FACTOR;
      while (deltaMilliseconds > 0) {
        let stepMilliseconds: number;
        if (deltaMilliseconds <= maxStepMilliseconds) {
          stepMilliseconds = deltaMilliseconds;
        } else if (deltaMilliseconds < maxStepMilliseconds * DOUBLE_FACTOR) {
          stepMilliseconds = deltaMilliseconds / HALF_DIVISOR + Math.random();
        } else {
          stepMilliseconds = maxStepMilliseconds + Math.random();
        }
        this.update(stepMilliseconds);
        deltaMilliseconds -= stepMilliseconds;
      }
    } else {
      this.prepareAndUpdate(deltaMilliseconds);
    }
  }

  public stop(): void {
    this.stopped = true;
    clearInterval(this.updateParticlesId);
    for (const unit of this.units) {
      this.skinManager.release(unit.skin);
    }
  }

  public update(deltaMilliseconds?: number): boolean {
    const {
      maxScale,
      minScale,
      observerScale
    } = this.config;
    if (this.stopped) {
      return false;
    }
    Vector.space = this.space;
    deltaMilliseconds ??= FRAME_DURATION_MILLISECONDS;
    deltaMilliseconds += this.rng() * UPDATE_JITTER_FACTOR;
    this.spawnSuspend -= deltaMilliseconds;
    if (!this.isTest) {
      this.readInput(deltaMilliseconds);
    }
    this.angle = Math.round(Math.atan2(this.direction.y, this.direction.x) / Math.PI * ANGLE_QUANTIZATION_SCALE + ANGLE_QUANTIZATION_OFFSET) % ANGLE_QUANTIZATION_OFFSET;
    if (this.replaying) {
      if (!this.replaying.read()) {
        delete this.replaying;
        this.alert('End of replay', '#ff0000');
        return false;
      }
    }
    if (this.recording) {
      this.recording.write();
    }
    this.recoverTail();
    const {
      player
    } = this;
    this.timings.aiStartTime = now();
    this.units.forEach((unit: Unit) => {
      unit.update(deltaMilliseconds);
    });
    this.timings.aiEndTime = now();
    this.handleUnitMovements(deltaMilliseconds);
    this.units.forEach((unit: Unit) => {
      unit.lastSquare = unit.base.square;
    });
    this.units.forEach((unit: Unit) => {
      const percent = unit.base.square / this.square;
      unit.percent = percent;
      unit.bestPercent = Math.max(unit.bestPercent, percent);
      unit.scale = lerp(maxScale, minScale, easeOutCubic(Math.trunc(percent * SCALE_QUANTIZATION_STEPS) / SCALE_QUANTIZATION_STEPS));
      unit.vrange = Math.sqrt(REFERENCE_DIAGONAL_SQUARED) / HALF_DIVISOR / unit.scale * VRANGE_FACTOR;
      if (unit.schemes) {
        unit.schemes.update(deltaMilliseconds);
      }
      if (unit.labels.length) {
        let vector = new Vector(0, LABEL_STACK_OFFSET_Y);
        const vector2 = new Vector(0, LABEL_SPACING_Y);
        const vector3 = new Vector(0, LABEL_SPACING_Y);
        unit.labels.forEach((textParticle: Label) => {
          this.labels.push(new TextParticle(textParticle.text, textParticle.color, ensureNonNullable(textParticle.unit), vector, vector2, textParticle.time, textParticle.fading));
          vector = vector.clone().add(vector3);
        });
        unit.labels = [];
      }
    });
    this.units.sort((unitA: Unit, unitB: Unit) => unitB.schemes && unitA.schemes ? unitB.schemes.scores() - unitA.schemes.scores() : 0);
    this.units.forEach((unit: Unit, index: number) => {
      unit.top = index + 1;
    });
    this.labels = this.labels.filter((particle: TextParticle) => {
      particle.update(deltaMilliseconds);
      return particle.time > 0;
    });
    this.updateNotifications(deltaMilliseconds);
    this.particles.forEach((particle: Particle) => {
      particle.update(deltaMilliseconds);
    });
    if (player) {
      this.level = lerp(this.config.startBotLevel, 1, player.percent);
    } else {
      this.level = this.config.noPlayerBotLevel;
    }
    if (this.config.botLevel !== -1) {
      this.level = this.config.botLevel;
    }
    this.units.forEach((bot: Unit) => {
      if (bot instanceof Bot) {
        const clampedLevel = Math.min(1, Math.max(0, this.level + bot.jitter));
        let {
          botAggroMax,
          botAggroMin,
          botDefMax,
          botDefMin,
          botGreedMax,
          botGreedMin,
          botSafetyMax,
          botSafetyMin
        } = this.config;
        switch (bot.type) {
          case 1:
            botAggroMin *= BOT1_AGGRO_MULT;
            botAggroMax *= BOT1_AGGRO_MULT;
            break;
          case BOT_TYPE_2:
            botGreedMin *= BOT2_GREED_MIN_MULT;
            botGreedMax *= BOT_GREED_MAX_MULT;
            botSafetyMin *= BOT2_SAFETY_MULT;
            botSafetyMax *= BOT2_SAFETY_MULT;
            break;
          case BOT_TYPE_3:
            botAggroMin *= BOT3_AGGRO_MULT;
            botAggroMax *= BOT3_AGGRO_MULT;
            botGreedMin *= BOT3_GREED_MIN_MULT;
            botGreedMax *= BOT_GREED_MAX_MULT;
            botSafetyMin *= BOT3_SAFETY_MULT;
            botSafetyMax *= BOT3_SAFETY_MULT;
            botDefMin *= BOT3_DEF_MULT;
            botDefMax *= BOT3_DEF_MULT;
            break;
          default:
            break;
        }
        bot.aggro = lerp(botAggroMin, botAggroMax, clampedLevel);
        bot.greed = lerp(botGreedMin, botGreedMax, clampedLevel);
        bot.safety = lerp(botSafetyMin, botSafetyMax, clampedLevel);
        bot.def = lerp(botDefMin, botDefMax, clampedLevel);
      }
    });
    if (this.player?.achievements) {
      this.player.achievements.update(this.player, deltaMilliseconds, this);
    }
    this.updateClosestBotAttack(player);
    const targetScale = player ? player.scale : observerScale;
    const scaleDelta = targetScale - this.scale;
    this.scale += scaleDelta * deltaMilliseconds / SCALE_LERP_DIVISOR;
    if (player && player.percent > WIN_PERCENT_THRESHOLD) {
      player.percent = 1;
      this.gameOver(KILL_REASON_WIN);
    }
    this.timings.spawnStartTime = now();
    for (let i2 = 0; i2 < this.config.nearPlayerBotSpawnCount; i2++) {
      this.spawnBot('player');
    }
    this.spawnBot('center');
    this.spawnBot(this.rng() > BOUNDS_SPAWN_CHANCE ? 'bounds' : 'random');
    this.timings.spawnEndTime = now();
    this.cycle++;
    return true;
  }

  public updateClosestBotAttack(player: null | Player): void {
    if (!player || player.track.length <= this.config.botAttackTrackLength) {
      return;
    }
    let closestBot: Bot | null = null;
    let closestDistance = Infinity;
    for (const unit of this.units) {
      if (unit instanceof Bot) {
        let minDistance = Infinity;
        player.track.simplyline.forEach((trackPoint: Vector) => {
          const distanceSquared = trackPoint.distance2(unit.position);
          if (distanceSquared < minDistance) {
            minDistance = distanceSquared;
          }
        });
        minDistance = Math.sqrt(minDistance);
        if (minDistance < closestDistance) {
          closestBot = unit;
          closestDistance = minDistance;
        }
      }
    }
    if (closestBot) {
      ensureNonNullable(closestBot.fsm).change('attack');
    }
  }

  public updateMetrics(frameTime: number): void {
    const {
      stats,
      timings
    } = this;
    const metric: Metric = {
      events: this.events,
      frameTime,
      renderTime: timings.renderEndTime - timings.renderStartTime,
      updateTime: timings.updateEndTime - timings.updateStartTime
    };
    this.metrics.push(metric);
    if (this.metrics.length > MAX_METRICS_SAMPLES) {
      this.metrics.shift();
    }
    const smoothingFactor = 0.05;
    stats.fps = lerp(stats.fps, MILLISECONDS_IN_SECOND / frameTime, smoothingFactor);
    stats.ut = lerp(stats.ut, timings.updateEndTime - timings.updateStartTime, smoothingFactor);
    stats.ait = lerp(stats.ait, timings.aiEndTime - timings.aiStartTime, smoothingFactor);
    stats.st = lerp(stats.st, timings.spawnEndTime - timings.spawnStartTime, smoothingFactor);
    stats.rt = lerp(stats.rt, timings.renderEndTime - timings.renderStartTime, smoothingFactor);
    this.fpsSequence.push(stats.fps);
    const lowFpsThreshold = 25;
    const highFpsThreshold = 35;
    const criticalFpsThreshold = 10;
    const fpsSampleSize = 120;
    const minQuality = 0.5;
    if (this.fpsSequence.length > fpsSampleSize) {
      this.fpsSequence.sort();
      const medianFps = ensureNonNullable(this.fpsSequence[Math.trunc(fpsSampleSize / HALF_DIVISOR)]);
      if (medianFps < lowFpsThreshold) {
        this.quality -= QUALITY_STEP;
      }
      if (medianFps < criticalFpsThreshold) {
        this.quality -= QUALITY_STEP;
      }
      if (this.quality < minQuality) {
        this.quality = minQuality;
      }
      if (medianFps > highFpsThreshold) {
        this.quality += QUALITY_STEP;
      }
      if (this.quality > 1) {
        this.quality = 1;
      }
      const qualityLevel = Math.round(this.quality * QUALITY_QUANTIZATION_STEPS);
      this.quality = qualityLevel / QUALITY_QUANTIZATION_STEPS;
      if (qualityLevel < QUALITY_QUANTIZATION_STEPS) {
        const qualityKey = `q${String(qualityLevel)}`;
        if (this.qas[qualityKey]) {
          this.qas[qualityKey] = false;
          if (window.ga) {
            window.ga('send', 'event', 'fps', qualityKey);
          }
        }
      }
      this.fpsSequence = [];
    }
    this.events = {
      kills: 0,
      returns: 0
    };
  }

  public updateNotifications(deltaMilliseconds: number): void {
    if (this.notifications.length) {
      const quest = ensureNonNullable(this.notifications[0]);
      if (quest.ready) {
        quest.update(deltaMilliseconds);
        if (quest.state > QUEST_STATE_COMPLETE) {
          this.notifications.shift();
        }
      }
    }
  }
}
// eslint-disable-next-line perfectionist/sort-modules, import-x/export -- engine declarations kept in dependency order; `Config` is a valid TypeScript declaration merge (adds the config-form index signature) that import-x false-positives as a duplicate export.
export interface Config {
  // Every field is a `string | number | boolean`; the index signature lets the
  // Config-editing form write fields back by their dynamic string key (its
  // Named fields keep their specific types since those take precedence).
  [configKey: string]: boolean | number | string;
  arenaColor: string;
  arenaSize: number;
  backgroundBottomColor: string;
  backgroundTopColor: string;
  baseCount: number;
  baseHeight: number;
  baseRadius: number;
  borderColor: string;
  borderPoints: number;
  botAggroMax: number;
  botAggroMin: number;
  botAttackTrackLength: number;
  botDefMax: number;
  botDefMin: number;
  botGreedMax: number;
  botGreedMin: number;
  botLevel: number;
  botSafetyMax: number;
  botSafetyMin: number;
  botsCount: number;
  enemyKillDelay: number;
  followKiller: boolean;
  font: string;
  maxPreparingTime: number;
  maxScale: number;
  minScale: number;
  nearPlayerBotSpawnCount: number;
  noPlayerBotLevel: number;
  observerScale: number;
  platesStrokeWidth: number;
  prepareAcceleration: number;
  prepareBatchCount: number;
  prepareCounter: number;
  prepareMult: number;
  quadSize: number;
  selfKillDelay: number;
  spawnTimeout: number;
  startBotLevel: number;
  trackWidth: number;
  unitSpeed: number;
}
// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface GameResults {
  kills: number;
  newBest: boolean;
  score: number;
  time: number;
}

// Declaration-merged onto the core `Component` (rather than kept as a
// Parallel `PreactComponent` type): the bundled preact/hooks addon patches
// The shared `preactOptions` object and touches the same live
// Component/vnode instances the core reconciler already types, so both
// Sides need to agree on one shape.

/* eslint-disable no-magic-numbers -- default game-config data table. */
export const defaultConfig = {
  arenaColor: '#e7fff4',
  arenaSize: 2000,
  backgroundBottomColor: '#81faff',
  backgroundTopColor: '#2d6998',
  baseCount: 50,
  baseHeight: 2,
  baseRadius: 30,
  borderColor: '#88a799',
  borderPoints: 300,
  botAggroMax: 1,
  botAggroMin: 0.2,
  botAttackTrackLength: 1500,
  botDefMax: 0.6,
  botDefMin: 1.2,
  botGreedMax: 0.6,
  botGreedMin: 0.1,
  botLevel: -1,
  botSafetyMax: 1,
  botSafetyMin: 0.5,
  botsCount: 15,
  enemyKillDelay: 2000,
  followKiller: true,
  font: 'PT Sans Caption',
  maxPreparingTime: 500,
  maxScale: 4.5,
  minScale: 3,
  nearPlayerBotSpawnCount: 1,
  noPlayerBotLevel: 0.5,
  observerScale: 2.5,
  platesStrokeWidth: 0,
  prepareAcceleration: 30,
  prepareBatchCount: 5,
  prepareCounter: 6000,
  prepareMult: 3,
  quadSize: 20,
  selfKillDelay: 1000,
  spawnTimeout: 3000,
  startBotLevel: 0.1,
  trackWidth: 8,
  unitSpeed: 90
};
/* eslint-enable no-magic-numbers -- end of the default game-config data table. */
