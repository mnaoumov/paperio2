/**
 * @file
 *
 * One id per run, shared by everything a run leaves behind: its stats log is stored under it, and every recording taken
 * during it carries it as `runId`, so the menu lists a run's video and data as one row.
 */

import { useRef } from 'preact/hooks';

interface RunIdState {
  readonly id: null | string;
  readonly route: string;
}

/**
 * A new run's id: the wall-clock start and the page's own clock, which never draws from `Math.random`.
 *
 * @returns The id.
 */
export function createRunId(): string {
  return `${String(Date.now())}-${String(Math.trunc(performance.now()))}`;
}

/**
 * The current run's id: a new one each time the route enters `game`, the same one for as long as it stays there, and
 * `null` elsewhere. It is computed during the render, so every effect that runs for the route change sees it.
 *
 * @param route - The current route.
 * @returns The id, or `null` off the `game` route.
 */
export function useRunId(route: string): null | string {
  const state = useRef<RunIdState>({ id: null, route: '' });
  if (state.current.route !== route) {
    state.current = { id: route === 'game' ? createRunId() : null, route };
  }
  return state.current.id;
}
