import {
  describe,
  expect,
  it
} from 'vitest';

import type {
  ChunkEntry,
  EncodeRequest,
  SoundEntry
} from './timeline.ts';

import {
  MICROSECONDS_PER_MILLISECOND,
  RecordingTimeline
} from './timeline.ts';

const FPS = 30;
const FRAME_MILLISECONDS = 1000 / FPS;
const KEY_FRAME_INTERVAL_MILLISECONDS = 60_000;
const CLOCK_START = 50_000;
const CHUNK_BYTES = 100;

/** A timeline with an encoder that hands every frame straight back, as a real one does, only later. */
class Harness {
  public readonly timeline = new RecordingTimeline({ fps: FPS, keyFrameIntervalMilliseconds: KEY_FRAME_INTERVAL_MILLISECONDS });
  private readonly inEncoder: EncodeRequest[] = [];

  public checkpoint(id: number, clockTime: number): EncodeRequest {
    const request = this.timeline.checkpoint(id, clockTime);
    this.inEncoder.push(request);
    return request;
  }

  public drain(): void {
    for (const request of this.inEncoder.splice(0)) {
      this.timeline.accept(request.timestamp, request.keyFrame ? 'key' : 'delta', CHUNK_BYTES);
    }
  }

  /**
   * Renders frames from `from` to `to` of game clock, one every 1/60 s.
   *
   * @param from - The clock at the first frame.
   * @param to - The clock past the last frame.
   * @returns The frames encoded.
   */
  public play(from: number, to: number): EncodeRequest[] {
    const encoded: EncodeRequest[] = [];
    const step = FRAME_MILLISECONDS / 2;
    const steps = Math.round((to - from) / step);
    for (let index = 0; index < steps; index++) {
      const clock = from + index * step;
      const request = this.timeline.frame(clock, true);
      if (request) {
        this.inEncoder.push(request);
        encoded.push(request);
      }
    }
    return encoded;
  }
}

function micro(milliseconds: number): number {
  return Math.round(milliseconds * MICROSECONDS_PER_MILLISECOND);
}

function timestamps(chunks: readonly ChunkEntry[]): number[] {
  return chunks.map((chunk: ChunkEntry) => chunk.timestamp);
}

describe('RecordingTimeline', () => {
  it('starts at video time 0 with a keyframe and encodes at the take\'s frame rate', () => {
    const harness = new Harness();
    const encoded = harness.play(CLOCK_START, CLOCK_START + 1000);
    expect(encoded[0]).toEqual({ keyFrame: true, timestamp: 0 });
    expect(encoded).toHaveLength(FPS);
    expect(encoded.slice(1).every((request: EncodeRequest) => !request.keyFrame)).toBe(true);
  });

  it('makes the checkpoint\'s frame a keyframe at the checkpoint\'s clock time', () => {
    const harness = new Harness();
    harness.play(CLOCK_START, CLOCK_START + 1000);
    expect(harness.checkpoint(1, CLOCK_START + 1010)).toEqual({ keyFrame: true, timestamp: micro(1010) });
  });

  it('cuts everything after the checkpoint on a respawn, and continues from its timestamp with a keyframe', () => {
    const harness = new Harness();
    harness.play(CLOCK_START, CLOCK_START + 1000);
    harness.checkpoint(1, CLOCK_START + 1000);
    harness.play(CLOCK_START + 1000, CLOCK_START + 4000);
    harness.drain();
    const keptBefore = harness.timeline.chunks.filter((chunk: ChunkEntry) => chunk.timestamp <= micro(1000));
    const firstDropped = harness.timeline.chunks[keptBefore.length];

    const cut = harness.timeline.respawn(1);

    expect(cut).toEqual({ fromSeq: firstDropped?.seq, restarted: false });
    expect(harness.timeline.chunks).toEqual(keptBefore);
    expect(harness.timeline.chunks.at(-1)).toMatchObject({ timestamp: micro(1000), type: 'key' });
    // The respawn restored the clock to the checkpoint's, so the next frames follow the keyframe directly.
    const after = harness.play(CLOCK_START + 1000, CLOCK_START + 1100);
    expect(after[0]?.keyFrame).toBe(true);
    expect(after[0]?.timestamp).toBeGreaterThan(micro(1000));
    expect(after[0]?.timestamp).toBeLessThanOrEqual(micro(1000 + FRAME_MILLISECONDS));
    harness.drain();
    const all = timestamps(harness.timeline.chunks);
    expect(all).toEqual([...all].sort((a: number, b: number) => a - b));
  });

  it('drops a cut frame still in the encoder', () => {
    const harness = new Harness();
    harness.play(CLOCK_START, CLOCK_START + 500);
    harness.checkpoint(1, CLOCK_START + 500);
    harness.play(CLOCK_START + 500, CLOCK_START + 900);
    // Nothing has come out of the encoder yet.
    expect(harness.timeline.respawn(1)).toEqual({ fromSeq: null, restarted: false });
    harness.play(CLOCK_START + 500, CLOCK_START + 600);
    harness.drain();
    const all = timestamps(harness.timeline.chunks);
    // The second attempt encodes the same timestamps as the first, so a cut frame that slipped through would repeat one.
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual([...all].sort((a: number, b: number) => a - b));
    expect(all.every((timestamp: number) => timestamp < micro(600))).toBe(true);
  });

  it('after a checkpoint is added then removed, a death cuts back to the one before it', () => {
    const harness = new Harness();
    harness.play(CLOCK_START, CLOCK_START + 1000);
    harness.checkpoint(1, CLOCK_START + 1000);
    harness.play(CLOCK_START + 1000, CLOCK_START + 2000);
    harness.checkpoint(2, CLOCK_START + 2000);
    harness.play(CLOCK_START + 2000, CLOCK_START + 3000);
    harness.drain();
    // Checkpoint 2 is removed: the practice run no longer holds it, and the death respawns at checkpoint 1.
    harness.timeline.keepMarkers([1]);
    const cut = harness.timeline.respawn(1);
    expect(cut.restarted).toBe(false);
    expect(harness.timeline.chunks.at(-1)?.timestamp).toBe(micro(1000));
    expect(harness.timeline.chunks.some((chunk: ChunkEntry) => chunk.timestamp === micro(2000))).toBe(false);
  });

  it('removing a checkpoint cuts nothing by itself', () => {
    const harness = new Harness();
    harness.play(CLOCK_START, CLOCK_START + 1000);
    harness.checkpoint(1, CLOCK_START + 1000);
    harness.play(CLOCK_START + 1000, CLOCK_START + 2000);
    harness.drain();
    const before = harness.timeline.chunks.length;
    harness.timeline.keepMarkers([]);
    expect(harness.timeline.chunks).toHaveLength(before);
  });

  it('restarts the take at 0 when the respawn goes to a checkpoint from before it', () => {
    const harness = new Harness();
    harness.play(CLOCK_START, CLOCK_START + 1000);
    harness.drain();
    const cut = harness.timeline.respawn(99);
    expect(cut).toEqual({ fromSeq: 0, restarted: true });
    expect(harness.timeline.chunks).toHaveLength(0);
    // The respawn put the clock back to the old checkpoint, before the take began.
    const encoded = harness.play(CLOCK_START - 5000, CLOCK_START - 4900);
    expect(encoded[0]).toEqual({ keyFrame: true, timestamp: 0 });
  });

  it('skips frames while the encoder is behind, but never a due keyframe', () => {
    const timeline = new RecordingTimeline({ fps: FPS, keyFrameIntervalMilliseconds: KEY_FRAME_INTERVAL_MILLISECONDS });
    expect(timeline.frame(CLOCK_START, false)).toEqual({ keyFrame: true, timestamp: 0 });
    expect(timeline.frame(CLOCK_START + 100, false)).toBeNull();
    expect(timeline.checkpoint(1, CLOCK_START + 200).keyFrame).toBe(true);
  });

  it('keeps the frame rate when renders come a little early or late', () => {
    const timeline = new RecordingTimeline({ fps: FPS, keyFrameIntervalMilliseconds: KEY_FRAME_INTERVAL_MILLISECONDS });
    let encoded = 0;
    const rendersPerSecond = 60;
    for (let index = 0; index < rendersPerSecond; index++) {
      const jitter = index % 2 === 0 ? 1 : -1;
      if (timeline.frame(CLOCK_START + index * FRAME_MILLISECONDS / 2 + jitter, true)) {
        encoded++;
      }
    }
    expect(encoded).toBe(FPS);
  });

  it('forces a keyframe once the keyframe interval has passed', () => {
    const timeline = new RecordingTimeline({ fps: FPS, keyFrameIntervalMilliseconds: 1000 });
    const keyFrames: number[] = [];
    for (let clock = CLOCK_START; clock < CLOCK_START + 3000; clock += FRAME_MILLISECONDS) {
      const request = timeline.frame(clock, true);
      if (request?.keyFrame) {
        keyFrames.push(request.timestamp);
      }
    }
    expect(keyFrames).toHaveLength(3);
  });

  it('logs a sound at its video time, and none before the take\'s first frame', () => {
    const harness = new Harness();
    expect(harness.timeline.sound(CLOCK_START - 10, 'kill', 1)).toBeNull();
    harness.play(CLOCK_START, CLOCK_START + 1000);
    expect(harness.timeline.sound(CLOCK_START + 500, 'kill', 0.5)).toEqual({ gain: 0.5, sound: 'kill', timestamp: micro(500) });
    expect(harness.timeline.sounds).toHaveLength(1);
  });

  it('cuts the sounds of the failed attempt with its video, and keeps the ones up to the checkpoint', () => {
    const harness = new Harness();
    harness.play(CLOCK_START, CLOCK_START + 1000);
    harness.timeline.sound(CLOCK_START + 400, 'capture-small', 1);
    harness.checkpoint(1, CLOCK_START + 1000);
    harness.timeline.sound(CLOCK_START + 1000, 'kill', 1);
    harness.play(CLOCK_START + 1000, CLOCK_START + 3000);
    harness.timeline.sound(CLOCK_START + 2500, 'death', 1);
    harness.drain();

    harness.timeline.respawn(1);
    expect(harness.timeline.sounds.map((entry: SoundEntry) => entry.sound)).toEqual(['capture-small', 'kill']);
    // The clock was put back to the checkpoint's, so the next attempt's sounds follow the kept ones in order.
    harness.play(CLOCK_START + 1000, CLOCK_START + 2000);
    harness.timeline.sound(CLOCK_START + 1500, 'capture-large', 1);
    expect(harness.timeline.sounds.map((entry: SoundEntry) => entry.timestamp)).toEqual([micro(400), micro(1000), micro(1500)]);
  });

  it('drops every sound when a respawn restarts the take', () => {
    const harness = new Harness();
    harness.play(CLOCK_START, CLOCK_START + 1000);
    harness.timeline.sound(CLOCK_START + 400, 'kill', 1);
    harness.timeline.respawn(99);
    expect(harness.timeline.sounds).toHaveLength(0);
  });

  it('counts the duration and the kept bytes', () => {
    const harness = new Harness();
    harness.play(CLOCK_START, CLOCK_START + 1000);
    harness.drain();
    expect(harness.timeline.keptBytes).toBe(FPS * CHUNK_BYTES);
    expect(harness.timeline.durationMilliseconds).toBeCloseTo(1000, 0);
  });
});
