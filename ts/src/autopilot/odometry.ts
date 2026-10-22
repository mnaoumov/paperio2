/**
 * @file
 *
 * Visual odometry for the blackbox pilot: how far the player moved, measured from the pixels alone. The player stays at
 * the view's centre, so the ground slides under it by exactly the player's own motion. Matching the edges of a
 * classified frame against those of a key frame gives that slide to a pixel, and since the key frame is kept for many
 * frames, the position it gives is never off by more than half a pixel of the key frame's, however many frames ago that
 * was. That is the sense a human uses to remember the way they came: the ground going by.
 *
 * It imports nothing but the plain geometry beside it, like the pilot.
 */

import type { Point } from './plane.ts';

import { ORIGIN } from './plane.ts';

/** The shift is searched this many pixels either side of the predicted one. */
const SEARCH_RADIUS = 3;
/** A key frame is replaced once the view has moved this many pixels from it, so the overlap stays large. */
const REKEY_SHIFT = 14;
/** A match is trusted when at most this share of the compared edge pixels disagree. */
const MAX_MISMATCH = 0.35;
/** Fewer compared edge pixels than this, as on open floor, and the prediction stands in for the measurement. */
const MIN_COMPARED = 40;
/** At most this many edge pixels are compared, spread evenly over the key frame. */
const MAX_SAMPLES = 3000;
/** A shift away from the predicted one costs this much per squared pixel, so a straight edge's slide stays put. */
const PRIOR_WEIGHT = 0.004;
/** The velocity is the average over this many frames. */
const VELOCITY_FRAMES = 6;
/** A velocity needs two positions. */
const MIN_HISTORY = 2;

export class Odometer {
  /** Whether the last frame's motion was measured rather than predicted. */
  public measured = false;
  /** The view centre's position, in frame pixels, from where the odometer started. */
  public position: Point = ORIGIN;
  /**
   * The player's motion per frame, averaged over the last few frames.
   *
   * @returns The velocity, in frame pixels per frame.
   */
  public get velocity(): Point {
    const first = this.history[0];
    const last = this.history.at(-1);
    if (!first || !last || this.history.length < MIN_HISTORY) {
      return ORIGIN;
    }
    const frames = this.history.length - 1;
    return { x: (last.x - first.x) / frames, y: (last.y - first.y) / frames };
  }

  private readonly history: Point[] = [];
  private key: null | Uint8Array = null;
  private keyPosition: Point = ORIGIN;
  private keySamples: Int32Array = new Int32Array(0);

  /** The view's shift from the key frame, the last time it was measured. */
  private shift: Point = ORIGIN;

  /**
   * Starts an odometer at the origin.
   *
   * @param ignoredClass - The pixel class that says nothing about the ground (the masked HUD and avatar).
   */
  public constructor(private readonly ignoredClass: number) {}

  /** Forgets the key frame and the velocity, keeping the position. */
  public reset(): void {
    this.key = null;
    this.history.length = 0;
  }

  /**
   * Measures one frame's motion.
   *
   * @param classes - The frame's pixel classes.
   * @param width - The frame's width.
   * @param height - The frame's height.
   * @param predicted - The motion expected this frame, which stands in when nothing can be measured.
   * @returns The position.
   */
  public update(classes: Uint8Array, width: number, height: number, predicted: Point): Point {
    const expected = { x: this.shift.x + predicted.x, y: this.shift.y + predicted.y };
    const found = this.key?.length === classes.length ? this.match(classes, width, height, expected) : null;
    this.measured = found !== null;
    this.shift = found ?? expected;
    this.position = { x: this.keyPosition.x + this.shift.x, y: this.keyPosition.y + this.shift.y };
    if (!found || Math.max(Math.abs(this.shift.x), Math.abs(this.shift.y)) > REKEY_SHIFT) {
      this.setKey(classes, width);
    }
    this.history.push(this.position);
    if (this.history.length > VELOCITY_FRAMES + 1) {
      this.history.shift();
    }
    return this.position;
  }

  private match(classes: Uint8Array, width: number, height: number, expected: Point): null | Point {
    const key = this.key ?? classes;
    const centerX = Math.round(expected.x);
    const centerY = Math.round(expected.y);
    let best: null | Point = null;
    let bestScore = Infinity;
    for (let shiftY = centerY - SEARCH_RADIUS; shiftY <= centerY + SEARCH_RADIUS; shiftY++) {
      for (let shiftX = centerX - SEARCH_RADIUS; shiftX <= centerX + SEARCH_RADIUS; shiftX++) {
        let compared = 0;
        let mismatched = 0;
        for (const sample of this.keySamples) {
          // A ground point at `sample` in the key frame is at `sample - shift` now.
          const column = sample % width - shiftX;
          const row = Math.floor(sample / width) - shiftY;
          if (column < 0 || row < 0 || column >= width || row >= height) {
            continue;
          }
          const now = classes[row * width + column];
          if (now === this.ignoredClass) {
            continue;
          }
          compared++;
          if (now !== key[sample]) {
            mismatched++;
          }
        }
        if (compared < MIN_COMPARED) {
          continue;
        }
        const mismatch = mismatched / compared;
        const offX = shiftX - expected.x;
        const offY = shiftY - expected.y;
        const score = mismatch + PRIOR_WEIGHT * (offX * offX + offY * offY);
        if (mismatch <= MAX_MISMATCH && score < bestScore) {
          bestScore = score;
          best = { x: shiftX, y: shiftY };
        }
      }
    }
    return best;
  }

  private setKey(classes: Uint8Array, width: number): void {
    this.key = classes.slice();
    this.keyPosition = this.position;
    this.shift = ORIGIN;
    const edges: number[] = [];
    for (let index = 0; index < classes.length - width - 1; index++) {
      const here = classes[index];
      if (here === this.ignoredClass) {
        continue;
      }
      const right = index % width < width - 1 ? classes[index + 1] : here;
      const below = classes[index + width];
      // Both sides of an edge are kept: one side alone cannot tell a slide toward it from a slide away.
      if (right !== here && right !== this.ignoredClass) {
        edges.push(index, index + 1);
      }
      if (below !== here && below !== this.ignoredClass) {
        edges.push(index, index + width);
      }
    }
    const stride = Math.max(1, Math.ceil(edges.length / MAX_SAMPLES));
    this.keySamples = Int32Array.from(edges.filter((_edge, index) => index % stride === 0));
  }
}
