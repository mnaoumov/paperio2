/**
 * @file
 *
 * Turns a stored take into an `.mp4`: the chunks are read from IndexedDB a batch at a time and muxed by mediabunny into
 * a plain (non-fragmented) MP4, which QuickTime plays as well as the browsers do.
 */

import type { StreamTargetChunk } from 'mediabunny';

import {
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  StreamTarget
} from 'mediabunny';

import type {
  ChunkRecord,
  RecordingRecord,
  StoredDecoderConfig
} from './store.ts';

import { readChunks } from './store.ts';

const MICROSECONDS_PER_SECOND = 1_000_000;
const DATE_PART_DIGITS = 2;

/**
 * Collects the muxer's positioned writes into blob parts. The muxer writes in order except for a few header fields it
 * goes back to patch, so a write is either appended or copied over bytes already held.
 */
export class PositionedParts {
  public get size(): number {
    return this.length;
  }

  private length = 0;
  private readonly parts: Uint8Array<ArrayBuffer>[] = [];

  public toBlob(type: string): Blob {
    return new Blob(this.parts, { type });
  }

  public write(data: Uint8Array, position: number): void {
    let offset = 0;
    let partStart = 0;
    for (const part of this.parts) {
      if (offset >= data.length) {
        break;
      }
      const partEnd = partStart + part.length;
      const writeAt = position + offset;
      if (writeAt < partEnd && writeAt >= partStart) {
        const count = Math.min(partEnd - writeAt, data.length - offset);
        part.set(data.subarray(offset, offset + count), writeAt - partStart);
        offset += count;
      }
      partStart = partEnd;
    }
    if (offset >= data.length) {
      return;
    }
    if (position + offset > this.length) {
      // A gap: the muxer never leaves one, but a zero fill keeps the offsets right if it ever does.
      this.parts.push(new Uint8Array(position + offset - this.length));
      this.length = position + offset;
    }
    const rest = new Uint8Array(data.length - offset);
    rest.set(data.subarray(offset));
    this.parts.push(rest);
    this.length += rest.length;
  }
}

/**
 * Muxes a stored take into an MP4.
 *
 * @param record - The take.
 * @returns The file.
 */
export async function exportRecording(record: RecordingRecord): Promise<Blob> {
  if (!record.decoderConfig) {
    throw new Error('This recording has no video in it');
  }
  const decoderConfig: StoredDecoderConfig = record.decoderConfig;
  const parts = new PositionedParts();
  const writable = new WritableStream<StreamTargetChunk>({
    write(chunk: StreamTargetChunk): void {
      parts.write(chunk.data, chunk.position);
    }
  });
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target: new StreamTarget(writable, { chunked: true })
  });
  const source = new EncodedVideoPacketSource(record.codec);
  // No frame-rate hint: mediabunny would round every timestamp to it, and a checkpoint's keyframe can fall between two
  // Slots.
  output.addVideoTrack(source);
  await output.start();
  const frameSeconds = 1 / record.fps;
  const meta: EncodedVideoChunkMetadata = { decoderConfig: toDecoderConfig(decoderConfig) };
  let previous: ChunkRecord | null = null;
  let packets = 0;
  // Each packet's duration runs to the next one's timestamp, so the previous chunk is added once the next is read.
  for await (const chunks of readChunks(record.id)) {
    for (const chunk of chunks) {
      if (previous) {
        await source.add(toPacket(previous, (chunk.timestamp - previous.timestamp) / MICROSECONDS_PER_SECOND), packets === 0 ? meta : undefined);
        packets++;
      }
      previous = chunk;
    }
  }
  if (!previous) {
    await output.cancel();
    throw new Error('This recording has no video in it');
  }
  await source.add(toPacket(previous, frameSeconds), packets === 0 ? meta : undefined);
  await output.finalize();
  return parts.toBlob('video/mp4');
}

/**
 * The download's file name: `paperio2-<yyyy-mm-dd-hhmm>.mp4`, in local time.
 *
 * @param startedAt - When the take started, from `Date.now()`.
 * @returns The name.
 */
export function recordingFileName(startedAt: number): string {
  const date = new Date(startedAt);
  function pad(value: number): string {
    return String(value).padStart(DATE_PART_DIGITS, '0');
  }
  return `paperio2-${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.mp4`;
}

function toDecoderConfig(config: StoredDecoderConfig): VideoDecoderConfig {
  const decoderConfig: VideoDecoderConfig = { codec: config.codec };
  if (config.codedWidth !== undefined) {
    decoderConfig.codedWidth = config.codedWidth;
  }
  if (config.codedHeight !== undefined) {
    decoderConfig.codedHeight = config.codedHeight;
  }
  if (config.colorSpace !== undefined) {
    decoderConfig.colorSpace = config.colorSpace;
  }
  if (config.description !== undefined) {
    decoderConfig.description = config.description;
  }
  return decoderConfig;
}

function toPacket(chunk: ChunkRecord, durationSeconds: number): EncodedPacket {
  return new EncodedPacket(new Uint8Array(chunk.data), chunk.type, chunk.timestamp / MICROSECONDS_PER_SECOND, durationSeconds);
}
