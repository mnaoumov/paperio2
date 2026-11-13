/**
 * @file
 *
 * The menu's list of runs: one row per run with its recording (when one was taken) and its stats log, played,
 * downloaded, kept and deleted together, and a **Delete all** that spares the runs marked Keep. The row wraps its buttons
 * onto a line of their own rather than squeezing the run's start, at every width the menu can have.
 */

import type { VNode } from 'preact';

import { createElement } from 'preact';
import {
  useEffect,
  useState
} from 'preact/hooks';

import type { StatsGameRecord } from '../stats/store.ts';
import type { StatsLogState } from '../stats/ui.ts';
import type { RecordingRecord } from '../video/store.ts';
import type { VideoRecordingState } from '../video/ui.ts';
import type { RunGroup } from './group.ts';

import { noop } from '../shared/noop.ts';
import {
  KEPT_STATS_GAMES,
  statsFileName
} from '../stats/store.ts';
import { recordingFileName } from '../video/export.ts';
import { AUTO_TAKES_KEPT } from '../video/retention.ts';
import {
  formatStartLabel,
  formatStartTooltip
} from '../video/start-label.ts';
import {
  CONFIRM_MILLISECONDS,
  downloadBlob,
  formatDuration,
  formatMegabytes,
  recordingFile
} from '../video/ui.ts';
import {
  groupRuns,
  isKeptRun,
  isRecordingRun,
  runsToDeleteAll
} from './group.ts';

export interface RunsListProps {
  readonly stats: StatsLogState;
  readonly video: VideoRecordingState;
}

const BYTES_PER_MEGABYTE = 1_048_576;
const MILLISECONDS_PER_SECOND = 1000;
/** Warn under the list once less than this is free. */
const LOW_STORAGE_MEGABYTES = 1000;
const LOW_STORAGE_BYTES = LOW_STORAGE_MEGABYTES * BYTES_PER_MEGABYTE;
const PERCENT_DIGITS = 2;
const PREVIEW_Z_INDEX = 1500;
const THUMBNAIL_WIDTH = 80;
const THUMBNAIL_HEIGHT = 45;
const DELETE_ALL = 'all';
const OUTCOME_LABELS: Readonly<Record<StatsGameRecord['outcome'], string>> = { death: 'died', quit: 'left', win: 'won' };

const ROW_STYLE = {
  alignItems: 'center',
  background: 'rgba(0, 0, 0, 0.25)',
  borderRadius: '6px',
  display: 'flex',
  // The buttons move onto a line of their own when the run's text would otherwise be squeezed.
  flexWrap: 'wrap',
  gap: '4px 8px',
  margin: '4px 0',
  padding: '4px 8px',
  textAlign: 'left'
};
const THUMBNAIL_STYLE = {
  background: 'rgba(255, 255, 255, 0.08)',
  borderRadius: '4px',
  flexShrink: '0',
  height: `${String(THUMBNAIL_HEIGHT)}px`,
  objectFit: 'cover',
  width: `${String(THUMBNAIL_WIDTH)}px`
};
const INFO_STYLE = {
  display: 'flex',
  flex: '1 1 9em',
  flexDirection: 'column',
  // Never narrower than the run's start on one line, so it cannot wrap letter by letter.
  minWidth: 'min-content'
};
const DETAIL_STYLE = { fontSize: '13px', opacity: '0.85' };
const ACTIONS_STYLE = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
  justifyContent: 'flex-end',
  marginLeft: 'auto'
};
const SMALL_BUTTON_STYLE = {
  fontSize: '14px',
  margin: '0',
  padding: '4px 10px',
  whiteSpace: 'nowrap'
};

/**
 * The runs, each with its video and its stats log, and the storage they take.
 *
 * @param root0 - The props.
 * @param root0.stats - The stats logs' state.
 * @param root0.video - The recorder's state.
 * @returns The list.
 */
export function RunsList({ stats, video }: RunsListProps): VNode<unknown> {
  const runs = groupRuns(video.recordings, stats.games);
  const [preview, setPreview] = useState<null | string>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<null | string>(null);
  const [thumbnails, setThumbnails] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    const urls = new Map<string, string>();
    for (const record of video.recordings) {
      if (record.thumbnail) {
        urls.set(record.id, URL.createObjectURL(record.thumbnail));
      }
    }
    setThumbnails(urls);
    return (): void => {
      for (const url of urls.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, [video.recordings]);
  useEffect(() => {
    if (preview === null) {
      return undefined;
    }
    const url = preview;
    return (): void => {
      URL.revokeObjectURL(url);
    };
  }, [preview]);
  useEffect(() => {
    if (confirm === null) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setConfirm(null);
    }, CONFIRM_MILLISECONDS);
    return (): void => {
      window.clearTimeout(timer);
    };
  }, [confirm]);

  function withFile(record: RecordingRecord, action: (blob: Blob) => void): void {
    setBusy(record.id);
    setError('');
    recordingFile(record, video.settings.audio).then(action, (exportError: unknown) => {
      setError(`The recording could not be exported: ${exportError instanceof Error ? exportError.message : String(exportError)}`);
    }).finally(() => {
      setBusy('');
    });
  }
  function play(record: RecordingRecord): void {
    withFile(record, (blob: Blob) => {
      setPreview(URL.createObjectURL(blob));
    });
  }
  function downloadVideo(record: RecordingRecord): void {
    withFile(record, (blob: Blob) => {
      downloadBlob(blob, recordingFileName(record.startedAt));
    });
  }
  async function removeRuns(removed: readonly RunGroup[]): Promise<void> {
    await video.remove(removed.flatMap((run: RunGroup) => run.recordings.map((record: RecordingRecord) => record.id)));
    await stats.remove(removed.flatMap((run: RunGroup) => run.stats ? [run.stats.id] : []));
  }
  async function toggleKeep(run: RunGroup): Promise<void> {
    const keep = !isKeptRun(run);
    await video.setKeep(run.recordings.map((record: RecordingRecord) => record.id), keep);
    if (run.stats) {
      await stats.setKeep(run.stats.id, keep);
    }
  }
  function button(className: string, label: string, title: string, action: () => void, disabled = false): VNode<unknown> {
    return createElement('button', {
      class: className,
      disabled,
      onClick: action,
      style: SMALL_BUTTON_STYLE,
      title,
      type: 'button'
    }, label);
  }
  function videoButtons(record: RecordingRecord): VNode<unknown>[] {
    if (record.status === 'recording') {
      return [];
    }
    return [
      button('yellow run-play', busy === record.id ? '…' : 'Play', 'Play the video', () => {
        play(record);
      }, busy !== ''),
      button('green run-video', 'Video', 'Download the video (MP4)', () => {
        downloadVideo(record);
      }, busy !== '')
    ];
  }

  function renderRun(run: RunGroup): VNode<unknown> {
    const recording = isRecordingRun(run);
    const kept = isKeptRun(run);
    const started = formatStartTooltip(run.startedAt);
    const thumbnail = run.recordings.map((record: RecordingRecord) => thumbnails.get(record.id)).find((url: string | undefined) => url !== undefined);
    const single = run.recordings.length === 1 ? run.recordings[0] : undefined;
    const several = run.recordings.length > 1;
    return createElement(
      'div',
      { 'class': 'run-row', 'data-id': run.id, 'key': run.id, 'style': ROW_STYLE },
      thumbnail
        ? createElement('img', { alt: '', class: 'run-thumbnail', height: String(THUMBNAIL_HEIGHT), src: thumbnail, style: THUMBNAIL_STYLE, width: String(THUMBNAIL_WIDTH) })
        : createElement('span', { 'aria-hidden': 'true', 'class': 'run-thumbnail', 'style': THUMBNAIL_STYLE }),
      createElement(
        'span',
        { class: 'run-info', style: INFO_STYLE, title: started },
        createElement('span', { class: 'run-start', style: { whiteSpace: 'nowrap' } }, `${formatStartLabel(run.startedAt, Date.now())}${kept ? ' · kept' : ''}`),
        run.recordings.length === 0
          ? createElement('span', { class: 'run-video-details run-missing', style: DETAIL_STYLE }, 'No video')
          : run.recordings.map((record: RecordingRecord, index: number) =>
            createElement(
              'span',
              { 'class': 'run-video-details', 'data-recording': record.id, 'key': record.id, 'style': { ...DETAIL_STYLE, alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '4px' } },
              `${several ? `Video ${String(index + 1)}` : 'Video'} ${videoText(record)}`,
              ...several ? videoButtons(record) : []
            )
          ),
        createElement(
          'span',
          { class: run.stats ? 'run-stats-details' : 'run-stats-details run-missing', style: DETAIL_STYLE },
          run.stats ? `Stats ${statsText(run.stats)}` : 'No stats log'
        )
      ),
      !recording && createElement(
        'span',
        { class: 'run-actions', style: ACTIONS_STYLE },
        button(`${kept ? 'green' : 'orange'} run-keep`, kept ? 'Kept' : 'Keep', kept ? 'Kept: Delete all and the automatic pruning leave it alone. Click to take the mark off.' : `Keep the video and the stats log: otherwise only the newest ${String(AUTO_TAKES_KEPT)} automatic videos and ${String(KEPT_STATS_GAMES)} stats logs stay, and Delete all removes it`, () => {
          toggleKeep(run).catch(noop);
        }),
        ...single ? videoButtons(single) : [],
        run.stats && button('green run-data', 'Data', 'Download the stats log (JSONL)', () => {
          if (run.stats) {
            downloadBlob(new Blob([run.stats.text], { type: 'application/x-ndjson' }), statsFileName(run.stats.startedAt));
          }
        }),
        createElement('button', {
          'aria-label': `Delete the run of ${started}: its video and its stats log`,
          'class': 'orange run-delete',
          'onClick': () => {
            if (confirm === run.id) {
              setConfirm(null);
              removeRuns([run]).catch(noop);
            } else {
              setConfirm(run.id);
            }
          },
          'style': SMALL_BUTTON_STYLE,
          'title': 'Delete the video and the stats log',
          'type': 'button'
        }, confirm === run.id ? 'Delete?' : '✕')
      )
    );
  }

  const deletable = runsToDeleteAll(runs);
  const keptCount = runs.filter(isKeptRun).length;
  const videoCount = video.recordings.length;
  const videoBytes = video.recordings.reduce((total: number, record: RecordingRecord) => total + record.bytes, 0);
  const free = video.estimate?.quota !== undefined && video.estimate.usage !== undefined ? video.estimate.quota - video.estimate.usage : null;
  const logs = stats.games;
  return createElement(
    'div',
    { id: 'runs', style: { marginTop: '12px' } },
    createElement('p', { style: { margin: '8px 0 4px' } }, 'Runs'),
    createElement(
      'p',
      { style: { fontSize: '13px', margin: '0 0 4px', opacity: '0.85' } },
      'Each run with its video, when one was recorded, and its stats log: area over time, captures, kills, deaths and frame times, as JSONL.'
    ),
    error && createElement('p', { id: 'runs-error' }, error),
    runs.map(renderRun),
    createElement(
      'p',
      { id: 'runs-storage', style: { fontSize: '13px', margin: '4px 0' } },
      `${String(runs.length)} run(s): ${String(videoCount)} video(s), ${formatMegabytes(videoBytes)}; ${String(logs.length)} stats log(s)`,
      free === null ? '' : ` · ${formatMegabytes(free)} free in this browser`,
      free !== null && free < LOW_STORAGE_BYTES ? ' · storage is low: download and delete some runs' : ''
    ),
    createElement(
      'div',
      { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center' } },
      deletable.length > 0 && createElement('button', {
        class: 'orange',
        id: 'runs-delete-all',
        onClick: () => {
          if (confirm === DELETE_ALL) {
            setConfirm(null);
            removeRuns(deletable).catch(noop);
          } else {
            setConfirm(DELETE_ALL);
          }
        },
        style: SMALL_BUTTON_STYLE,
        title: keptCount > 0 ? `Delete every run except the ${String(keptCount)} marked Keep` : 'Delete every run',
        type: 'button'
      }, deleteAllLabel(confirm === DELETE_ALL, deletable.length, keptCount)),
      logs.length > 1 && createElement('button', {
        class: 'green',
        id: 'runs-download-data',
        onClick: () => {
          const oldestFirst = [...logs].sort((a: StatsGameRecord, b: StatsGameRecord) => a.startedAt - b.startedAt);
          const newest = oldestFirst.at(-1)?.startedAt ?? Date.now();
          downloadBlob(new Blob([oldestFirst.map((game: StatsGameRecord) => game.text).join('')], { type: 'application/x-ndjson' }), statsFileName(newest).replace('paperio2-', 'paperio2-all-'));
        },
        style: SMALL_BUTTON_STYLE,
        title: 'Every stats log in one file, oldest first; each starts with its header line.',
        type: 'button'
      }, 'Download all data')
    ),
    preview !== null && createElement(
      'div',
      {
        id: 'recording-preview',
        onClick: () => {
          setPreview(null);
        },
        style: {
          alignItems: 'center',
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          inset: '0',
          justifyContent: 'center',
          position: 'fixed',
          zIndex: PREVIEW_Z_INDEX
        }
      },
      createElement('video', {
        autoplay: true,
        controls: true,
        onClick: (event: MouseEvent) => {
          event.stopPropagation();
        },
        src: preview,
        style: { maxHeight: '80vh', maxWidth: '90vw' }
      }),
      createElement('button', { class: 'orange', style: { marginTop: '12px' }, type: 'button' }, 'Close')
    )
  );
}

function deleteAllLabel(confirming: boolean, count: number, keptCount: number): string {
  if (confirming) {
    return `Delete ${String(count)} run(s)?`;
  }
  return keptCount > 0 ? 'Delete all except kept' : 'Delete all';
}

function statsText(game: StatsGameRecord): string {
  return `${game.pilot} · ${formatDuration(game.seconds * MILLISECONDS_PER_SECOND)} · ${game.percent.toFixed(PERCENT_DIGITS)}% · ${OUTCOME_LABELS[game.outcome]}`;
}

function videoText(record: RecordingRecord): string {
  const notes = [
    record.auto === true ? 'auto' : '',
    record.status === 'recovered' ? 'recovered' : '',
    record.status === 'recording' ? 'recording' : ''
  ].filter((note: string) => note !== '');
  return [formatDuration(record.durationMilliseconds), formatMegabytes(record.bytes), ...notes].join(' · ');
}
