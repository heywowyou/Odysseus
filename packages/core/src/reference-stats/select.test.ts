import { describe, expect, it } from 'vitest';
import { selectReferenceStats } from './select.js';

describe('selectReferenceStats', () => {
  it('ranks the hospitality-tagged row before general rows for the same category', () => {
    const results = selectReferenceStats('accessibility', 'hospitality');
    const ids = results.map((stat) => stat.id);
    expect(ids).toContain('deloitte-speed-conversion-travel-2020');
    expect(ids).toContain('deloitte-speed-conversion-retail-2020');
    expect(ids.indexOf('deloitte-speed-conversion-travel-2020')).toBeLessThan(
      ids.indexOf('deloitte-speed-conversion-retail-2020'),
    );
  });

  it('never drops general rows when a hospitality sector is requested', () => {
    const general = selectReferenceStats('accessibility', 'general').map((stat) => stat.id);
    const hospitality = selectReferenceStats('accessibility', 'hospitality').map((stat) => stat.id);
    for (const id of general) {
      expect(hospitality).toContain(id);
    }
  });

  it('returns both geo rows for a general request, established before emerging is irrelevant here since both are emerging', () => {
    const results = selectReferenceStats('geo', 'general');
    const ids = results.map((stat) => stat.id);
    expect(ids).toContain('princeton-geo-visibility-2024');
    expect(ids).toContain('pew-ai-overviews-ctr-2025');
  });

  it('includes the hospitality-only geo row when requested for hospitality', () => {
    const ids = selectReferenceStats('geo', 'hospitality').map((stat) => stat.id);
    expect(ids).toContain('phocuswright-ai-trip-planning-2026');
  });

  it('only returns rows whose category includes the requested one', () => {
    const results = selectReferenceStats('accessibility', 'general');
    for (const stat of results) {
      expect(stat.category).toContain('accessibility');
    }
  });

  it('sorts established rows before emerging rows within the same sector rank', () => {
    const results = selectReferenceStats('geo', 'general');
    const firstEmergingIndex = results.findIndex((stat) => stat.confidence === 'emerging');
    if (firstEmergingIndex !== -1) {
      const anyEstablishedAfter = results
        .slice(firstEmergingIndex + 1)
        .some((stat) => stat.confidence === 'established' && stat.sector === 'general');
      expect(anyEstablishedAfter).toBe(false);
    }
  });

  it('never throws for any category/sector combination', () => {
    const categories = ['accessibility', 'seo', 'geo'] as const;
    const sectors = ['general', 'hospitality'] as const;
    for (const category of categories) {
      for (const sector of sectors) {
        expect(() => selectReferenceStats(category, sector)).not.toThrow();
      }
    }
  });
});
