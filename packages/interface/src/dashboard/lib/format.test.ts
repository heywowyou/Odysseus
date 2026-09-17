import { describe, expect, it } from 'vitest';
import { fr } from '../i18n/fr';
import {
  formatCommune,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatSector,
} from './format';

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

describe('prospect display formatting', () => {
  it('formats a date in the dashboard language, not the browser locale', () => {
    expect(formatDate('2026-09-17T12:00:00.000Z', 'fr')).toBe('17 sept. 2026');
    expect(formatDate('2026-09-17T12:00:00.000Z', 'en')).toBe('17 Sept 2026');
  });

  it('labels stored and legacy sector values', () => {
    expect(formatSector('hotel', fr.common.sectorLabels)).toBe('Hôtel');
    expect(formatSector('Hôtel', fr.common.sectorLabels)).toBe('Hôtel');
    expect(formatSector('Camping', fr.common.sectorLabels)).toBe('Camping');
  });

  it('recases capitalised communes and leaves typed casing alone', () => {
    expect(formatCommune('ANTIBES')).toBe('Antibes');
    expect(formatCommune('LA TESTE-DE-BUCH')).toBe('La Teste-de-Buch');
    expect(formatCommune("L'ÎLE-ROUSSE")).toBe("L'Île-Rousse");
    expect(formatCommune('La Teste-de-Buch')).toBe('La Teste-de-Buch');
  });
});
