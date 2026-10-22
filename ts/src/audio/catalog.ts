/**
 * @file
 *
 * The game's music and sound effects: which files there are, how loud each plays, and which effect a capture gets.
 * Every file is CC0, from Juhani Junkala's packs on OpenGameArt; `assets/audio/CREDITS.md` names each one's source.
 */

/** The effects, by the file name under `assets/audio/sounds/`. */
export const SOUND_NAMES = [
  'capture-large',
  'capture-medium',
  'capture-small',
  'checkpoint-remove',
  'checkpoint-set',
  'death',
  'kill',
  'respawn',
  'results',
  'win'
] as const;
/** An effect due now, at a volume. */
export interface SoundCue {
  /** 0 to 1, on top of the effect's own level in {@link SOUND_LEVELS}. */
  readonly gain: number;
  readonly sound: SoundName;
}

export type SoundName = typeof SOUND_NAMES[number];

/**
 * The practice run's own sounds. They are additions over a real run, so recording mode silences them, and a take never
 * holds them: its cut hides the failed attempt, and a respawn chime would mark the seam.
 */
export const PRACTICE_SOUNDS: ReadonlySet<SoundName> = new Set<SoundName>(['checkpoint-remove', 'checkpoint-set', 'respawn']);

/* eslint-disable no-magic-numbers -- the effects' levels and the tracks' lengths are data tables. */
/** Each effect's level, so the quiet UI clicks stay under the gameplay sounds. The pack's files all peak at -6 dB. */
export const SOUND_LEVELS: Readonly<Record<SoundName, number>> = {
  'capture-large': 0.8,
  'capture-medium': 0.7,
  'capture-small': 0.6,
  'checkpoint-remove': 0.35,
  'checkpoint-set': 0.4,
  'death': 0.8,
  'kill': 0.75,
  'respawn': 0.5,
  'results': 0.6,
  'win': 0.8
};

export interface MusicTrack {
  readonly author: string;
  /** Its length, so a download can lay the music bed without decoding every track first. */
  readonly durationSeconds: number;
  /** The file name under `assets/audio/music/`. */
  readonly file: string;
  readonly title: string;
}

/** The gameplay playlist, played shuffled. Each was normalized to -16 LUFS, so none jumps out of the mix. */
export const MUSIC_TRACKS: readonly MusicTrack[] = [
  { author: 'Juhani Junkala', durationSeconds: 41.14, file: 'stage-1.mp3', title: 'Stage 1' },
  { author: 'Juhani Junkala', durationSeconds: 56.1, file: 'stage-2.mp3', title: 'Stage 2' },
  { author: 'Juhani Junkala', durationSeconds: 74.25, file: 'level-1.mp3', title: 'Level 1' },
  { author: 'Juhani Junkala', durationSeconds: 72.8, file: 'level-2.mp3', title: 'Level 2' },
  { author: 'Juhani Junkala', durationSeconds: 81.9, file: 'level-3.mp3', title: 'Level 3' }
];
/* eslint-enable no-magic-numbers -- end of the data tables. */

/** The music's level under the effects: a background, never louder than a capture. */
export const MUSIC_LEVEL = 0.35;

const AUDIO_ROOT = 'assets/audio/';

/**
 * A capture below this share of the arena makes no sound. Sliding along the base's edge re-enters it many times a second,
 * each time taking a sliver under a millionth of the arena; the smallest real loop measured took 0.0018.
 */
const MIN_AUDIBLE_CAPTURE = 0.0001;
/** A capture below this share of the arena is a small one. */
const SMALL_CAPTURE = 0.005;
/** Below this, a medium one; at or above it, a large one. */
const LARGE_CAPTURE = 0.02;
/** The capture at which the effect reaches its full volume. */
const FULL_VOLUME_CAPTURE = 0.05;
const MIN_CAPTURE_GAIN = 0.55;

/**
 * The effect a capture gets: a single coin for a small one, a double for a medium one, a cluster for a large one, and
 * louder the more was taken.
 *
 * @param increment - The ground taken, as a share of the arena.
 * @returns The cue, or `null` for a sliver too small to hear.
 */
export function captureCue(increment: number): null | SoundCue {
  if (increment < MIN_AUDIBLE_CAPTURE) {
    return null;
  }
  let sound: SoundName = 'capture-large';
  if (increment < SMALL_CAPTURE) {
    sound = 'capture-small';
  } else if (increment < LARGE_CAPTURE) {
    sound = 'capture-medium';
  }
  const scale = Math.sqrt(Math.max(0, increment) / FULL_VOLUME_CAPTURE);
  return { gain: Math.min(1, MIN_CAPTURE_GAIN + (1 - MIN_CAPTURE_GAIN) * scale), sound };
}

export function isSoundName(value: string): value is SoundName {
  return SOUND_NAMES.some((name: SoundName) => name === value);
}

export function musicUrl(track: MusicTrack): string {
  return `${AUDIO_ROOT}music/${track.file}`;
}

export function soundUrl(sound: SoundName): string {
  return `${AUDIO_ROOT}sounds/${sound}.mp3`;
}
