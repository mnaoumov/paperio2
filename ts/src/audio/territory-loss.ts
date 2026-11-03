/**
 * @file
 * Detects losses in the own-territory area just drawn on the minimap. No enemy or pending-capture state is read.
 */

/** A visible minimap sample, independent of the engine's capture events. */
export interface MinimapSample {
  /** Own-territory area divided by the arena's rectangular extent. */
  readonly area: number;
  /** Side length of the minimap in rendered canvas pixels, after the renderer's device-ratio transform. */
  readonly size: number;
  /** Game-clock milliseconds, so pausing does not age the burst window. */
  readonly time: number;
}

/** Ignore edge slivers smaller than 0.01% of the map, even on a large screen. */
const MIN_LOSS_SHARE = 0.0001;
/** Consecutive drops within this window belong to one capture burst. */
const LOSS_QUIET_MILLISECONDS = 500;

export class TerritoryLoss {
  private lastDropTime = -Infinity;
  private previous: MinimapSample | null = null;

  /** Forget samples across runs, respawns, hidden views and death. */
  public reset(): void {
    this.previous = null;
    this.lastDropTime = -Infinity;
  }

  /**
   * Returns whether this rendered sample starts an audible loss burst.
   *
   * @param current - The own area and resolution just drawn, at game time.
   * @returns Whether a new audible loss burst started.
   */
  public sample(current: MinimapSample): boolean {
    const previous = this.previous;
    this.previous = current;
    if (!previous || current.time < previous.time || current.size !== previous.size) {
      this.lastDropTime = -Infinity;
      return false;
    }
    const loss = previous.area - current.area;
    const threshold = Math.max(MIN_LOSS_SHARE, 1 / (current.size * current.size));
    if (loss < threshold) {
      return false;
    }
    const startsBurst = current.time - this.lastDropTime >= LOSS_QUIET_MILLISECONDS;
    this.lastDropTime = current.time;
    return startsBurst;
  }
}
