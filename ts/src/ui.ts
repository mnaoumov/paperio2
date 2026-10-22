/* eslint-disable perfectionist/sort-modules -- engine declarations are kept in the original bundle's dependency order: an alphabetical module sort would reorder `extends` subclasses before their base classes (breaking class init at runtime) and split `no-magic-numbers` disable blocks. Per-line disables cannot be kept stable since perfectionist 5.12 pins each disabled node and re-sorts the rest around it. */
import type { VNode } from 'preact';

import {
  assertNonNullable,
  ensureNonNullable
} from '@mnaoumov/typescript-lib/type-guards';
import {
  createContext,
  createElement,
  Fragment
} from 'preact';
import {
  useContext,
  useEffect,
  useRef,
  useState
} from 'preact/hooks';

import type { GameAudioState } from './audio/ui.ts';
import type { AutopilotState } from './autopilot/ui.ts';
import type { EnemyMenuState } from './enemy-menu.ts';
import type {
  Config,
  Game,
  GameResults
} from './engine.ts';
import type { GameApi } from './game-api.ts';
import type { GhostRaceState } from './ghost/ui.ts';
import type { Language } from './i18n.ts';
import type { Checkpoint } from './practice.ts';
import type { SaveSummary } from './save-format.ts';
import type { SkinSource } from './skins/skin.ts';
import type { GameSnapshot } from './snapshot.ts';
import type { VideoRecordingState } from './video/ui.ts';

import {
  AudioControl,
  AudioMenu,
  useGameAudio
} from './audio/ui.ts';
import {
  AutopilotHud,
  AutopilotMenu,
  useAutopilot
} from './autopilot/ui.ts';
import {
  EnemyMenu,
  useEnemySettings
} from './enemy-menu.ts';
import {
  GhostHud,
  RaceMenu,
  useGhostRace
} from './ghost/ui.ts';
import {
  findDefaultLanguage,
  list3
} from './i18n.ts';
import { Practice } from './practice.ts';
import {
  applyRecordingClass,
  CutMarker,
  formatRewindHint,
  readRecordingMode,
  RECORDING_KEY,
  writeRecordingMode
} from './recording.ts';
import {
  deleteSave,
  listSaves,
  readSave,
  writeSave
} from './save-format.ts';
import { DAYS_IN_YEAR } from './scoring.ts';
import { noop } from './shared/noop.ts';
import {
  canCaptureSnapshot,
  captureSnapshot
} from './snapshot.ts';
import {
  RecordControl,
  RecordingsPanel,
  useVideoRecording
} from './video/ui.ts';

export type Dispatch<T> = (action: ((prevState: T) => T) | T) => void;

export interface Ref<T> {
  current: T;
}

export const LanguageContext = createContext<Language | undefined>(undefined);
export const TIP_ROTATION_INTERVAL_MS = 3000;
export const PERCENT_DECIMAL_PLACES = 2;
export const PLAYTIME_ISO_START_INDEX = 14;
export const PLAYTIME_ISO_END_INDEX = -5;
export interface TipsProps {
  messages: string[];
}
export function Tips({
  messages
}: TipsProps): VNode<unknown> {
  const [tipIndex, setTipIndex] = useState(0);
  useEffect(() => {
    const intervalId = setInterval(() => {
      setTipIndex((previousIndex: number) => (previousIndex + 1) % messages.length);
    }, TIP_ROTATION_INTERVAL_MS);
    return (): void => {
      clearInterval(intervalId);
    };
  }, []);
  return createElement(
    'div',
    {
      class: 'tips'
    },
    createElement('div', {
      class: 'tip',
      key: tipIndex
    }, messages[tipIndex])
  );
}
export interface ConfigFormProps {
  apply: (event: Event) => void;
  config: Config | null | undefined;
}
export function ConfigForm({
  apply,
  config
}: ConfigFormProps): null | VNode<unknown> {
  if (!config) {
    return null;
  }
  return createElement(
    'form',
    {
      class: 'config',
      onSubmit: apply
    },
    Object.entries(config).map(([configKey, configValue]) =>
      createElement(
        'label',
        {
          style: 'color: white;'
        },
        configKey,
        '\xA0',
        createElement('input', {
          autocomplete: 'off',
          id: configKey,
          maxlength: '10',
          name: configKey,
          type: 'text',
          value: String(configValue)
        })
      )
    ),
    createElement('button', {
      class: 'yellow',
      id: 'apply',
      name: 'apply'
    }, 'Применить')
  );
}
export interface ConfigScreenProps {
  api: GameApi | null;
  setPreparing: Dispatch<boolean>;
  setState: Dispatch<string>;
  view: Ref<HTMLCanvasElement | null>;
}
export function ConfigScreen({
  api,
  setPreparing,
  setState,
  view
}: ConfigScreenProps): VNode<unknown> {
  const config = api?.game.config;
  function applyConfig(event: Event): void {
    event.preventDefault();
    assertNonNullable(api);
    assertNonNullable(config);
    Object.keys(config).forEach((configKey: string) => {
      const element = document.getElementById(configKey);
      if (element) {
        const parsedValue = parseFloat(element.value);
        config[configKey] = Number.isNaN(parsedValue) ? element.value : parsedValue;
      }
    });
    api.game.stopped = true;
    api.create(ensureNonNullable(view.current));
    setPreparing(true);
    api.prepare(() => {
      setPreparing(false);
    });
    setState('menu');
  }
  return createElement(
    'div',
    {
      class: 'uibox'
    },
    createElement(
      'div',
      {
        class: 'logo'
      },
      createElement('img', {
        src: 'assets/images/logo.png'
      })
    ),
    createElement(ConfigForm, {
      apply: applyConfig,
      config
    })
  );
}
export interface LanguageFooterProps {
  setLanguage: Dispatch<Language | undefined>;
}
export function LanguageFooter({
  setLanguage
}: LanguageFooterProps): VNode<unknown> {
  const currentLanguage = useContext(LanguageContext);
  const languageItems = list3.map((language: Language, index: number) =>
    createElement('li', {
      class: language === currentLanguage ? 'active' : '',
      onClick: () => {
        setLanguage(list3[index]);
      }
    }, language.name.toUpperCase())
  );
  return createElement(
    'div',
    {
      id: 'footer'
    },
    createElement('ul', {
      id: 'lng'
    }, languageItems)
  );
}
export interface MenuScreenProps {
  api: GameApi | null;
  audio: GameAudioState;
  autopilot: AutopilotState;
  enemies: EnemyMenuState;
  ghost: GhostRaceState;
  loadSave: (id: string) => void;
  menuMessage: string;
  nickName: string;
  playable: boolean;
  practiceMode: boolean;
  preparing: boolean;
  provider?: undefined;
  recordingMode: boolean;
  removeSave: (id: string) => void;
  route: Dispatch<string>;
  saves: readonly SaveSummary[];
  setLanguage: Dispatch<Language | undefined>;
  setNickName: Dispatch<string>;
  setPracticeMode: (practiceMode: boolean) => void;
  setRecordingMode: (recordingMode: boolean) => void;
  setState: Dispatch<string>;
  skin: string;
  skins: SkinSource[];
  start: () => void;
  video: VideoRecordingState;
}
export function MenuScreen({
  api,
  audio,
  autopilot,
  enemies,
  ghost,
  loadSave,
  menuMessage,
  nickName,
  practiceMode,
  recordingMode,
  removeSave,
  route,
  saves,
  setNickName,
  setPracticeMode,
  setRecordingMode,
  skin,
  start,
  video
}: MenuScreenProps): VNode<unknown> {
  const {
    lng
  } = ensureNonNullable(useContext(LanguageContext));
  const isSupported = !!api;
  function handleNickNameInput(event: Event): void {
    setNickName((event.target as HTMLInputElement).value);
  }
  const canPlay = isSupported;
  function handlePlay(event: Event): void {
    event.preventDefault();
    if (canPlay) {
      start();
    }
  }
  useEffect(() => {
    if (window.ads?.showAds) {
      window.ads.showAds();
    }
  }, []);
  return createElement(
    Fragment,
    null,
    createElement('div', {
      id: 'left_side'
    }),
    createElement(
      'div',
      {
        class: 'uibox'
      },
      createElement(
        'div',
        {
          class: 'logo'
        },
        createElement('img', {
          src: 'assets/images/logo.png'
        })
      ),
      createElement(Tips, {
        messages: lng.messages
      }),
      createElement(
        'div',
        {
          class: 'play'
        },
        createElement('input', {
          autocomplete: 'off',
          id: 'nick',
          maxlength: '12',
          name: 'nick',
          oninput: handleNickNameInput,
          placeholder: lng.placeholderText,
          type: 'text',
          value: nickName
        }),
        createElement('button', {
          class: `yellow${canPlay ? '' : ' disabled'}`,
          id: 'play',
          name: 'play',
          onClick: handlePlay
        }, lng.btnPlay),
        createElement(
          'button',
          {
            class: 'orange noPadding',
            id: 'skins',
            name: 'skins',
            onClick: () => {
              route('skins');
            }
          },
          createElement('img', {
            height: '30',
            src: `assets/skins/select/${(skin || 'noskin').toLowerCase().replace(/\s+/g, '')}.png`,
            width: '30'
          })
        )
      ),
      !isSupported && createElement('p', {
        class: 'notsupported'
      }, lng.nosupport),
      isSupported && !recordingMode && createElement(
        'div',
        {
          style: PRACTICE_PANEL_STYLE
        },
        createElement(AudioMenu, {
          state: audio
        })
      ),
      isSupported && !recordingMode && createElement(
        'div',
        {
          style: PRACTICE_PANEL_STYLE
        },
        createElement(AutopilotMenu, {
          state: autopilot
        }),
        createElement(EnemyMenu, {
          state: enemies
        })
      ),
      isSupported && !recordingMode && createElement(
        'div',
        {
          style: PRACTICE_PANEL_STYLE
        },
        createElement(RaceMenu, {
          state: ghost
        })
      ),
      isSupported && !recordingMode && createElement(PracticeMenu, {
        loadSave,
        menuMessage,
        practiceMode,
        removeSave,
        saves,
        setPracticeMode,
        setRecordingMode
      }),
      isSupported && !recordingMode && createElement(
        'div',
        {
          style: PRACTICE_PANEL_STYLE
        },
        createElement(RecordingsPanel, {
          state: video
        })
      )
    ),
    createElement('div', {
      id: 'right_side'
    })
  );
}
/** Where the menu's Practice toggle is remembered, `on` or `off`. */
export const PRACTICE_MODE_STORAGE_KEY = 'paperio2.practice';
const PRACTICE_PANEL_STYLE = {
  color: '#ffffff',
  fontFamily: '"PT Sans Caption", sans-serif',
  fontSize: '15px',
  margin: '12px auto 0',
  maxWidth: '420px',
  textAlign: 'center'
};
const SAVE_ROW_STYLE = {
  alignItems: 'center',
  background: 'rgba(0, 0, 0, 0.25)',
  borderRadius: '6px',
  display: 'flex',
  gap: '8px',
  justifyContent: 'space-between',
  margin: '4px 0',
  padding: '4px 8px'
};
const SMALL_BUTTON_STYLE = {
  fontSize: '14px',
  margin: '0',
  padding: '4px 10px'
};
export function readPracticeMode(): boolean {
  try {
    return localStorage.getItem(PRACTICE_MODE_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}
export function writePracticeMode(practiceMode: boolean): void {
  try {
    localStorage.setItem(PRACTICE_MODE_STORAGE_KEY, practiceMode ? 'on' : 'off');
  } catch {
    // A blocked storage only means the toggle is not remembered.
  }
}
export function formatPlaytime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / MILLISECONDS_PER_SECOND));
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `${String(minutes)}:${String(seconds).padStart(SECONDS_DIGITS, '0')}`;
}
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_DIGITS = 2;
const SECONDS_PER_MINUTE = 60;
export interface PracticeMenuProps {
  loadSave: (id: string) => void;
  menuMessage: string;
  practiceMode: boolean;
  removeSave: (id: string) => void;
  saves: readonly SaveSummary[];
  setPracticeMode: (practiceMode: boolean) => void;
  setRecordingMode: (recordingMode: boolean) => void;
}
/**
 * The menu's Practice toggle, its Recording toggle and its saved games. Practice mode turns on checkpoints for the
 * next run; a saved game always loads into a practice run. Recording mode hides this whole panel, so the R key is
 * what turns it back off.
 *
 * @param root0 - The props.
 * @param root0.loadSave - Starts a practice run from a save.
 * @param root0.menuMessage - A message to show, such as why a save did not load.
 * @param root0.practiceMode - Whether the next run is practice.
 * @param root0.removeSave - Deletes a save.
 * @param root0.saves - The saves, newest first.
 * @param root0.setPracticeMode - Turns practice mode on or off.
 * @param root0.setRecordingMode - Turns recording mode on or off.
 * @returns The panel.
 */
export function PracticeMenu({
  loadSave,
  menuMessage,
  practiceMode,
  removeSave,
  saves,
  setPracticeMode,
  setRecordingMode
}: PracticeMenuProps): VNode<unknown> {
  return createElement(
    'div',
    {
      id: 'practice-menu',
      style: PRACTICE_PANEL_STYLE
    },
    createElement('button', {
      'aria-pressed': practiceMode,
      'class': practiceMode ? 'green' : 'orange',
      'id': 'practice-toggle',
      'onClick': () => {
        setPracticeMode(!practiceMode);
      },
      'title': 'Checkpoints every 10 seconds, respawn at the latest on death. Practice runs do not count.',
      'type': 'button'
    }, `Practice mode: ${practiceMode ? 'on' : 'off'}`),
    ' ',
    createElement('button', {
      'aria-pressed': false,
      'class': 'orange',
      'id': 'recording-toggle',
      'onClick': () => {
        setRecordingMode(true);
      },
      'title': 'Hide everything this copy adds, and mark the frames to cut. R turns it on and off.',
      'type': 'button'
    }, 'Recording mode (R)'),
    menuMessage && createElement('p', {
      id: 'practice-message'
    }, menuMessage),
    saves.length > 0 && createElement(
      'div',
      {
        id: 'saved-games'
      },
      createElement('p', {
        style: {
          margin: '8px 0 4px'
        }
      }, 'Saved games'),
      saves.map((save: SaveSummary) =>
        createElement(
          'div',
          {
            key: save.id,
            style: SAVE_ROW_STYLE
          },
          createElement('span', {
            style: {
              overflow: 'hidden',
              textAlign: 'left',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            },
            title: save.name
          }, `${save.name} (${formatPlaytime(save.playtime)})`),
          createElement(
            'span',
            {
              style: {
                display: 'flex',
                flexShrink: '0',
                gap: '4px'
              }
            },
            createElement('button', {
              class: 'yellow',
              onClick: () => {
                loadSave(save.id);
              },
              style: SMALL_BUTTON_STYLE,
              type: 'button'
            }, 'Load'),
            createElement('button', {
              'aria-label': `Delete ${save.name}`,
              'class': 'orange',
              'onClick': () => {
                removeSave(save.id);
              },
              'style': SMALL_BUTTON_STYLE,
              'type': 'button'
            }, '✕')
          )
        )
      )
    )
  );
}
export interface GameScreenProps {
  api: GameApi | null;
  bestScore: number;
  lastPercent?: number;
  /** The cut marker while recording mode is on, else `null`. */
  marker: CutMarker | null;
  nickName: string;
  /** A saved game to start from, which makes the run practice. */
  pendingLoad: GameSnapshot | null;
  practiceMode: boolean;
  route: Dispatch<string>;
  setBestScore: Dispatch<number>;
  setPendingLoad: Dispatch<GameSnapshot | null>;
  setPractice: Dispatch<null | Practice>;
  setPreparing: Dispatch<boolean>;
  setResults: Dispatch<GameResults | null>;
  skin: string;
}
export function GameScreen({
  api,
  bestScore,
  lastPercent,
  marker,
  nickName,
  pendingLoad,
  practiceMode,
  route,
  setBestScore,
  setPendingLoad,
  setPractice,
  setPreparing,
  setResults,
  skin
}: GameScreenProps): null {
  useEffect(() => {
    function handleGameOver(results: GameResults): void {
      ensureNonNullable(api).game.practice = null;
      setPractice(null);
      if (marker && marker.state !== 'off') {
        // A practice run that ran out of checkpoints: the results are the original's, so they are clean again.
        marker.resumeThen(noop);
      }
      if (results.newBest) {
        setBestScore(results.score);
      }
      setResults(results);
      route('results');
    }
    if (window.ads?.hideAds) {
      window.ads.hideAds();
    }
    ensureNonNullable(api).game.language = ensureNonNullable(useContext(LanguageContext)).lng;
    let skin2 = skin;
    if (skin2 === 'default' || skin2 === 'No skin') {
      skin2 = '';
    }
    const startedApi = ensureNonNullable(api);
    startedApi.start(nickName, skin2, bestScore, handleGameOver, lastPercent, pendingLoad !== null || practiceMode);
    const { game } = startedApi;
    game.practice = null;
    if (pendingLoad || practiceMode) {
      if (pendingLoad) {
        startedApi.restoreSnapshot(pendingLoad);
        setPendingLoad(null);
        if (marker && game.pause()) {
          // A loaded game starts mid-run, so it is a cut: everything before the green frames goes.
          marker.resumeThen(() => {
            game.resume();
          });
        }
      }
      const practice = new Practice(game);
      game.practice = practice;
      practice.begin();
      setPractice(practice);
    } else {
      setPractice(null);
    }
    const {
      dataLayer
    } = window;
    if (dataLayer) {
      dataLayer.push({
        event: 'levelStart',
        productKey: 'paper2IO',
        publisher: 'CONNECT2MEDIA'
      });
    }
    setPreparing(false);
  }, []);
  return null;
}
/** `KeyboardEvent.code` values that toggle the pause: layout-independent, so P works on a Russian layout too. */
export const PAUSE_KEY_CODES: readonly string[] = ['Escape', 'KeyP'];
export const PAUSE_Z_INDEX = 1000;
export interface PauseControlProps {
  api: GameApi | null;
  /** The cut marker while recording mode is on, else `null`. */
  marker: CutMarker | null;
  /** Called after a save is written, so the menu lists it. */
  onSaved: () => void;
  /** The practice run, whose Save and End buttons the paused overlay holds, or `null` outside practice mode. */
  practice: null | Practice;
}
function keepFocusOnBody(event: Event): void {
  event.preventDefault();
}
/**
 * The pause button, the paused overlay and the Esc / P toggle. None of it may take keyboard focus: the engine
 * reads keys only when `event.target === document.body`, so a focused button would silently stop keyboard
 * steering, the same constraint the joystick toggle in `index.html` follows.
 *
 * In a practice run the paused overlay also holds the run's Save (K) and End buttons, which are kept off the in-game
 * panel.
 *
 * In recording mode none of it is shown: a pause is the cut marker's red span, and a resume shows its green span with
 * the game still paused, then plays on.
 *
 * @param root0 - The props.
 * @param root0.api - The game API whose live game is paused.
 * @param root0.marker - The cut marker while recording mode is on.
 * @param root0.onSaved - Told when a save has been written.
 * @param root0.practice - The practice run, or `null` outside practice mode.
 * @returns The button, plus the overlay while paused.
 */
export function PauseControl({
  api,
  marker,
  onSaved,
  practice
}: PauseControlProps): VNode<unknown> {
  const game = api?.game;
  const [paused, setPaused] = useState(game?.paused ?? false);
  const [practiceMessage, setPracticeMessage] = useState('');
  useEffect(() => {
    if (!game) {
      return undefined;
    }
    const currentGame: Game = game;
    function handlePauseChange(isPaused: boolean): void {
      setPaused(isPaused);
      setPracticeMessage('');
      if (!marker) {
        return;
      }
      if (isPaused) {
        marker.cut();
      } else if (marker.state !== 'off' && !isRespawnPending(currentGame)) {
        marker.clear();
      }
    }
    currentGame.onPauseChange = handlePauseChange;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.repeat || !PAUSE_KEY_CODES.includes(event.code)) {
        return;
      }
      event.preventDefault();
      togglePause(currentGame, marker);
    }
    window.addEventListener('keydown', handleKeyDown, false);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown, false);
      if (currentGame.onPauseChange === handlePauseChange) {
        currentGame.onPauseChange = null;
      }
    };
  }, [game, marker]);
  function handleClick(event: MouseEvent): void {
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.blur();
    }
    if (game) {
      togglePause(game, marker);
    }
  }
  if (marker) {
    return createElement(Fragment, null);
  }
  function overlayButton(id: string, label: string, title: string, action: () => void): VNode<unknown> {
    return createElement('button', {
      id,
      onClick: (event: MouseEvent) => {
        // The overlay itself resumes on a click.
        event.stopPropagation();
        if (event.currentTarget instanceof HTMLElement) {
          event.currentTarget.blur();
        }
        action();
      },
      onMouseDown: keepFocusOnBody,
      onPointerDown: keepFocusOnBody,
      style: { ...PRACTICE_HUD_BUTTON_STYLE, fontSize: '16px', padding: '8px 14px' },
      tabIndex: -1,
      title,
      type: 'button'
    }, label);
  }
  const practiceInPlay = practice !== null && !practice.ended;
  return createElement(
    Fragment,
    null,
    paused && createElement(
      'div',
      {
        id: 'pause-overlay',
        onClick: handleClick,
        onMouseDown: keepFocusOnBody,
        onPointerDown: keepFocusOnBody,
        style: {
          alignItems: 'center',
          background: 'rgba(0, 0, 0, 0.45)',
          color: '#ffffff',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: '"PT Sans Caption", sans-serif',
          inset: '0',
          justifyContent: 'center',
          position: 'fixed',
          textAlign: 'center',
          userSelect: 'none',
          zIndex: PAUSE_Z_INDEX
        }
      },
      createElement('div', {
        style: {
          fontSize: '48px',
          fontWeight: 'bold'
        }
      }, 'Paused'),
      createElement('div', {
        style: {
          fontSize: '18px',
          marginTop: '8px'
        }
      }, 'Press Esc or P, or tap to resume'),
      practiceInPlay && createElement(
        'div',
        {
          id: 'pause-practice',
          style: {
            display: 'flex',
            gap: '8px',
            marginTop: '16px'
          }
        },
        overlayButton('practice-save', 'Save game', 'Save the game (K)', () => {
          saveGame(practice, onSaved, setPracticeMessage);
        }),
        overlayButton('practice-end', 'End practice', 'End the practice run and see the results', () => {
          practice.end();
          // The death delay before the results runs on the game clock.
          game?.resume();
        })
      ),
      practiceInPlay && practiceMessage && createElement('div', {
        id: 'pause-practice-message',
        style: {
          fontSize: '16px',
          marginTop: '8px'
        }
      }, practiceMessage)
    ),
    createElement('button', {
      'aria-label': paused ? 'Resume' : 'Pause',
      'id': 'pause-button',
      'onClick': handleClick,
      'onMouseDown': keepFocusOnBody,
      'onPointerDown': keepFocusOnBody,
      'style': {
        background: 'rgba(0, 0, 0, 0.35)',
        border: '2px solid rgba(255, 255, 255, 0.8)',
        borderRadius: '50%',
        color: '#ffffff',
        cursor: 'pointer',
        fontSize: '18px',
        height: '44px',
        left: '50%',
        lineHeight: '1',
        padding: '0',
        position: 'fixed',
        top: '12px',
        transform: 'translateX(-50%)',
        width: '44px',
        zIndex: PAUSE_Z_INDEX + 1
      },
      'tabIndex': -1,
      'title': paused ? 'Resume (Esc / P)' : 'Pause (Esc / P)',
      'type': 'button'
    }, paused ? '▶' : '❚❚')
  );
}
function togglePause(game: Game, marker: CutMarker | null): void {
  if (game.pause()) {
    return;
  }
  if (!marker || isRespawnPending(game)) {
    // A pause inside a respawn's cut ends without green frames: the cut runs on to the respawn.
    game.resume();
  } else if (marker.state === 'resume') {
    // Paused again while the green frames show: stay paused, and the cut goes on.
    marker.cut();
  } else {
    marker.resumeThen(() => {
      game.resume();
    });
  }
}
function isRespawnPending(game: Game): boolean {
  return game.practice?.respawnPending ?? false;
}
/**
 * Runs an action that interrupts the play, such as a save, inside a cut in recording mode: the game pauses, the red
 * frames show, the action runs, then the green frames and the play resumes. Inside a pause it only runs the action.
 *
 * @param game - The live game.
 * @param marker - The cut marker while recording mode is on.
 * @param action - The action; it calls `done` once it has finished.
 */
function interruptPlay(game: Game, marker: CutMarker | null, action: (done: () => void) => void): void {
  if (marker?.state !== 'off' || isRespawnPending(game) || !game.pause()) {
    action(noop);
    return;
  }
  marker.cut();
  action(() => {
    marker.resumeThen(() => {
      game.resume();
    });
  });
}
/** `KeyboardEvent.code` values of the practice keys, none of which the engine steers on. */
export const PRACTICE_KEY_ADD = 'KeyZ';
export const PRACTICE_KEY_REMOVE = 'KeyX';
export const PRACTICE_KEY_SAVE = 'KeyK';
export const PRACTICE_MESSAGE_MILLISECONDS = 3000;
const PRACTICE_HUD_BUTTON_STYLE = {
  background: 'rgba(0, 0, 0, 0.35)',
  border: '2px solid rgba(255, 255, 255, 0.8)',
  borderRadius: '8px',
  color: '#ffffff',
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: '1',
  padding: '6px 8px'
};
export interface PracticeControlProps {
  /** The sound, which plays the checkpoint clicks. */
  audio: GameAudioState['audio'];
  /** The cut marker while recording mode is on, else `null`. */
  marker: CutMarker | null;
  /** Called after a save is written, so the menu lists it. */
  onSaved: () => void;
  practice: null | Practice;
}
/**
 * The practice run's controls, the Geometry Dash way: two buttons, Set checkpoint (Z) and Remove latest (X). A death
 * respawns at the latest checkpoint, so there is no list to pick from. K saves the game; the Save and End buttons are
 * on the paused overlay. Like the pause button, none of it may take keyboard focus, since the engine reads keys only
 * from `document.body`.
 *
 * In recording mode none of it is shown, while the keys keep working. A respawn then runs
 * inside a cut: red from the death, with how far back the cut reaches; the restore; green with the game paused; play.
 * A save and a removal pause the game inside a cut of their own.
 *
 * @param root0 - The props.
 * @param root0.audio - The sound, which plays the checkpoint clicks.
 * @param root0.marker - The cut marker while recording mode is on.
 * @param root0.onSaved - Told when a save has been written.
 * @param root0.practice - The practice run, or `null` outside practice mode.
 * @returns The controls, or nothing outside practice mode.
 */
export function PracticeControl({
  audio,
  marker,
  onSaved,
  practice
}: PracticeControlProps): null | VNode<unknown> {
  const [, setVersion] = useState(0);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!practice) {
      return undefined;
    }
    const currentPractice: Practice = practice;
    const { game } = currentPractice;
    if (marker) {
      const currentMarker: CutMarker = marker;
      currentPractice.onPlayerDeath = (checkpoint: Checkpoint): void => {
        currentMarker.cut();
        currentMarker.cut(formatRewindHint(currentMarker.cutStartedAt, checkpoint.seenAt));
      };
      currentPractice.onRespawn = (checkpoint: Checkpoint): void => {
        game.pause();
        currentMarker.cut(formatRewindHint(currentMarker.cutStartedAt, checkpoint.seenAt));
        currentMarker.resumeThen(() => {
          game.resume();
          checkpoint.seenAt = performance.now();
        });
      };
    } else {
      currentPractice.onPlayerDeath = null;
      currentPractice.onRespawn = null;
    }
    let messageTimer: number | undefined;
    function showMessage(text: string): void {
      setMessage(text);
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => {
        setMessage('');
      }, PRACTICE_MESSAGE_MILLISECONDS);
    }
    currentPractice.onChange = (): void => {
      setVersion((version: number) => version + 1);
    };
    currentPractice.onMessage = showMessage;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.repeat || event.target instanceof HTMLInputElement) {
        return;
      }
      switch (event.code) {
        case PRACTICE_KEY_ADD:
          addCheckpoint(currentPractice, audio);
          break;
        case PRACTICE_KEY_REMOVE:
          interruptPlay(game, marker, (done: () => void) => {
            removeCheckpoint(currentPractice, audio);
            done();
          });
          break;
        case PRACTICE_KEY_SAVE:
          interruptPlay(game, marker, (done: () => void) => {
            saveGame(currentPractice, onSaved, showMessage, done);
          });
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    window.addEventListener('keydown', handleKeyDown, false);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown, false);
      clearTimeout(messageTimer);
      if (currentPractice.onChange) {
        currentPractice.onChange = null;
      }
      currentPractice.onMessage = null;
      currentPractice.onPlayerDeath = null;
      currentPractice.onRespawn = null;
    };
  }, [practice, marker, audio]);
  if (!practice || marker) {
    return null;
  }
  const currentPractice = practice;
  function hudButton(id: string, label: string, title: string, action: () => void): VNode<unknown> {
    return createElement('button', {
      id,
      onClick: (event: MouseEvent) => {
        if (event.currentTarget instanceof HTMLElement) {
          event.currentTarget.blur();
        }
        action();
      },
      onMouseDown: keepFocusOnBody,
      onPointerDown: keepFocusOnBody,
      style: PRACTICE_HUD_BUTTON_STYLE,
      tabIndex: -1,
      title,
      type: 'button'
    }, label);
  }
  return createElement(
    'div',
    {
      id: 'practice-hud',
      onMouseDown: keepFocusOnBody,
      onPointerDown: keepFocusOnBody,
      style: {
        background: 'rgba(0, 0, 0, 0.5)',
        borderRadius: '8px',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"PT Sans Caption", sans-serif',
        fontSize: '13px',
        gap: '6px',
        left: '8px',
        maxWidth: '220px',
        padding: '8px',
        position: 'fixed',
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
        top: '50%',
        transform: 'translateY(-50%)',
        userSelect: 'none',
        zIndex: PAUSE_Z_INDEX - 1
      }
    },
    createElement('div', {
      style: {
        fontWeight: 'bold'
      }
    }, 'Practice'),
    hudButton('practice-add', '⚑ Set checkpoint', 'Set a checkpoint (Z)', () => {
      addCheckpoint(currentPractice, audio);
    }),
    hudButton('practice-remove', '✕ Remove latest', 'Remove the latest checkpoint (X)', () => {
      removeCheckpoint(currentPractice, audio);
    }),
    currentPractice.respawnPending && createElement('div', {
      id: 'practice-status'
    }, 'Respawning at the latest checkpoint…'),
    message && createElement('div', {
      id: 'practice-message'
    }, message)
  );
}
function addCheckpoint(practice: Practice, audio: GameAudioState['audio']): void {
  if (practice.add()) {
    audio.onCheckpointSet();
  } else {
    practice.onMessage?.(practice.game.preparing() ? 'No checkpoint while the game is still starting' : 'No checkpoint while the player is out of play');
  }
}
function removeCheckpoint(practice: Practice, audio: GameAudioState['audio']): void {
  if (practice.removeLatest()) {
    audio.onCheckpointRemoved();
  }
}
function saveGame(practice: Practice, onSaved: () => void, report: (text: string) => void, done: () => void = noop): void {
  const { game } = practice;
  const latest = practice.checkpoints[practice.checkpoints.length - 1];
  const player = game.player;
  const inPlay = player !== null && game.units.includes(player);
  const captured = inPlay && canCaptureSnapshot(game) ? captureSnapshot(game) : null;
  // A save cannot hold a pending game timer, so a capture that has one falls back to the latest checkpoint.
  const snapshot = captured?.timers.length === 0 ? captured : latest?.snapshot;
  if (!snapshot) {
    report('Nothing to save yet');
    done();
    return;
  }
  const percent = ((player?.percent ?? 0) * PERCENT_DISPLAY_SCALE).toFixed(PERCENT_DECIMAL_PLACES);
  const name = `${player?.name ?? 'Player'} · ${percent}% · ${new Date().toLocaleString()}`;
  writeSave(game, snapshot, name).then(() => {
    report('Saved');
    onSaved();
    done();
  }, (error: unknown) => {
    report(error instanceof Error ? error.message : String(error));
    done();
  });
}
const PERCENT_DISPLAY_SCALE = 100;
export interface ResultsScreenProps {
  bestScore: number;
  country?: undefined;
  provider?: undefined;
  recordingMode: boolean;
  results: GameResults;
  route: Dispatch<string>;
  start: () => void;
}
export function ResultsScreen({
  bestScore,
  recordingMode,
  results,
  route
}: ResultsScreenProps): VNode<unknown> {
  function goToMenu(): void {
    route('menu');
  }
  const {
    lng
  } = ensureNonNullable(useContext(LanguageContext));
  const {
    dataLayer
  } = window;
  if (dataLayer) {
    dataLayer.push({
      event: 'levelCompletion',
      productKey: 'paper2IO',
      publisher: 'CONNECT2MEDIA'
    });
  }
  useEffect(() => {
    if (window.ads?.showAds) {
      window.ads.showAds();
    }
  }, []);
  return createElement(
    Fragment,
    null,
    createElement('div', {
      id: 'left_side'
    }),
    createElement(
      'div',
      {
        class: 'uibox'
      },
      createElement(
        'div',
        {
          class: 'logo'
        },
        createElement('img', {
          src: 'assets/images/logo.png'
        })
      ),
      createElement(
        'div',
        {
          class: 'nav'
        },
        createElement('button', {
          class: 'yellow slider-5',
          id: 'menu',
          onClick: goToMenu
        }, lng.btnContinue)
      ),
      results.practice && !recordingMode && createElement('p', {
        id: 'practice-results',
        style: {
          color: '#ffffff',
          fontFamily: '"PT Sans Caption", sans-serif',
          textAlign: 'center'
        }
      }, 'Practice run: it does not count toward your best score.'),
      createElement(
        'div',
        {
          class: 'resultbox'
        },
        createElement(
          'div',
          {
            class: 'results'
          },
          createElement(
            'div',
            {
              class: 'left'
            },
            createElement(
              'div',
              {
                class: 'slider-1'
              },
              lng.yourScore,
              ':'
            ),
            createElement(
              'div',
              {
                class: 'slider-2'
              },
              results.newBest && createElement(
                'span',
                {
                  class: 'newScore'
                },
                lng.newText,
                ' '
              ),
              lng.bestScore,
              ':'
            ),
            createElement(
              'div',
              {
                class: 'slider-3'
              },
              lng.timePlayed,
              ':'
            ),
            createElement(
              'div',
              {
                class: 'slider-4'
              },
              lng.playersKilled,
              ':'
            )
          ),
          createElement(
            'div',
            {
              class: 'right'
            },
            createElement('div', {
              class: 'slider-1'
            }, `${results.score.toFixed(PERCENT_DECIMAL_PLACES)}%`),
            createElement('div', {
              class: 'slider-2'
            }, `${bestScore.toFixed(PERCENT_DECIMAL_PLACES)}%`),
            createElement('div', {
              class: 'slider-3'
            }, new Date(results.time).toISOString().slice(PLAYTIME_ISO_START_INDEX, PLAYTIME_ISO_END_INDEX)),
            createElement('div', {
              class: 'slider-4'
            }, results.kills)
          )
        )
      ),
      createElement('div', {
        id: 'yandex_rtb'
      })
    ),
    createElement('div', {
      id: 'right_side'
    })
  );
}
export interface SkinPreviewProps {
  name: string;
}
export function SkinPreview({
  name
}: SkinPreviewProps): VNode<unknown> {
  return createElement(
    'div',
    {
      class: 'skin'
    },
    createElement(
      'div',
      {
        class: 'skin-view'
      },
      createElement('h3', null, name),
      createElement('img', {
        src: `assets/skins/select/${name.toLowerCase().replace(/\s+/g, '')}.png`
      })
    )
  );
}
export interface SkinCarouselProps {
  menu: () => void;
  setSkin: Dispatch<string>;
  skin: string;
  skins: SkinSource[];
}
export function SkinCarousel({
  menu,
  setSkin,
  skin,
  skins
}: SkinCarouselProps): VNode<unknown> {
  const {
    lng
  } = ensureNonNullable(useContext(LanguageContext));
  const currentSkinIndex = skins.findIndex((skinSource: SkinSource) => skinSource.name === skin);
  const [skinIndex, setSkinIndex] = useState(currentSkinIndex > 0 ? currentSkinIndex : 0);
  function selectSkin(index: number): void {
    if (index >= 0 && index < skins.length) {
      setSkinIndex(index);
      setSkin(ensureNonNullable(skins[index]).name);
    }
  }
  return createElement(
    'div',
    {
      class: 'skinbox'
    },
    createElement(
      'div',
      {
        class: 'skins-container'
      },
      createElement('button', {
        class: 'orange',
        name: 'left',
        onClick: () => {
          selectSkin(skinIndex - 1);
        }
      }, '<'),
      createElement(SkinPreview, {
        name: ensureNonNullable(skins[skinIndex]).name
      }),
      createElement('button', {
        class: 'orange',
        name: 'right',
        onClick: () => {
          selectSkin(skinIndex + 1);
        }
      }, '>')
    ),
    createElement(
      'div',
      {
        class: 'nav'
      },
      createElement('button', {
        class: 'green',
        onClick: menu
      }, lng.btnSelect)
    )
  );
}
export interface SkinsScreenProps {
  route: Dispatch<string>;
  setSkin: Dispatch<string>;
  skin: string;
  skins: SkinSource[];
}
export function SkinsScreen({
  route,
  setSkin,
  skin,
  skins
}: SkinsScreenProps): VNode<unknown> {
  function goToMenu(): void {
    route('menu');
  }
  useEffect(() => {
    const element = document.getElementById('paperio-site_multisize');
    if (element) {
      element.style.display = 'none';
    }
  }, []);
  return createElement(
    Fragment,
    null,
    createElement('div', {
      id: 'left_side'
    }),
    createElement(
      'div',
      {
        class: 'uibox'
      },
      createElement(
        'div',
        {
          class: 'logo'
        },
        createElement('img', {
          src: 'assets/images/logo.png'
        })
      ),
      createElement(SkinCarousel, {
        menu: goToMenu,
        setSkin,
        skin,
        skins: [{
          name: 'No skin'
        }].concat(skins)
      })
    ),
    createElement('div', {
      id: 'right_side'
    })
  );
}
export interface StoredGameData {
  bestScore?: number;
  nickName?: string;
  skin?: string;
}
export interface StorageSetOptions {
  readonly expires: number;
}
export interface StorageApi {
  getJSON: (key: string) => null | StoredGameData;
  set: (key: string, value: StoredGameData, options: StorageSetOptions) => void;
}
export interface RecordingModeState {
  /** Hides the notice, and plays on if the switch paused a run. */
  dismissNotice: () => void;
  /** The cut marker while recording mode is on, else `null`. */
  marker: CutMarker | null;
  /** Whether the "You are in recording mode" notice is shown. */
  noticeShown: boolean;
  recordingMode: boolean;
  setRecordingMode: (recordingMode: boolean) => void;
}
/**
 * Recording mode's state: remembered in `localStorage`, toggled by the R key, and mirrored as a class on `<html>`.
 * Every switch in shows the notice, a restore from storage on load included, so the mode is never on unannounced.
 *
 * @param api - The game API.
 * @param route - The current route; a switch during a run is marked.
 * @returns The mode, its setter, the cut marker and the notice.
 */
export function useRecordingMode(api: GameApi | null, route: string): RecordingModeState {
  const [recordingMode, setRecordingModeState] = useState(readRecordingMode);
  const [noticeShown, setNoticeShown] = useState(recordingMode);
  const [cutMarker] = useState(() => new CutMarker());
  const afterNotice = useRef<(() => void) | null>(null);
  function setRecordingMode(nextRecordingMode: boolean): void {
    writeRecordingMode(nextRecordingMode);
    setRecordingModeState(nextRecordingMode);
    setNoticeShown(nextRecordingMode);
    const pausedBySwitch = afterNotice.current !== null;
    afterNotice.current = null;
    if (route === 'game' && api) {
      if (pausedBySwitch && !nextRecordingMode) {
        // Switched back before the notice was dismissed: give back the pause the switch in took.
        api.game.resume();
      }
      afterNotice.current = markRecordingSwitch(api.game, cutMarker, nextRecordingMode);
    }
  }
  function dismissNotice(): void {
    setNoticeShown(false);
    const action = afterNotice.current;
    afterNotice.current = null;
    action?.();
  }
  useEffect(() => {
    applyRecordingClass(recordingMode);
  }, [recordingMode]);
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.code !== RECORDING_KEY || event.repeat || event.target instanceof HTMLInputElement) {
        return;
      }
      event.preventDefault();
      setRecordingMode(!recordingMode);
    }
    window.addEventListener('keydown', handleKeyDown, false);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown, false);
    };
  }, [recordingMode, route]);
  return {
    dismissNotice,
    marker: recordingMode ? cutMarker : null,
    noticeShown,
    recordingMode,
    setRecordingMode
  };
}
/**
 * Marks a recording-mode switch made during a run.
 *
 * @param game - The live game.
 * @param marker - The cut marker.
 * @param recordingMode - Whether recording mode was just turned on.
 * @returns What to run once the notice is dismissed, or `null`.
 */
function markRecordingSwitch(game: Game, marker: CutMarker, recordingMode: boolean): (() => void) | null {
  if (!recordingMode) {
    // The additions come back, so the frames from here on are not clean.
    marker.flashCut();
    return null;
  }
  if (!game.pause()) {
    return null;
  }
  // The notice sits on the red frames, and the game waits under them until it is dismissed, so no play is lost.
  // Clean from the end of the green frames on.
  marker.cut();
  return (): void => {
    marker.resumeThen(() => {
      game.resume();
    });
  };
}
/** The notice's wording, as the owner asked for it. */
export const RECORDING_NOTICE_TEXT = 'You are in recording mode. Press R to return to normal mode';
/** `KeyboardEvent.code` values that dismiss the notice. */
export const RECORDING_NOTICE_DISMISS_CODES: readonly string[] = ['Enter', 'Escape', 'NumpadEnter', 'Space'];
/** Above the cut marker, whose red frames it sits on. */
const RECORDING_NOTICE_Z_INDEX = 2001;
export interface RecordingNoticeProps {
  onDismiss: () => void;
  shown: boolean;
}
/**
 * The modal shown on every switch into recording mode, styled like the game's own About window. Like the pause
 * control it never takes focus. While it is open it swallows every key but R, so Esc closes it rather than also
 * toggling the pause, and nothing reaches the engine or the practice keys.
 *
 * @param root0 - The props.
 * @param root0.onDismiss - Called on OK, Enter, Space or Esc.
 * @param root0.shown - Whether the notice is shown.
 * @returns The modal, or nothing while it is hidden.
 */
export function RecordingNotice({ onDismiss, shown }: RecordingNoticeProps): VNode<unknown> {
  // Read through a ref, so the effect depends on `shown` alone: an effect whose deps change on every render of the
  // App would queue preact's after-paint callback on every frame of play, and that alone shifts the frame timing.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (!shown) {
      return undefined;
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.code === RECORDING_KEY) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      if (!event.repeat && RECORDING_NOTICE_DISMISS_CODES.includes(event.code)) {
        dismissRef.current();
      }
    }
    window.addEventListener('keydown', handleKeyDown, true);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [shown]);
  if (!shown) {
    return createElement(Fragment, null);
  }
  return createElement(
    'div',
    {
      'aria-modal': 'true',
      'id': 'recording-notice',
      'onMouseDown': keepFocusOnBody,
      'onPointerDown': keepFocusOnBody,
      'role': 'dialog',
      'style': {
        alignItems: 'center',
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        fontFamily: '"PT Sans Caption", sans-serif',
        inset: '0',
        justifyContent: 'center',
        position: 'fixed',
        userSelect: 'none',
        zIndex: RECORDING_NOTICE_Z_INDEX
      }
    },
    createElement(
      'div',
      {
        style: {
          background: '#ffffff',
          borderRadius: '10px',
          boxSizing: 'border-box',
          color: '#422100',
          margin: '16px',
          maxWidth: '520px',
          padding: '32px',
          textAlign: 'center'
        }
      },
      createElement('p', {
        style: {
          fontSize: '24px',
          lineHeight: '1.3',
          margin: '0 0 24px'
        }
      }, RECORDING_NOTICE_TEXT),
      createElement('button', {
        class: 'green',
        id: 'recording-notice-ok',
        onClick: (event: MouseEvent) => {
          if (event.currentTarget instanceof HTMLElement) {
            event.currentTarget.blur();
          }
          onDismiss();
        },
        tabIndex: -1,
        type: 'button'
      }, 'OK')
    )
  );
}
export interface AppProps {
  ads?: undefined;
  api: GameApi | null;
  mode?: string;
  provider?: undefined;
  skins: SkinSource[];
  storage: StorageApi;
}
export function App({
  api,
  provider,
  skins,
  storage
}: AppProps): VNode<unknown> {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [playable, setPlayable] = useState(false);
  const [route, setRoute] = useState('menu');
  const [preparing, setPreparing] = useState(true);
  const [language, setLanguage] = useState(findDefaultLanguage());
  const [results, setResults] = useState<GameResults | null>(null);
  const storageKey = 'paper.io.storage';
  const storedData = storage.getJSON(storageKey) ?? {};
  const [nickName, setNickName] = useState(storedData.nickName ?? '');
  const [bestScore, setBestScore] = useState(storedData.bestScore ?? 0);
  const [skin, setSkin] = useState(storedData.skin ?? '');
  const [practiceMode, setPracticeModeState] = useState(readPracticeMode);
  const [practice, setPractice] = useState<null | Practice>(null);
  const [pendingLoad, setPendingLoad] = useState<GameSnapshot | null>(null);
  const [saves, setSaves] = useState<readonly SaveSummary[]>(listSaves);
  const [menuMessage, setMenuMessage] = useState('');
  const { dismissNotice, marker, noticeShown, recordingMode, setRecordingMode } = useRecordingMode(api, route);
  const video = useVideoRecording(api, route);
  const sound = useGameAudio(api, route, recordingMode);
  const autopilot = useAutopilot(api, route, start);
  const enemies = useEnemySettings(api);
  const ghost = useGhostRace(api, route, autopilot.autopilot);
  function setPracticeMode(nextPracticeMode: boolean): void {
    writePracticeMode(nextPracticeMode);
    setPracticeModeState(nextPracticeMode);
  }
  function refreshSaves(): void {
    setSaves(listSaves());
  }
  function loadSave(id: string): void {
    if (!api) {
      return;
    }
    setMenuMessage('Loading…');
    let payload: string;
    try {
      payload = readSave(id);
    } catch (error) {
      setMenuMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    api.decodeSnapshot(payload).then((snapshot: GameSnapshot) => {
      setMenuMessage('');
      setPendingLoad(snapshot);
      start();
    }, (error: unknown) => {
      setMenuMessage(`This save could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  function removeSave(id: string): void {
    try {
      deleteSave(id);
    } catch (error) {
      setMenuMessage(error instanceof Error ? error.message : String(error));
    }
    refreshSaves();
  }
  const storageOptions = {
    expires: DAYS_IN_YEAR
  };
  if (nickName !== storedData.nickName || bestScore !== storedData.bestScore || skin !== storedData.skin) {
    storage.set(storageKey, {
      bestScore,
      nickName,
      skin
    }, storageOptions);
  }
  useEffect(() => {
    if (api) {
      api.create(ensureNonNullable(canvasRef.current));
      api.prepare(() => {
        setPreparing(false);
      });
      setPlayable(true);
    }
  }, []);
  ensureNonNullable(api).startGame = (): void => {
    const element = document.getElementById('overlay');
    if (element) {
      element.style.display = 'none';
    }
    if (api?.game) {
      api.game.visible = true;
    }
    setRoute('game');
  };
  function start(): void {
    const element = document.getElementById('overlay');
    if (element) {
      element.style.display = 'block';
      element.style.animation = 'fadein 500ms';
    }
    if (api?.game) {
      api.game.visible = false;
    }
    ensureNonNullable(window.ShowPreroll)();
  }
  function setCanvasRef(element: EventTarget | null): void {
    canvasRef.current = element instanceof HTMLCanvasElement ? element : null;
  }
  return createElement(
    Fragment,
    null,
    createElement('canvas', {
      class: route === 'game' || preparing ? '' : 'fadein',
      id: 'view',
      ref: setCanvasRef
    }),
    route === 'game' && createElement(PauseControl, {
      api,
      marker,
      onSaved: refreshSaves,
      practice
    }),
    createElement(AutopilotHud, {
      api,
      hidden: marker !== null,
      inGame: route === 'game',
      state: autopilot
    }),
    createElement(GhostHud, {
      hidden: marker !== null,
      inGame: route === 'game',
      state: ghost
    }),
    createElement(AudioControl, {
      hidden: marker !== null,
      inGame: route === 'game',
      state: sound
    }),
    createElement(RecordControl, {
      hidden: marker !== null,
      inGame: route === 'game',
      state: video
    }),
    route === 'game' && createElement(PracticeControl, {
      audio: sound.audio,
      marker,
      onSaved: refreshSaves,
      practice
    }),
    createElement(RecordingNotice, {
      onDismiss: dismissNotice,
      shown: noticeShown
    }),
    route !== 'game' && createElement('div', {
      id: 'ui_overlay'
    }),
    createElement(LanguageContext.Provider, {
      children: [
        createElement(
          'div',
          {
            class: route === 'game' ? 'hide' : '',
            id: 'ui'
          },
          route === 'menu' && createElement(MenuScreen, {
            api,
            audio: sound,
            autopilot,
            enemies,
            ghost,
            loadSave,
            menuMessage,
            nickName,
            playable,
            practiceMode,
            preparing,
            provider,
            recordingMode,
            removeSave,
            route: setRoute,
            saves,
            setLanguage,
            setNickName,
            setPracticeMode,
            setRecordingMode,
            setState: setRoute,
            skin,
            skins,
            start,
            video
          }),
          route === 'game' && createElement(GameScreen, {
            api,
            bestScore,
            marker,
            nickName,
            pendingLoad,
            practiceMode,
            route: setRoute,
            setBestScore,
            setPendingLoad,
            setPractice,
            setPreparing,
            setResults,
            skin
          }),
          route === 'results' && createElement(ResultsScreen, {
            bestScore,
            provider,
            recordingMode,
            results: ensureNonNullable(results),
            route: setRoute,
            start
          }),
          route === 'config' && createElement(ConfigScreen, {
            api,
            setPreparing,
            setState: setRoute,
            view: canvasRef
          }),
          route === 'skins' && createElement(SkinsScreen, {
            route: setRoute,
            setSkin,
            skin,
            skins
          })
        ),
        route !== 'game' && createElement(LanguageFooter, {
          setLanguage
        })
      ],
      value: language
    }),
    createElement('div', {
      id: 'overlay'
    })
  );
}
/* eslint-enable perfectionist/sort-modules -- end of the dependency-ordered engine declarations. */
