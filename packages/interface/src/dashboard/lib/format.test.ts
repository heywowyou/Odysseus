import { describe, expect, it } from 'vitest';
import { fr } from '../i18n/fr';
import { formatDateTime, formatRelativeTime } from './format';

const NOW = Date.parse('2026-08-30T14:00:00Z');

describe('formatRelativeTime', () => {
  const copy = fr.common.relativeTime;

  it('reads sub-minute timestamps as just now', () => {
    expect(formatRelativeTime(new Date(NOW - 30_000), copy, NOW)).toBe(copy.justNow);
  });

  it('buckets minutes, hours, and days', () => {
    expect(formatRelativeTime(new Date(NOW - 5 * 60_000), copy, NOW)).toBe('il y a 5 min');
    expect(formatRelativeTime(new Date(NOW - 3 * 3_600_000), copy, NOW)).toBe('il y a 3 h');
    expect(formatRelativeTime(new Date(NOW - 2 * 86_400_000), copy, NOW)).toBe('il y a 2 j');
  });

  it('treats future timestamps as just now', () => {
    expect(formatRelativeTime(new Date(NOW + 300_000), copy, NOW)).toBe(copy.justNow);
  });
});

describe('formatDateTime', () => {
  it('formats per dashboard language', () => {
    const value = new Date('2026-08-30T14:05:00Z');
    expect(formatDateTime(value, 'en')).toMatch(/2026/);
    expect(formatDateTime(value, 'fr')).toMatch(/2026/);
  });
});
