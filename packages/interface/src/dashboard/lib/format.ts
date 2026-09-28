import type { DashboardLanguage, DashboardStrings } from '../i18n/types';

type RelativeTimeCopy = DashboardStrings['common']['relativeTime'];

function toDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

/** Date only, in the dashboard language rather than the browser's. */
export function formatDate(value: string | Date, language: DashboardLanguage): string {
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'medium',
  }).format(toDate(value));
}

/** A stored sector code through the label map. Legacy records stored the
 *  label itself (`Hôtel`), which matches case- and accent-insensitively. */
export function formatSector(sector: string, labels: Record<string, string>): string {
  return labels[sectorCode(sector, labels) ?? ''] ?? sector;
}

/** The known sector code a stored value stands for, legacy labels included,
 *  or undefined for a value outside the label map. */
export function sectorCode(sector: string, labels: Record<string, string>): string | undefined {
  const key = sector
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
  return Object.hasOwn(labels, key) ? key : undefined;
}

const COMMUNE_PARTICLES = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'sur',
  'sous',
  'en',
  'et',
  'aux',
  'au',
  'd',
  'l',
]);

/** Issue #397: directory sources store communes in capitals (`ANTIBES`)
 *  while operator records use ordinary casing. An all-capitals value is
 *  recased the French way (`LA TESTE-DE-BUCH` -> `La Teste-de-Buch`); any
 *  value with lowercase letters is left exactly as entered. */
export function formatCommune(commune: string): string {
  if (commune !== commune.toUpperCase()) return commune;
  let index = 0;
  return commune.toLowerCase().replace(/[\p{L}]+/gu, (word) => {
    const first = index === 0;
    index += 1;
    if (!first && COMMUNE_PARTICLES.has(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
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
