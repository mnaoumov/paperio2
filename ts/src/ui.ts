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

import type {
  Config,
  Game,
  GameResults
} from './engine.ts';
import type { GameApi } from './game-api.ts';
import type { Language } from './i18n.ts';
import type { Checkpoint } from './practice.ts';
import type { SaveSummary } from './save-format.ts';
import type { SkinSource } from './skins/skin.ts';
import type { GameSnapshot } from './snapshot.ts';

import {
  findDefaultLanguage,
  list3
} from './i18n.ts';
import { Practice } from './practice.ts';
import {
  deleteSave,
  listSaves,
  readSave,
  writeSave
} from './save-format.ts';
import { DAYS_IN_YEAR } from './scoring.ts';
import {
  canCaptureSnapshot,
  captureSnapshot
} from './snapshot.ts';

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
  loadSave: (id: string) => void;
  menuMessage: string;
  nickName: string;
  playable: boolean;
  practiceMode: boolean;
  preparing: boolean;
  provider?: undefined;
  removeSave: (id: string) => void;
  route: Dispatch<string>;
  saves: readonly SaveSummary[];
  setLanguage: Dispatch<Language | undefined>;
  setNickName: Dispatch<string>;
  setPracticeMode: (practiceMode: boolean) => void;
  setState: Dispatch<string>;
  skin: string;
  skins: SkinSource[];
  start: () => void;
}
export function MenuScreen({
  api,
  loadSave,
  menuMessage,
  nickName,
  practiceMode,
  removeSave,
  route,
  saves,
  setNickName,
  setPracticeMode,
  skin,
  start
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
      isSupported && createElement(PracticeMenu, {
        loadSave,
        menuMessage,
        practiceMode,
        removeSave,
        saves,
        setPracticeMode
      })
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
}
/**
 * The menu's Practice toggle and its saved games. Practice mode turns on checkpoints for the next run; a saved game
 * always loads into a practice run.
 *
 * @param root0 - The props.
 * @param root0.loadSave - Starts a practice run from a save.
 * @param root0.menuMessage - A message to show, such as why a save did not load.
 * @param root0.practiceMode - Whether the next run is practice.
 * @param root0.removeSave - Deletes a save.
 * @param root0.saves - The saves, newest first.
 * @param root0.setPracticeMode - Turns practice mode on or off.
 * @returns The panel.
 */
export function PracticeMenu({
  loadSave,
  menuMessage,
  practiceMode,
  removeSave,
  saves,
  setPracticeMode
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
}
function keepFocusOnBody(event: Event): void {
  event.preventDefault();
}
/**
 * The pause button, the paused overlay and the Esc / P toggle. None of it may take keyboard focus: the engine
 * reads keys only when `event.target === document.body`, so a focused button would silently stop keyboard
 * steering, the same constraint the joystick toggle in `index.html` follows.
 *
 * @param root0 - The props.
 * @param root0.api - The game API whose live game is paused.
 * @returns The button, plus the overlay while paused.
 */
export function PauseControl({
  api
}: PauseControlProps): VNode<unknown> {
  const game = api?.game;
  const [paused, setPaused] = useState(game?.paused ?? false);
  useEffect(() => {
    if (!game) {
      return undefined;
    }
    const currentGame: Game = game;
    currentGame.onPauseChange = setPaused;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.repeat || !PAUSE_KEY_CODES.includes(event.code)) {
        return;
      }
      event.preventDefault();
      togglePause(currentGame);
    }
    window.addEventListener('keydown', handleKeyDown, false);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown, false);
      if (currentGame.onPauseChange === setPaused) {
        currentGame.onPauseChange = null;
      }
    };
  }, [game]);
  function handleClick(event: MouseEvent): void {
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.blur();
    }
    if (game) {
      togglePause(game);
    }
  }
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
      }, 'Press Esc or P, or tap to resume')
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
function togglePause(game: Game): void {
  if (!game.pause()) {
    game.resume();
  }
}
/** `KeyboardEvent.code` values of the practice keys, none of which the engine steers on. */
export const PRACTICE_KEY_ADD = 'KeyZ';
export const PRACTICE_KEY_REMOVE = 'KeyX';
export const PRACTICE_KEY_SAVE = 'KeyK';
export const PRACTICE_MESSAGE_MILLISECONDS = 3000;
export const PRACTICE_VISIBLE_CHECKPOINTS = 10;
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
  /** Called after a save is written, so the menu lists it. */
  onSaved: () => void;
  practice: null | Practice;
}
/**
 * The practice run's controls: add a checkpoint (Z), remove the latest (X), save the game (K) and end the run, plus
 * the checkpoints themselves, each removable on its own. Like the pause button, none of it may take keyboard focus,
 * since the engine reads keys only from `document.body`.
 *
 * @param root0 - The props.
 * @param root0.onSaved - Told when a save has been written.
 * @param root0.practice - The practice run, or `null` outside practice mode.
 * @returns The controls, or nothing outside practice mode.
 */
export function PracticeControl({
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
          addCheckpoint(currentPractice);
          break;
        case PRACTICE_KEY_REMOVE:
          currentPractice.remove();
          break;
        case PRACTICE_KEY_SAVE:
          saveGame(currentPractice, onSaved);
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
    };
  }, [practice]);
  if (!practice) {
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
  const { checkpoints } = currentPractice;
  const latest = checkpoints[checkpoints.length - 1];
  const visible = checkpoints.slice(-PRACTICE_VISIBLE_CHECKPOINTS);
  let status = `Checkpoints: ${String(checkpoints.length)} · Deaths: ${String(currentPractice.deaths)}`;
  if (currentPractice.respawnPending) {
    status = 'Respawning at the latest checkpoint…';
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
    createElement('div', null, status),
    createElement(
      'div',
      {
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px'
        }
      },
      hudButton('practice-add', '⚑ +', 'Add a checkpoint (Z)', () => {
        addCheckpoint(currentPractice);
      }),
      hudButton('practice-remove', '⚑ −', 'Remove the latest checkpoint (X)', () => {
        currentPractice.remove();
      }),
      hudButton('practice-save', 'Save', 'Save the game (K)', () => {
        saveGame(currentPractice, onSaved);
      }),
      hudButton('practice-end', 'End', 'End the practice run', () => {
        currentPractice.end();
      })
    ),
    createElement(
      'div',
      {
        id: 'practice-checkpoints',
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px'
        }
      },
      checkpoints.length > visible.length && createElement('span', null, `+${String(checkpoints.length - visible.length)}`),
      visible.map((checkpoint: Checkpoint) =>
        createElement(
          'span',
          {
            key: checkpoint.id,
            style: {
              alignItems: 'center',
              background: checkpoint === latest ? 'rgba(46, 204, 113, 0.75)' : 'rgba(0, 0, 0, 0.35)',
              borderRadius: '10px',
              display: 'inline-flex',
              gap: '2px',
              padding: '1px 2px 1px 6px'
            },
            title: checkpoint.isAuto ? 'Automatic checkpoint' : 'Your checkpoint'
          },
          `${checkpoint.isAuto ? '' : '★ '}${formatPlaytime(checkpoint.playtime)}`,
          createElement('button', {
            'aria-label': 'Remove this checkpoint',
            'onClick': (event: MouseEvent) => {
              if (event.currentTarget instanceof HTMLElement) {
                event.currentTarget.blur();
              }
              currentPractice.remove(checkpoint.id);
            },
            'onMouseDown': keepFocusOnBody,
            'onPointerDown': keepFocusOnBody,
            'style': {
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '12px',
              padding: '0 4px'
            },
            'tabIndex': -1,
            'type': 'button'
          }, '✕')
        )
      )
    ),
    message && createElement('div', {
      id: 'practice-message'
    }, message)
  );
}
function addCheckpoint(practice: Practice): void {
  if (!practice.add()) {
    practice.onMessage?.(practice.game.preparing() ? 'No checkpoint while the game is still starting' : 'No checkpoint while the player is out of play');
  }
}
function saveGame(practice: Practice, onSaved: () => void): void {
  const { game } = practice;
  const latest = practice.checkpoints[practice.checkpoints.length - 1];
  const player = game.player;
  const inPlay = player !== null && game.units.includes(player);
  const snapshot = inPlay && canCaptureSnapshot(game) ? captureSnapshot(game) : latest?.snapshot;
  if (!snapshot) {
    practice.onMessage?.('Nothing to save yet');
    return;
  }
  const percent = ((player?.percent ?? 0) * PERCENT_DISPLAY_SCALE).toFixed(PERCENT_DECIMAL_PLACES);
  const name = `${player?.name ?? 'Player'} · ${percent}% · ${new Date().toLocaleString()}`;
  writeSave(game, snapshot, name).then(() => {
    practice.onMessage?.('Saved');
    onSaved();
  }, (error: unknown) => {
    practice.onMessage?.(error instanceof Error ? error.message : String(error));
  });
}
const PERCENT_DISPLAY_SCALE = 100;
export interface ResultsScreenProps {
  bestScore: number;
  country?: undefined;
  provider?: undefined;
  results: GameResults;
  route: Dispatch<string>;
  start: () => void;
}
export function ResultsScreen({
  bestScore,
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
      results.practice && createElement('p', {
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
      api
    }),
    route === 'game' && createElement(PracticeControl, {
      onSaved: refreshSaves,
      practice
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
            loadSave,
            menuMessage,
            nickName,
            playable,
            practiceMode,
            preparing,
            provider,
            removeSave,
            route: setRoute,
            saves,
            setLanguage,
            setNickName,
            setPracticeMode,
            setState: setRoute,
            skin,
            skins,
            start
          }),
          route === 'game' && createElement(GameScreen, {
            api,
            bestScore,
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
