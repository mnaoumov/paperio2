/**
 * Exported files by take and Sound setting, kept for the session so Play then Download muxes once. The music bed is
 * shuffled on each export, so a cached file keeps Play and then Download the same.
 */
export class ExportCache {
  private readonly files = new Map<string, Promise<Blob>>();

  /**
   * Drops every file exported from one take.
   *
   * @param recordingId - The take's id.
   */
  public forget(recordingId: string): void {
    const prefix = exportCacheKeyPrefix(recordingId);
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(prefix)) {
        this.files.delete(key);
      }
    }
  }

  /**
   * The take's file for a Sound setting, exported on the first call.
   *
   * @param recordingId - The take's id.
   * @param audio - The Sound setting.
   * @param exportFile - Exports the take; called only when no file is cached.
   * @returns The file.
   */
  public async get(recordingId: string, audio: string, exportFile: () => Promise<Blob>): Promise<Blob> {
    const key = `${exportCacheKeyPrefix(recordingId)}${audio}`;
    const cached = this.files.get(key);
    if (cached) {
      return cached;
    }
    const file = exportFile();
    this.files.set(key, file);
    try {
      return await file;
    } catch (error: unknown) {
      if (this.files.get(key) === file) {
        this.files.delete(key);
      }
      throw error;
    }
  }
}

function exportCacheKeyPrefix(recordingId: string): string {
  return `${recordingId}:`;
}
