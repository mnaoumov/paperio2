import type { Game } from '../engine.ts';
import type { Segment } from '../geometry/shapes.ts';
import type { RolloutFrame } from './protocol.ts';

import {
  MAX_ROLLOUT_SEGMENTS,
  MAX_ROLLOUT_UNITS
} from './protocol.ts';

const FNV_OFFSET = 2166136261;
const DJB_OFFSET = 5381;
const SEGMENT_BYTES = 32;
const START_Y_OFFSET = 8;
const END_X_OFFSET = 16;
const END_Y_OFFSET = 24;
/** Synchronous scratch space for the four coordinates, with explicit byte order across platforms. */
const coordinates = new DataView(new ArrayBuffer(SEGMENT_BYTES));

export function geometryFingerprint(segments: readonly Segment[]): string {
  // Two independently accumulated 32-bit hashes of the exact ordered IEEE-754 bytes, plus the segment count.
  let first = FNV_OFFSET;
  let second = DJB_OFFSET;
  for (const segment of segments) {
    coordinates.setFloat64(0, segment.start.x, true);
    coordinates.setFloat64(START_Y_OFFSET, segment.start.y, true);
    coordinates.setFloat64(END_X_OFFSET, segment.end.x, true);
    coordinates.setFloat64(END_Y_OFFSET, segment.end.y, true);
    for (let offset = 0; offset < SEGMENT_BYTES; offset++) {
      const byte = coordinates.getUint8(offset);
      /* eslint-disable no-bitwise, no-magic-numbers -- FNV-1a and DJB2 fingerprints, not simulation arithmetic. */
      first = Math.imul(first ^ byte, 16777619) >>> 0;
      second = (Math.imul(second, 33) ^ byte) >>> 0;
      /* eslint-enable no-bitwise, no-magic-numbers -- end of fingerprint arithmetic. */
    }
  }
  return `${String(segments.length)}:${String(first)}:${String(second)}`;
}

export function readRolloutFrame(game: Game, frame: number, randomState: number, unitName?: string): RolloutFrame {
  const units = unitName === undefined ? game.units : game.units.filter((unit) => unit.name === unitName);
  return {
    death: game.pendingGameOver?.reason ?? null,
    frame,
    kills: game.events.kills,
    randomState,
    returns: game.events.returns,
    time: game.clock.now(),
    units: units.map((unit) => ({
      angle: unit.direction,
      context: [unit.fsm?.context.exitPoint?.x ?? null, unit.fsm?.context.exitPoint?.y ?? null, unit.fsm?.context.point?.x ?? null, unit.fsm?.context.point?.y ?? null, unit.fsm?.context.minDistance ?? null],
      id: unit.base.polygon.segments[0]?.id ?? -1,
      inOwnBase: unit.in === unit.base,
      name: unit.name,
      square: unit.base.square,
      state: unit.fsm?.state ?? null,
      target: unit.target ? [unit.target.x, unit.target.y] : null,
      territory: geometryFingerprint(unit.base.polygon.segments),
      trail: geometryFingerprint(unit.track.polyline.segments),
      x: unit.position.x,
      y: unit.position.y
    }))
  };
}

export function validateRolloutWorld(game: Game): void {
  const segments = game.units.reduce((sum, unit) => sum + unit.base.polygon.segments.length + unit.track.polyline.segments.length, 0);
  if (game.units.length > MAX_ROLLOUT_UNITS || game.config.botsCount > MAX_ROLLOUT_UNITS || segments > MAX_ROLLOUT_SEGMENTS) {
    throw new Error('Rollout world exceeds the work budget');
  }
}
