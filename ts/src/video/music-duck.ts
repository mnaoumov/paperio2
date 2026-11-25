/**
 * @file
 *
 * The music bed's ducking in a download: the same shape the live `MusicDucker` (`audio/ducking.ts`) gives the music,
 * rebuilt from the take's log. The music steps down while a warning loop is above silence and while a ducking alert
 * plays, and comes back after.
 */

import type { Envelope } from './envelope.ts';
import type {
  ExposureEntry,
  SoundEntry
} from './timeline.ts';

import {
  DUCK_ATTACK_SECONDS,
  DUCK_RELEASE_SECONDS,
  DUCKING_SOUNDS,
  MUSIC_DUCK_GAIN
} from '../audio/ducking.ts';
import { valueAt } from './envelope.ts';

/** A span of video time, in seconds, during which the music is ducked. */
export interface DuckSpan {
  readonly end: number;
  readonly start: number;
}

const MICROSECONDS_PER_SECOND = 1_000_000;

/**
 * The music's duck gain over a download, as the live ducker makes it: down at each span's start, held, and back after
 * its end. Overlapping spans merge, and a span that starts while the music is still coming back turns it down again
 * from where it had got to.
 *
 * @param spans - The spans, in any order.
 * @returns The envelope's corners in order, starting at 1 at time 0.
 */
export function duckEnvelope(spans: readonly DuckSpan[]): Envelope[] {
  const sorted = spans.filter((span: DuckSpan) => span.end > span.start).sort((left: DuckSpan, right: DuckSpan) => left.start - right.start);
  const merged: DuckSpan[] = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (last && span.start <= Math.max(last.start + DUCK_ATTACK_SECONDS, last.end)) {
      merged[merged.length - 1] = { end: Math.max(last.end, span.end), start: last.start };
    } else {
      merged.push(span);
    }
  }
  const points: Envelope[] = [{ time: 0, value: 1 }];
  for (const { end, start } of merged) {
    const from = valueAt(points, start);
    while ((points.at(-1)?.time ?? 0) > start) {
      points.pop();
    }
    const ducked = start + DUCK_ATTACK_SECONDS;
    const releaseAt = Math.max(ducked, end);
    points.push(
      { time: start, value: from },
      { time: ducked, value: MUSIC_DUCK_GAIN },
      { time: releaseAt, value: MUSIC_DUCK_GAIN },
      { time: releaseAt + DUCK_RELEASE_SECONDS, value: 1 }
    );
  }
  return points;
}

/**
 * The spans a take ducks the music for: each stretch with a warning loop above silence, and each ducking alert for its
 * length.
 *
 * @param exposures - The loops' logged changes, in order.
 * @param sounds - The take's effects.
 * @param durationOf - An effect's length in seconds, or `undefined` when it did not load.
 * @param totalSeconds - The video's length, which closes a loop still playing at the end.
 * @returns The spans.
 */
export function duckSpans(
  exposures: readonly ExposureEntry[],
  sounds: readonly SoundEntry[],
  durationOf: (sound: string) => number | undefined,
  totalSeconds: number
): DuckSpan[] {
  const spans: DuckSpan[] = [];
  for (const entry of sounds) {
    const duration = isDuckingSound(entry.sound) ? durationOf(entry.sound) : undefined;
    if (duration !== undefined) {
      const start = entry.timestamp / MICROSECONDS_PER_SECOND;
      spans.push({ end: start + duration, start });
    }
  }
  let start: null | number = null;
  for (const entry of exposures) {
    const time = entry.timestamp / MICROSECONDS_PER_SECOND;
    const audible = entry.open > 0 || entry.enemy > 0;
    if (audible && start === null) {
      start = time;
    } else if (!audible && start !== null) {
      spans.push({ end: time, start });
      start = null;
    }
  }
  if (start !== null) {
    spans.push({ end: Math.max(start, totalSeconds), start });
  }
  return spans;
}

function isDuckingSound(sound: string): boolean {
  return [...DUCKING_SOUNDS].some((name: string) => name === sound);
}
