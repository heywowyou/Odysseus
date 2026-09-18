import { describe, expect, it } from 'vitest';
import { formatLocaleNumber } from './number.js';

describe('formatLocaleNumber', () => {
  it('groups French thousands with a no-break space, never the narrow one the report fonts lack', () => {
    expect(formatLocaleNumber(16490, 'fr-FR')).toBe('16 490');
    expect(formatLocaleNumber(1234.5, 'fr-FR', { minimumFractionDigits: 1 })).toBe('1 234,5');
    expect(formatLocaleNumber(0.42, 'fr-FR', { style: 'percent' })).not.toContain(' ');
  });

  it('leaves English grouping unchanged', () => {
    expect(formatLocaleNumber(16490, 'en-GB')).toBe('16,490');
  });
});
