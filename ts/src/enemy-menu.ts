/**
 * @file
 *
 * The page side of the enemy modes: the menu's Enemies, Vision, Difficulty and Bots switches, remembered in
 * `localStorage` and handed to the game at once, so the menu's own bots already play the chosen mode.
 */

import type { VNode } from 'preact';

import { createElement } from 'preact';
import {
  useEffect,
  useState
} from 'preact/hooks';

import type {
  EnemyMode,
  EnemySettings
} from './entities/enemy-modes.ts';
import type { GameApi } from './game-api.ts';

import {
  ENEMY_COUNTS,
  ENEMY_LEVELS,
  ENEMY_MODES,
  ENEMY_VISIONS,
  parseEnemySettings,
  VISION_MODES
} from './entities/enemy-modes.ts';

/** Where the menu's enemy settings are remembered, as JSON. */
export const ENEMY_STORAGE_KEY = 'paperio2.enemies';

const MODE_LABELS: Readonly<Record<EnemyMode, string>> = {
  'avoid': 'Avoid you',
  'chase': 'Chase you',
  'civil-war': 'Civil war',
  'free-for-all': 'Free-for-all',
  'grabbers': 'Land grabbers',
  'mixed': 'Mixed',
  'original': 'Original',
  'pack': 'Pack hunters',
  'passive': 'Passive',
  'suicidal': 'Suicidal'
};

const MODE_TITLES: Readonly<Record<EnemyMode, string>> = {
  'avoid': 'Bots keep away from you and never attack.',
  'chase': 'Every bot that sees you hunts your trail.',
  'civil-war': 'Bots hunt each other and steer around you.',
  'free-for-all': 'Bots hunt any trail in range, each other\'s as well as yours.',
  'grabbers': 'Greedy bots race you for space and never attack.',
  'mixed': 'Each bot plays a random mode.',
  'original': 'The original game\'s bots.',
  'pack': 'The three bots nearest you hunt together: one at your trail, two across your way home.',
  'passive': 'Bots never leave their bases.',
  'suicidal': 'Bots cross their own trails and throw themselves in front of you.'
};

const PERCENT_SCALE = 100;
const ORIGINAL_BOTS_COUNT = 15;

export interface EnemyMenuProps {
  readonly state: EnemyMenuState;
}

export interface EnemyMenuState {
  /** Moves one setting on to its next value. */
  readonly cycle: (key: keyof EnemySettings) => void;
  readonly settings: EnemySettings;
}

/**
 * The menu's enemy switches.
 *
 * @param root0 - The props.
 * @param root0.state - The settings and their switch.
 * @returns The buttons.
 */
export function EnemyMenu({ state }: EnemyMenuProps): VNode<unknown> {
  const { cycle, settings } = state;
  function button(id: string, key: keyof EnemySettings, label: string, title: string, changed: boolean): VNode<unknown> {
    return createElement('button', {
      class: changed ? 'green' : 'orange',
      id,
      onClick: () => {
        cycle(key);
      },
      title,
      type: 'button'
    }, label);
  }
  return createElement(
    'div',
    { id: 'enemy-menu', style: { display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center', marginTop: '8px' } },
    button('enemy-mode', 'mode', `Enemies: ${MODE_LABELS[settings.mode]}`, MODE_TITLES[settings.mode], settings.mode !== 'original'),
    VISION_MODES.includes(settings.mode) && button(
      'enemy-vision',
      'vision',
      `Vision: ${settings.vision === 'whitebox' ? 'Whitebox' : 'Blackbox'}`,
      'Whitebox bots know where you are everywhere; blackbox bots see you only within their own view.',
      settings.vision !== 'whitebox'
    ),
    button(
      'enemy-level',
      'level',
      `Difficulty: ${settings.level === null ? 'Ramp' : `${(settings.level * PERCENT_SCALE).toFixed(0)}%`}`,
      'Ramp makes the bots bolder as you grow, as in the original; a percentage fixes their level from timid (0%) to hardest (100%).',
      settings.level !== null
    ),
    button('enemy-count', 'count', `Bots: ${String(settings.count ?? ORIGINAL_BOTS_COUNT)}`, 'How many bots play.', settings.count !== null)
  );
}

export function readEnemySettings(): EnemySettings {
  try {
    return parseEnemySettings(localStorage.getItem(ENEMY_STORAGE_KEY));
  } catch {
    return parseEnemySettings(null);
  }
}

/**
 * The enemy settings for the App: read from storage, handed to the game whenever they change.
 *
 * @param api - The game API.
 * @returns The state.
 */
export function useEnemySettings(api: GameApi | null): EnemyMenuState {
  const [settings, setSettings] = useState<EnemySettings>(readEnemySettings);
  useEffect(() => {
    api?.setEnemySettings(settings);
  }, [settings]);

  function cycle(key: keyof EnemySettings): void {
    const next: EnemySettings = {
      count: key === 'count' ? nextOf(ENEMY_COUNTS, settings.count) : settings.count,
      level: key === 'level' ? nextOf(ENEMY_LEVELS, settings.level) : settings.level,
      mode: key === 'mode' ? nextOf(ENEMY_MODES, settings.mode) : settings.mode,
      vision: key === 'vision' ? nextOf(ENEMY_VISIONS, settings.vision) : settings.vision
    };
    try {
      localStorage.setItem(ENEMY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // A blocked storage only means the choice is not remembered.
    }
    setSettings(next);
  }

  return { cycle, settings };
}

function nextOf<T>(values: readonly T[], current: T): T {
  return values[(values.indexOf(current) + 1) % values.length] ?? current;
}
