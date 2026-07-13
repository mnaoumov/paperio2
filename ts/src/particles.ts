import type { Unit } from './entities.ts';

import {
  Segment,
  Vector
} from './geometry.ts';
import {
  FULL_TURN,
  HEX_CHANNEL_DIGITS,
  HEX_RADIX,
  IMAGE_CENTER_DIVISOR,
  MILLISECONDS_IN_SECOND,
  QUARTER_TURN,
  RGB_CHANNEL_MAX
} from './shared/constants.ts';
import { ensureNonNullable } from './type-guards.ts';

export type ParticleColor = HTMLCanvasElement | HTMLImageElement | string;

export function createParticleSquarePath(): Path2D {
  const path2D = new Path2D();
  const halfSize = 1;
  path2D.moveTo(-halfSize, -halfSize);
  path2D.lineTo(halfSize, -halfSize);
  path2D.lineTo(halfSize, halfSize);
  path2D.lineTo(-halfSize, halfSize);
  path2D.closePath();
  return path2D;
}
export const particleSquarePath = createParticleSquarePath();
export const RANDOM_MIDPOINT = 0.5;
export const NOM_SCALE_HALF_DIVISOR = 2;
// eslint-disable-next-line no-magic-numbers -- ±6° velocity spread for spawned nom particles.
export const NOM_VELOCITY_SPREAD_ANGLE = Math.PI / 30;
// eslint-disable-next-line no-magic-numbers -- ±18° acceleration spread for spawned nom particles.
export const NOM_ACCEL_SPREAD_ANGLE = Math.PI / 10;
export const NOM_DECELERATION_FACTOR = -6;
export const NOM_SCALE_MIN = 0.75;
export const NOM_SCALE_RANGE = 0.5;
export const NOM_VSCALE_FACTOR = -2;
export const NOM_PARTICLE_LIFETIME_MS = 300;
export const PARTICLE_IMAGE_SCALE_DIVISOR = 20;
export const SCORE_PARTICLE_SPACING = 5;
export const SCORE_PARTICLE_SPEED_MIN = 25;
export const SCORE_PARTICLE_SPEED_RANGE = 100;
export const SCORE_PARTICLE_SLOW_CHANCE = 0.25;
export const SCORE_PARTICLE_SLOW_FACTOR = 0.1;
export const SCORE_TRANSFER_ROTATION_FACTOR = 3;
export const ROTATION_SPEED_RANGE = 0.5;
export const SCORE_PARTICLE_LIFETIME_MIN_MS = 500;
export const SCORE_PARTICLE_LIFETIME_RANGE_MS = 500;
export const VSCALE_ROTATION_FACTOR = 0.7;
export const SCORE_ACCEL_MIN = 1.5;
export const SCORE_ACCEL_RANGE = 0.5;
export class Particle {
  // `velocity`/`acceleration` are normally Vectors, but the score-collection path in
  // SpawnScoreParticles reassigns them to scalar speeds on already-expiring particles (time===1),
  // So the field type is a union and the vector math below is typeof-guarded.
  public acceleration: null | number | Vector;
  public color: ParticleColor;
  public fn: ((particle: Particle) => void) | null;
  public position: Vector;
  public rotate: number;
  public rotation: number;
  public scale: number;
  public target: null | Unit;
  public time: number;
  public velocity: number | Vector;
  public vscale: number;
  public constructor(target: null | Unit, color: ParticleColor, position: Vector, velocity: number | Vector, acceleration: null | number | Vector, rotate: number, scale: number, vscale: number, time: number, callback?: (particle: Particle) => void) {
    this.target = target;
    this.color = color;
    this.position = position;
    this.velocity = velocity;
    this.acceleration = acceleration;
    this.rotate = rotate;
    this.scale = scale;
    this.vscale = vscale;
    this.rotation = Math.random() * FULL_TURN;
    this.time = time;
    this.fn = callback ?? null;
  }

  public static nom(unit: Unit, segment: Segment, scale: number): Particle {
    const randomSign = Math.sign(Math.random() - RANDOM_MIDPOINT);
    const scaledMaxScale = unit.skin.container.maxScale * scale;
    const {
      baseHeight,
      unitSpeed
    } = unit.game.config;
    const velocity = ensureNonNullable(segment.vector).clone().normalize().rotate(randomSign * Math.random() * NOM_VELOCITY_SPREAD_ANGLE).mulScalar(unitSpeed * (1 + Math.random()));
    const perpendicularOffset = ensureNonNullable(segment.vector).clone().rotate(QUARTER_TURN).normalize().mulScalar(randomSign * Math.random() * scaledMaxScale / NOM_SCALE_HALF_DIVISOR);
    const forwardOffset = ensureNonNullable(segment.vector).clone().normalize().mulScalar(scaledMaxScale / NOM_SCALE_HALF_DIVISOR);
    const acceleration = ensureNonNullable(segment.vector).clone().normalize().mulScalar(unitSpeed * NOM_DECELERATION_FACTOR).rotate(randomSign * Math.random() * NOM_ACCEL_SPREAD_ANGLE);
    const {
      particles
    } = ensureNonNullable(unit.in).unit.skin.colors;
    const scale2 = NOM_SCALE_MIN + Math.random() * NOM_SCALE_RANGE;
    const particle = new Particle(null, ensureNonNullable(particles[Math.trunc(Math.random() * particles.length)]), segment.start.clone().add(perpendicularOffset).add(forwardOffset).add(new Vector(0, -baseHeight)), velocity, acceleration, Math.PI + Math.random() * Math.PI, scale2, scale2 * NOM_VSCALE_FACTOR, NOM_PARTICLE_LIFETIME_MS);
    return particle;
  }

  public draw(context: CanvasRenderingContext2D): void {
    const {
      x,
      y
    } = this.position;
    const {
      color,
      rotation,
      scale
    } = this;
    const savedTransform = context.getTransform();
    context.translate(x, y);
    context.rotate(rotation);
    context.scale(scale, scale);
    if (typeof color === 'string') {
      if (context.fillStyle !== color) {
        context.fillStyle = color;
      }
      context.fill(particleSquarePath);
    } else {
      context.scale(1 / PARTICLE_IMAGE_SCALE_DIVISOR, 1 / PARTICLE_IMAGE_SCALE_DIVISOR);
      context.drawImage(color, -color.width / IMAGE_CENTER_DIVISOR, -color.height / IMAGE_CENTER_DIVISOR);
    }
    context.setTransform(savedTransform);
  }

  public update(deltaTimeMilliseconds: number): void {
    const deltaTimeSeconds = deltaTimeMilliseconds / MILLISECONDS_IN_SECOND;
    this.time -= deltaTimeMilliseconds;
    if (this.time <= 0) {
      if (this.fn) {
        this.fn(this);
      }
      return;
    }
    if (typeof this.velocity !== 'number') {
      this.position.x += this.velocity.x * deltaTimeSeconds;
      this.position.y += this.velocity.y * deltaTimeSeconds;
      if (this.acceleration && typeof this.acceleration !== 'number') {
        this.velocity.x += this.acceleration.x * deltaTimeSeconds;
        this.velocity.y += this.acceleration.y * deltaTimeSeconds;
      }
    }
    this.rotation += this.rotate * deltaTimeSeconds;
    this.scale += this.vscale * deltaTimeSeconds;
  }
}
export function spawnScoreParticles(unit: Unit, scoreCollector: null | Unit, list4: Segment[], shouldTransferScore?: boolean): void {
  const game = unit.game;
  if (game.visible) {
    const totalScores = ensureNonNullable(unit.schemes).scores();
    let i2 = 0;
    let accumulatedDistance = 0;
    let scorePerParticle = 0;
    list4.forEach((segment: Segment) => {
      accumulatedDistance += ensureNonNullable(segment.vector).magnitude();
      if (accumulatedDistance > SCORE_PARTICLE_SPACING) {
        accumulatedDistance = 0;
        const velocity = ensureNonNullable(segment.vector).clone().normalize().rotate(Math.sign(Math.random() - RANDOM_MIDPOINT) * QUARTER_TURN).mulScalar(SCORE_PARTICLE_SPEED_MIN + Math.random() * SCORE_PARTICLE_SPEED_RANGE);
        if (Math.random() > SCORE_PARTICLE_SLOW_CHANCE) {
          velocity.mulScalar(SCORE_PARTICLE_SLOW_FACTOR);
        }
        const rotationSpeed = (shouldTransferScore ? SCORE_TRANSFER_ROTATION_FACTOR : 1) * (1 + Math.random() * ROTATION_SPEED_RANGE);
        const time = SCORE_PARTICLE_LIFETIME_MIN_MS + Math.random() * SCORE_PARTICLE_LIFETIME_RANGE_MS;
        const vscale = -rotationSpeed * VSCALE_ROTATION_FACTOR * (MILLISECONDS_IN_SECOND / time);
        const particle = new Particle(null, ensureNonNullable(unit.skin.colors.particles[Math.trunc(Math.random() * unit.skin.colors.particles.length)]), segment.start.clone(), velocity, null, FULL_TURN * (1 + Math.random()) * Math.sign(Math.random() - RANDOM_MIDPOINT || 1), rotationSpeed, vscale, time, (particle2: Particle) => {
          if (scoreCollector) {
            particle2.target = scoreCollector;
            particle2.time = 1;
            particle2.velocity = typeof particle2.velocity === 'number' ? particle2.velocity : particle2.velocity.magnitude();
            particle2.acceleration = (SCORE_ACCEL_MIN + Math.random() * SCORE_ACCEL_RANGE) * game.config.unitSpeed;
            particle2.fn = (): void => {
              if (shouldTransferScore) {
                ensureNonNullable(scoreCollector.schemes).getScheme().accumulator += scorePerParticle;
              }
            };
            particle2.vscale = 0;
            particle2.scale = 1;
          }
        });
        game.particles.push(particle);
        i2++;
      }
    });
    scorePerParticle = totalScores / i2;
  }
}

export const TEXT_PARTICLE_RISE_SPEED = -50;
export const TEXT_PARTICLE_DURATION_MS = 2000;
export const TEXT_PARTICLE_DECELERATION = -2000;
export const TEXT_PARTICLE_FONT_SIZE = 30;
export class TextParticle {
  public acceleration: Vector;
  public color: string;
  public duration: number;
  public fading: boolean;
  public position: Vector;
  public text: string;
  public time: number;
  public unit: null | Unit;
  public velocity: Vector;
  public constructor(text: string, color: string, unit: null | Unit, position: Vector = new Vector(0, 0), velocity: Vector = new Vector(0, TEXT_PARTICLE_RISE_SPEED), durationMilliseconds = TEXT_PARTICLE_DURATION_MS, isFading = true) {
    this.text = text;
    this.color = color || '#000000';
    this.unit = unit;
    this.position = position;
    this.velocity = velocity;
    this.acceleration = velocity.clone().mulScalar(TEXT_PARTICLE_DECELERATION / durationMilliseconds);
    this.duration = durationMilliseconds;
    this.time = durationMilliseconds;
    this.fading = isFading;
  }

  public draw(context: CanvasRenderingContext2D, fontFamily: string, positionScale: number, fontScale: number): void {
    let alphaHex = Math.floor(easeOut(this.time / this.duration) * RGB_CHANNEL_MAX).toString(HEX_RADIX);
    if (alphaHex.length < HEX_CHANNEL_DIGITS) {
      alphaHex = `0${alphaHex}`;
    }
    const point = this.unit ? this.unit.position.clone().add(this.position) : this.position;
    const {
      devicePixelRatio
    } = window;
    const fontSize = fontScale * TEXT_PARTICLE_FONT_SIZE / devicePixelRatio;
    context.save();
    context.fillStyle = `${this.color}${this.fading ? alphaHex : ''}`;
    context.font = `bold ${String(fontSize)}px ${fontFamily}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(this.text, point.x * positionScale, point.y * positionScale);
    context.restore();
    function easeOut(t: number): number {
      return 1 + --t * t * t * t * t;
    }
  }

  public update(deltaMilliseconds: number): void {
    this.time -= deltaMilliseconds;
    if (this.time > 0) {
      this.velocity.add(this.acceleration.clone().mulScalar(deltaMilliseconds / MILLISECONDS_IN_SECOND));
      this.position.add(this.velocity.clone().mulScalar(deltaMilliseconds / MILLISECONDS_IN_SECOND));
    }
  }
}
