/**
 * @file
 *
 * The page side of the ghost race and the speedrun seed: the menu's Race panel (the seed, with Copy link and New seed,
 * and the Ghost switch with the best run it races), the recorder that samples every run that is not practice, and the
 * ghost drawn over the game on a canvas of its own, so the in-game recorder, which records the game's canvas, never
 * sees it. The best run is kept per seed, so a ghost is raced on the map it was flown on. All of it hides in recording
 * mode.
 */

import type { VNode } from 'preact';

import { createElement } from 'preact';
import {
  useEffect,
  useRef,
  useState
} from 'preact/hooks';

import type { Autopilot } from '../autopilot/driver.ts';
import type { Game } from '../engine.ts';
import type { GameApi } from '../game-api.ts';
import type {
  GhostPoint,
  GhostTrack
} from './track.ts';

import {
  FULL_TURN,
  HALF
} from '../autopilot/plane.ts';
import { worldToScreen } from '../camera-map.ts';
import {
  createSeedText,
  urlWithSeed
} from '../seed.ts';
import {
  GHOST_SWITCH_STORAGE_KEY,
  ghostAt,
  ghostPath,
  GhostRecorder,
  ghostStorageKey,
  isBetterRun,
  parseGhost
} from './track.ts';

/** `KeyboardEvent.code` that shows or hides the ghost during a run. */
export const GHOST_KEY = 'KeyH';

const GHOST_Z_INDEX = 998;
/** The ghost is drawn this big, in arena units: about a unit's head. */
const GHOST_WORLD_RADIUS = 12;
const GHOST_MIN_SCREEN_RADIUS = 6;
/** The tail behind the ghost spans this much game time. */
const GHOST_TAIL_MILLISECONDS = 1500;
const GHOST_ALPHA = 0.45;
const GHOST_TAIL_WIDTH = 3;
/** A ghost off screen is pinned this far inside the edge. */
const EDGE_MARGIN = 28;
const LABEL_OFFSET = 8;
const LABEL_PADDING = 4;
const LABEL_HEIGHT = 14;
const PERCENT_SCALE = 100;
const PERCENT_DIGITS = 2;
const COPIED_MESSAGE_MILLISECONDS = 2000;

/** Where the ghost's canvas is held while it is mounted. */
export interface CanvasHolder {
  current: HTMLCanvasElement | null;
}

export interface GhostHudProps {
  readonly hidden: boolean;
  readonly inGame: boolean;
  readonly state: GhostRaceState;
}

export interface GhostRaceState {
  /** The best run on this page's seed, which the ghost replays, or `null`. */
  readonly best: GhostTrack | null;
  readonly enabled: boolean;
  readonly forget: () => void;
  /** The canvas the ghost is drawn on, while one is mounted. */
  readonly overlayRef: CanvasHolder;
  /** The page's speedrun seed, or `null`. */
  readonly seed: null | string;
  readonly toggle: () => void;
}

export interface RaceMenuProps {
  readonly state: GhostRaceState;
}

/**
 * The canvas the ghost is drawn on during a run.
 *
 * @param root0 - The props.
 * @param root0.hidden - Whether recording mode hides it.
 * @param root0.inGame - Whether a run is on screen.
 * @param root0.state - The race's state.
 * @returns The canvas, or nothing.
 */
export function GhostHud({ hidden, inGame, state }: GhostHudProps): null | VNode<unknown> {
  if (hidden || !inGame || !state.enabled || !state.best) {
    return null;
  }
  return createElement('canvas', {
    id: 'ghost-overlay',
    ref: (element: EventTarget | null) => {
      state.overlayRef.current = element instanceof HTMLCanvasElement ? element : null;
    },
    style: { height: '100%', left: '0', pointerEvents: 'none', position: 'fixed', top: '0', width: '100%', zIndex: GHOST_Z_INDEX }
  });
}

/**
 * The menu's Race panel: the speedrun seed and the ghost.
 *
 * @param root0 - The props.
 * @param root0.state - The race's state.
 * @returns The panel.
 */
export function RaceMenu({ state }: RaceMenuProps): VNode<unknown> {
  const { best, enabled, forget, seed, toggle } = state;
  const [copied, setCopied] = useState('');
  function copyLink(): void {
    navigator.clipboard.writeText(location.href).then(() => {
      setCopied('Link copied');
    }, () => {
      setCopied('Copy failed: the address bar has the link');
    });
    setTimeout(() => {
      setCopied('');
    }, COPIED_MESSAGE_MILLISECONDS);
  }
  return createElement(
    'div',
    { id: 'race-menu', style: { marginTop: '8px' } },
    seed === null
      ? createElement('button', {
        class: 'orange',
        id: 'seed-new',
        onClick: () => {
          location.assign(urlWithSeed(location.href, createSeedText()));
        },
        title: 'Every Play on a seeded page starts on the same map, with the same bots and spawn point. Share the link to race on it.',
        type: 'button'
      }, 'Seeded map: off')
      : createElement(
        'span',
        null,
        'Seed ',
        createElement('code', { id: 'seed-text' }, seed),
        ' ',
        createElement('button', { class: 'green', id: 'seed-copy', onClick: copyLink, title: 'Copy this page\'s link, seed included.', type: 'button' }, 'Copy link'),
        ' ',
        createElement('button', {
          class: 'orange',
          id: 'seed-renew',
          onClick: () => {
            location.assign(urlWithSeed(location.href, createSeedText()));
          },
          title: 'A new map.',
          type: 'button'
        }, 'New seed'),
        ' ',
        createElement('button', {
          class: 'orange',
          id: 'seed-off',
          onClick: () => {
            location.assign(urlWithSeed(location.href, null));
          },
          title: 'Back to a different map every time.',
          type: 'button'
        }, 'Off')
      ),
    copied && createElement('div', null, copied),
    createElement(
      'div',
      { style: { marginTop: '6px' } },
      createElement('button', {
        'aria-pressed': enabled,
        'class': enabled ? 'green' : 'orange',
        'id': 'ghost-toggle',
        'onClick': toggle,
        'title': 'Race the best run on this map as a translucent ghost: yours or the demo pilot\'s, whichever took more. Never recorded. H shows or hides it.',
        'type': 'button'
      }, `Ghost: ${enabled ? 'on' : 'off'} (H)`),
      ' ',
      createElement('span', { id: 'ghost-best' }, best ? `Best: ${formatPercent(best.best)} by ${best.pilot}` : 'No run on this map yet'),
      best && ' ',
      best && createElement('button', { class: 'orange', id: 'ghost-forget', onClick: forget, title: 'Forget the best run on this map.', type: 'button' }, 'Forget')
    )
  );
}

/**
 * The ghost race for the App: the switch, the best run on this page's seed, a recorder on every run that is not
 * practice, and the ghost drawn after every frame.
 *
 * @param api - The game API.
 * @param route - The current route.
 * @param autopilot - The demo autopilot of the run on screen, or `null`, to tell who flew a run.
 * @returns The state.
 */
export function useGhostRace(api: GameApi | null, route: string, autopilot: Autopilot | null): GhostRaceState {
  const seed = api?.seed ?? null;
  const [enabled, setEnabled] = useState(readSwitch);
  const [best, setBest] = useState<GhostTrack | null>(() => readGhost(seed));
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const autopilotRef = useRef<Autopilot | null>(autopilot);
  autopilotRef.current = autopilot;
  const bestRef = useRef<GhostTrack | null>(best);
  bestRef.current = best;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  function toggle(): void {
    setEnabled((previous: boolean) => {
      writeStorage(GHOST_SWITCH_STORAGE_KEY, previous ? 'off' : 'on');
      return !previous;
    });
  }
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  function forget(): void {
    try {
      localStorage.removeItem(ghostStorageKey(seed));
    } catch {
      // A blocked storage held nothing to forget.
    }
    setBest(null);
  }

  useEffect(() => {
    if (route !== 'game' || !api) {
      return;
    }
    const { game } = api;
    const recorder = new GhostRecorder(seed);
    let practice = false;
    let demoSteered = false;
    let humanSteered = false;
    function onFrame(): void {
      const { player } = game;
      practice ||= game.practice !== null;
      if (player && game.units.includes(player)) {
        const elapsed = game.clock.now() - game.startTime;
        recorder.sample(elapsed, player.position.x, player.position.y, player.percent);
        if (autopilotRef.current?.engaged) {
          demoSteered = true;
        } else {
          humanSteered = true;
        }
        const canvas = overlayRef.current;
        const track = bestRef.current;
        if (canvas && track && enabledRef.current) {
          drawGhost(canvas, game, track, elapsed, player.percent);
        }
      } else {
        // During the death delay the race is over: the last frame's ghost goes.
        overlayRef.current?.getContext('2d')?.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
      }
    }
    game.frameObservers.push(onFrame);
    return (): void => {
      const index = game.frameObservers.indexOf(onFrame);
      if (index >= 0) {
        game.frameObservers.splice(index, 1);
      }
      const pilot = pilotLabel(autopilotRef.current, demoSteered, humanSteered);
      const track = practice ? null : recorder.finish(pilot, Date.now());
      if (track && isBetterRun(track, readGhost(seed))) {
        writeStorage(ghostStorageKey(seed), JSON.stringify(track));
        setBest(track);
      }
    };
  }, [route]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.repeat || event.target instanceof HTMLInputElement || event.code !== GHOST_KEY) {
        return;
      }
      toggleRef.current();
      event.preventDefault();
    }
    window.addEventListener('keydown', handleKeyDown, false);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown, false);
    };
  }, []);

  return { best, enabled, forget, overlayRef, seed, toggle };
}

function drawGhost(canvas: HTMLCanvasElement, game: Game, track: GhostTrack, elapsed: number, ownPercent: number): void {
  const { clientHeight, clientWidth } = canvas;
  if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
    canvas.width = clientWidth;
    canvas.height = clientHeight;
  }
  const context = canvas.getContext('2d');
  const origin = game.origin;
  if (!context || !origin) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  const pose = ghostAt(track, elapsed);
  if (!pose) {
    return;
  }
  const toScreen = worldToScreen(game, origin);
  const center = toScreen(pose);
  const radius = Math.max(GHOST_MIN_SCREEN_RADIUS, Math.abs(toScreen({ x: pose.x + GHOST_WORLD_RADIUS, y: pose.y }).x - center.x));
  const onScreen = center.x >= 0 && center.x <= canvas.width && center.y >= 0 && center.y <= canvas.height;
  context.globalAlpha = GHOST_ALPHA;
  if (onScreen && !pose.ended) {
    const tail = ghostPath(track, elapsed - GHOST_TAIL_MILLISECONDS, elapsed).map(toScreen);
    context.strokeStyle = '#ffffff';
    context.lineWidth = GHOST_TAIL_WIDTH;
    context.beginPath();
    tail.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    context.lineTo(center.x, center.y);
    context.stroke();
  }
  const shown = onScreen ? center : pinToEdge(center, canvas.width, canvas.height);
  context.fillStyle = pose.ended ? '#9a9a9a' : '#ffffff';
  context.beginPath();
  context.arc(shown.x, shown.y, onScreen ? radius : GHOST_MIN_SCREEN_RADIUS, 0, FULL_TURN);
  context.fill();
  context.globalAlpha = 1;
  const lead = pose.percent - ownPercent;
  const text = `Ghost ${formatPercent(pose.percent)}${pose.ended ? ' (ended)' : ''} · you ${lead > 0 ? 'behind' : 'ahead'} by ${formatPercent(Math.abs(lead))}`;
  drawLabel(context, text, shown.x, shown.y - (onScreen ? radius : GHOST_MIN_SCREEN_RADIUS) - LABEL_OFFSET, canvas.width);
}

function drawLabel(context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number): void {
  context.font = '12px "PT Sans Caption", sans-serif';
  const textWidth = context.measureText(text).width;
  const left = Math.min(Math.max(LABEL_PADDING, x - textWidth * HALF), width - textWidth - LABEL_PADDING);
  const baseline = Math.max(LABEL_HEIGHT + LABEL_PADDING, y);
  context.fillStyle = 'rgba(0, 0, 0, 0.55)';
  context.fillRect(left - LABEL_PADDING, baseline - LABEL_HEIGHT, textWidth + LABEL_PADDING + LABEL_PADDING, LABEL_HEIGHT + LABEL_PADDING);
  context.fillStyle = '#ffffff';
  context.fillText(text, left, baseline);
}

function formatPercent(share: number): string {
  return `${(share * PERCENT_SCALE).toFixed(PERCENT_DIGITS)}%`;
}

function pilotLabel(autopilot: Autopilot | null, demoSteered: boolean, humanSteered: boolean): string {
  const demo = autopilot ? `Demo (${autopilot.mode === 'whitebox' ? 'Whitebox' : 'Blackbox'})` : 'Demo';
  if (demoSteered && humanSteered) {
    return `You and ${demo}`;
  }
  return demoSteered ? demo : 'You';
}

/**
 * Pins a point outside the canvas to its edge, along the line from the centre, so an off-screen ghost shows its
 * direction.
 *
 * @param point - The point.
 * @param width - The canvas width.
 * @param height - The canvas height.
 * @returns The pinned point.
 */
function pinToEdge(point: GhostPoint, width: number, height: number): GhostPoint {
  const centerX = width * HALF;
  const centerY = height * HALF;
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  const scale = Math.min(Math.abs((centerX - EDGE_MARGIN) / (dx || 1)), Math.abs((centerY - EDGE_MARGIN) / (dy || 1)));
  return { x: centerX + dx * Math.min(1, scale), y: centerY + dy * Math.min(1, scale) };
}

function readGhost(seed: null | string): GhostTrack | null {
  try {
    return parseGhost(localStorage.getItem(ghostStorageKey(seed)));
  } catch {
    return null;
  }
}

function readSwitch(): boolean {
  try {
    return localStorage.getItem(GHOST_SWITCH_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A blocked or full storage only means the run is not kept.
  }
}
