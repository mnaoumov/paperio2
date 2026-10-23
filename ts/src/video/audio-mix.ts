/**
 * @file
 *
 * A download's audio track: the take's sound effects at their video times, and optionally one continuous music bed
 * laid under the whole cut video. Music is never recorded with the take, because a cut would make it jump; it is laid
 * here, once the video's final length is known.
 *
 * The effects include the warning loops, played back from the take's log of their changes (see `exposure-track.ts`).
 *
 * The mix is rendered with `OfflineAudioContext` a window at a time, so an hour of video never holds an hour of samples,
 * and the windows are handed to the muxer as the video packets reach them, which keeps the two tracks interleaved.
 */

import type {
  AudioCodec,
  Output
} from 'mediabunny';

import {
  AudioBufferSource,
  getFirstEncodableAudioCodec,
  Quality
} from 'mediabunny';

import type {
  MusicTrack,
  SoundName
} from '../audio/catalog.ts';
import type { BedSegment } from '../audio/playlist.ts';
import type { Envelope } from './envelope.ts';
import type { RecordingRecord } from './store.ts';
import type { SoundEntry } from './timeline.ts';

import {
  isSoundName,
  MUSIC_LEVEL,
  MUSIC_TRACKS,
  musicUrl,
  SOUND_LEVELS,
  SOUND_NAMES,
  soundUrl
} from '../audio/catalog.ts';
import { fetchAudio } from '../audio/game-audio.ts';
import {
  audioRandom,
  planMusicBed,
  shuffledOrder
} from '../audio/playlist.ts';
import { applyEnvelope } from './envelope.ts';
import {
  EXPOSURE_LEAD_SECONDS,
  exposureEnvelopes,
  isExposureAudible,
  scheduleExposure
} from './exposure-track.ts';

/** What a download carries besides the video. */
export interface AddTakeAudioOptions {
  readonly effects: boolean;
  readonly music: boolean;
}

/** Feeds the audio track up to a point of the video, so the muxer gets both tracks in step. */
export interface TakeAudio {
  /** Renders and adds the rest of the audio, to the end of the video. */
  finish(): Promise<void>;
  /**
   * Renders and adds the audio up to a time, if it is not there yet.
   *
   * @param seconds - The video time the video track has reached.
   */
  until(seconds: number): Promise<void>;
}

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const WINDOW_SECONDS = 10;
const CROSSFADE_SECONDS = 2;
const END_FADE_SECONDS = 2;
const MICROSECONDS_PER_SECOND = 1_000_000;
const MILLISECONDS_PER_SECOND = 1000;
const AUDIO_CODECS: readonly AudioCodec[] = ['aac', 'opus'];

/**
 * Adds an audio track for a take to the output, before it starts.
 *
 * @param output - The output, not started yet.
 * @param record - The take.
 * @param options - Whether the effects and the music go in.
 * @returns The feeder, or `null` when there is nothing to mix or this browser cannot encode audio.
 */
export async function addTakeAudio(output: Output, record: RecordingRecord, options: AddTakeAudioOptions): Promise<null | TakeAudio> {
  const totalSeconds = record.durationMilliseconds / MILLISECONDS_PER_SECOND;
  const sounds = options.effects ? (record.sounds ?? []).filter((entry: SoundEntry) => entry.timestamp / MICROSECONDS_PER_SECOND < totalSeconds) : [];
  const exposure = options.effects && (record.exposures ?? []).length > 0 ? exposureEnvelopes(record.exposures ?? []) : null;
  const hasLoops = exposure !== null && isExposureAudible(exposure, 0, totalSeconds);
  if (totalSeconds <= 0 || (sounds.length === 0 && !hasLoops && !options.music) || typeof OfflineAudioContext === 'undefined') {
    return null;
  }
  const supported = output.format.getSupportedAudioCodecs();
  const codec = await getFirstEncodableAudioCodec(AUDIO_CODECS.filter((candidate: AudioCodec) => supported.includes(candidate)), { numberOfChannels: CHANNELS, sampleRate: SAMPLE_RATE });
  if (!codec) {
    return null;
  }
  const source = new AudioBufferSource({ codec, quality: new Quality('high') });
  output.addAudioTrack(source);
  const decoder = new OfflineAudioContext(CHANNELS, 1, SAMPLE_RATE);
  const effects = sounds.length > 0 ? await loadEffects(decoder) : new Map<SoundName, AudioBuffer>();
  const bed = options.music
    ? planMusicBed({
      crossfadeSeconds: CROSSFADE_SECONDS,
      durations: MUSIC_TRACKS.map((track: MusicTrack) => track.durationSeconds),
      endFadeSeconds: END_FADE_SECONDS,
      order: shuffledOrder(MUSIC_TRACKS.length, audioRandom),
      totalSeconds
    })
    : [];
  const tracks = new Map<number, Promise<AudioBuffer | null>>();

  async function renderWindow(from: number, to: number): Promise<void> {
    const frames = Math.max(1, Math.round((to - from) * SAMPLE_RATE));
    // A window with a warning loop in it renders a lead-in first, trimmed off below, so the loops run on across the seam.
    const lead = exposure && isExposureAudible(exposure, from, to) ? EXPOSURE_LEAD_SECONDS : 0;
    const leadFrames = Math.round(lead * SAMPLE_RATE);
    const context = new OfflineAudioContext(CHANNELS, leadFrames + frames, SAMPLE_RATE);
    if (exposure && lead > 0) {
      scheduleExposure(context, context.destination, exposure, from, to, lead);
    }
    for (const entry of sounds) {
      const at = entry.timestamp / MICROSECONDS_PER_SECOND;
      const buffer = isSoundName(entry.sound) ? effects.get(entry.sound) : undefined;
      if (buffer && isSoundName(entry.sound) && at < to && at + buffer.duration > from) {
        const gain = context.createGain();
        gain.gain.value = entry.gain * SOUND_LEVELS[entry.sound];
        const node = context.createBufferSource();
        node.buffer = buffer;
        node.connect(gain).connect(context.destination);
        node.start(Math.max(0, at - from) + lead, Math.max(0, from - at));
      }
    }
    for (const segment of bed) {
      const end = segment.start + segment.duration;
      if (segment.start >= to || end <= from) {
        continue;
      }
      const buffer = await loadTrack(segment.track);
      if (!buffer) {
        continue;
      }
      const gain = context.createGain();
      applyEnvelope(gain.gain, segmentEnvelope(segment), from, to, lead);
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(gain).connect(context.destination);
      const startAt = Math.max(segment.start, from);
      node.start(startAt - from + lead, startAt - segment.start, end - startAt);
    }
    const rendered = await context.startRendering();
    await source.add(leadFrames > 0 ? trimStart(rendered, leadFrames) : rendered);
    // A decoded track holds about 25 MB, so the ones the bed is past are dropped.
    for (const track of [...tracks.keys()]) {
      if (!bed.some((segment: BedSegment) => segment.track === track && segment.start + segment.duration > to)) {
        tracks.delete(track);
      }
    }
  }

  function loadTrack(index: number): Promise<AudioBuffer | null> {
    let loading = tracks.get(index);
    if (!loading) {
      const track = MUSIC_TRACKS[index];
      loading = track ? fetchAudio(decoder, musicUrl(track)) : Promise.resolve(null);
      tracks.set(index, loading);
    }
    return loading;
  }

  let rendered = 0;
  async function renderUntil(seconds: number): Promise<void> {
    const target = Math.min(seconds, totalSeconds);
    while (rendered < target) {
      const from = rendered;
      const to = Math.min(totalSeconds, from + WINDOW_SECONDS);
      // Claimed before the render, so the window is never rendered twice.
      rendered = to;
      await renderWindow(from, to);
    }
  }

  return {
    async finish(): Promise<void> {
      await renderUntil(totalSeconds);
    },
    async until(seconds: number): Promise<void> {
      await renderUntil(seconds);
    }
  };
}

/**
 * The music bed segment's volume over time, in video seconds: up from silence over its fade in, down over its fade out.
 *
 * @param segment - The segment.
 * @returns The envelope's corners, in order.
 */
export function segmentEnvelope(segment: BedSegment): Envelope[] {
  const end = segment.start + segment.duration;
  const points: Envelope[] = [{ time: segment.start, value: segment.fadeIn > 0 ? 0 : MUSIC_LEVEL }];
  if (segment.fadeIn > 0) {
    points.push({ time: segment.start + segment.fadeIn, value: MUSIC_LEVEL });
  }
  if (segment.fadeOut > 0) {
    points.push({ time: end - segment.fadeOut, value: MUSIC_LEVEL });
  }
  points.push({ time: end, value: segment.fadeOut > 0 ? 0 : MUSIC_LEVEL });
  return points;
}

async function loadEffects(decoder: BaseAudioContext): Promise<Map<SoundName, AudioBuffer>> {
  const buffers = new Map<SoundName, AudioBuffer>();
  await Promise.all(SOUND_NAMES.map(async (name: SoundName) => {
    const buffer = await fetchAudio(decoder, soundUrl(name));
    if (buffer) {
      buffers.set(name, buffer);
    }
  }));
  return buffers;
}

/**
 * A rendered window without its lead-in.
 *
 * @param buffer - The rendered window.
 * @param frames - The lead-in's length in frames.
 * @returns A buffer of the window alone.
 */
function trimStart(buffer: AudioBuffer, frames: number): AudioBuffer {
  const trimmed = new AudioBuffer({ length: buffer.length - frames, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    trimmed.copyToChannel(buffer.getChannelData(channel).subarray(frames), channel);
  }
  return trimmed;
}
