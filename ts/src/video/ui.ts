/**
 * @file
 *
 * The in-game recorder's page side: the V key and the record button during a run, **Record every game**, and the
 * menu's Recordings list (play, download, keep, delete, the frame-size settings and the storage left). None of it is on
 * the canvas, so none of it is in a take.
 */

import type { VNode } from 'preact';

import {
  createElement,
  Fragment
} from 'preact';
import {
  useEffect,
  useRef,
  useState
} from 'preact/hooks';

import type { GameApi } from '../game-api.ts';
import type { ExportRecordingOptions } from './export.ts';
import type {
  CodecChoice,
  StopReason,
  VideoAudioSetting,
  VideoFpsSetting,
  VideoHeightSetting,
  VideoSettings
} from './recorder.ts';
import type { RecordingRecord } from './store.ts';

import { ExportCache } from './export-cache.ts';
import { exportRecording } from './export.ts';
import {
  findCodec,
  outputSize,
  readVideoSettings,
  VIDEO_AUDIO_OPTIONS,
  VIDEO_FPS_OPTIONS,
  VIDEO_HEIGHT_OPTIONS,
  VideoRecorder,
  writeVideoSettings
} from './recorder.ts';
import {
  AUTO_TAKES_KEPT,
  autoTakesToPrune,
  isTooShortAutoTake
} from './retention.ts';
import {
  deleteRecording,
  listRecordings,
  putRecording,
  recoverUnfinished
} from './store.ts';

/** `KeyboardEvent.code` of the start/stop key. The engine steers on arrows and W/A/S/D; the app uses Z X K P J Esc. */
export const VIDEO_KEY = 'KeyV';
/** How long a button waits for its confirming second click. */
export const CONFIRM_MILLISECONDS = 3000;
const TICK_MILLISECONDS = 500;
const HUD_Z_INDEX = 1001;
const BYTES_PER_MEGABYTE = 1_048_576;
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const TIME_PART_DIGITS = 2;
const SUPPORT_PROBE_WIDTH = 1280;
const SUPPORT_PROBE_HEIGHT = 720;
const SUPPORT_PROBE_FPS = 30;

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
const SMALL_BUTTON_STYLE = {
  fontSize: '14px',
  margin: '0',
  padding: '4px 10px'
};

const AUDIO_LABELS: Readonly<Record<VideoAudioSetting, string>> = {
  all: 'Effects and music',
  effects: 'Effects only',
  music: 'Music only',
  none: 'None'
};

const exportedFiles = new ExportCache();

export interface RecordControlProps {
  /** Whether a run is on screen; the control shows only then. */
  readonly inGame: boolean;
  readonly state: VideoRecordingState;
}

export interface RecordingsPanelProps {
  readonly state: VideoRecordingState;
}

export interface VideoRecordingState {
  readonly active: null | VideoRecorder;
  readonly discard: () => void;
  readonly estimate: null | StorageEstimate;
  readonly message: string;
  readonly recordings: readonly RecordingRecord[];
  /** Deletes takes; resolves once they are gone and the list is read again. */
  readonly remove: (ids: readonly string[]) => Promise<void>;
  /** Marks takes Keep, or takes the mark off, then prunes the automatic takes past the newest few. */
  readonly setKeep: (ids: readonly string[], keep: boolean) => Promise<void>;
  readonly setSettings: (settings: VideoSettings) => void;
  readonly settings: VideoSettings;
  readonly startOrStop: () => void;
  /** Why this browser cannot record, `''` while that is being checked, or `null` when it can. */
  readonly unsupported: null | string;
}

/**
 * Hands a file to the browser's download.
 *
 * @param blob - The file.
 * @param fileName - Its name.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
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

/**
 * The download's audio for a Sound setting.
 *
 * @param setting - The setting.
 * @returns Whether the effects and the music go in.
 */
export function exportAudio(setting: VideoAudioSetting): ExportRecordingOptions {
  return { effects: setting === 'all' || setting === 'effects', music: setting === 'all' || setting === 'music' };
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / MILLISECONDS_PER_SECOND));
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const tail = String(seconds).padStart(TIME_PART_DIGITS, '0');
  return hours > 0 ? `${String(hours)}:${String(minutes).padStart(TIME_PART_DIGITS, '0')}:${tail}` : `${String(minutes)}:${tail}`;
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`;
}

/**
 * The record button during a run, beside the pause button: Rec (V) to start; while recording, the length, Stop and
 * Discard (a second click confirms). Like the pause button, none of it takes focus.
 *
 * @param root0 - The props.
 * @param root0.inGame - Whether a run is on screen.
 * @param root0.state - The recorder's state.
 * @returns The control.
 */
export function RecordControl({ inGame, state }: RecordControlProps): null | VNode<unknown> {
  const { active, discard, message, startOrStop, unsupported } = state;
  const [, setTick] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setTick((tick: number) => tick + 1);
    }, TICK_MILLISECONDS);
    return (): void => {
      window.clearInterval(timer);
    };
  }, [active]);
  useEffect(() => {
    if (!confirmDiscard) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setConfirmDiscard(false);
    }, CONFIRM_MILLISECONDS);
    return (): void => {
      window.clearTimeout(timer);
    };
  }, [confirmDiscard]);
  if (!inGame || unsupported !== null) {
    return null;
  }
  function button(id: string, label: string, title: string, action: () => void): VNode<unknown> {
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
      style: HUD_BUTTON_STYLE,
      tabIndex: -1,
      title,
      type: 'button'
    }, label);
  }
  return createElement(
    'div',
    {
      id: 'video-hud',
      onMouseDown: keepFocusOnBody,
      onPointerDown: keepFocusOnBody,
      style: {
        alignItems: 'center',
        color: '#ffffff',
        display: 'flex',
        flexWrap: 'wrap',
        fontFamily: '"PT Sans Caption", sans-serif',
        fontSize: '14px',
        gap: '6px',
        left: 'calc(50% + 32px)',
        maxWidth: 'calc(50% - 40px)',
        position: 'fixed',
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
        top: '18px',
        userSelect: 'none',
        zIndex: HUD_Z_INDEX
      }
    },
    active
      ? createElement(
        Fragment,
        null,
        createElement('span', {
          'aria-live': 'polite',
          'id': 'video-indicator',
          'style': { background: 'rgba(0, 0, 0, 0.55)', borderRadius: '8px', color: '#ff5050', fontWeight: 'bold', padding: '6px 8px', textShadow: 'none' }
        }, `● ${formatDuration(active.durationMilliseconds)}`),
        button('video-stop', '■ Stop', 'Stop recording and keep it (V)', startOrStop),
        button('video-discard', confirmDiscard ? 'Discard? Click again' : 'Discard', 'Throw this recording away', () => {
          if (confirmDiscard) {
            setConfirmDiscard(false);
            discard();
          } else {
            setConfirmDiscard(true);
          }
        })
      )
      : button('video-start', '● Rec (V)', 'Record the game, without its failed practice attempts (V)', startOrStop),
    message && createElement('span', { id: 'video-message' }, message)
  );
}

/**
 * A recording as an MP4 file with the sound the Sound setting picks, exported once and then served from a cache.
 *
 * @param record - The recording.
 * @param audio - The Sound setting.
 * @returns The file.
 */
export async function recordingFile(record: RecordingRecord, audio: VideoAudioSetting): Promise<Blob> {
  return exportedFiles.get(record.id, audio, async () => exportRecording(record, exportAudio(audio)));
}

/**
 * The menu's Recordings settings: the size, frame rate and sound of a take, **Record every game**, and the recorder's
 * messages. The runs themselves, each with its video and its stats log, are listed below it by `runs/ui.ts`.
 *
 * @param root0 - The props.
 * @param root0.state - The recorder's state.
 * @returns The panel.
 */
export function RecordingsPanel({ state }: RecordingsPanelProps): VNode<unknown> {
  const { message, setSettings, settings, unsupported } = state;
  function select(id: string, value: string, options: readonly (readonly [string, string])[], onChange: (value: string) => void): VNode<unknown> {
    return createElement('select', {
      id,
      onChange: (event: Event) => {
        if (event.currentTarget instanceof HTMLSelectElement) {
          onChange(event.currentTarget.value);
        }
      },
      style: { fontSize: '14px', margin: '0 4px' },
      value
    }, options.map(([optionValue, label]: readonly [string, string]) => createElement('option', { key: optionValue, value: optionValue }, label)));
  }

  return createElement(
    'div',
    {
      id: 'recordings',
      style: { marginTop: '12px' }
    },
    createElement('p', { style: { margin: '8px 0 4px' } }, 'Recordings (V during a run)'),
    unsupported
      ? createElement('p', { id: 'recordings-unsupported' }, unsupported)
      : createElement(
        'div',
        { id: 'recordings-settings' },
        'Size',
        select('video-height', settings.height, VIDEO_HEIGHT_OPTIONS.map((option: VideoHeightSetting) => [option, option === 'canvas' ? 'Canvas size' : `${option}p`] as const), (value: string) => {
          setSettings({ ...settings, height: VIDEO_HEIGHT_OPTIONS.find((option: VideoHeightSetting) => option === value) ?? settings.height });
        }),
        'Frame rate',
        select('video-fps', settings.fps, VIDEO_FPS_OPTIONS.map((option: VideoFpsSetting) => [option, `${option} fps`] as const), (value: string) => {
          setSettings({ ...settings, fps: VIDEO_FPS_OPTIONS.find((option: VideoFpsSetting) => option === value) ?? settings.fps });
        }),
        'Sound',
        select('video-audio', settings.audio, VIDEO_AUDIO_OPTIONS.map((option: VideoAudioSetting) => [option, AUDIO_LABELS[option]] as const), (value: string) => {
          setSettings({ ...settings, audio: VIDEO_AUDIO_OPTIONS.find((option: VideoAudioSetting) => option === value) ?? settings.audio });
        }),
        createElement(
          'div',
          { style: { marginTop: '6px' } },
          createElement('button', {
            'aria-pressed': settings.recordEvery,
            'class': settings.recordEvery ? 'green' : 'orange',
            'id': 'video-record-every',
            'onClick': () => {
              setSettings({ ...settings, recordEvery: !settings.recordEvery });
            },
            'style': SMALL_BUTTON_STYLE,
            'title': `Record each run from its first frame, so V is never forgotten. Takes under 10 s are dropped, and only the newest ${String(AUTO_TAKES_KEPT)} not marked Keep stay.`,
            'type': 'button'
          }, `Record every game: ${settings.recordEvery ? 'on' : 'off'}`)
        )
      ),
    message && createElement('p', { id: 'recordings-message' }, message)
  );
}

/**
 * The recorder's state for the App: the running take, the stored ones, the settings, and the V key. A take stops by
 * itself when the run ends (the route leaves `game`) or the storage runs low.
 *
 * @param api - The game API.
 * @param route - The current route.
 * @param runId - The current run's id (`runs/run-id.ts`), which each take records.
 * @returns The state and its actions.
 */
export function useVideoRecording(api: GameApi | null, route: string, runId: null | string): VideoRecordingState {
  const [active, setActive] = useState<null | VideoRecorder>(null);
  const [recordings, setRecordings] = useState<readonly RecordingRecord[]>([]);
  const [estimate, setEstimate] = useState<null | StorageEstimate>(null);
  const [message, setMessage] = useState('');
  const [settings, setSettingsState] = useState(readVideoSettings);
  // WebCodecs and the storage estimate exist only on a secure page; elsewhere (an http host, and the differential test's
  // Page) the recorder does nothing at all.
  const [unsupported, setUnsupported] = useState<null | string>(() => window.isSecureContext ? '' : 'Recording needs a secure page: https, or localhost.');
  const activeRef = useRef<null | VideoRecorder>(null);
  const startingRef = useRef(false);
  const routeRef = useRef(route);
  routeRef.current = route;
  const runIdRef = useRef<null | string>(runId);
  runIdRef.current = runId;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  function refresh(): void {
    if (typeof indexedDB === 'undefined') {
      return;
    }
    listRecordings().then((records: RecordingRecord[]) => {
      setRecordings(records);
    }, (error: unknown) => {
      setMessage(`The recordings could not be read: ${errorText(error)}`);
    });
    if (!window.isSecureContext) {
      return;
    }
    navigator.storage.estimate().then(setEstimate, () => {
      setEstimate(null);
    });
  }

  function finish(recorder: VideoRecorder, reason: StopReason, note = ''): void {
    if (activeRef.current === recorder) {
      activeRef.current = null;
      setActive(null);
    }
    recorder.stop(reason).then(async (record: null | RecordingRecord) => {
      if (record && isTooShortAutoTake(record)) {
        await deleteRecording(record.id);
        setMessage(note);
        return;
      }
      setMessage(note || (record ? `Recorded ${formatDuration(record.durationMilliseconds)} (${formatMegabytes(record.bytes)}); it is in the menu's Recordings` : 'Nothing was recorded'));
      if (record?.auto === true) {
        await pruneAutoTakes();
      }
    }, (error: unknown) => {
      setMessage(`The recording could not be finished: ${errorText(error)}`);
    }).catch((error: unknown) => {
      setMessage(`The old automatic recordings could not be pruned: ${errorText(error)}`);
    }).finally(refresh);
  }

  async function pruneAutoTakes(): Promise<void> {
    for (const id of autoTakesToPrune(await listRecordings())) {
      exportedFiles.forget(id);
      await deleteRecording(id);
    }
  }

  function start(auto = false): void {
    const game = api?.game;
    if (!game || activeRef.current || startingRef.current || unsupported !== null) {
      return;
    }
    startingRef.current = true;
    const { fps, height } = settingsRef.current;
    const size = outputSize(game.view.width, game.view.height, height);
    findCodec(size.width, size.height, Number(fps)).then((choice: CodecChoice | null) => {
      if (!choice) {
        throw new Error(`this browser cannot encode ${String(size.width)}x${String(size.height)} video`);
      }
      if (routeRef.current !== 'game') {
        return;
      }
      const recorder = VideoRecorder.start(
        game,
        choice,
        settingsRef.current,
        {
          onAutoStop: (reason: StopReason, text: string) => {
            finish(recorder, reason, text);
          }
        },
        auto,
        runIdRef.current
      );
      activeRef.current = recorder;
      setActive(recorder);
      setMessage('');
    }).catch((error: unknown) => {
      setMessage(`The recording could not start: ${errorText(error)}`);
    }).finally(() => {
      startingRef.current = false;
    });
  }

  function startOrStop(): void {
    const recorder = activeRef.current;
    if (recorder) {
      finish(recorder, 'user');
    } else {
      start();
    }
  }

  function discard(): void {
    const recorder = activeRef.current;
    if (!recorder) {
      return;
    }
    activeRef.current = null;
    setActive(null);
    recorder.discard().then(() => {
      setMessage('The recording was discarded');
      refresh();
    }, (error: unknown) => {
      setMessage(`The recording could not be discarded: ${errorText(error)}`);
    });
  }

  async function remove(ids: readonly string[]): Promise<void> {
    try {
      for (const id of ids) {
        exportedFiles.forget(id);
        await deleteRecording(id);
      }
    } catch (error) {
      setMessage(`The recording could not be deleted: ${errorText(error)}`);
    }
    refresh();
  }

  async function setKeep(ids: readonly string[], keep: boolean): Promise<void> {
    try {
      for (const record of recordings) {
        if (ids.includes(record.id) && (record.keep === true) !== keep) {
          await putRecording({ ...record, keep });
        }
      }
      // Taking a Keep off can put an old take past the newest few.
      await pruneAutoTakes();
    } catch (error) {
      setMessage(`The recording could not be changed: ${errorText(error)}`);
    }
    refresh();
  }

  function setSettings(nextSettings: VideoSettings): void {
    writeVideoSettings(nextSettings);
    setSettingsState(nextSettings);
  }

  const startOrStopRef = useRef(startOrStop);
  startOrStopRef.current = startOrStop;

  useEffect(() => {
    if (!window.isSecureContext) {
      // Takes are only recorded on a secure page, but the list still shows the runs' stats logs beside them.
      refresh();
      return undefined;
    }
    findCodec(SUPPORT_PROBE_WIDTH, SUPPORT_PROBE_HEIGHT, SUPPORT_PROBE_FPS).then((choice: CodecChoice | null) => {
      setUnsupported(choice ? null : 'This browser has no WebCodecs video encoder for H.264, VP9 or AV1, so it cannot record.');
    }, () => {
      setUnsupported('This browser cannot record.');
    });
    recoverUnfinished().then((recovered: number) => {
      if (recovered > 0) {
        setMessage(`${String(recovered)} unfinished recording(s) recovered`);
      }
    }, noopError).finally(refresh);
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.code !== VIDEO_KEY || event.repeat || event.target instanceof HTMLInputElement || routeRef.current !== 'game') {
        return;
      }
      event.preventDefault();
      startOrStopRef.current();
    }
    window.addEventListener('keydown', handleKeyDown, false);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown, false);
    };
  }, []);

  useEffect(() => {
    const recorder = activeRef.current;
    if (route !== 'game' && recorder) {
      finish(recorder, 'game-ended');
    }
    if (route === 'game' && settingsRef.current.recordEvery) {
      // Record every game: the run starts in the same commit, so the take's first frame is the run's first.
      start(true);
    }
  }, [route]);

  return { active, discard, estimate, message, recordings, remove, setKeep, setSettings, settings, startOrStop, unsupported };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function keepFocusOnBody(event: Event): void {
  event.preventDefault();
}

function noopError(): void {
  // Recovery is best effort: a failure leaves the takes as they were.
}
