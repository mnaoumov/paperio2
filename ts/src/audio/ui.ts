/**
 * @file
 *
 * The page side of the sound: the music and effects switches, their M and N keys, remembered in `localStorage`, and
 * the music following the route: on during a run, faded out on the results, off in the menu.
 */

import type { VNode } from 'preact';

import { createElement } from 'preact';
import {
  useEffect,
  useRef,
  useState
} from 'preact/hooks';

import type { GameApi } from '../game-api.ts';

import { GameAudio } from './game-audio.ts';

/** `KeyboardEvent.code` of the music switch. The engine steers on arrows and W/A/S/D; the app uses Z X K P J V Esc. */
export const MUSIC_KEY = 'KeyM';
/** `KeyboardEvent.code` of the sound-effects switch. */
export const EFFECTS_KEY = 'KeyN';
/** Where the music switch is remembered, `on` or `off`; it is on unless switched off. */
export const MUSIC_STORAGE_KEY = 'paperio2.music';
/** Where the effects switch is remembered, `on` or `off`; it is on unless switched off. */
export const EFFECTS_STORAGE_KEY = 'paperio2.effects';
const HUD_Z_INDEX = 1001;

const HUD_BUTTON_STYLE = {
  background: 'rgba(0, 0, 0, 0.35)',
  border: '2px solid rgba(255, 255, 255, 0.8)',
  borderRadius: '8px',
  color: '#ffffff',
  cursor: 'pointer',
  fontFamily: '"PT Sans Caption", sans-serif',
  fontSize: '14px',
  lineHeight: '1',
  padding: '6px 8px'
};

export interface AudioControlProps {
  /** Whether a run is on screen; the buttons show only then. */
  readonly inGame: boolean;
  readonly state: GameAudioState;
}

export interface AudioMenuProps {
  readonly state: GameAudioState;
}

export interface GameAudioState {
  readonly audio: GameAudio;
  readonly effectsEnabled: boolean;
  readonly musicEnabled: boolean;
  readonly toggleEffects: () => void;
  readonly toggleMusic: () => void;
}

/**
 * The music and effects buttons during a run, left of the pause button. Like the pause button, neither takes focus.
 *
 * @param root0 - The props.
 * @param root0.inGame - Whether a run is on screen.
 * @param root0.state - The switches.
 * @returns The buttons, or nothing outside a run.
 */
export function AudioControl({ inGame, state }: AudioControlProps): null | VNode<unknown> {
  if (!inGame) {
    return null;
  }
  const { effectsEnabled, musicEnabled, toggleEffects, toggleMusic } = state;
  return createElement(
    'div',
    {
      id: 'audio-hud',
      onMouseDown: keepFocusOnBody,
      onPointerDown: keepFocusOnBody,
      style: {
        display: 'flex',
        gap: '6px',
        position: 'fixed',
        right: 'calc(50% + 32px)',
        top: '18px',
        userSelect: 'none',
        zIndex: HUD_Z_INDEX
      }
    },
    hudButton('audio-music', musicEnabled ? '♪' : '♪✕', `Music ${musicEnabled ? 'on' : 'off'} (M)`, musicEnabled, toggleMusic),
    hudButton('audio-effects', effectsEnabled ? '🔊' : '🔇', `Sound effects ${effectsEnabled ? 'on' : 'off'} (N)`, effectsEnabled, toggleEffects)
  );
}

/**
 * The menu's Music and Sounds switches.
 *
 * @param root0 - The props.
 * @param root0.state - The switches.
 * @returns The buttons.
 */
export function AudioMenu({ state }: AudioMenuProps): VNode<unknown> {
  const { effectsEnabled, musicEnabled, toggleEffects, toggleMusic } = state;
  return createElement(
    'div',
    {
      id: 'audio-menu',
      style: { marginTop: '8px' }
    },
    createElement('button', {
      'aria-pressed': musicEnabled,
      'class': musicEnabled ? 'green' : 'orange',
      'id': 'music-toggle',
      'onClick': toggleMusic,
      'title': 'Music during a run. M turns it on and off.',
      'type': 'button'
    }, `Music: ${musicEnabled ? 'on' : 'off'} (M)`),
    ' ',
    createElement('button', {
      'aria-pressed': effectsEnabled,
      'class': effectsEnabled ? 'green' : 'orange',
      'id': 'effects-toggle',
      'onClick': toggleEffects,
      'title': 'Sound effects. N turns them on and off.',
      'type': 'button'
    }, `Sounds: ${effectsEnabled ? 'on' : 'off'} (N)`)
  );
}

export function readSwitch(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'off';
  } catch {
    return true;
  }
}

/**
 * The sound for the App: the switches, the M and N keys, the game hooked up once it exists, and the music following the
 * route.
 *
 * @param api - The game API.
 * @param route - The current route.
 * @returns The switches and the live audio.
 */
export function useGameAudio(api: GameApi | null, route: string): GameAudioState {
  const [musicEnabled, setMusicEnabled] = useState(() => readSwitch(MUSIC_STORAGE_KEY));
  const [effectsEnabled, setEffectsEnabled] = useState(() => readSwitch(EFFECTS_STORAGE_KEY));
  const [audio] = useState(() => new GameAudio(musicEnabled, effectsEnabled));
  const togglesRef = useRef({ toggleEffects, toggleMusic });

  function toggleMusic(): void {
    const enabled = !audio.musicEnabled;
    writeSwitch(MUSIC_STORAGE_KEY, enabled);
    audio.setMusicEnabled(enabled);
    setMusicEnabled(enabled);
  }

  function toggleEffects(): void {
    const enabled = !audio.effectsEnabled;
    writeSwitch(EFFECTS_STORAGE_KEY, enabled);
    audio.setEffectsEnabled(enabled);
    setEffectsEnabled(enabled);
  }

  togglesRef.current = { toggleEffects, toggleMusic };

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.repeat || event.target instanceof HTMLInputElement) {
        return;
      }
      if (event.code === MUSIC_KEY) {
        togglesRef.current.toggleMusic();
      } else if (event.code === EFFECTS_KEY) {
        togglesRef.current.toggleEffects();
      } else {
        return;
      }
      event.preventDefault();
    }
    window.addEventListener('keydown', handleKeyDown, false);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown, false);
    };
  }, []);

  useEffect(() => {
    if (route === 'game') {
      // The game is created when the canvas mounts, after the App's first render, so it is hooked up on a run.
      if (api) {
        audio.attach(api.game);
      }
      audio.startMusic();
    } else if (route === 'results') {
      audio.fadeOutMusic();
    } else {
      audio.stopMusic();
    }
  }, [route]);

  return { audio, effectsEnabled, musicEnabled, toggleEffects, toggleMusic };
}

export function writeSwitch(key: string, enabled: boolean): void {
  try {
    localStorage.setItem(key, enabled ? 'on' : 'off');
  } catch {
    // A blocked storage only means the switch is not remembered.
  }
}

function hudButton(id: string, label: string, title: string, pressed: boolean, action: () => void): VNode<unknown> {
  return createElement('button', {
    'aria-label': title,
    'aria-pressed': pressed,
    id,
    'onClick': (event: MouseEvent) => {
      if (event.currentTarget instanceof HTMLElement) {
        event.currentTarget.blur();
      }
      action();
    },
    'onMouseDown': keepFocusOnBody,
    'onPointerDown': keepFocusOnBody,
    'style': { ...HUD_BUTTON_STYLE, opacity: pressed ? '1' : '0.6' },
    'tabIndex': -1,
    title,
    'type': 'button'
  }, label);
}

function keepFocusOnBody(event: Event): void {
  event.preventDefault();
}
