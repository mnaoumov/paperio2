/**
 * @file
 *
 * Whether the warning loops are heard over the music. Each loop is rendered here sample by sample from its own spec, at
 * its quietest (the start of a trail), and its loudness in each octave band is compared with the music's in the same
 * band. A loop counts as heard when, in its strongest band, it is louder than the loudest track by a margin.
 *
 * The music's band levels are a fixture, measured from the five tracks in `assets/audio/music/`: each decoded to mono
 * 48 kHz (`ffmpeg -i <track> -ac 1 -ar 48000 -f f32le -`), filtered by the same octave band-pass as below, cut into 400 ms
 * frames, and the 90th percentile frame RMS taken, at gain 1. Each entry is the loudest of the five tracks. Re-measure
 * them when a track is replaced.
 */

import {
  describe,
  expect,
  it
} from 'vitest';

import type { ExposureVoiceSpec } from './exposure-loops.ts';

import { MUSIC_LEVEL } from './catalog.ts';
import { MUSIC_DUCK_GAIN } from './ducking.ts';
import {
  ENEMY_VOICE,
  EXPOSURE_LEVELS,
  OPEN_VOICE
} from './exposure-loops.ts';
import { exposureMix } from './exposure.ts';

const BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000] as const;
/** The loudest track's level in each band, in dB at gain 1 (see the file comment). */
const MUSIC_BAND_DB = [-17.0, -20.7, -23.5, -27.2, -27.7, -28.9, -29.0, -30.4] as const;
/** How far over the ducked music a loop must be in its strongest band, in dB. */
const DUCKED_MARGIN_DB = 12;
/** How far over the music a loop must be even if the music were not ducked. */
const FULL_MUSIC_MARGIN_DB = 6;
const SAMPLE_RATE = 48_000;
const SECONDS = 4;
const FRAME_SECONDS = 0.4;
const PERCENTILE = 0.9;
const OCTAVE_Q = 1.414;
/** The old open-ground voice, an octave and more lower, which the music masked. */
const OLD_OPEN_VOICE: ExposureVoiceSpec = {
  carriers: [{ frequency: 110, type: 'triangle' }, { frequency: 55, type: 'sine' }],
  filterFrequency: 500,
  filterType: 'lowpass',
  pulseSmoothing: 12,
  pulseType: 'sine'
};

interface Biquad {
  readonly a1: number;
  readonly a2: number;
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
}

describe('the warning loops over the music', () => {
  it.each(
    [
      ['open', OPEN_VOICE, EXPOSURE_LEVELS.open * exposureMix('open', 0).open, exposureMix('open', 0).rate],
      ['enemy', ENEMY_VOICE, EXPOSURE_LEVELS.enemy * exposureMix('enemy', 0).enemy, exposureMix('enemy', 0).rate]
    ] as const
  )('the %s loop at its quietest stands clear of the music', (_name: string, spec: ExposureVoiceSpec, level: number, rate: number) => {
    const loop = renderLoop(spec, level, rate);
    expect(margin(loop, MUSIC_LEVEL * MUSIC_DUCK_GAIN)).toBeGreaterThan(DUCKED_MARGIN_DB);
    expect(margin(loop, MUSIC_LEVEL)).toBeGreaterThan(FULL_MUSIC_MARGIN_DB);
  });

  it('would fail for the old open-ground voice, which sat in the music\'s bass', () => {
    const level = EXPOSURE_LEVELS.open * exposureMix('open', 0).open;
    expect(margin(renderLoop(OLD_OPEN_VOICE, level, exposureMix('open', 0).rate), MUSIC_LEVEL)).toBeLessThan(FULL_MUSIC_MARGIN_DB);
  });
});

/**
 * Band levels as the music fixture was measured: the 90th percentile 400 ms frame RMS after the octave band-pass, twice.
 *
 * @param signal - Samples.
 * @returns The level in each of {@link BANDS}, linear.
 */
function bandLevels(signal: Float32Array): number[] {
  const frame = Math.round(FRAME_SECONDS * SAMPLE_RATE);
  return BANDS.map((frequency: number) => {
    const bandPass = biquad('bandpass', frequency, OCTAVE_Q);
    const filtered = filter(filter(signal, bandPass), bandPass);
    const levels: number[] = [];
    for (let start = 0; start + frame <= filtered.length; start += frame) {
      levels.push(rms(filtered.subarray(start, start + frame)));
    }
    levels.sort((left: number, right: number) => left - right);
    return levels[Math.floor(PERCENTILE * levels.length)] ?? 0;
  });
}

/**
 * An RBJ cookbook biquad.
 *
 * @param type - Band-pass (constant 0 dB peak) or low-pass.
 * @param frequency - Its centre or corner, in Hz.
 * @param q - Its Q.
 * @returns The normalized coefficients.
 */
function biquad(type: 'bandpass' | 'lowpass', frequency: number, q: number): Biquad {
  const omega = 2 * Math.PI * frequency / SAMPLE_RATE;
  const cos = Math.cos(omega);
  const alpha = Math.sin(omega) / (2 * q);
  const a0 = 1 + alpha;
  const low = (1 - cos) / 2;
  const [b0, b1, b2] = type === 'bandpass' ? [alpha, 0, -alpha] : [low, 1 - cos, low];
  return { a1: -2 * cos / a0, a2: (1 - alpha) / a0, b0: b0 / a0, b1: b1 / a0, b2: b2 / a0 };
}

function decibels(value: number): number {
  return 20 * Math.log10(value);
}

function filter(signal: Float32Array, { a1, a2, b0, b1, b2 }: Biquad): Float32Array {
  const output = new Float32Array(signal.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < signal.length; index++) {
    const x = signal[index] ?? 0;
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    output[index] = y;
  }
  return output;
}

/**
 * How far a loop stands over the music in the band where it stands furthest.
 *
 * @param loop - The loop's samples.
 * @param musicGain - The music's gain.
 * @returns The margin, in dB.
 */
function margin(loop: Float32Array, musicGain: number): number {
  const levels = bandLevels(loop);
  return Math.max(...levels.map((level: number, band: number) => decibels(level) - (MUSIC_BAND_DB[band] ?? 0) - decibels(musicGain)));
}

/**
 * The loop as `buildExposureVoice` wires it: the carriers summed through the filter, times a gain the pulse swings
 * between 0 and 1. WebAudio's filters default to Q 1 (low-pass resonance in dB), close to the flat Q used here.
 *
 * @param spec - The voice.
 * @param level - Its level gain.
 * @param rate - Its pulses a second.
 * @returns {@link SECONDS} of samples.
 */
function renderLoop(spec: ExposureVoiceSpec, level: number, rate: number): Float32Array {
  const length = SAMPLE_RATE * SECONDS;
  const carriers = new Float32Array(length);
  for (const { frequency, type } of spec.carriers) {
    const samples = wave(type, frequency, length);
    for (let index = 0; index < length; index++) {
      carriers[index] = (carriers[index] ?? 0) + (samples[index] ?? 0);
    }
  }
  const tone = filter(carriers, biquad('lowpass', spec.filterFrequency, Math.SQRT1_2));
  const pulse = filter(wave(spec.pulseType, rate, length), biquad('lowpass', spec.pulseSmoothing, Math.SQRT1_2));
  const half = 0.5;
  return tone.map((sample: number, index: number) => sample * level * (half + half * (pulse[index] ?? 0)));
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / Math.max(1, samples.length));
}

/**
 * A periodic wave, as the oscillator types shape it.
 *
 * @param type - The oscillator type.
 * @param frequency - Hz.
 * @param length - Samples.
 * @returns The samples, from -1 to 1.
 */
function wave(type: OscillatorType, frequency: number, length: number): Float32Array {
  const samples = new Float32Array(length);
  const half = 0.5;
  for (let index = 0; index < length; index++) {
    const phase = frequency * index / SAMPLE_RATE % 1;
    switch (type) {
      case 'sawtooth':
        samples[index] = 2 * phase - 1;
        break;
      case 'square':
        samples[index] = phase < half ? 1 : -1;
        break;
      case 'triangle':
        samples[index] = 1 - 4 * Math.abs(phase - half);
        break;
      default:
        samples[index] = Math.sin(2 * Math.PI * phase);
    }
  }
  return samples;
}
