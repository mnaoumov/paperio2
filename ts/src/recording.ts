/**
 * @file
 *
 * Recording mode: hides everything this copy adds over the original, so a screen recording looks like the original
 * game, and marks the frames to cut out of that recording. A cut marker is a full-frame solid color: red from the
 * first frame to cut, green for the last ones, then clean gameplay again. Clean frames never carry a marker.
 */

/** Where recording mode is remembered, `on` or `off`. */
export const RECORDING_MODE_STORAGE_KEY = 'paperio2.recording';
/** `KeyboardEvent.code` of the recording-mode toggle; the engine steers on the arrow and W/A/S/D keys only. */
export const RECORDING_KEY = 'KeyR';
/** The class on `<html>` while recording mode is on; `joystick.css` hides the joystick by it. */
export const RECORDING_CLASS = 'paperio2-recording';
export const CUT_COLOR = '#ff0000';
export const RESUME_COLOR = '#00ff00';
/** The shortest red span, so a quick pause still shows in a timeline thumbnail. */
export const MIN_CUT_MILLISECONDS = 700;
/** How long the green span lasts, with the game still paused under it. */
export const RESUME_MILLISECONDS = 700;
const MARKER_Z_INDEX = 2000;
const MILLISECONDS_PER_SECOND = 1000;

export type MarkerState = 'cut' | 'off' | 'resume';

interface MarkerElements {
  readonly element: HTMLDivElement;
  readonly label: HTMLDivElement;
  readonly note: HTMLDivElement;
}

/**
 * The full-frame cut marker. It never takes the pointer or the focus, so steering is untouched.
 */
export class CutMarker {
  /**
   * When the current red span started.
   *
   * @returns A `performance.now()` time.
   */
  public get cutStartedAt(): number {
    return this.cutStart;
  }

  /**
   * What the marker shows now.
   *
   * @returns `off`, `cut` (red) or `resume` (green).
   */
  public get state(): MarkerState {
    return this._state;
  }

  private _state: MarkerState = 'off';
  private cutStart = 0;
  private element: HTMLDivElement | null = null;
  private hint = '';
  private label: HTMLDivElement | null = null;
  private note: HTMLDivElement | null = null;

  private timer: number | undefined;

  /** Hides the marker at once, whatever it shows. */
  public clear(): void {
    window.clearTimeout(this.timer);
    this.timer = undefined;
    this._state = 'off';
    if (this.element) {
      this.element.style.display = 'none';
    }
  }

  /**
   * Shows the red "cut from here" frame, and keeps it until {@link resumeThen} or {@link clear}.
   *
   * @param hint - A line under the label, such as how far back the cut reaches. Kept when omitted on a marker already red.
   */
  public cut(hint?: string): void {
    if (this._state !== 'cut') {
      this.cutStart = performance.now();
      this.hint = '';
    }
    window.clearTimeout(this.timer);
    this.timer = undefined;
    if (hint !== undefined) {
      this.hint = hint;
    }
    this._state = 'cut';
    this.show(CUT_COLOR, 'CUT', this.hint);
  }

  /**
   * Shows red for the shortest span and hides it, for an event after which the frames are not clean anyway.
   */
  public flashCut(): void {
    this.cut();
    this.timer = window.setTimeout(() => {
      this.clear();
    }, MIN_CUT_MILLISECONDS);
  }

  /**
   * Ends a red span: red until it has lasted {@link MIN_CUT_MILLISECONDS}, then green for {@link RESUME_MILLISECONDS},
   * then the marker hides and `action` runs. A {@link cut} in between cancels it.
   *
   * @param action - What resumes the play, such as `game.resume()`.
   */
  public resumeThen(action: () => void): void {
    if (this._state !== 'cut') {
      this.cut();
    }
    window.clearTimeout(this.timer);
    const redLeft = Math.max(0, this.cutStart + MIN_CUT_MILLISECONDS - performance.now());
    this.timer = window.setTimeout(() => {
      this._state = 'resume';
      this.show(RESUME_COLOR, 'RESUME', '');
      this.timer = window.setTimeout(() => {
        this.clear();
        action();
      }, RESUME_MILLISECONDS);
    }, redLeft);
  }

  private ensureElement(): MarkerElements {
    if (this.element && this.label && this.note) {
      return { element: this.element, label: this.label, note: this.note };
    }
    const element = document.createElement('div');
    element.id = 'cut-marker';
    element.setAttribute('aria-hidden', 'true');
    Object.assign(element.style, {
      alignItems: 'center',
      color: '#000000',
      display: 'none',
      flexDirection: 'column',
      fontFamily: '"PT Sans Caption", sans-serif',
      inset: '0',
      justifyContent: 'center',
      pointerEvents: 'none',
      position: 'fixed',
      textAlign: 'center',
      userSelect: 'none',
      zIndex: String(MARKER_Z_INDEX)
    });
    const label = document.createElement('div');
    Object.assign(label.style, {
      fontSize: '18vmin',
      fontWeight: 'bold',
      lineHeight: '1'
    });
    const note = document.createElement('div');
    Object.assign(note.style, {
      fontSize: '5vmin',
      marginTop: '2vmin'
    });
    element.append(label, note);
    document.body.appendChild(element);
    this.element = element;
    this.label = label;
    this.note = note;
    return { element, label, note };
  }

  private show(color: string, text: string, hint: string): void {
    const { element, label, note } = this.ensureElement();
    element.style.background = color;
    label.textContent = text;
    note.textContent = hint;
    element.style.display = 'flex';
  }
}

export function applyRecordingClass(recordingMode: boolean): void {
  document.documentElement.classList.toggle(RECORDING_CLASS, recordingMode);
}

/**
 * Formats how far back the cut reaches, in seconds of the raw recording.
 *
 * @param cutStart - When the red span started, from `performance.now()`.
 * @param seenAt - When the state to go back to was last on screen, from `performance.now()`.
 * @returns The hint shown on the red frames.
 */
export function formatRewindHint(cutStart: number, seenAt: number): string {
  const seconds = Math.max(0, cutStart - seenAt) / MILLISECONDS_PER_SECOND;
  return `cut from ${seconds.toFixed(1)} s before this`;
}

export function readRecordingMode(): boolean {
  try {
    return localStorage.getItem(RECORDING_MODE_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeRecordingMode(recordingMode: boolean): void {
  try {
    localStorage.setItem(RECORDING_MODE_STORAGE_KEY, recordingMode ? 'on' : 'off');
  } catch {
    // A blocked storage only means the toggle is not remembered.
  }
}
