/**
 * @file
 *
 * The two warning loops, synthesized in WebAudio, so they need no file and never end on a seam. Open ground gets a low,
 * soft pulse; enemy ground a sharper throb, two notes a semitone apart. Each loop is a carrier through a filter into a gain that a slow
 * oscillator swings between silence and full, so the pulse rate is that oscillator's frequency. Every change of level or
 * rate is a short linear ramp, which crossfades one loop into the other and fades both out at home without a click.
 */

import type { ExposureMix } from './exposure.ts';

import {
  sameMix,
  SILENT_MIX
} from './exposure.ts';

/** How long a change of zone or level takes: the crossfade, and the fade out on reaching home. */
export const EXPOSURE_CROSSFADE_SECONDS = 0.15;
/** Each loop's full level, under the quietest capture sound (0.6), so a capture is always heard over it. */
// eslint-disable-next-line no-magic-numbers -- the two levels are a data table.
export const EXPOSURE_LEVELS = { enemy: 0.22, open: 0.16 } as const;

/** The parts of an `AudioContext` the loops use, so a test can stand in for one. */
export interface LoopContext {
  createBiquadFilter(): LoopFilter;
  createGain(): LoopGain;
  createOscillator(): LoopOscillator;
  readonly currentTime: number;
}

export interface LoopFilter extends LoopNode {
  readonly frequency: LoopParam;
  readonly Q: LoopParam;
  type: BiquadFilterType;
}

export interface LoopGain extends LoopNode {
  readonly gain: LoopParam;
}

/** The parts of an `AudioNode` the loops use. */
export interface LoopNode {
  connect(destination: LoopNode | LoopParam): unknown;
  disconnect(): void;
}

export interface LoopOscillator extends LoopNode {
  readonly frequency: LoopParam;
  onended: ((event: Event) => unknown) | null;
  start(when?: number): void;
  stop(when?: number): void;
  type: OscillatorType;
}

/** The parts of an `AudioParam` the loops use. */
export interface LoopParam {
  cancelScheduledValues(cancelTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  setValueAtTime(value: number, startTime: number): unknown;
  value: number;
}

interface CarrierSpec {
  readonly frequency: number;
  readonly type: OscillatorType;
}

interface Voice {
  readonly level: LoopGain;
  readonly nodes: readonly LoopNode[];
  readonly oscillators: readonly LoopOscillator[];
  readonly pulse: LoopOscillator;
}

interface VoicePair {
  readonly enemy: Voice;
  readonly open: Voice;
}

interface VoiceSpec {
  readonly carriers: readonly CarrierSpec[];
  readonly filterFrequency: number;
  readonly filterType: BiquadFilterType;
  /** Rounds the pulse's edges: the pulse oscillator goes through a low-pass at this frequency. */
  readonly pulseSmoothing: number;
  readonly pulseType: OscillatorType;
}

/* eslint-disable no-magic-numbers -- the voices are data tables of frequencies. */
/** Open ground: a triangle at A2 over a sine an octave down, dark, pulsing softly. */
const OPEN_VOICE: VoiceSpec = {
  carriers: [{ frequency: 110, type: 'triangle' }, { frequency: 55, type: 'sine' }],
  filterFrequency: 500,
  filterType: 'lowpass',
  pulseSmoothing: 12,
  pulseType: 'sine'
};
/** Enemy ground: two sawtooth waves a semitone apart, beating, brighter, throbbing on a rounded square. */
const ENEMY_VOICE: VoiceSpec = {
  carriers: [{ frequency: 233.08, type: 'sawtooth' }, { frequency: 246.94, type: 'sawtooth' }],
  filterFrequency: 1400,
  filterType: 'lowpass',
  pulseSmoothing: 40,
  pulseType: 'square'
};
/* eslint-enable no-magic-numbers -- end of the data tables. */
/** The pulse swings the loop's gain by this much either side of its middle, so the troughs are silent. */
const PULSE_DEPTH = 0.5;

export class ExposureLoops {
  private applied: ExposureMix = SILENT_MIX;
  private readonly context: LoopContext;
  private readonly destination: LoopNode;
  private voices: null | VoicePair = null;

  public constructor(context: LoopContext, destination: LoopNode) {
    this.context = context;
    this.destination = destination;
  }

  /**
   * Moves the loops to a mix, over {@link EXPOSURE_CROSSFADE_SECONDS}. Nothing is built until the first audible mix, and
   * a mix equal to the last one schedules nothing.
   *
   * @param mix - The mix.
   */
  public apply(mix: ExposureMix): void {
    if (sameMix(mix, this.applied)) {
      return;
    }
    this.applied = mix;
    const voices = this.voices ?? (mix === SILENT_MIX ? null : this.build());
    if (!voices) {
      return;
    }
    const now = this.context.currentTime;
    const end = now + EXPOSURE_CROSSFADE_SECONDS;
    rampTo(voices.open.level.gain, mix.open * EXPOSURE_LEVELS.open, now, end);
    rampTo(voices.enemy.level.gain, mix.enemy * EXPOSURE_LEVELS.enemy, now, end);
    if (mix.rate > 0) {
      // The rate follows the loop that is playing; the one fading out keeps its own.
      const playing = mix.enemy > 0 ? voices.enemy : voices.open;
      rampTo(playing.pulse.frequency, mix.rate, now, end);
    }
  }

  /** Fades both loops out and, once they are silent, stops and disconnects every node. */
  public stop(): void {
    const voices = this.voices;
    this.apply(SILENT_MIX);
    this.voices = null;
    if (!voices) {
      return;
    }
    const end = this.context.currentTime + EXPOSURE_CROSSFADE_SECONDS;
    for (const voice of [voices.open, voices.enemy]) {
      for (const oscillator of voice.oscillators) {
        oscillator.stop(end);
      }
      voice.pulse.stop(end);
    }
    voices.enemy.pulse.onended = (): void => {
      disconnect(voices.open);
      disconnect(voices.enemy);
    };
  }

  private build(): VoicePair {
    const voices: VoicePair = { enemy: this.buildVoice(ENEMY_VOICE), open: this.buildVoice(OPEN_VOICE) };
    this.voices = voices;
    return voices;
  }

  private buildVoice(spec: VoiceSpec): Voice {
    const context = this.context;
    const level = context.createGain();
    level.gain.value = 0;
    level.connect(this.destination);

    const swing = context.createGain();
    swing.gain.value = PULSE_DEPTH;
    swing.connect(level);

    const filter = context.createBiquadFilter();
    filter.type = spec.filterType;
    filter.frequency.value = spec.filterFrequency;
    filter.connect(swing);

    const oscillators = spec.carriers.map(({ frequency, type }: CarrierSpec) => {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.connect(filter);
      return oscillator;
    });

    // The pulse: an oscillator, rounded by a low-pass, scaled to PULSE_DEPTH, added to the swing gain's own PULSE_DEPTH,
    // so that gain moves between 0 and 1 at the pulse rate.
    const pulse = context.createOscillator();
    pulse.type = spec.pulseType;
    pulse.frequency.value = 1;
    const smoothing = context.createBiquadFilter();
    smoothing.type = 'lowpass';
    smoothing.frequency.value = spec.pulseSmoothing;
    const depth = context.createGain();
    depth.gain.value = PULSE_DEPTH;
    pulse.connect(smoothing);
    smoothing.connect(depth);
    depth.connect(swing.gain);

    for (const oscillator of oscillators) {
      oscillator.start();
    }
    pulse.start();
    return { level, nodes: [level, swing, filter, smoothing, depth], oscillators, pulse };
  }
}

function disconnect(voice: Voice): void {
  for (const node of [...voice.oscillators, voice.pulse, ...voice.nodes]) {
    node.disconnect();
  }
}

function rampTo(param: LoopParam, value: number, now: number, end: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, end);
}
