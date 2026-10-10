/**
 * When a follow-up becomes due. Spacing is counted in calendar days of the
 * operator's time zone, and a follow-up is due from the first minute of its
 * day: everything that falls due on a given day is in To do when the day
 * starts, instead of appearing through the day at the hour each earlier
 * email happened to be sent.
 */

/** The operator works, and prospects read their mail, on French time. */
export const OUTREACH_TIME_ZONE = 'Europe/Paris';

const DAY_MS = 24 * 60 * 60 * 1000;

const wallClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: OUTREACH_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** The time zone's wall clock at `instant`, read as if it were UTC. */
function wallClockAsUtc(instant: number): number {
  const parts = Object.fromEntries(
    wallClock.formatToParts(new Date(instant)).map((part) => [part.type, Number(part.value)]),
  );
  return Date.UTC(
    parts['year']!,
    parts['month']! - 1,
    parts['day']!,
    parts['hour'],
    parts['minute'],
    parts['second'],
  );
}

/**
 * Midnight, in the outreach time zone, of the calendar day `afterDays` days
 * after the day `sentAt` falls on. Calendar days, so a daylight-saving
 * change between the two never shifts the hour.
 */
export function outreachDueDayStart(sentAt: Date, afterDays: number): Date {
  const sentWall = new Date(wallClockAsUtc(sentAt.getTime()));
  const dueWall =
    Date.UTC(sentWall.getUTCFullYear(), sentWall.getUTCMonth(), sentWall.getUTCDate()) +
    afterDays * DAY_MS;
  // The zone's offset is read at the answer itself: a first guess with the
  // offset of the send, corrected once if the clocks changed in between.
  let instant = dueWall - (wallClockAsUtc(sentAt.getTime()) - sentAt.getTime());
  instant = dueWall - (wallClockAsUtc(instant) - instant);
  return new Date(instant);
}
