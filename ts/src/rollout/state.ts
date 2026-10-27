import type { Game } from '../engine.ts';
import type { Segment } from '../geometry/shapes.ts';
import type { RolloutFrame } from './protocol.ts';

import {
  MAX_ROLLOUT_SEGMENTS,
  MAX_ROLLOUT_UNITS
} from './protocol.ts';

const FNV_OFFSET = 2166136261;
const DJB_OFFSET = 5381;

export function readRolloutFrame(game: Game, frame: number, randomState: number): RolloutFrame {
  return {
    death: game.pendingGameOver?.reason ?? null,
    frame,
    kills: game.events.kills,
    randomState,
    returns: game.events.returns,
    time: game.clock.now(),
    units: game.units.map((unit) => ({
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

function geometryFingerprint(segments: readonly Segment[]): string {
  // Two independently accumulated 32-bit hashes of the exact ordered coordinates, plus the segment count.
  let first = FNV_OFFSET;
  let second = DJB_OFFSET;
  for (const segment of segments) {
    const text = `${String(segment.start.x)},${String(segment.start.y)},${String(segment.end.x)},${String(segment.end.y)};`;
    for (let index = 0; index < text.length; index++) {
      /* eslint-disable no-bitwise, no-magic-numbers -- FNV-1a and DJB2 fingerprints, not simulation arithmetic. */
      first = Math.imul(first ^ text.charCodeAt(index), 16777619) >>> 0;
      second = (Math.imul(second, 33) ^ text.charCodeAt(index)) >>> 0;
      /* eslint-enable no-bitwise, no-magic-numbers -- end of fingerprint arithmetic. */
    }
  }
  return `${String(segments.length)}:${String(first)}:${String(second)}`;
}
