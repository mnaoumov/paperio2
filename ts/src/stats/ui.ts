/**
 * @file
 *
 * The page side of the stats log: every run on the `game` route is logged (see `log.ts`), kept in IndexedDB as it goes
 * (every minute of game time, when the tab is hidden and when the run ends), and listed in the menu's Extras with a
 * Download per game and one for all of them. Nothing leaves the browser except by a download.
 */

import type { VNode } from 'preact';

import { createElement } from 'preact';
import {
  useEffect,
  useState
} from 'preact/hooks';

import type { AutopilotMode } from '../autopilot/driver.ts';
import type { GameApi } from '../game-api.ts';
import type { StatsGameRecord } from './store.ts';

import { noop } from '../shared/noop.ts';
import {
  deleteStatsGame,
  KEPT_STATS_GAMES,
  listStatsGames,
  putStatsGame,
  statsFileName
} from './store.ts';

export interface StatsLogState {
  readonly games: readonly StatsGameRecord[];
  readonly remove: (id: string) => void;
}

export interface StatsMenuProps {
  readonly state: StatsLogState;
}

/** Game time between two writes of a running game's log. */
const FLUSH_MILLISECONDS = 60_000;
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_DIGITS = 2;
const PERCENT_DIGITS = 2;
const ROW_STYLE = {
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
const OUTCOME_LABELS: Readonly<Record<StatsGameRecord['outcome'], string>> = { death: 'died', quit: 'left', win: 'won' };

/**
 * The menu's Stats logs panel: the logged games, newest first, each with Download and Delete.
 *
 * @param root0 - The props.
 * @param root0.state - The logs' state.
 * @returns The panel.
 */
export function StatsMenu({ state }: StatsMenuProps): VNode<unknown> {
  const { games, remove } = state;
  const [confirmDelete, setConfirmDelete] = useState<null | string>(null);
  return createElement(
    'div',
    { id: 'stats-logs', style: { marginTop: '12px' } },
    createElement('p', { style: { margin: '8px 0 4px' } }, 'Stats logs'),
    createElement(
      'p',
      { style: { fontSize: '13px', margin: '0 0 4px', opacity: '0.85' } },
      `Every run is logged: area over time, captures, kills, deaths and frame times, as JSONL. The newest ${String(KEPT_STATS_GAMES)} are kept.`
    ),
    games.length > 1 && createElement('button', {
      class: 'green',
      id: 'stats-download-all',
      onClick: () => {
        const oldestFirst = [...games].reverse();
        downloadText(oldestFirst.map((game: StatsGameRecord) => game.text).join(''), statsFileName(oldestFirst.at(-1)?.startedAt ?? Date.now()).replace('paperio2-', 'paperio2-all-'));
      },
      style: SMALL_BUTTON_STYLE,
      title: 'All the games below in one file, oldest first; each starts with its header line.',
      type: 'button'
    }, 'Download all'),
    games.map((game: StatsGameRecord) => {
      const started = new Date(game.startedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
      return createElement(
        'div',
        { 'class': 'stats-row', 'data-id': game.id, 'key': game.id, 'style': ROW_STYLE },
        createElement(
          'span',
          { style: { display: 'flex', flex: '1', flexDirection: 'column', minWidth: '0', textAlign: 'left' } },
          createElement('span', null, started),
          createElement('span', { class: 'stats-details', style: { fontSize: '13px', opacity: '0.85' } }, `${game.pilot} · ${formatSeconds(game.seconds)} · ${game.percent.toFixed(PERCENT_DIGITS)}% · ${OUTCOME_LABELS[game.outcome]}`)
        ),
        createElement(
          'span',
          { style: { display: 'flex', flexShrink: '0', gap: '4px' } },
          createElement('button', {
            class: 'green stats-download',
            onClick: () => {
              downloadText(game.text, statsFileName(game.startedAt));
            },
            style: SMALL_BUTTON_STYLE,
            type: 'button'
          }, 'Download'),
          createElement('button', {
            'aria-label': `Delete the stats log of ${started}`,
            'class': 'orange stats-delete',
            'onClick': () => {
              if (confirmDelete === game.id) {
                setConfirmDelete(null);
                remove(game.id);
              } else {
                setConfirmDelete(game.id);
              }
            },
            'style': SMALL_BUTTON_STYLE,
            'type': 'button'
          }, confirmDelete === game.id ? 'Delete?' : '✕')
        )
      );
    })
  );
}

/**
 * Logs every run on the `game` route, and lists the logged games for the menu.
 *
 * @param api - The game API.
 * @param route - The current route.
 * @param autopilotMode - The menu's demo mode, which says who starts a run.
 * @param recordingMode - Whether recording mode is on.
 * @returns The logs' state.
 */
export function useStatsLog(api: GameApi | null, route: string, autopilotMode: AutopilotMode, recordingMode: boolean): StatsLogState {
  const pilot = autopilotMode === 'off' ? 'human' : autopilotMode;
  const [games, setGames] = useState<readonly StatsGameRecord[]>([]);

  function refresh(): void {
    if (typeof indexedDB === 'undefined') {
      return;
    }
    listStatsGames().then(setGames, () => {
      // Blocked storage keeps nothing to list.
    });
  }

  useEffect(() => {
    if (route !== 'game') {
      refresh();
    }
  }, [route]);

  useEffect(() => {
    if (route !== 'game' || !api || typeof indexedDB === 'undefined') {
      return;
    }
    const startedAt = Date.now();
    const id = `${String(startedAt)}-${String(Math.trunc(performance.now()))}`;
    const log = api.createStatsLog(pilot, recordingMode);
    let flushedAt = 0;
    function save(text: string, then: () => void = noop): void {
      putStatsGame({ id, outcome: log.outcome, percent: log.percent, pilot, seconds: log.seconds, startedAt, text }).then(then, () => {
        // A full or blocked storage only means the log is not kept.
      });
    }
    function onFrame(): void {
      const time = log.seconds * MILLISECONDS_PER_SECOND;
      // A practice respawn puts the clock back, so the span is counted either way.
      if (Math.abs(time - flushedAt) >= FLUSH_MILLISECONDS) {
        flushedAt = time;
        save(log.text());
      }
    }
    function onVisibilityChange(): void {
      if (document.visibilityState === 'hidden') {
        save(log.text());
      }
    }
    api.game.frameObservers.push(onFrame);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return (): void => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const index = api.game.frameObservers.indexOf(onFrame);
      if (index >= 0) {
        api.game.frameObservers.splice(index, 1);
      }
      // The menu lists the games once this run's last write is in.
      save(log.finish(), refresh);
    };
  }, [route]);

  function remove(id: string): void {
    deleteStatsGame(id).then(refresh, refresh);
  }

  return { games, remove };
}

function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, MILLISECONDS_PER_SECOND);
}

function formatSeconds(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(whole / SECONDS_PER_MINUTE))}:${String(whole % SECONDS_PER_MINUTE).padStart(SECONDS_DIGITS, '0')}`;
}
