/**
 * @file
 *
 * The page side of the stats log: every run on the `game` route is logged (see `log.ts`) under the run's id, and kept
 * in IndexedDB as it goes (every minute of game time, when the tab is hidden and when the run ends). The menu lists each
 * log beside its run's recordings (`runs/ui.ts`). Nothing leaves the browser except by a download.
 */

import {
  useEffect,
  useState
} from 'preact/hooks';

import type { AutopilotMode } from '../autopilot/driver.ts';
import type { GameApi } from '../game-api.ts';
import type { StatsGameRecord } from './store.ts';

import { noop } from '../shared/noop.ts';
import {
  deleteStatsGames,
  listStatsGames,
  putStatsGame,
  setStatsGameKeep
} from './store.ts';

export interface StatsLogState {
  readonly games: readonly StatsGameRecord[];
  /** Deletes logs; resolves once they are gone and the list is read again. */
  readonly remove: (ids: readonly string[]) => Promise<void>;
  /** Marks a log Keep, or takes the mark off. */
  readonly setKeep: (id: string, keep: boolean) => Promise<void>;
}

/** Game time between two writes of a running game's log. */
const FLUSH_MILLISECONDS = 60_000;
const MILLISECONDS_PER_SECOND = 1000;

/**
 * Logs every run on the `game` route, and lists the logged games for the menu.
 *
 * @param api - The game API.
 * @param route - The current route.
 * @param autopilotMode - The menu's demo mode, which says who starts a run.
 * @param runId - The current run's id (`runs/run-id.ts`), which the log is stored under.
 * @returns The logs' state.
 */
export function useStatsLog(api: GameApi | null, route: string, autopilotMode: AutopilotMode, runId: null | string): StatsLogState {
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
    if (route !== 'game' || !api || runId === null || typeof indexedDB === 'undefined') {
      return;
    }
    const id = runId;
    const startedAt = Date.now();
    const log = api.createStatsLog(pilot);
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

  async function remove(ids: readonly string[]): Promise<void> {
    await deleteStatsGames(ids).catch(noop);
    refresh();
  }

  async function setKeep(id: string, keep: boolean): Promise<void> {
    await setStatsGameKeep(id, keep).catch(noop);
    refresh();
  }

  return { games, remove, setKeep };
}
