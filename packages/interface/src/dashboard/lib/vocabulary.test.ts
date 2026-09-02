import { describe, expect, it } from 'vitest';
import { vocabularyLabel } from './vocabulary';

const LABELS = { qualified: 'Qualified', parked: 'On hold' };

describe('vocabularyLabel', () => {
  it('returns the localized label for a known value', () => {
    expect(vocabularyLabel(LABELS, 'qualified')).toBe('Qualified');
  });

  it('returns the empty string for absent values', () => {
    expect(vocabularyLabel(LABELS, null)).toBe('');
    expect(vocabularyLabel(LABELS, undefined)).toBe('');
    expect(vocabularyLabel(LABELS, '')).toBe('');
  });

  it('falls back to the raw code for an unknown value', () => {
    expect(vocabularyLabel(LABELS, 'group-routed')).toBe('group-routed');
  });

  it('prefers the localized catch-all over the raw code when one is given', () => {
    expect(vocabularyLabel(LABELS, 'group-routed', 'Other')).toBe('Other');
    expect(vocabularyLabel(LABELS, 'qualified', 'Other')).toBe('Qualified');
  });
});
