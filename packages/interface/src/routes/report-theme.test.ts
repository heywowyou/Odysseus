import { describe, expect, it } from 'vitest';
import { parseReportThemeQuery } from './audits.js';

describe('parseReportThemeQuery', () => {
  it('defaults omitted theme to dark and accepts explicit themes', () => {
    expect(parseReportThemeQuery(new URLSearchParams())).toBe('dark');
    expect(parseReportThemeQuery(new URLSearchParams('theme=dark'))).toBe('dark');
    expect(parseReportThemeQuery(new URLSearchParams('theme=light'))).toBe('light');
  });

  it('rejects unknown, repeated, and unrelated query parameters', () => {
    expect(parseReportThemeQuery(new URLSearchParams('theme=system'))).toBeUndefined();
    expect(parseReportThemeQuery(new URLSearchParams('theme=light&theme=dark'))).toBeUndefined();
    expect(parseReportThemeQuery(new URLSearchParams('download=1'))).toBeUndefined();
  });
});
