/**
 * How the Recordings list names a take by its start: as short as the row allows, so the time is never cut off.
 */

/**
 * The start as the row shows it: the time alone for a take from today, the month and day with it for an earlier one,
 * and the year too only when it is not the current one. Seconds are left out; the length on the second line tells
 * takes from the same minute apart.
 *
 * @param startedAt - When the take started, in milliseconds since the epoch.
 * @param now - The current time, in milliseconds since the epoch.
 * @param locale - The locale to format in; the page's own when omitted.
 * @returns The label.
 */
export function formatStartLabel(startedAt: number, now: number, locale?: string): string {
  const started = new Date(startedAt);
  const today = new Date(now);
  const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  if (isSameDay(started, today)) {
    return started.toLocaleTimeString(locale, timeOptions);
  }
  return started.toLocaleString(locale, {
    ...timeOptions,
    day: 'numeric',
    month: 'short',
    ...started.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }
  });
}

/**
 * The full start, for the row's tooltip.
 *
 * @param startedAt - When the take started, in milliseconds since the epoch.
 * @param locale - The locale to format in; the page's own when omitted.
 * @returns The date and time, seconds included.
 */
export function formatStartTooltip(startedAt: number, locale?: string): string {
  return new Date(startedAt).toLocaleString(locale, { dateStyle: 'full', timeStyle: 'medium' });
}

function isSameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}
