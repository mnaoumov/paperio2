/**
 * @file
 *
 * The music playlist's order, and the music bed a download lays under a take: plain logic, unit-tested.
 */

/** A track fades in and out, so one shorter than two crossfades is skipped. */
const CROSSFADES_PER_TRACK = 2;
/** 2 to the 32nd: one more than the largest 32-bit unsigned integer. */
const UINT32_RANGE = 4_294_967_296;

/** One track's place in a music bed. */
export interface BedSegment {
  /** How long it plays, in seconds. */
  readonly duration: number;
  /** Seconds to fade in from its start: 0 for the bed's first track, the crossfade for the others. */
  readonly fadeIn: number;
  /** Seconds to fade out before its end. */
  readonly fadeOut: number;
  /** When it starts, in seconds of video. */
  readonly start: number;
  /** Its index in the track list. */
  readonly track: number;
}

export interface PlanMusicBedParams {
  /** Seconds the outgoing and incoming tracks overlap. */
  readonly crossfadeSeconds: number;
  /** Each track's length, in seconds. */
  readonly durations: readonly number[];
  /** Seconds of fade at the very end of the video. */
  readonly endFadeSeconds: number;
  /** The order the tracks play in, as indices; it repeats until the video ends. */
  readonly order: readonly number[];
  /** The video's length, in seconds. */
  readonly totalSeconds: number;
}

/**
 * A random number in [0, 1) that never draws from `Math.random`: the engine's spawn positions and particles do, and an
 * extra draw would change the game whenever `Math.random` is seeded, as the differential test seeds it.
 *
 * @returns The number.
 */
export function audioRandom(): number {
  return (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) / UINT32_RANGE;
}

/**
 * Lays tracks end to end, overlapping by the crossfade, until the video is covered. The last one is cut at the end of
 * the video and fades out over its last seconds.
 *
 * @param params - The tracks, their order and the video's length.
 * @returns The segments, in order.
 */
export function planMusicBed(params: PlanMusicBedParams): BedSegment[] {
  const { crossfadeSeconds, durations, endFadeSeconds, order, totalSeconds } = params;
  const segments: BedSegment[] = [];
  const playable = order.filter((track: number) => (durations[track] ?? 0) > crossfadeSeconds * CROSSFADES_PER_TRACK);
  if (totalSeconds <= 0 || playable.length === 0) {
    return segments;
  }
  let start = 0;
  for (let index = 0; start < totalSeconds; index++) {
    const track = playable[index % playable.length] ?? 0;
    const length = durations[track] ?? 0;
    const end = Math.min(start + length, totalSeconds);
    const isLast = end >= totalSeconds;
    segments.push({
      duration: end - start,
      fadeIn: index === 0 ? 0 : crossfadeSeconds,
      fadeOut: isLast ? Math.min(endFadeSeconds, end - start) : crossfadeSeconds,
      start,
      track
    });
    start += length - crossfadeSeconds;
  }
  return segments;
}

/**
 * Shuffles the track indices, so the playlist never starts its next round on the track the last one ended with.
 *
 * @param count - How many tracks there are.
 * @param random - A source of numbers in [0, 1), such as {@link audioRandom}.
 * @param after - The track that just played, or `null`.
 * @returns A new order holding every index once.
 */
export function shuffledOrder(count: number, random: () => number, after: null | number = null): number[] {
  const order = Array.from({ length: count }, (_: unknown, index: number) => index);
  for (let index = order.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    const value = order[index] ?? 0;
    order[index] = order[other] ?? 0;
    order[other] = value;
  }
  if (count > 1 && order[0] === after) {
    order.push(order.shift() ?? 0);
  }
  return order;
}
