/**
 * @file
 *
 * The "Additions in recordings" setting: whether an in-game take keeps the additions drawn on the canvas, or draws it
 * as the original does (the default).
 */

/**
 * Where the "Additions in recordings" setting is remembered, `on` or `off`. Off (the default) draws the canvas as the
 * original does while an in-game take is on.
 */
export const RECORDING_ADDITIONS_STORAGE_KEY = 'paperio2.recordingAdditions';
/** Where the retired recording mode (the R key) was remembered; it is removed on load. */
export const RETIRED_RECORDING_MODE_STORAGE_KEY = 'paperio2.recording';

/** Removes what the retired recording mode left in storage. */
export function forgetRecordingMode(): void {
  try {
    localStorage.removeItem(RETIRED_RECORDING_MODE_STORAGE_KEY);
  } catch {
    // A blocked storage holds nothing to remove.
  }
}

export function readRecordingAdditions(): boolean {
  try {
    return localStorage.getItem(RECORDING_ADDITIONS_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeRecordingAdditions(recordingAdditions: boolean): void {
  try {
    localStorage.setItem(RECORDING_ADDITIONS_STORAGE_KEY, recordingAdditions ? 'on' : 'off');
  } catch {
    // A blocked storage only means the setting is not remembered.
  }
}
