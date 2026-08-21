import { describe, expect, it } from 'vitest';
import { selectReferenceStats } from './select.js';

describe('selectReferenceStats', () => {
  // B1: deloitte-speed-conversion-* moved from category ['accessibility',
  // 'seo'] to ['performance'] - they're about page speed and conversion,
  // not accessibility or SEO. These two tests moved with them.
  it('ranks the hospitality-tagged row before general rows for the same category', () => {
    const results = selectReferenceStats('performance', 'hospitality');
    const ids = results.map((stat) => stat.id);
    expect(ids).toContain('deloitte-speed-conversion-travel-2020');
    expect(ids).toContain('deloitte-speed-conversion-retail-2020');
    expect(ids.indexOf('deloitte-speed-conversion-travel-2020')).toBeLessThan(
      ids.indexOf('deloitte-speed-conversion-retail-2020'),
    );
  });

  it('never drops general rows when a hospitality sector is requested', () => {
    const general = selectReferenceStats('performance', 'general').map((stat) => stat.id);
    const hospitality = selectReferenceStats('performance', 'hospitality').map((stat) => stat.id);
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

  it('B1: never returns the page-speed stats for accessibility or seo', () => {
    const accessibilityIds = selectReferenceStats('accessibility', 'general').map((stat) => stat.id);
    const seoIds = selectReferenceStats('seo', 'general').map((stat) => stat.id);
    const speedStatIds = ['deloitte-speed-conversion-retail-2020', 'deloitte-speed-conversion-travel-2020', 'deloitte-aov-retail-2020'];
    for (const id of speedStatIds) {
      expect(accessibilityIds).not.toContain(id);
      expect(seoIds).not.toContain(id);
    }
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
    const categories = ['accessibility', 'seo', 'geo', 'performance'] as const;
    const sectors = ['general', 'hospitality'] as const;
    for (const category of categories) {
      for (const sector of sectors) {
        expect(() => selectReferenceStats(category, sector)).not.toThrow();
      }
    }
  });

  // P0.2 (2026-08-21 La Corniche feedback pass): strictSector excludes
  // 'general' rows entirely instead of only ranking them second - a
  // deliberate move away from cross-sector benchmarks, not a re-matching
  // fix. The table has no hospitality-tagged accessibility or seo rows,
  // so a hospitality report must get no citation at all for those
  // categories rather than falling back to a mismatched one.
  describe('strictSector', () => {
    it('excludes general rows entirely for a sector with no matching row in that category', () => {
      const results = selectReferenceStats('accessibility', 'hospitality', { strictSector: true });
      expect(results).toEqual([]);
    });

    it('still returns the sector-matched row when one exists', () => {
      const results = selectReferenceStats('performance', 'hospitality', { strictSector: true });
      const ids = results.map((stat) => stat.id);
      expect(ids).toEqual(['deloitte-speed-conversion-travel-2020']);
    });

    it('a general-sector request with strictSector excludes hospitality-only rows too', () => {
      const strict = selectReferenceStats('performance', 'general', { strictSector: true }).map((s) => s.id);
      expect(strict).not.toContain('deloitte-speed-conversion-travel-2020');
      expect(strict).toEqual(expect.arrayContaining(['deloitte-speed-conversion-retail-2020', 'deloitte-aov-retail-2020']));
    });

    it('default (no options) keeps the original permissive rank-with-fallback behavior', () => {
      const results = selectReferenceStats('accessibility', 'hospitality');
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
