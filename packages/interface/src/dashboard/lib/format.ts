import type { DashboardLanguage, DashboardStrings } from '../i18n/types';

type RelativeTimeCopy = DashboardStrings['common']['relativeTime'];

function toDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

export function formatDateTime(value: string | Date, language: DashboardLanguage): string {
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(toDate(value));
}

/** Bucketed relative time against a copy table with {minutes}/{hours}/
 *  {days} tokens. `now` is injectable so buckets are testable; timestamps
 *  in the future (clock skew) read as "just now". */
export function formatRelativeTime(
  value: string | Date,
  copy: RelativeTimeCopy,
  now: number = Date.now(),
): string {
  const seconds = Math.round((now - toDate(value).getTime()) / 1000);
  // Floor, not round: half-elapsed buckets (30s, 90min) belong to the lower
  // bucket, so 30 seconds reads as "just now" rather than "1 min ago".
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return copy.justNow;
  if (minutes < 60) return copy.minutesAgo.replace('{minutes}', String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return copy.hoursAgo.replace('{hours}', String(hours));
  const days = Math.floor(hours / 24);
  return copy.daysAgo.replace('{days}', String(days));
}
