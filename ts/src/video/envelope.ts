/**
 * @file
 *
 * A value over a download's video time, as straight lines between corners: the music bed's volume, and the warning
 * loops' levels and pulse rate. A window of the mix schedules the part of it that falls inside the window.
 */

/** A trapezoid's area is its width by the mean of its two sides. */
const HALF = 0.5;

/** A corner: the value at a time, in video seconds. */
export interface Envelope {
  readonly time: number;
  readonly value: number;
}

/** The parts of an `AudioParam` an envelope is scheduled on. */
export interface EnvelopeParam {
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  setValueAtTime(value: number, startTime: number): unknown;
}

/**
 * Schedules the part of an envelope inside a window on a parameter of the window's context.
 *
 * @param param - The parameter.
 * @param points - The corners, in order.
 * @param from - The window's start, in video seconds.
 * @param to - The window's end, in video seconds.
 * @param lead - Seconds of the context before the window's start, which the mix trims off.
 */
export function applyEnvelope(param: EnvelopeParam, points: readonly Envelope[], from: number, to: number, lead = 0): void {
  const startsAt = Math.max(from, points[0]?.time ?? from);
  param.setValueAtTime(valueAt(points, startsAt), startsAt - from + lead);
  for (const point of points) {
    if (point.time > startsAt && point.time <= to) {
      param.linearRampToValueAtTime(point.value, point.time - from + lead);
    }
  }
  const last = points.find((point: Envelope) => point.time > to);
  if (last) {
    param.linearRampToValueAtTime(valueAt(points, to), to - from + lead);
  }
}

/**
 * The area under an envelope from its first corner to a time: for a rate in cycles a second, the cycles run by then.
 *
 * @param points - The corners, in order.
 * @param time - Video seconds.
 * @returns The area; the value before the first corner counts as nothing, the value after the last holds.
 */
export function areaUntil(points: readonly Envelope[], time: number): number {
  let area = 0;
  let previous = points[0];
  if (!previous || time <= previous.time) {
    return 0;
  }
  for (const point of points.slice(1)) {
    const end = Math.min(point.time, time);
    if (end > previous.time) {
      area += (end - previous.time) * (previous.value + valueAt([previous, point], end)) * HALF;
    }
    if (point.time >= time) {
      return area;
    }
    previous = point;
  }
  return area + (time - previous.time) * previous.value;
}

/**
 * Whether an envelope is above zero anywhere in a window.
 *
 * @param points - The corners, in order.
 * @param from - The window's start.
 * @param to - The window's end.
 * @returns `false` when it is zero throughout.
 */
export function isAudibleIn(points: readonly Envelope[], from: number, to: number): boolean {
  return valueAt(points, from) > 0 || valueAt(points, to) > 0 || points.some((point: Envelope) => point.time > from && point.time < to && point.value > 0);
}

/**
 * The envelope's value at a time, by straight lines between its corners.
 *
 * @param points - The corners, in order.
 * @param time - Video seconds.
 * @returns The value.
 */
export function valueAt(points: readonly Envelope[], time: number): number {
  let previous = points[0];
  if (!previous || time <= previous.time) {
    return previous?.value ?? 0;
  }
  for (const point of points.slice(1)) {
    if (time <= point.time) {
      const span = point.time - previous.time;
      return span <= 0 ? point.value : previous.value + (point.value - previous.value) * (time - previous.time) / span;
    }
    previous = point;
  }
  return previous.value;
}
