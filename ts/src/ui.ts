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
import type { SkinSource } from './skins/skin.ts';

import {
  findDefaultLanguage,
  list3
} from './i18n.ts';
import { DAYS_IN_YEAR } from './scoring.ts';

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
  nickName: string;
  playable: boolean;
  preparing: boolean;
  provider?: undefined;
  route: Dispatch<string>;
  setLanguage: Dispatch<Language | undefined>;
  setNickName: Dispatch<string>;
  setState: Dispatch<string>;
  skin: string;
  skins: SkinSource[];
  start: () => void;
}
export function MenuScreen({
  api,
  nickName,
  route,
  setNickName,
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
      }, lng.nosupport)
    ),
    createElement('div', {
      id: 'right_side'
    })
  );
}
export interface GameScreenProps {
  api: GameApi | null;
  bestScore: number;
  lastPercent?: number;
  nickName: string;
  route: Dispatch<string>;
  setBestScore: Dispatch<number>;
  setPreparing: Dispatch<boolean>;
  setResults: Dispatch<GameResults | null>;
  skin: string;
}
export function GameScreen({
  api,
  bestScore,
  lastPercent,
  nickName,
  route,
  setBestScore,
  setPreparing,
  setResults,
  skin
}: GameScreenProps): null {
  useEffect(() => {
    function handleGameOver(results: GameResults): void {
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
    ensureNonNullable(api).start(nickName, skin2, bestScore, handleGameOver, lastPercent);
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
            nickName,
            playable,
            preparing,
            provider,
            route: setRoute,
            setLanguage,
            setNickName,
            setState: setRoute,
            skin,
            skins,
            start
          }),
          route === 'game' && createElement(GameScreen, {
            api,
            bestScore,
            nickName,
            route: setRoute,
            setBestScore,
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
