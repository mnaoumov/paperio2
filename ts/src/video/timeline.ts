/**
 * @file
 *
 * The in-game recording's timeline: which frames to encode, which of them must be keyframes, and what a practice
 * respawn cuts. It holds no video data, only the index of the encoded chunks, so it is plain logic and unit-tested.
 *
 * Video time is the game clock minus the clock at the take's first frame. A paused span renders no frame and the
 * clock skips it, so a pause never shows in the video. A respawn restores the clock to the checkpoint's, so after the
 * cut the video carries on from the checkpoint's own timestamp: everything encoded after the checkpoint's keyframe
 * (the failed attempt, the death and the death delay) is dropped, and the next frame is a keyframe again, because the
 * encoder's last reference was a dropped frame.
 */

/** An encoded chunk that is kept in the take. */
export interface ChunkEntry {
  readonly bytes: number;
  /** Increasing over the take and never reused, so a cut is one key range in storage. */
  readonly seq: number;
  /** Video time in microseconds. */
  readonly timestamp: number;
  readonly type: ChunkType;
}

export type ChunkType = 'delta' | 'key';

/** What a respawn cut. */
export interface CutResult {
  /** The first stored sequence number that is gone: every chunk from it on is to be deleted, or `null` for none. */
  readonly fromSeq: null | number;
  /** Whether the cut reached the start of the take, so the take starts over at video time 0. */
  readonly restarted: boolean;
}

/** A frame to encode now. */
export interface EncodeRequest {
  readonly keyFrame: boolean;
  /** Video time in microseconds. */
  readonly timestamp: number;
}

export interface RecordingTimelineConstructorParams {
  readonly fps: number;
  /** The longest run of video without a keyframe, so a player can seek. */
  readonly keyFrameIntervalMilliseconds: number;
}

interface PendingEncode {
  keep: boolean;
  readonly timestamp: number;
}

export const DEFAULT_KEY_FRAME_INTERVAL_MILLISECONDS = 5000;
export const MICROSECONDS_PER_MILLISECOND = 1000;
const MILLISECONDS_PER_SECOND = 1000;

export class RecordingTimeline {
  /** The kept chunks, in order. */
  public readonly chunks: ChunkEntry[] = [];

  /**
   * How long the take is so far, counting the frames still in the encoder.
   *
   * @returns Milliseconds of video.
   */
  public get durationMilliseconds(): number {
    if (this.lastEncodedAt === null) {
      return 0;
    }
    return this.lastEncodedAt / MICROSECONDS_PER_MILLISECOND + this.frameIntervalMilliseconds;
  }

  /**
   * The frame interval at the take's frame rate.
   *
   * @returns Milliseconds.
   */
  public get frameIntervalMilliseconds(): number {
    return MILLISECONDS_PER_SECOND / this.fps;
  }

  /**
   * The kept chunks' total size.
   *
   * @returns Bytes.
   */
  public get keptBytes(): number {
    return this.chunks.reduce((total: number, chunk: ChunkEntry) => total + chunk.bytes, 0);
  }

  private readonly fps: number;
  private keyFrameDue = true;
  private readonly keyFrameIntervalMilliseconds: number;
  private lastEncodedAt: null | number = null;
  private lastKeyFrameAt = 0;
  /** Each checkpoint's keyframe, by checkpoint id, in video microseconds. */
  private readonly markers = new Map<number, number>();
  private nextFrameAt = 0;
  private nextSeq = 0;

  /** The game clock at video time 0, or `null` until the take's first frame. */
  private origin: null | number = null;
  /** Frames handed to the encoder whose chunks have not come out yet, in encode order. */
  private readonly pending: PendingEncode[] = [];

  public constructor(options: RecordingTimelineConstructorParams) {
    this.fps = options.fps;
    this.keyFrameIntervalMilliseconds = options.keyFrameIntervalMilliseconds;
  }

  /**
   * Takes an encoded chunk from the encoder.
   *
   * @param timestamp - The chunk's timestamp, in microseconds.
   * @param type - Whether it is a keyframe.
   * @param bytes - Its size.
   * @returns Its entry, to be stored, or `null` when a cut dropped it while it was in the encoder.
   */
  public accept(timestamp: number, type: ChunkType, bytes: number): ChunkEntry | null {
    let encode = this.pending.shift();
    while (encode && encode.timestamp !== timestamp) {
      encode = this.pending.shift();
    }
    if (!encode?.keep) {
      return null;
    }
    const entry: ChunkEntry = { bytes, seq: this.nextSeq++, timestamp, type };
    this.chunks.push(entry);
    return entry;
  }

  /**
   * Called when a checkpoint is taken: its frame becomes a keyframe, the point a respawn at it cuts back to.
   *
   * @param checkpointId - The checkpoint's id.
   * @param clockTime - The game clock when it was taken, which its respawn restores.
   * @returns The keyframe to encode now.
   */
  public checkpoint(checkpointId: number, clockTime: number): EncodeRequest {
    this.origin ??= clockTime;
    let timestamp = this.toVideoTime(clockTime);
    if (this.lastEncodedAt !== null && timestamp <= this.lastEncodedAt) {
      timestamp = this.lastEncodedAt + 1;
    }
    this.markers.set(checkpointId, timestamp);
    return this.encode(timestamp, true);
  }

  /**
   * Called after every rendered frame.
   *
   * @param clockTime - The game clock now.
   * @param canEncode - `false` while the encoder is behind: the frame is skipped unless a keyframe is due.
   * @returns The frame to encode now, or `null`.
   */
  public frame(clockTime: number, canEncode: boolean): EncodeRequest | null {
    this.origin ??= clockTime;
    const timestamp = this.toVideoTime(clockTime);
    if (this.lastEncodedAt !== null && timestamp <= this.lastEncodedAt) {
      return null;
    }
    if (timestamp < this.nextFrameAt) {
      return null;
    }
    const keyFrame = this.keyFrameDue || timestamp - this.lastKeyFrameAt >= this.keyFrameIntervalMilliseconds * MICROSECONDS_PER_MILLISECOND;
    if (!canEncode && !keyFrame) {
      this.nextFrameAt = this.slotAfter(timestamp);
      return null;
    }
    return this.encode(timestamp, keyFrame);
  }

  /**
   * Forgets the markers of checkpoints the practice run no longer holds, so the map stays small.
   *
   * @param checkpointIds - The ids still held.
   */
  public keepMarkers(checkpointIds: readonly number[]): void {
    for (const id of [...this.markers.keys()]) {
      if (!checkpointIds.includes(id)) {
        this.markers.delete(id);
      }
    }
  }

  /**
   * Called right after a respawn restored a checkpoint: cuts everything after its keyframe.
   *
   * @param checkpointId - The checkpoint respawned at.
   * @returns What was cut.
   */
  public respawn(checkpointId: number): CutResult {
    const marker = this.markers.get(checkpointId);
    this.keyFrameDue = true;
    if (marker === undefined) {
      // A checkpoint from before the take: nothing recorded shows its state, so the take starts over from it.
      return this.restart();
    }
    for (const encode of this.pending) {
      if (encode.timestamp > marker) {
        encode.keep = false;
      }
    }
    const firstDropped = this.chunks.findIndex((chunk: ChunkEntry) => chunk.timestamp > marker);
    let fromSeq: null | number = null;
    if (firstDropped >= 0) {
      fromSeq = this.chunks[firstDropped]?.seq ?? null;
      this.chunks.length = firstDropped;
    }
    for (const [id, timestamp] of [...this.markers]) {
      if (timestamp > marker) {
        this.markers.delete(id);
      }
    }
    this.lastEncodedAt = marker;
    this.lastKeyFrameAt = marker;
    this.nextFrameAt = this.slotAfter(marker);
    return { fromSeq, restarted: false };
  }

  private encode(timestamp: number, keyFrame: boolean): EncodeRequest {
    this.pending.push({ keep: true, timestamp });
    this.lastEncodedAt = timestamp;
    this.nextFrameAt = this.slotAfter(timestamp);
    if (keyFrame) {
      this.keyFrameDue = false;
      this.lastKeyFrameAt = timestamp;
    }
    return { keyFrame, timestamp };
  }

  private frameIntervalMicroseconds(): number {
    return Math.round(this.frameIntervalMilliseconds * MICROSECONDS_PER_MILLISECOND);
  }

  private restart(): CutResult {
    for (const encode of this.pending) {
      encode.keep = false;
    }
    const fromSeq = this.chunks[0]?.seq ?? null;
    this.chunks.length = 0;
    this.markers.clear();
    this.origin = null;
    this.lastEncodedAt = null;
    this.lastKeyFrameAt = 0;
    this.nextFrameAt = 0;
    return { fromSeq, restarted: true };
  }

  /**
   * The next slot of the frame-rate grid, which starts at video time 0: a frame is encoded on the first render at or
   * past each slot, so a render that comes a little early does not push every later frame back.
   *
   * @param timestamp - Video time in microseconds.
   * @returns The first slot after it.
   */
  private slotAfter(timestamp: number): number {
    const interval = this.frameIntervalMicroseconds();
    return (Math.floor(timestamp / interval) + 1) * interval;
  }

  private toVideoTime(clockTime: number): number {
    return Math.max(0, Math.round((clockTime - (this.origin ?? clockTime)) * MICROSECONDS_PER_MILLISECOND));
  }
}
