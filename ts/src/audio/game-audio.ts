/**
 * @file
 *
 * The game's live sound: the music playlist and the effects, through one WebAudio context. Nothing is created or
 * fetched until something is due to play, and the context is resumed on the page's first click, tap or key, which
 * the browsers' autoplay rules require; in practice that is the Play button.
 *
 * Music plays only during a run: a shuffled playlist, each track fetched when it is next. It pauses with the game,
 * fades out when the results come up and stops in the menu. Effects are fetched once, on the first one due, and each
 * plays on its own source node, so overlapping effects never cut each other off.
 *
 * Every gameplay effect is also logged on the running take's timeline, heard or not, so a download can mix it back in.
 * The practice run's own sounds are never logged, and recording mode silences them.
 */

import type {
  Game,
  GameOverResult,
  GameSounds
} from '../engine.ts';
import type {
  MusicTrack,
  SoundCue,
  SoundName
} from './catalog.ts';

import { KILL_REASON_WIN } from '../shared/constants.ts';
import { noop } from '../shared/noop.ts';
import {
  captureCue,
  MUSIC_LEVEL,
  MUSIC_TRACKS,
  musicUrl,
  PRACTICE_SOUNDS,
  SOUND_LEVELS,
  SOUND_NAMES,
  soundUrl
} from './catalog.ts';
import {
  audioRandom,
  shuffledOrder
} from './playlist.ts';

/** How long the music takes to fade out when the results come up. */
export const MUSIC_FADE_OUT_SECONDS = 1.5;
/** How long a track takes to fade in, so the music never starts on a click. */
const MUSIC_FADE_IN_SECONDS = 0.5;
/** The gain ramps aim at this rather than 0, which an exponential ramp cannot reach. */
const SILENT_GAIN = 0.0001;
/** An effect is skipped when the same one already started this recently: a burst of kills plays one sound. */
const SAME_SOUND_GAP_SECONDS = 0.05;
/** An effect still loading this long after it was due is dropped: it would no longer match what is on screen. */
const LATE_SOUND_SECONDS = 0.25;
const UNLOCK_EVENTS = ['keydown', 'pointerdown', 'touchend'] as const;

interface PlayingTrack {
  readonly gain: GainNode;
  readonly source: AudioBufferSourceNode;
}

export class GameAudio implements GameSounds {
  /**
   * Whether the effects are heard.
   *
   * @returns The setting.
   */
  public get effectsEnabled(): boolean {
    return this._effectsEnabled;
  }

  /**
   * Whether the music is heard.
   *
   * @returns The setting.
   */
  public get musicEnabled(): boolean {
    return this._musicEnabled;
  }

  private _effectsEnabled: boolean;
  private _musicEnabled: boolean;
  private context: AudioContext | null = null;
  private effects: null | Promise<ReadonlyMap<SoundName, AudioBuffer>> = null;
  private effectsGain: GainNode | null = null;
  private game: Game | null = null;
  private readonly lastStarted = new Map<SoundName, number>();
  /** Whether a run is on, so the playlist should be playing when the music is on. */
  private musicWanted = false;
  private order: number[] = [];
  private orderIndex = 0;
  private playing: null | PlayingTrack = null;
  /** Bumped on every start and stop, so a track that finishes loading late knows it is no longer wanted. */
  private playlistGeneration = 0;
  private recordingMode = false;
  private readonly trackBuffers = new Map<number, Promise<AudioBuffer | null>>();

  public constructor(musicEnabled: boolean, effectsEnabled: boolean) {
    this._musicEnabled = musicEnabled;
    this._effectsEnabled = effectsEnabled;
    const unlock = (): void => {
      this.ensureContext()?.resume().catch(noop);
      if (this.context?.state === 'running') {
        for (const type of UNLOCK_EVENTS) {
          window.removeEventListener(type, unlock, true);
        }
      }
    };
    for (const type of UNLOCK_EVENTS) {
      window.addEventListener(type, unlock, true);
    }
  }

  /**
   * Listens to a game: its player's moments play the effects.
   *
   * @param game - The live game.
   */
  public attach(game: Game): void {
    if (this.game && this.game !== game && this.game.sounds === this) {
      this.game.sounds = null;
    }
    this.game = game;
    game.sounds = this;
  }

  /** Fades the music out, for the results screen. */
  public fadeOutMusic(): void {
    this.musicWanted = false;
    this.playlistGeneration++;
    this.stopTrack(MUSIC_FADE_OUT_SECONDS);
  }

  public onCapture(increment: number): void {
    const cue = captureCue(increment);
    if (cue) {
      this.cue(cue);
    }
  }

  /** Called by the practice controls when the player removes the latest checkpoint. */
  public onCheckpointRemoved(): void {
    this.cue({ gain: 1, sound: 'checkpoint-remove' });
  }

  /** Called by the practice controls when the player sets a checkpoint. */
  public onCheckpointSet(): void {
    this.cue({ gain: 1, sound: 'checkpoint-set' });
  }

  public onGameOver(result: GameOverResult): void {
    // The results jingle is the page's, after the run: no take holds it.
    this.play({ gain: 1, sound: result.reason === KILL_REASON_WIN || result.newBest ? 'win' : 'results' });
  }

  public onKill(): void {
    this.cue({ gain: 1, sound: 'kill' });
  }

  public onPauseChange(paused: boolean): void {
    const context = this.context;
    if (!context) {
      return;
    }
    if (paused) {
      context.suspend().catch(noop);
    } else {
      context.resume().catch(noop);
    }
  }

  public onPlayerDeath(): void {
    this.cue({ gain: 1, sound: 'death' });
  }

  public onRespawn(): void {
    this.cue({ gain: 1, sound: 'respawn' });
  }

  public setEffectsEnabled(enabled: boolean): void {
    this._effectsEnabled = enabled;
  }

  public setMusicEnabled(enabled: boolean): void {
    this._musicEnabled = enabled;
    if (!enabled) {
      this.playlistGeneration++;
      this.stopTrack(0);
    } else if (this.musicWanted && !this.playing) {
      this.playNextTrack();
    }
  }

  public setRecordingMode(recordingMode: boolean): void {
    this.recordingMode = recordingMode;
  }

  /** Starts the playlist for a run, from a fresh shuffle, and fetches the effects ahead of the first one. */
  public startMusic(): void {
    const context = this.ensureContext();
    if (context && this._effectsEnabled) {
      this.loadEffects(context).catch(noop);
    }
    if (this.musicWanted) {
      return;
    }
    this.musicWanted = true;
    this.order = [];
    this.orderIndex = 0;
    if (this._musicEnabled) {
      this.playNextTrack();
    }
  }

  /** Stops the music at once, for the menu. */
  public stopMusic(): void {
    this.musicWanted = false;
    this.playlistGeneration++;
    this.stopTrack(0);
  }

  /**
   * Plays an effect of the run, and logs it on the running take unless it is a practice sound.
   *
   * @param cue - The effect.
   */
  private cue(cue: SoundCue): void {
    const isPractice = PRACTICE_SOUNDS.has(cue.sound);
    if (!isPractice) {
      this.game?.videoRecorder?.onSound(cue.sound, cue.gain);
    }
    if (isPractice && this.recordingMode) {
      return;
    }
    this.play(cue);
  }

  private ensureContext(): AudioContext | null {
    if (this.context) {
      return this.context;
    }
    if (typeof AudioContext === 'undefined') {
      return null;
    }
    const context = new AudioContext();
    const effectsGain = context.createGain();
    effectsGain.connect(context.destination);
    this.context = context;
    this.effectsGain = effectsGain;
    if (this.game?.paused === true) {
      context.suspend().catch(noop);
    }
    return context;
  }

  private loadEffects(context: AudioContext): Promise<ReadonlyMap<SoundName, AudioBuffer>> {
    this.effects ??= Promise.all(SOUND_NAMES.map(async (name: SoundName) => {
      const buffer = await fetchAudio(context, soundUrl(name));
      return [name, buffer] as const;
    })).then((entries: (readonly [SoundName, AudioBuffer | null])[]) => {
      const buffers = new Map<SoundName, AudioBuffer>();
      for (const [name, buffer] of entries) {
        if (buffer) {
          buffers.set(name, buffer);
        }
      }
      return buffers;
    });
    return this.effects;
  }

  private loadTrack(context: AudioContext, index: number): Promise<AudioBuffer | null> {
    let buffer = this.trackBuffers.get(index);
    if (!buffer) {
      const track: MusicTrack | undefined = MUSIC_TRACKS[index];
      buffer = track ? fetchAudio(context, musicUrl(track)) : Promise.resolve(null);
      this.trackBuffers.set(index, buffer);
    }
    return buffer;
  }

  private play(cue: SoundCue): void {
    if (!this._effectsEnabled) {
      return;
    }
    const context = this.ensureContext();
    if (!context) {
      return;
    }
    const startedAt = context.currentTime;
    this.loadEffects(context).then((buffers: ReadonlyMap<SoundName, AudioBuffer>) => {
      const buffer = buffers.get(cue.sound);
      const effectsGain = this.effectsGain;
      // A sound that was due long before the files loaded is dropped rather than played late.
      if (!buffer || !effectsGain || context.currentTime - startedAt > LATE_SOUND_SECONDS) {
        return;
      }
      const last = this.lastStarted.get(cue.sound);
      if (last !== undefined && context.currentTime - last < SAME_SOUND_GAP_SECONDS) {
        return;
      }
      this.lastStarted.set(cue.sound, context.currentTime);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      gain.gain.value = cue.gain * SOUND_LEVELS[cue.sound];
      source.connect(gain).connect(effectsGain);
      source.start();
    }, noop);
  }

  private playNextTrack(): void {
    const context = this.ensureContext();
    if (!context || !this.musicWanted || !this._musicEnabled) {
      return;
    }
    if (this.orderIndex >= this.order.length) {
      this.order = shuffledOrder(MUSIC_TRACKS.length, audioRandom, this.order.at(-1) ?? null);
      this.orderIndex = 0;
    }
    const index = this.order[this.orderIndex++] ?? 0;
    const generation = ++this.playlistGeneration;
    this.loadTrack(context, index).then((buffer: AudioBuffer | null) => {
      if (generation !== this.playlistGeneration || !this.musicWanted || !this._musicEnabled) {
        return;
      }
      if (!buffer) {
        // A track that failed to load is skipped; a playlist that loads nothing plays nothing.
        if (MUSIC_TRACKS.some((_: MusicTrack, other: number) => other !== index && !this.trackBuffers.has(other))) {
          this.playNextTrack();
        }
        return;
      }
      this.stopTrack(0);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      gain.gain.setValueAtTime(SILENT_GAIN, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(MUSIC_LEVEL, context.currentTime + MUSIC_FADE_IN_SECONDS);
      source.connect(gain).connect(context.destination);
      const playing: PlayingTrack = { gain, source };
      source.onended = (): void => {
        if (this.playing === playing) {
          this.playing = null;
          this.playNextTrack();
        }
      };
      this.playing = playing;
      source.start();
      // A decoded track holds about 25 MB, so only the one playing is kept; the next is fetched when it is due.
      for (const other of [...this.trackBuffers.keys()]) {
        if (other !== index) {
          this.trackBuffers.delete(other);
        }
      }
    }, noop);
  }

  private stopTrack(fadeSeconds: number): void {
    const playing = this.playing;
    const context = this.context;
    this.playing = null;
    if (!playing || !context) {
      return;
    }
    const { gain, source } = playing;
    if (fadeSeconds <= 0 || context.state !== 'running') {
      source.stop();
      return;
    }
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(SILENT_GAIN, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, now + fadeSeconds);
    source.stop(now + fadeSeconds);
  }
}

/**
 * Fetches and decodes an audio file.
 *
 * @param context - Any audio context: a decoded buffer plays in every one.
 * @param url - The file.
 * @returns The buffer, or `null` when it could not be fetched or decoded.
 */
export async function fetchAudio(context: BaseAudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await context.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
}
