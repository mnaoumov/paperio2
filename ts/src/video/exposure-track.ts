/**
 * @file
 *
 * The warning loops in a download. The take logs each change of the loops' mix, and this plays them back in the mix's
 * `OfflineAudioContext` windows with the live loops' own nodes: each loop's level and pulse rate become envelopes of
 * the same 150 ms ramps the live loops make.
 *
 * The mix renders 10 s windows one at a time, and an oscillator started at a window's start would start at phase zero,
 * a click at every seam. So a window with a loop in it renders a lead-in that the mix trims off, and each oscillator is
 * started in the lead-in such that, at the window's start, it has the phase it would have had running since video time
 * 0: a carrier by its fixed frequency, the pulse by the area under its rate. The lead-in also lets the filters settle.
 */

import type {
  LoopContext,
  LoopNode
} from '../audio/exposure-loops.ts';
import type { Envelope } from './envelope.ts';
import type { ExposureEntry } from './timeline.ts';

import {
  buildExposureVoice,
  ENEMY_VOICE,
  EXPOSURE_CROSSFADE_SECONDS,
  EXPOSURE_LEVELS,
  INITIAL_PULSE_RATE,
  OPEN_VOICE
} from '../audio/exposure-loops.ts';
import {
  applyEnvelope,
  areaUntil,
  isAudibleIn,
  valueAt
} from './envelope.ts';

/** Both loops over the take. */
export interface ExposureEnvelopes {
  readonly enemy: VoiceEnvelopes;
  readonly open: VoiceEnvelopes;
}

/** One loop over the take: its level gain, and its pulse's rate in pulses a second. */
export interface VoiceEnvelopes {
  readonly level: readonly Envelope[];
  readonly rate: readonly Envelope[];
}

/**
 * The lead-in a window with a loop in it renders before its start. It is at least one period of the slowest pulse
 * (1 a second), so every oscillator can be started inside it at the phase it needs, with time left for the filters.
 */
export const EXPOSURE_LEAD_SECONDS = 2;
const MICROSECONDS_PER_SECOND = 1_000_000;

/**
 * When to start an oscillator of a fixed frequency so that it has run a number of cycles, give or take whole ones, at
 * the end of the lead-in.
 *
 * @param cycles - The cycles it should have run by then.
 * @param frequency - Its frequency, at least `1 / lead`.
 * @param lead - The lead-in, in seconds.
 * @returns The start time, from 0 to one period into the lead-in.
 */
export function alignedStart(cycles: number, frequency: number, lead: number): number {
  const phase = cycles - Math.floor(cycles);
  const whole = Math.floor(lead * frequency - phase);
  return lead - (phase + whole) / frequency;
}

/**
 * The loops' envelopes from the take's log, ramping as the live loops do: every level over
 * {@link EXPOSURE_CROSSFADE_SECONDS} from wherever it was, and the rate only on the loop that is playing, so the one
 * fading out keeps its own.
 *
 * @param entries - The take's changes, in order.
 * @returns The envelopes, starting silent at video time 0.
 */
export function exposureEnvelopes(entries: readonly ExposureEntry[]): ExposureEnvelopes {
  const open = { level: [{ time: 0, value: 0 }], rate: [{ time: 0, value: INITIAL_PULSE_RATE }] };
  const enemy = { level: [{ time: 0, value: 0 }], rate: [{ time: 0, value: INITIAL_PULSE_RATE }] };
  for (const entry of entries) {
    const time = entry.timestamp / MICROSECONDS_PER_SECOND;
    rampTo(open.level, time, entry.open * EXPOSURE_LEVELS.open);
    rampTo(enemy.level, time, entry.enemy * EXPOSURE_LEVELS.enemy);
    if (entry.rate > 0) {
      rampTo((entry.enemy > 0 ? enemy : open).rate, time, entry.rate);
    }
  }
  return { enemy, open };
}

/**
 * Whether either loop is heard in a window.
 *
 * @param envelopes - The loops.
 * @param from - The window's start, in video seconds.
 * @param to - The window's end.
 * @returns `false` when both are silent throughout.
 */
export function isExposureAudible(envelopes: ExposureEnvelopes, from: number, to: number): boolean {
  return isAudibleIn(envelopes.open.level, from, to) || isAudibleIn(envelopes.enemy.level, from, to);
}

/**
 * Builds and schedules the loops heard in a window, in the window's context.
 *
 * @param context - The window's context, whose time 0 is `lead` before the window's start.
 * @param destination - Where the loops go.
 * @param envelopes - The loops.
 * @param from - The window's start, in video seconds.
 * @param to - The window's end.
 * @param lead - The lead-in, in seconds: at least {@link EXPOSURE_LEAD_SECONDS}.
 */
export function scheduleExposure(context: LoopContext, destination: LoopNode, envelopes: ExposureEnvelopes, from: number, to: number, lead: number): void {
  const voices = [{ envelopes: envelopes.open, spec: OPEN_VOICE }, { envelopes: envelopes.enemy, spec: ENEMY_VOICE }];
  for (const { envelopes: { level, rate }, spec } of voices) {
    if (!isAudibleIn(level, from, to)) {
      continue;
    }
    const voice = buildExposureVoice(context, spec, destination);
    voice.level.gain.value = valueAt(level, from);
    applyEnvelope(voice.level.gain, level, from, to, lead);
    for (const oscillator of voice.oscillators) {
      // The parameter's own value, which the oscillator runs at, rounded to single precision.
      const frequency = oscillator.frequency.value;
      oscillator.start(alignedStart(frequency * from, frequency, lead));
    }
    const startRate = valueAt(rate, from);
    voice.pulse.frequency.value = startRate;
    applyEnvelope(voice.pulse.frequency, rate, from, to, lead);
    voice.pulse.start(alignedStart(areaUntil(rate, from), startRate, lead));
  }
}

/**
 * Adds a ramp to an envelope as `ExposureLoops` makes it: from the value at that time, cutting short a ramp still under
 * way, to the target over {@link EXPOSURE_CROSSFADE_SECONDS}.
 *
 * @param points - The envelope's corners, appended to.
 * @param time - When the ramp starts, in video seconds.
 * @param target - Where it ends.
 */
function rampTo(points: Envelope[], time: number, target: number): void {
  const from = valueAt(points, time);
  if (from === target && (points.at(-1)?.value ?? from) === target) {
    return;
  }
  while ((points.at(-1)?.time ?? 0) > time) {
    points.pop();
  }
  points.push({ time, value: from }, { time: time + EXPOSURE_CROSSFADE_SECONDS, value: target });
}
