/**
 * @file
 *
 * The in-game video recorder. It records the game canvas, not the page: each recorded frame is drawn into a fixed-size
 * output canvas and encoded with WebCodecs at game time, and each chunk goes to IndexedDB as it comes out of the
 * encoder. A practice checkpoint makes its frame a keyframe, and a respawn at it cuts every chunk after that keyframe,
 * so the take plays as one run with no failed attempt in it. See {@link RecordingTimeline} for the cut.
 */

import type {
  FrameRecorder,
  Game
} from '../engine.ts';
import type { Checkpoint } from '../practice.ts';
import type {
  RecordingRecord,
  StoredCodec,
  StoredDecoderConfig
} from './store.ts';
import type {
  ChunkEntry,
  CutResult
} from './timeline.ts';

import { noop } from '../shared/noop.ts';
import {
  deleteChunksFrom,
  deleteRecording,
  putChunk,
  putRecording,
  recordingLockName
} from './store.ts';
import {
  DEFAULT_KEY_FRAME_INTERVAL_MILLISECONDS,
  MICROSECONDS_PER_MILLISECOND,
  RecordingTimeline
} from './timeline.ts';

export interface CodecChoice {
  readonly codec: StoredCodec;
  readonly codecString: string;
}

export interface RecorderCallbacks {
  /** Told when the recorder stopped by itself: the storage ran low or a write failed. */
  readonly onAutoStop: (reason: StopReason, message: string) => void;
}

export type StopReason = 'discarded' | 'error' | 'game-ended' | 'storage' | 'user';

/** The frame rates offered, as the settings store them. */
export const VIDEO_FPS_OPTIONS = ['30', '60'] as const;
export type VideoFpsSetting = typeof VIDEO_FPS_OPTIONS[number];

/** The output heights offered: a number of lines, capped at the canvas's own, or the canvas's own size. */
export const VIDEO_HEIGHT_OPTIONS = ['480', '720', 'canvas'] as const;
export type VideoHeightSetting = typeof VIDEO_HEIGHT_OPTIONS[number];

/** What a download's audio track carries: the take's effects, a music bed laid under it, both, or nothing. */
export const VIDEO_AUDIO_OPTIONS = ['all', 'effects', 'music', 'none'] as const;
export type VideoAudioSetting = typeof VIDEO_AUDIO_OPTIONS[number];

export interface VideoSettings {
  readonly audio: VideoAudioSetting;
  readonly fps: VideoFpsSetting;
  readonly height: VideoHeightSetting;
  /** Whether every run is recorded from its start, without V. */
  readonly recordEvery: boolean;
}

export interface VideoSize {
  readonly height: number;
  readonly width: number;
}

export const VIDEO_SETTINGS_STORAGE_KEY = 'paperio2.video';
export const DEFAULT_VIDEO_SETTINGS: VideoSettings = { audio: 'all', fps: '30', height: '720', recordEvery: false };
/**
 * The bitrate at 720p and 30 fps; other sizes and rates get the same bits per pixel. It is the lowest of the bitrates
 * tried that showed no blocking on trail edges (README, *Recording inside the game*).
 */
export const DEFAULT_BITRATE_720P30 = 1_000_000;
const REFERENCE_WIDTH = 1280;
const REFERENCE_HEIGHT = 720;
const REFERENCE_FPS = 30;
const MIN_BITRATE = 250_000;
/** The encoder is behind when more than this many frames wait in it; ordinary frames are then skipped. */
const MAX_ENCODE_QUEUE = 6;
const BYTES_PER_MEGABYTE = 1_048_576;
const STORAGE_RESERVE_MEGABYTES = 200;
/** Stop the take while this much storage is still free. */
export const STORAGE_RESERVE_BYTES = STORAGE_RESERVE_MEGABYTES * BYTES_PER_MEGABYTE;
/** The encoders take even dimensions only. */
const SIZE_STEP = 2;
const HALF = 2;
const STORAGE_CHECK_MILLISECONDS = 5000;
const RECORD_UPDATE_MILLISECONDS = 2000;
const THUMBNAIL_WIDTH = 160;
const THUMBNAIL_QUALITY = 0.7;

const AVC_LEVEL_4_0 = 'avc1.640028';
const CODEC_CANDIDATES: readonly CodecChoice[] = [
  { codec: 'avc', codecString: 'avc1.640033' },
  { codec: 'avc', codecString: AVC_LEVEL_4_0 },
  { codec: 'avc', codecString: 'avc1.4d0033' },
  { codec: 'avc', codecString: 'avc1.42e033' },
  { codec: 'avc', codecString: 'avc1.42e01f' },
  { codec: 'vp9', codecString: 'vp09.00.41.08' },
  { codec: 'av1', codecString: 'av01.0.08M.08' }
];

/** One take. Create it with {@link VideoRecorder.start}, then {@link stop} or {@link discard} it. */
export class VideoRecorder implements FrameRecorder {
  public readonly record: RecordingRecord;

  /** Why the take ended, or `null` while it runs. */
  public stopReason: null | StopReason = null;

  /**
   * How long the take is so far.
   *
   * @returns Milliseconds of video.
   */
  public get durationMilliseconds(): number {
    return this.timeline.durationMilliseconds;
  }

  /**
   * The take's kept size so far.
   *
   * @returns Bytes.
   */
  public get keptBytes(): number {
    return this.timeline.keptBytes;
  }

  private readonly context: CanvasRenderingContext2D;
  private readonly encoder: VideoEncoder;
  private failure: Error | null = null;
  private lastRecordUpdate = 0;
  private lastStorageCheck = 0;
  private readonly output: HTMLCanvasElement;
  private releaseLock: () => void = noop;
  private storageCheck: null | Promise<void> = null;
  private thumbnailDue = true;
  private readonly timeline: RecordingTimeline;
  /** The chain of storage writes, in the order they were issued. */
  private writes: Promise<void> = Promise.resolve();

  private constructor(private readonly game: Game, choice: CodecChoice, settings: VideoSettings, private readonly callbacks: RecorderCallbacks, auto: boolean) {
    const view = game.view;
    const { height, width } = outputSize(view.width, view.height, settings.height);
    this.output = document.createElement('canvas');
    this.output.width = width;
    this.output.height = height;
    const context = this.output.getContext('2d');
    if (!context) {
      throw new Error('No 2D canvas for the recording');
    }
    this.context = context;
    const fps = Number(settings.fps);
    this.timeline = new RecordingTimeline({ fps, keyFrameIntervalMilliseconds: DEFAULT_KEY_FRAME_INTERVAL_MILLISECONDS });
    const now = Date.now();
    this.record = {
      ...(auto ? { auto } : {}),
      bytes: 0,
      codec: choice.codec,
      decoderConfig: null,
      durationMilliseconds: 0,
      fps,
      height,
      id: crypto.randomUUID(),
      startedAt: now,
      status: 'recording',
      thumbnail: null,
      updatedAt: now,
      width
    };
    this.encoder = new VideoEncoder({
      error: (error: DOMException): void => {
        this.fail(error);
      },
      output: (chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata): void => {
        this.handleChunk(chunk, metadata);
      }
    });
    this.encoder.configure(encoderConfig(choice, width, height, fps));
    const record = { ...this.record };
    this.queueWrite(() => putRecording(record));
  }

  /**
   * Starts a take on the game's canvas.
   *
   * @param game - The live game.
   * @param choice - The codec, from {@link findCodec}.
   * @param settings - Size and frame rate.
   * @param callbacks - Told when the take stops by itself.
   * @param auto - Whether **Record every game** started it rather than V, which lets it be pruned.
   * @returns The running take.
   */
  public static start(game: Game, choice: CodecChoice, settings: VideoSettings, callbacks: RecorderCallbacks, auto = false): VideoRecorder {
    const recorder = new VideoRecorder(game, choice, settings, callbacks, auto);
    game.videoRecorder = recorder;
    // Held until the take is finished or discarded; a reload or a crash drops it, which marks the take as recoverable.
    navigator.locks.request(recordingLockName(recorder.record.id), () =>
      new Promise<void>((resolve) => {
        recorder.releaseLock = resolve;
      })).catch(noop);
    // Keeps the browser from evicting the takes when the disk fills; a refusal changes nothing else.
    navigator.storage.persist().catch(noop);
    return recorder;
  }

  public afterFrame(): void {
    const request = this.timeline.frame(this.game.clock.now(), this.encoder.encodeQueueSize <= MAX_ENCODE_QUEUE);
    if (request) {
      this.encodeCanvas(request.timestamp, request.keyFrame);
    }
    this.housekeeping();
  }

  /** Throws the take away: nothing of it is kept. */
  public async discard(): Promise<void> {
    if (!this.detach('discarded')) {
      return;
    }
    try {
      this.encoder.close();
    } catch {
      // Already closed by an encoder error.
    }
    try {
      await this.writes.catch(noop);
      await deleteRecording(this.record.id);
    } finally {
      this.releaseLock();
    }
  }

  public onCheckpoint(checkpoint: Checkpoint): void {
    const request = this.timeline.checkpoint(checkpoint.id, checkpoint.snapshot.clockTime);
    this.encodeCanvas(request.timestamp, true);
    const practice = this.game.practice;
    if (practice) {
      this.timeline.keepMarkers(practice.checkpoints.map((held: Checkpoint) => held.id));
    }
  }

  public onRespawn(checkpoint: Checkpoint): void {
    const cut: CutResult = this.timeline.respawn(checkpoint.id);
    if (cut.restarted) {
      this.thumbnailDue = true;
    }
    const { fromSeq } = cut;
    if (fromSeq !== null) {
      this.queueWrite(() => deleteChunksFrom(this.record.id, fromSeq));
    }
  }

  public onSound(sound: string, gain: number): void {
    if (this.stopReason === null) {
      this.timeline.sound(this.game.clock.now(), sound, gain);
    }
  }

  /**
   * Ends the take: the frames still in the encoder are flushed and stored, and the take is listed as finished.
   *
   * @param reason - Why it ends.
   * @returns The finished take, or `null` when it holds no video.
   */
  public async stop(reason: StopReason = 'user'): Promise<null | RecordingRecord> {
    if (!this.detach(reason)) {
      return null;
    }
    try {
      return await this.finish();
    } finally {
      this.releaseLock();
    }
  }

  private captureThumbnail(): void {
    const thumbnail = document.createElement('canvas');
    thumbnail.width = THUMBNAIL_WIDTH;
    thumbnail.height = Math.max(1, Math.round(THUMBNAIL_WIDTH * this.output.height / this.output.width));
    thumbnail.getContext('2d')?.drawImage(this.output, 0, 0, thumbnail.width, thumbnail.height);
    thumbnail.toBlob(
      (blob: Blob | null) => {
        this.record.thumbnail = blob;
      },
      'image/jpeg',
      THUMBNAIL_QUALITY
    );
  }

  private async checkStorage(): Promise<void> {
    let estimate: StorageEstimate;
    try {
      estimate = await navigator.storage.estimate();
    } catch {
      return;
    }
    const { quota, usage } = estimate;
    if (quota !== undefined && usage !== undefined && quota - usage < STORAGE_RESERVE_BYTES && this.stopReason === null) {
      this.callbacks.onAutoStop('storage', 'The recording stopped because the browser\'s storage is almost full');
    }
  }

  private detach(reason: StopReason): boolean {
    if (this.stopReason !== null) {
      return false;
    }
    this.stopReason = reason;
    if (this.game.videoRecorder === this) {
      this.game.videoRecorder = null;
    }
    return true;
  }

  private drawCanvas(): void {
    const view = this.game.view;
    const { height, width } = this.output;
    const scale = Math.min(width / Math.max(1, view.width), height / Math.max(1, view.height));
    const drawWidth = view.width * scale;
    const drawHeight = view.height * scale;
    this.context.fillStyle = '#000000';
    this.context.fillRect(0, 0, width, height);
    this.context.drawImage(view, (width - drawWidth) / HALF, (height - drawHeight) / HALF, drawWidth, drawHeight);
  }

  private encodeCanvas(timestamp: number, keyFrame: boolean): void {
    if (this.encoder.state !== 'configured') {
      return;
    }
    this.drawCanvas();
    const frame = new VideoFrame(this.output, { duration: Math.round(this.timeline.frameIntervalMilliseconds * MICROSECONDS_PER_MILLISECOND), timestamp });
    try {
      this.encoder.encode(frame, { keyFrame });
    } finally {
      frame.close();
    }
    if (this.thumbnailDue && timestamp === 0) {
      this.thumbnailDue = false;
      this.captureThumbnail();
    }
  }

  private fail(error: unknown): void {
    const failure = error instanceof Error ? error : new Error(String(error));
    this.failure ??= failure;
    if (this.stopReason === null) {
      this.callbacks.onAutoStop('error', `The recording stopped: ${failure.message}`);
    }
  }

  private async finish(): Promise<null | RecordingRecord> {
    try {
      await this.encoder.flush();
      this.encoder.close();
    } catch (error) {
      this.failure ??= error instanceof Error ? error : new Error(String(error));
    }
    await this.writes.catch((error: unknown) => {
      this.failure ??= error instanceof Error ? error : new Error(String(error));
    });
    if (this.record.decoderConfig === null || this.timeline.chunks.length === 0) {
      await deleteRecording(this.record.id);
      return null;
    }
    this.updateRecordFields();
    this.record.status = 'finished';
    await putRecording(this.record);
    return this.record;
  }

  private handleChunk(chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata): void {
    if (metadata?.decoderConfig && this.record.decoderConfig === null) {
      this.record.decoderConfig = copyDecoderConfig(metadata.decoderConfig);
    }
    const entry: ChunkEntry | null = this.timeline.accept(chunk.timestamp, chunk.type, chunk.byteLength);
    if (!entry) {
      return;
    }
    const data = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(data);
    this.queueWrite(() => putChunk({ data, recordingId: this.record.id, seq: entry.seq, timestamp: entry.timestamp, type: entry.type }));
  }

  private housekeeping(): void {
    const now = Date.now();
    if (now - this.lastRecordUpdate >= RECORD_UPDATE_MILLISECONDS) {
      this.lastRecordUpdate = now;
      this.updateRecordFields();
      const snapshot = { ...this.record };
      this.queueWrite(() => putRecording(snapshot));
    }
    if (now - this.lastStorageCheck >= STORAGE_CHECK_MILLISECONDS && this.storageCheck === null) {
      this.lastStorageCheck = now;
      this.storageCheck = this.checkStorage().finally(() => {
        this.storageCheck = null;
      });
    }
  }

  private queueWrite(action: () => Promise<void>): void {
    this.writes = this.writes.then(action).catch((error: unknown) => {
      this.fail(error);
    });
  }

  private updateRecordFields(): void {
    this.record.bytes = this.timeline.keptBytes;
    this.record.durationMilliseconds = this.timeline.durationMilliseconds;
    this.record.sounds = this.timeline.sounds.slice();
    this.record.updatedAt = Date.now();
  }
}

/**
 * The bitrate for an output size and frame rate, at the same bits per pixel as the measured 720p30 default.
 *
 * @param width - Output width.
 * @param height - Output height.
 * @param fps - Frame rate.
 * @returns Bits a second.
 */
export function bitrateFor(width: number, height: number, fps: number): number {
  return Math.max(MIN_BITRATE, Math.round(DEFAULT_BITRATE_720P30 * (width * height) / (REFERENCE_WIDTH * REFERENCE_HEIGHT) * fps / REFERENCE_FPS));
}

/**
 * Finds the first codec this browser encodes at the given size, H.264 first.
 *
 * @param width - Output width.
 * @param height - Output height.
 * @param fps - Frame rate.
 * @returns The codec, or `null` when WebCodecs or every candidate is missing.
 */
export async function findCodec(width: number, height: number, fps: number): Promise<CodecChoice | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return null;
  }
  for (const candidate of CODEC_CANDIDATES) {
    try {
      const support = await VideoEncoder.isConfigSupported(encoderConfig(candidate, width, height, fps));
      if (support.supported === true) {
        return candidate;
      }
    } catch {
      // An unknown codec string throws in some browsers; try the next.
    }
  }
  return null;
}

/**
 * The output size for a canvas: the setting's height, never more than the canvas's own, even in both dimensions as
 * the encoders need.
 *
 * @param canvasWidth - The canvas's width in pixels.
 * @param canvasHeight - The canvas's height in pixels.
 * @param setting - The height setting.
 * @returns The output size.
 */
export function outputSize(canvasWidth: number, canvasHeight: number, setting: VideoHeightSetting): VideoSize {
  const safeWidth = Math.max(SIZE_STEP, canvasWidth);
  const safeHeight = Math.max(SIZE_STEP, canvasHeight);
  const height = setting === 'canvas' ? safeHeight : Math.min(Number(setting), safeHeight);
  const width = height * safeWidth / safeHeight;
  return { height: even(height), width: even(width) };
}

export function readVideoSettings(): VideoSettings {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(VIDEO_SETTINGS_STORAGE_KEY) ?? 'null');
    if (typeof parsed === 'object' && parsed !== null && 'fps' in parsed && 'height' in parsed) {
      const fps = VIDEO_FPS_OPTIONS.find((option: VideoFpsSetting) => option === parsed.fps) ?? DEFAULT_VIDEO_SETTINGS.fps;
      const height = VIDEO_HEIGHT_OPTIONS.find((option: VideoHeightSetting) => option === parsed.height) ?? DEFAULT_VIDEO_SETTINGS.height;
      // Settings saved before there was sound have no audio choice.
      const audio = 'audio' in parsed ? VIDEO_AUDIO_OPTIONS.find((option: VideoAudioSetting) => option === parsed.audio) ?? DEFAULT_VIDEO_SETTINGS.audio : DEFAULT_VIDEO_SETTINGS.audio;
      const recordEvery = 'recordEvery' in parsed && parsed.recordEvery === true;
      return { audio, fps, height, recordEvery };
    }
  } catch {
    // Blocked or malformed storage: the defaults.
  }
  return DEFAULT_VIDEO_SETTINGS;
}

export function writeVideoSettings(settings: VideoSettings): void {
  try {
    localStorage.setItem(VIDEO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A blocked storage only means the settings are not remembered.
  }
}

function copyDecoderConfig(config: VideoDecoderConfig): StoredDecoderConfig {
  let description: ArrayBuffer | undefined;
  if (config.description) {
    const raw = config.description;
    const source = ArrayBuffer.isView(raw) ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) : new Uint8Array(raw);
    description = source.slice().buffer;
  }
  return {
    codec: config.codec,
    ...(config.codedHeight === undefined ? {} : { codedHeight: config.codedHeight }),
    ...(config.codedWidth === undefined ? {} : { codedWidth: config.codedWidth }),
    ...(config.colorSpace ? { colorSpace: { fullRange: config.colorSpace.fullRange ?? null, matrix: config.colorSpace.matrix ?? null, primaries: config.colorSpace.primaries ?? null, transfer: config.colorSpace.transfer ?? null } } : {}),
    ...(description ? { description } : {})
  };
}

function encoderConfig(choice: CodecChoice, width: number, height: number, fps: number): VideoEncoderConfig {
  return {
    bitrate: bitrateFor(width, height, fps),
    bitrateMode: 'variable',
    codec: choice.codecString,
    framerate: fps,
    height,
    width,
    ...(choice.codec === 'avc' ? { avc: { format: 'avc' } } : {})
  };
}

function even(value: number): number {
  return Math.max(SIZE_STEP, SIZE_STEP * Math.round(value / SIZE_STEP));
}
