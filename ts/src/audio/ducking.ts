/**
 * @file
 *
 * Ducking: the music drops while a warning loop plays or an alert sounds, so the cue is heard over it. The music is
 * bass-heavy (its loudest passages peak at 63 and 125 Hz), and the open-ground loop used to sit right there, 1.8 dB under
 * the music at the start of a trail, where players did not hear it at all. The loop now sits higher, and the music steps
 * down under it.
 *
 * The live game drives a {@link MusicDucker} from its frames and cues, and a download lays the same shape on its music
 * bed from the take's log (`video/music-duck.ts`), so both sound alike.
 */

import type { SoundName } from './catalog.ts';
import type { LoopParam } from './exposure-loops.ts';

/** The music's gain while ducked, on top of its own level: about -6 dB. */
export const MUSIC_DUCK_GAIN = 0.5;
/** How long the music takes to step down: the loops' own crossfade, so the music makes room as the loop comes in. */
export const DUCK_ATTACK_SECONDS = 0.15;
/** How long the music takes to come back once the cue is over, slow enough not to pump. */
export const DUCK_RELEASE_SECONDS = 0.6;
/** The one-shot effects that duck the music for as long as they play: the alerts the player must not miss. */
export const DUCKING_SOUNDS: ReadonlySet<SoundName> = new Set<SoundName>(['kill', 'territory-loss']);

/**
 * The live music bus's ducking. It is told when the warning loops start and stop and when a ducking alert plays, and
 * schedules the bus gain from those: down over {@link DUCK_ATTACK_SECONDS}, back over {@link DUCK_RELEASE_SECONDS}
 * once neither a loop nor an alert is playing.
 */
export class MusicDucker {
  private alertUntil = -Infinity;
  private loops = false;
  private readonly param: LoopParam;

  public constructor(param: LoopParam) {
    this.param = param;
  }

  /**
   * Ducks the music while an alert plays.
   *
   * @param now - The context's time.
   * @param duration - How long the alert lasts, in seconds.
   */
  public alert(now: number, duration: number): void {
    const until = now + duration;
    if (until <= this.alertUntil) {
      return;
    }
    this.alertUntil = until;
    if (!this.loops) {
      this.schedule(now);
    }
  }

  /**
   * Tells the ducker whether a warning loop is audible. Nothing is scheduled when that has not changed.
   *
   * @param now - The context's time.
   * @param audible - Whether either loop is above silence.
   */
  public setLoops(now: number, audible: boolean): void {
    if (audible === this.loops) {
      return;
    }
    this.loops = audible;
    this.schedule(now);
  }

  private schedule(now: number): void {
    const param = this.param;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    if (this.loops) {
      param.linearRampToValueAtTime(MUSIC_DUCK_GAIN, now + DUCK_ATTACK_SECONDS);
      return;
    }
    if (this.alertUntil > now) {
      const ducked = now + DUCK_ATTACK_SECONDS;
      param.linearRampToValueAtTime(MUSIC_DUCK_GAIN, ducked);
      const releaseAt = Math.max(ducked, this.alertUntil);
      param.setValueAtTime(MUSIC_DUCK_GAIN, releaseAt);
      param.linearRampToValueAtTime(1, releaseAt + DUCK_RELEASE_SECONDS);
      return;
    }
    param.linearRampToValueAtTime(1, now + DUCK_RELEASE_SECONDS);
  }
}
