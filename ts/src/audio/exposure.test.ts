import {
  describe,
  expect,
  it
} from 'vitest';

import type {
  ExposedEnemy,
  ExposedUnit,
  ExposureState
} from './exposure.ts';

import {
  Polygon,
  Segment
} from '../geometry/shapes.ts';
import { Vector } from '../geometry/vector.ts';
import {
  desiredExposureMix,
  exposureIntensity,
  exposureMix,
  exposureOf,
  FULL_TENSION_TRAIL_LENGTH,
  SILENT_MIX
} from './exposure.ts';

const BASE = { name: 'own base' };
const ENEMY_BASE = { name: 'enemy base' };
const SHORT_TRAIL = 100;

function createEnemy(): ExposedEnemy {
  return { base: { polygon: new Polygon([new Vector(0, 0), new Vector(10, 0), new Vector(10, 10), new Vector(0, 10)]) }, death: false };
}

function state(player: ExposedUnit | null, overrides: Partial<ExposureState> = {}): ExposureState {
  return { effectsEnabled: true, inRun: true, paused: false, player, ...overrides };
}

function unit(where: unknown, trailLength = SHORT_TRAIL, death = false, enemies: ExposedEnemy[] = [], segments: Segment[] = []): ExposedUnit {
  return { base: BASE, death, game: { units: enemies }, in: where, track: { length: trailLength, polyline: { segments } } };
}

const CROSSING_TRAIL = [new Segment(new Vector(-10, 5), new Vector(20, 5))];

describe('exposureOf', () => {
  it('reads the zone from the territory the head is in', () => {
    expect(exposureOf(unit(BASE))).toBe('home');
    expect(exposureOf(unit(null))).toBe('open');
    expect(exposureOf(unit(ENEMY_BASE))).toBe('enemy');
  });

  it('puts a dead player at home, wherever it died', () => {
    expect(exposureOf(unit(ENEMY_BASE, SHORT_TRAIL, true))).toBe('home');
    expect(exposureOf(unit(null, SHORT_TRAIL, true))).toBe('home');
  });

  it('follows the head frame by frame: out, onto an enemy, back out, home', () => {
    const frames = [BASE, null, null, ENEMY_BASE, ENEMY_BASE, null, BASE].map((where: unknown) => exposureOf(unit(where)));
    expect(frames).toEqual(['home', 'open', 'open', 'enemy', 'enemy', 'open', 'home']);
  });

  it('keeps the enemy mix after the head leaves, until the player gets home or the trail is removed', () => {
    const enemies = [createEnemy()];
    const player = unit(null, SHORT_TRAIL, false, enemies, CROSSING_TRAIL);
    expect(exposureOf(player)).toBe('enemy');
    expect(desiredExposureMix(state(player))).toEqual(exposureMix('enemy', SHORT_TRAIL));
    expect(exposureOf({ ...player, in: BASE })).toBe('home');
    expect(exposureOf(unit(null, 0, false, enemies))).toBe('open');
  });

  it('drops the warning when the enemy dies or disappears, but keeps it for another living enemy', () => {
    const first = createEnemy();
    const second = createEnemy();
    expect(exposureOf(unit(null, SHORT_TRAIL, false, [{ ...first, death: true }], CROSSING_TRAIL))).toBe('open');
    expect(exposureOf(unit(null, SHORT_TRAIL, false, [], CROSSING_TRAIL))).toBe('open');
    expect(exposureOf(unit(null, SHORT_TRAIL, false, [{ ...first, death: true }, second], CROSSING_TRAIL))).toBe('enemy');
    expect(exposureOf(unit(null, SHORT_TRAIL, false, [{ ...first, death: true }, { ...second, death: true }], CROSSING_TRAIL))).toBe('open');
  });

  it('uses current territory after a capture removes the ground beneath the trail', () => {
    const owner = createEnemy();
    const player = unit(null, SHORT_TRAIL, false, [owner], CROSSING_TRAIL);
    expect(exposureOf(player)).toBe('enemy');
    owner.base.polygon.segments = new Polygon([new Vector(0, 20), new Vector(10, 20), new Vector(10, 30), new Vector(0, 30)]).segments;
    expect(exposureOf(player)).toBe('open');
  });

  it('finds a trail wholly inside enemy land and ignores the player own territory', () => {
    const owner = createEnemy();
    const player = unit(null, SHORT_TRAIL, false, [owner], [new Segment(new Vector(2, 2), new Vector(8, 8))]);
    expect(exposureOf(player)).toBe('enemy');
    expect(exposureOf({ ...player, base: owner.base })).toBe('open');
    expect(exposureOf({ ...player, death: true })).toBe('home');
  });
});

describe('exposureMix', () => {
  it('is silent at home', () => {
    expect(exposureMix('home', FULL_TENSION_TRAIL_LENGTH)).toBe(SILENT_MIX);
  });

  it('plays only the open loop on open ground and only the enemy loop on enemy ground', () => {
    const open = exposureMix('open', SHORT_TRAIL);
    expect(open.open).toBeGreaterThan(0);
    expect(open.enemy).toBe(0);
    const enemy = exposureMix('enemy', SHORT_TRAIL);
    expect(enemy.enemy).toBeGreaterThan(0);
    expect(enemy.open).toBe(0);
  });

  it('makes enemy ground faster than open ground', () => {
    expect(exposureMix('enemy', 0).rate).toBeGreaterThan(exposureMix('open', FULL_TENSION_TRAIL_LENGTH).rate);
  });

  it('rises with the trail, up to full level at the full-tension length and no further', () => {
    const short = exposureMix('open', 0);
    const long = exposureMix('open', FULL_TENSION_TRAIL_LENGTH);
    expect(long.open).toBeGreaterThan(short.open);
    expect(long.rate).toBeGreaterThan(short.rate);
    expect(long.open).toBe(1);
    expect(exposureMix('open', FULL_TENSION_TRAIL_LENGTH * 3)).toEqual(long);
  });
});

describe('exposureIntensity', () => {
  it('moves in steps, so a growing trail does not change the mix on every frame', () => {
    expect(exposureIntensity(0)).toBe(0);
    expect(exposureIntensity(1)).toBe(exposureIntensity(2));
    expect(exposureIntensity(FULL_TENSION_TRAIL_LENGTH)).toBe(1);
    expect(exposureIntensity(-1)).toBe(0);
  });
});

describe('desiredExposureMix', () => {
  it('plays out of the base during a run', () => {
    expect(desiredExposureMix(state(unit(null))).open).toBeGreaterThan(0);
    expect(desiredExposureMix(state(unit(ENEMY_BASE))).enemy).toBeGreaterThan(0);
  });

  it('is silent at home, on death, while paused, with the effects off, outside a run and with no player', () => {
    expect(desiredExposureMix(state(unit(BASE)))).toBe(SILENT_MIX);
    expect(desiredExposureMix(state(unit(null, SHORT_TRAIL, true)))).toBe(SILENT_MIX);
    expect(desiredExposureMix(state(unit(null), { paused: true }))).toBe(SILENT_MIX);
    expect(desiredExposureMix(state(unit(null), { effectsEnabled: false }))).toBe(SILENT_MIX);
    expect(desiredExposureMix(state(unit(ENEMY_BASE), { inRun: false }))).toBe(SILENT_MIX);
    expect(desiredExposureMix(state(null))).toBe(SILENT_MIX);
  });
});
