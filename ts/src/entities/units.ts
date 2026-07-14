import type { Game } from '../engine.ts';
import type { Polygon } from '../geometry/shapes.ts';
import type {
  AchievementTracker,
  SchemeCycler,
  Scoreboard,
  ScoreLabel
} from '../scoring.ts';
import type {
  Asset,
  Skin
} from '../skins.ts';

import { Vector } from '../geometry/vector.ts';
import {
  MILLISECONDS_IN_SECOND,
  PERCENT_MAX,
  QUARTER_TURN
} from '../shared/constants.ts';
import { now } from '../shared/math-utils.ts';
import { noop } from '../shared/noop.ts';
import { createRandomGenerator } from '../shared/random.ts';
import { ensureNonNullable } from '../type-guards.ts';
import {
  botStates,
  StateMachine
} from './bot-ai.ts';
import {
  Territory,
  Trail
} from './territory-trail.ts';

export interface UnitScores {
  accumulator: number;
  kills: number;
}
export interface UnitStatistics {
  kills: number;
}
export interface UnitTrackDistance {
  danger: number;
  trackDistance: number;
  trackPoint: null | Vector;
  unit: Unit;
}

// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface Label {
  color: string;
  fading?: boolean;
  text: string;
  time: number;
  unit?: null | Unit;
}

export type SchemeConstructor = new (unit: Unit) => ScoreLabel;

// eslint-disable-next-line perfectionist/sort-modules -- engine declarations kept in original dependency order; alphabetical module sort would reorder extends subclasses before their base classes and break runtime init.
export interface ComebackInfo {
  game: Game;
  increment: number;
  rise: Polygon;
  victims: ComebackVictim[];
}
export interface ComebackVictim {
  base: Territory;
  poly: Polygon;
}

export const CITY_SAME_COUNTRY_FACTOR = 0.5;
export const CITY_FOREIGN_FACTOR = 0.1;
export class City {
  public capital: boolean;
  public country: string;
  public labels: Label[];
  public name: string;
  public position: Vector;
  public scores: number;
  public skin: null | Skin;
  public unit: null | Unit;
  public constructor(name: string, isCapital: boolean, position: Vector, unit: null | Unit) {
    this.name = name;
    this.capital = isCapital;
    this.position = position;
    this.unit = unit;
    this.labels = [];
    this.country = ensureNonNullable(ensureNonNullable(unit).skin.assets.find((asset: Asset) => asset.pool.name === 'flags')).name;
    this.scores = 0;
    this.skin = null;
  }

  public add(amount: number): number {
    const name = ensureNonNullable(ensureNonNullable(this.unit).skin.assets.find((asset: Asset) => asset.pool.name === 'flags')).name;
    let scoreGain: number;
    if (name === this.country) {
      scoreGain = amount * (this.capital ? 1 : CITY_SAME_COUNTRY_FACTOR);
    } else {
      scoreGain = amount * CITY_FOREIGN_FACTOR;
    }
    this.scores += scoreGain;
    return scoreGain;
  }
}
export const TOP_LIST_RANK_LIMIT = 5;
export class Unit {
  public achievements: AchievementTracker | null;
  public base: Territory;
  public baseDistance: number;
  public baseNearestPoint: null | Vector;
  public baseNearestPointNormal: null | Vector;
  public baseNearestPointTangent: null | Vector;
  public bestPercent: number;
  public bornTime: number;
  public cities: City[];
  public death: boolean;
  public direction: number;
  public fsm: null | StateMachine;
  public game: Game;
  public in: null | Territory;
  public readonly isPlayer: boolean = false;
  public jitter: number;
  public killer: null | Unit;
  public labels: Label[];
  public lastSquare: number;
  public log: Vector[];
  public name: string;
  public percent: number;
  public position: Vector;
  public respawn: boolean;
  public scale: number;
  public schemes: null | Scoreboard;
  public scores: UnitScores;
  public smoothness: number;
  public statistics: UnitStatistics;
  public target: null | Vector;
  public top: number;
  public track: Trail;
  public type: number;
  public vrange: number;
  public get skin(): Skin {
    return ensureNonNullable(this._skin);
  }

  public set skin(value: Skin) {
    this._skin = value;
  }

  private _skin: null | Skin = null;
  public constructor(game: Game, name: string, position: Vector, basePoints: Vector[], _unused?: undefined, schemeCycler?: SchemeCycler) {
    this.killer = null;
    this.achievements = null;
    this.death = false;
    this.jitter = 0;
    this.smoothness = 0;
    this.type = 0;
    this.fsm = null;
    this.game = game;
    this.name = name;
    this.position = position;
    this.base = new Territory(this, basePoints);
    this.track = new Trail(this);
    this.lastSquare = this.base.square;
    this.in = this.base;
    this.target = null;
    this.respawn = false;
    this.statistics = {
      kills: 0
    };
    this.log = [];
    this.bornTime = now();
    this.cities = [];
    this.labels = [];
    this.percent = 0;
    this.bestPercent = 0;
    this.scale = 0;
    this.vrange = 1;
    this.direction = 0;
    this.top = 0;
    this.scores = {
      accumulator: 0,
      kills: 0
    };
    this.schemes = (schemeCycler?.getSchemes(this)) ?? null;
    this.baseDistance = 0;
    this.baseNearestPoint = null;
    this.baseNearestPointTangent = null;
    this.baseNearestPointNormal = null;
  }

  public addLabel(label: Label): void {
    label.unit ??= this;
    this.labels.push(label);
  }

  public movement(): null | Vector {
    return this.target?.clone().sub(this.position).normalize() ?? null;
  }

  public onScoreChanged(): void {
    if (this.game.units.indexOf(this) <= TOP_LIST_RANK_LIMIT || this.isPlayer) {
      this.game.topListChanged = true;
    }
  }

  public setSkin(skin: Skin): void {
    this.skin = skin;
    skin.user = this;
  }

  public update(deltaTime: number): void {
    this.log.push(this.position);
    if (this.in !== this.base) {
      this.scores.accumulator += this.percent * PERCENT_MAX * deltaTime / MILLISECONDS_IN_SECOND;
    }
    let nearestDistanceSquared = 0;
    let nearestPoint = null;
    let tangent = null;
    if (this.in !== this.base) {
      nearestDistanceSquared = Infinity;
      let nearestIndex = 0;
      const {
        simplify
      } = this.base.polygon;
      simplify.forEach((point: Vector, index: number) => {
        const distanceSquared = point.distance2(this.position);
        if (distanceSquared < nearestDistanceSquared) {
          nearestDistanceSquared = distanceSquared;
          nearestPoint = point;
          nearestIndex = index;
        }
      });
      const previousPoint = simplify[nearestIndex > 0 ? nearestIndex - 1 : simplify.length - 1];
      const nextPoint = simplify[nearestIndex < simplify.length - 1 ? nearestIndex + 1 : 0];
      tangent = ensureNonNullable(nextPoint).clone().sub(ensureNonNullable(previousPoint)).normalize();
    }
    nearestDistanceSquared = Math.sqrt(nearestDistanceSquared);
    this.baseDistance = nearestDistanceSquared;
    this.baseNearestPoint = nearestPoint;
    this.baseNearestPointTangent = tangent;
    this.baseNearestPointNormal = tangent?.clone().rotate(-QUARTER_TURN) ?? null;
  }
}
export const PLAYER_ANGLE_DIVISOR = 127;
export const PLAYER_TARGET_DISTANCE = 50;
export class Player extends Unit {
  public override readonly isPlayer: boolean = true;
  public moveTo?: boolean;
  public win: boolean;
  public constructor(game: Game, name: string, position: Vector, basePoints: Vector[], unused?: undefined, schemeCycler?: SchemeCycler) {
    super(game, name, position, basePoints, unused, schemeCycler);
    this.win = false;
  }

  public override update(deltaMilliseconds: number): void {
    super.update(deltaMilliseconds);
    if (!this.respawn) {
      this.target = new Vector(1, 0).rotate(this.game.angle * Math.PI / PLAYER_ANGLE_DIVISOR).mulScalar(PLAYER_TARGET_DISTANCE).add(this.position);
    }
  }
}
export const BOT_JITTER_RANDOM_SCALE = 2;
export const BOT_JITTER_MAGNITUDE = 0.1;
export class Bot extends Unit {
  public aggro: number;
  public aspect?: string;
  public capSquare = 0;
  public def: number;
  public distanceDanger = 0;
  public greed: number;
  public maxDanger: number;
  public safety: number;
  // Assigned an empty array in the constructor and never populated by any observed code path.
  public targets: Unit[];
  public unitDanger: null | Unit;
  public unitToTrackDistances: UnitTrackDistance[] = [];
  public constructor(game: Game, type: number, name: string, position: Vector, basePoints: Vector[], unused?: undefined, schemeCycler?: SchemeCycler) {
    super(game, name, position, basePoints, unused, schemeCycler);
    this.aggro = 0;
    this.greed = 0;
    this.safety = 0;
    this.def = 0;
    this.type = type;
    this.jitter = (this.game.rng() * BOT_JITTER_RANDOM_SCALE - 1) * BOT_JITTER_MAGNITUDE;
    this.targets = [];
    this.smoothness = 1;
    this.maxDanger = 0;
    this.unitDanger = null;
    this.fsm = new StateMachine(botStates, 'idle', this);
  }

  public override update(deltaMilliseconds: number): void {
    super.update(deltaMilliseconds);
    this.unitToTrackDistances = [];
    let maxDanger = 0;
    let dangerDistance = 0;
    let dangerUnit: null | Unit = null;
    if (this.in !== this.base) {
      const {
        player
      } = this.game;
      this.game.units.forEach((otherUnit: Unit) => {
        const isPlayerOutOfRange = player === otherUnit && this.position.distance(otherUnit.position) > this.vrange;
        if (otherUnit !== this && !isPlayerOutOfRange) {
          let nearestTrackDistance = Infinity;
          let nearestTrackPoint: null | Vector = null;
          this.track.simplyline.forEach((trackPoint: Vector) => {
            const distanceSquared = trackPoint.distance2(otherUnit.position);
            if (distanceSquared < nearestTrackDistance) {
              nearestTrackDistance = distanceSquared;
              nearestTrackPoint = trackPoint;
            }
          });
          nearestTrackDistance = Math.sqrt(nearestTrackDistance);
          const danger = this.baseDistance / nearestTrackDistance;
          this.unitToTrackDistances.push({
            danger,
            trackDistance: nearestTrackDistance,
            trackPoint: nearestTrackPoint,
            unit: otherUnit
          });
          if (danger > maxDanger) {
            dangerUnit = otherUnit;
            dangerDistance = nearestTrackDistance;
            maxDanger = danger;
          }
        }
      });
    }
    this.unitDanger = dangerUnit;
    this.distanceDanger = dangerDistance;
    this.maxDanger = maxDanger;
    this.smoothness = 1;
    ensureNonNullable(this.fsm).update();
  }
}
export const fromCharCode = String.fromCharCode;
export class NamePool {
  public pool: string[];
  public rng: (seed?: number) => number;
  public constructor(pool: string[], seed: number) {
    this.pool = pool;
    this.rng = createRandomGenerator(seed);
  }

  public aviable(): boolean {
    return true;
  }

  public get(): string | undefined {
    const randomValue = this.rng();
    const name = this.pool[Math.trunc(randomValue * this.pool.length)];
    return name;
  }

  public release(names: string[]): void {
    this.pool.push(...names);
  }

  public request(): void {
    noop();
  }
}
export const MILLISECONDS_IN_MINUTE = 60000;
