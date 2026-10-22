/**
 * @file
 *
 * The page side of the demo autopilot: the menu's mode switch (Off / Whitebox / Blackbox), remembered in
 * `localStorage`; the autopilot attached to each run; the next round started by itself after the results; the O key that hands control back to it after a takeover; a small
 * readout beside the canvas (mode, game time, percent); and the optional debug overlay, drawn on a canvas of its own so
 * the in-game recorder, which records the game's canvas, never sees it. Everything on screen hides in recording mode.
 */

import type { VNode } from 'preact';

import { createElement } from 'preact';
import {
  useEffect,
  useRef,
  useState
} from 'preact/hooks';

import type { GameApi } from '../game-api.ts';
import type {
  Autopilot,
  AutopilotMode
} from './driver.ts';
import type { Point } from './plane.ts';

import { worldToScreen } from '../camera-map.ts';
import { AUTOPILOT_MODES } from './driver.ts';
import { FULL_TURN } from './plane.ts';
import { ShowcaseCamera } from './showcase.ts';

/** `KeyboardEvent.code` that hands control back to the autopilot, or takes it from it. */
export const AUTOPILOT_KEY = 'KeyO';
/** `KeyboardEvent.code` that shows or hides the debug overlay. */
export const AUTOPILOT_OVERLAY_KEY = 'KeyI';
/** Where the menu's mode is remembered. */
export const AUTOPILOT_STORAGE_KEY = 'paperio2.autopilot';
/** Where the overlay switch is remembered, `on` or `off`; it is off unless switched on. */
export const AUTOPILOT_OVERLAY_STORAGE_KEY = 'paperio2.autopilotOverlay';
/** `KeyboardEvent.code` that switches the demo's camera between the pilot and the leader. */
export const AUTOPILOT_VIEW_KEY = 'KeyL';
/** Where the showcase view is remembered, `on` (the camera follows the leader) or `off`; it is off unless switched on. */
export const AUTOPILOT_VIEW_STORAGE_KEY = 'paperio2.autopilotView';

const MODE_LABELS: Readonly<Record<AutopilotMode, string>> = { blackbox: 'Blackbox', off: 'Off', whitebox: 'Whitebox' };
const READOUT_INTERVAL_MILLISECONDS = 250;
/** How long the results of a demo round show before the next round starts by itself. */
const DEMO_RESTART_SECONDS = 5;
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_DIGITS = 2;
const PERCENT_SCALE = 100;
const PERCENT_DIGITS = 2;
const HUD_Z_INDEX = 1001;
const OVERLAY_Z_INDEX = 999;
const OVERLAY_LINE_WIDTH = 2;
const OVERLAY_POINT_RADIUS = 4;
/** The blackbox's view is drawn this many times its size, at the bottom left. */
const BLACKBOX_VIEW_SCALE = 1;
const BLACKBOX_VIEW_MARGIN = 12;
const BLACKBOX_VIEW_BOTTOM = 90;
const BLACKBOX_VIEW_ALPHA = 0.75;
/** Colors of the blackbox's pixel classes: floor, own, trail, foreign, outside, unknown. */
// eslint-disable-next-line no-magic-numbers -- a palette, one RGB triple per class.
const CLASS_COLORS: readonly (readonly [number, number, number])[] = [[230, 255, 240], [40, 160, 60], [150, 230, 160], [220, 40, 40], [40, 60, 200], [120, 120, 120]];
const RGBA_CHANNELS = 4;
const BLUE_CHANNEL = 2;
const OVERLAY_DASH = 8;
const LABEL_PADDING = 4;
const LABEL_HEIGHT = 14;
const OPAQUE = 255;
const READOUT_STYLE = {
  background: 'rgba(0, 0, 0, 0.35)',
  border: '2px solid rgba(255, 255, 255, 0.8)',
  borderRadius: '8px',
  bottom: '12px',
  color: '#ffffff',
  fontFamily: '"PT Sans Caption", sans-serif',
  fontSize: '14px',
  left: '50%',
  padding: '4px 10px',
  pointerEvents: 'none',
  position: 'fixed',
  transform: 'translateX(-50%)',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  zIndex: HUD_Z_INDEX
} as const;

export interface AutopilotHudProps {
  readonly api: GameApi | null;
  /** Whether recording mode hides the additions. */
  readonly hidden: boolean;
  readonly inGame: boolean;
  readonly state: AutopilotState;
}

export interface AutopilotMenuProps {
  readonly state: AutopilotState;
}

export interface AutopilotState {
  /** The autopilot of the run on screen, or `null`. */
  readonly autopilot: Autopilot | null;
  /** Moves the menu's mode on to the next one. */
  readonly cycleMode: () => void;
  readonly engaged: boolean;
  /** Whether the camera follows the unit with the most territory rather than the pilot (the showcase view). */
  readonly leaderView: boolean;
  readonly mode: AutopilotMode;
  /** Seconds until the demo's next round starts by itself, while the results screen shows; else `null`. */
  readonly nextRoundIn: null | number;
  readonly overlay: boolean;
  /** The showcase camera of the run on screen, or `null`. */
  readonly showcase: null | ShowcaseCamera;
  readonly toggleLeaderView: () => void;
  readonly toggleOverlay: () => void;
}

/**
 * The readout beside the canvas during a demo, and the debug overlay when it is on.
 *
 * @param root0 - The props.
 * @param root0.api - The game API.
 * @param root0.hidden - Whether recording mode hides them.
 * @param root0.inGame - Whether a run is on screen.
 * @param root0.state - The autopilot's state.
 * @returns The readout and overlay, or nothing.
 */
export function AutopilotHud({ api, hidden, inGame, state }: AutopilotHudProps): null | VNode<unknown> {
  const [readout, setReadout] = useState('');
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const { autopilot, engaged, mode, overlay, showcase } = state;
  useEffect(() => {
    if (!autopilot || !inGame) {
      return;
    }
    const game = autopilot.game;
    function update(): void {
      const player = game.player;
      const seconds = Math.max(0, Math.floor((game.clock.now() - game.startTime) / MILLISECONDS_PER_SECOND));
      const time = `${String(Math.floor(seconds / SECONDS_PER_MINUTE))}:${String(seconds % SECONDS_PER_MINUTE).padStart(SECONDS_DIGITS, '0')}`;
      const percent = player ? `${(player.percent * PERCENT_SCALE).toFixed(PERCENT_DIGITS)}%` : '-';
      const leader = showcase?.leader;
      const watching = leader && leader !== player ? ` · watching ${leader.name} ${(leader.percent * PERCENT_SCALE).toFixed(PERCENT_DIGITS)}%` : '';
      setReadout(`${time} · ${percent}${watching}`);
    }
    update();
    const intervalId = setInterval(update, READOUT_INTERVAL_MILLISECONDS);
    return (): void => {
      clearInterval(intervalId);
    };
  }, [autopilot, inGame, showcase]);
  useEffect(() => {
    if (!autopilot) {
      return;
    }
    autopilot.coach = overlay;
    autopilot.onFrame = (): void => {
      const canvas = overlayRef.current;
      if (canvas) {
        drawOverlay(canvas, autopilot);
      }
    };
    return (): void => {
      autopilot.onFrame = null;
      autopilot.coach = false;
    };
  }, [autopilot, overlay]);
  if (hidden) {
    return null;
  }
  if (!inGame) {
    return state.nextRoundIn === null
      ? null
      : createElement('div', {
        id: 'autopilot-readout',
        style: READOUT_STYLE
      }, `Demo: ${MODE_LABELS[mode]} · next round in ${String(state.nextRoundIn)} s · Continue stops it`);
  }
  if (!autopilot || !api) {
    return null;
  }
  return createElement(
    'div',
    null,
    overlay && createElement('canvas', {
      id: 'autopilot-overlay',
      ref: (element: EventTarget | null) => {
        overlayRef.current = element instanceof HTMLCanvasElement ? element : null;
      },
      style: { height: '100%', left: '0', pointerEvents: 'none', position: 'fixed', top: '0', width: '100%', zIndex: OVERLAY_Z_INDEX }
    }),
    createElement('div', {
      id: 'autopilot-readout',
      style: READOUT_STYLE
    }, `Demo: ${MODE_LABELS[mode]}${engaged ? '' : ' (you steer, O hands back)'} · ${readout}`)
  );
}

/**
 * The menu's Demo switch and its overlay switch.
 *
 * @param root0 - The props.
 * @param root0.state - The autopilot's state.
 * @returns The buttons.
 */
export function AutopilotMenu({ state }: AutopilotMenuProps): VNode<unknown> {
  const { cycleMode, leaderView, mode, overlay, toggleLeaderView, toggleOverlay } = state;
  return createElement(
    'div',
    {
      id: 'autopilot-menu',
      style: { marginTop: '8px' }
    },
    createElement('button', {
      'aria-pressed': mode !== 'off',
      'class': mode === 'off' ? 'orange' : 'green',
      'id': 'autopilot-toggle',
      'onClick': cycleMode,
      'title': 'An autopilot that tries to win as fast as it can, round after round: Whitebox reads the engine, Blackbox sees only the screen. A steering key, a touch or a click on the game takes over; O hands back.',
      'type': 'button'
    }, `Demo: ${MODE_LABELS[mode]}`),
    mode !== 'off' && ' ',
    mode !== 'off' && createElement('button', {
      'aria-pressed': overlay,
      'class': overlay ? 'green' : 'orange',
      'id': 'autopilot-overlay-toggle',
      'onClick': toggleOverlay,
      'title': 'Draw what the autopilot plans and sees. Never recorded. I turns it on and off.',
      'type': 'button'
    }, `Overlay: ${overlay ? 'on' : 'off'} (I)`),
    mode !== 'off' && ' ',
    mode !== 'off' && createElement('button', {
      'aria-pressed': leaderView,
      'class': leaderView ? 'green' : 'orange',
      'id': 'autopilot-view-toggle',
      'onClick': toggleLeaderView,
      'title': 'Showcase: the camera follows whoever holds the most territory, the pilot or a bot. It goes back to the pilot while you steer. L switches it.',
      'type': 'button'
    }, `View: ${leaderView ? 'leader' : 'pilot'} (L)`)
  );
}

export function readAutopilotMode(): AutopilotMode {
  try {
    const stored = localStorage.getItem(AUTOPILOT_STORAGE_KEY);
    return AUTOPILOT_MODES.find((mode) => mode === stored) ?? 'off';
  } catch {
    return 'off';
  }
}

/**
 * The autopilot for the App: the menu's mode, an autopilot attached to every run while the mode is on, the next round
 * started by itself from the results screen, and the O and I keys.
 *
 * @param api - The game API.
 * @param route - The current route.
 * @param restart - Starts the next round, as the results screen's Play does.
 * @returns The state.
 */
export function useAutopilot(api: GameApi | null, route: string, restart: () => void): AutopilotState {
  const [mode, setMode] = useState<AutopilotMode>(readAutopilotMode);
  const [overlay, setOverlay] = useState(() => readStoredSwitch(AUTOPILOT_OVERLAY_STORAGE_KEY));
  const [leaderView, setLeaderView] = useState(() => readStoredSwitch(AUTOPILOT_VIEW_STORAGE_KEY));
  const [showcase, setShowcase] = useState<null | ShowcaseCamera>(null);
  const [autopilot, setAutopilot] = useState<Autopilot | null>(null);
  const [engaged, setEngaged] = useState(true);
  const [nextRoundIn, setNextRoundIn] = useState<null | number>(null);
  const autopilotRef = useRef<Autopilot | null>(null);
  autopilotRef.current = autopilot;
  const restartRef = useRef(restart);
  restartRef.current = restart;

  function cycleMode(): void {
    const next = AUTOPILOT_MODES[(AUTOPILOT_MODES.indexOf(mode) + 1) % AUTOPILOT_MODES.length] ?? 'off';
    writeStored(AUTOPILOT_STORAGE_KEY, next);
    setMode(next);
  }

  function toggleOverlay(): void {
    setOverlay((previous: boolean) => {
      writeStored(AUTOPILOT_OVERLAY_STORAGE_KEY, previous ? 'off' : 'on');
      return !previous;
    });
  }

  function toggleLeaderView(): void {
    setLeaderView((previous: boolean) => {
      writeStored(AUTOPILOT_VIEW_STORAGE_KEY, previous ? 'off' : 'on');
      return !previous;
    });
  }

  const toggleOverlayRef = useRef(toggleOverlay);
  toggleOverlayRef.current = toggleOverlay;
  const toggleLeaderViewRef = useRef(toggleLeaderView);
  toggleLeaderViewRef.current = toggleLeaderView;

  useEffect(() => {
    if (!autopilot || !leaderView) {
      return;
    }
    const camera = new ShowcaseCamera(autopilot.game, () => autopilot.engaged);
    camera.attach();
    setShowcase(camera);
    return (): void => {
      camera.detach();
      setShowcase(null);
    };
  }, [autopilot, leaderView]);

  useEffect(() => {
    // The game is created when the canvas mounts and the run starts on the game route, so the autopilot attaches then.
    if (route !== 'game' || mode === 'off' || !api) {
      return;
    }
    const attached = api.attachAutopilot(mode);
    attached.onEngagedChange = setEngaged;
    setEngaged(true);
    setAutopilot(attached);
    return (): void => {
      attached.detach();
      setAutopilot(null);
    };
  }, [route, mode]);

  useEffect(() => {
    // A demo plays on by itself: after a death or a win the results show for a moment, then the next round starts.
    // Leaving the results screen (Continue) cancels it.
    if (route !== 'results' || mode === 'off') {
      return;
    }
    let secondsLeft = DEMO_RESTART_SECONDS;
    setNextRoundIn(secondsLeft);
    const intervalId = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) {
        setNextRoundIn(secondsLeft);
        return;
      }
      clearInterval(intervalId);
      setNextRoundIn(null);
      restartRef.current();
    }, MILLISECONDS_PER_SECOND);
    return (): void => {
      clearInterval(intervalId);
      setNextRoundIn(null);
    };
  }, [route, mode]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.repeat || event.target instanceof HTMLInputElement) {
        return;
      }
      if (event.code === AUTOPILOT_KEY && autopilotRef.current) {
        const current = autopilotRef.current;
        if (current.engaged) {
          current.disengage();
        } else {
          current.engage();
        }
      } else if (event.code === AUTOPILOT_OVERLAY_KEY && autopilotRef.current) {
        toggleOverlayRef.current();
      } else if (event.code === AUTOPILOT_VIEW_KEY && autopilotRef.current) {
        toggleLeaderViewRef.current();
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

  return { autopilot, cycleMode, engaged, leaderView, mode, nextRoundIn, overlay, showcase, toggleLeaderView, toggleOverlay };
}

function drawBlackboxView(context: CanvasRenderingContext2D, autopilot: Autopilot, height: number): void {
  const debug = autopilot.blackbox?.debug;
  if (!debug?.classes) {
    return;
  }
  const image = context.createImageData(debug.width, debug.height);
  debug.classes.forEach((pixelClass: number, index: number) => {
    const [red, green, blue] = CLASS_COLORS[pixelClass] ?? [0, 0, 0];
    image.data[index * RGBA_CHANNELS] = red;
    image.data[index * RGBA_CHANNELS + 1] = green;
    image.data[index * RGBA_CHANNELS + BLUE_CHANNEL] = blue;
    image.data[index * RGBA_CHANNELS + RGBA_CHANNELS - 1] = OPAQUE;
  });
  const top = height - BLACKBOX_VIEW_BOTTOM - debug.height * BLACKBOX_VIEW_SCALE;
  context.globalAlpha = BLACKBOX_VIEW_ALPHA;
  context.putImageData(image, BLACKBOX_VIEW_MARGIN, top);
  context.globalAlpha = 1;
  context.strokeStyle = '#ffffff';
  context.strokeRect(BLACKBOX_VIEW_MARGIN, top, debug.width, debug.height);
  drawLabel(context, `blackbox: ${debug.phase}`, BLACKBOX_VIEW_MARGIN, top - OVERLAY_POINT_RADIUS);
  if (debug.threat) {
    context.strokeStyle = '#ff0000';
    context.beginPath();
    context.arc(BLACKBOX_VIEW_MARGIN + debug.threat.x, top + debug.threat.y, OVERLAY_POINT_RADIUS, 0, FULL_TURN);
    context.stroke();
  }
}

/**
 * Writes a line of the overlay on a dark band, so it reads over the light floor and over territory alike.
 *
 * @param context - The overlay's context.
 * @param text - The text.
 * @param x - Its left edge.
 * @param y - Its baseline.
 */
function drawLabel(context: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  context.font = '12px "PT Sans Caption", sans-serif';
  const width = context.measureText(text).width;
  context.fillStyle = 'rgba(0, 0, 0, 0.55)';
  context.fillRect(x - LABEL_PADDING, y - LABEL_HEIGHT, width + LABEL_PADDING + LABEL_PADDING, LABEL_HEIGHT + LABEL_PADDING);
  context.fillStyle = '#ffffff';
  context.fillText(text, x, y);
}

/**
 * Draws the debug overlay: the whitebox's planned loop, target and nearest threat over the game, or the blackbox's
 * classified view in a corner.
 *
 * @param canvas - The overlay canvas.
 * @param autopilot - The autopilot.
 */
function drawOverlay(canvas: HTMLCanvasElement, autopilot: Autopilot): void {
  const { clientHeight, clientWidth } = canvas;
  if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
    canvas.width = clientWidth;
    canvas.height = clientHeight;
  }
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = OVERLAY_LINE_WIDTH;
  if (autopilot.blackbox) {
    drawBlackboxView(context, autopilot, canvas.height);
    return;
  }
  const debug = autopilot.whitebox?.debug;
  const player = autopilot.game.player;
  if (!debug || !player) {
    return;
  }
  const toScreen = worldToScreen(autopilot.game, autopilot.game.origin ?? player.position);
  if (debug.loop) {
    context.strokeStyle = '#ffffff';
    context.setLineDash([OVERLAY_DASH, OVERLAY_POINT_RADIUS]);
    context.beginPath();
    debug.loop.forEach((point: Point, index: number) => {
      const { x, y } = toScreen(point);
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();
    context.setLineDash([]);
  }
  if (debug.target) {
    const { x, y } = toScreen(debug.target);
    context.fillStyle = '#ffff00';
    context.beginPath();
    context.arc(x, y, OVERLAY_POINT_RADIUS, 0, FULL_TURN);
    context.fill();
  }
  if (debug.threat) {
    const { x, y } = toScreen(debug.threat.position);
    const radius = Math.abs(toScreen({ x: debug.threat.position.x + debug.threat.distance, y: debug.threat.position.y }).x - x);
    context.strokeStyle = '#ff3030';
    context.beginPath();
    context.arc(x, y, radius, 0, FULL_TURN);
    context.stroke();
  }
  drawLabel(context, `whitebox${autopilot.engaged ? '' : ' (suggesting)'}: ${debug.phase}${debug.threat ? `, ${debug.threat.state} at ${debug.threat.distance.toFixed(0)}` : ''}`, BLACKBOX_VIEW_MARGIN, canvas.height - BLACKBOX_VIEW_BOTTOM);
}

function readStoredSwitch(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'on';
  } catch {
    return false;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A blocked storage only means the choice is not remembered.
  }
}
