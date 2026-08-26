import { describe, expect, it } from 'vitest';
import { REFERENCE_STAT_TABLE } from './stats.js';

describe('REFERENCE_STAT_TABLE', () => {
  it('has unique ids', () => {
    const ids = REFERENCE_STAT_TABLE.map((stat) => stat.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has a non-empty category array for every row', () => {
    for (const stat of REFERENCE_STAT_TABLE) {
      expect(stat.category.length).toBeGreaterThan(0);
    }
  });

  it('has non-empty bilingual citation text for every row', () => {
    for (const stat of REFERENCE_STAT_TABLE) {
      expect(stat.citation.fr.length).toBeGreaterThan(0);
      expect(stat.citation.en.length).toBeGreaterThan(0);
    }
  });

  it('gives every scales-down row a ratio, and no context-only row a ratio', () => {
    for (const stat of REFERENCE_STAT_TABLE) {
      if (stat.scalability === 'scales-down') {
        expect(stat.ratio).toBeDefined();
      } else {
        expect(stat.ratio).toBeUndefined();
      }
    }
  });

  it('never references the excluded Web Standards Commission source', () => {
    for (const stat of REFERENCE_STAT_TABLE) {
      const haystack = `${stat.source} ${stat.citation.fr} ${stat.citation.en}`.toLowerCase();
      expect(haystack).not.toContain('wsc.us.org');
      expect(haystack).not.toContain('web standards commission');
    }
  });

  it('has at least one emerging row for geo', () => {
    const geoEmerging = REFERENCE_STAT_TABLE.filter(
      (stat) => stat.category.includes('geo') && stat.confidence === 'emerging',
    );
    expect(geoEmerging.length).toBeGreaterThan(0);
  });

  describe('2026-08-22 hospitality sector research pass', () => {
    it('has at least one hospitality-tagged accessibility row', () => {
      const hospitalityAccessibility = REFERENCE_STAT_TABLE.filter(
        (stat) => stat.sector === 'hospitality' && stat.category.includes('accessibility'),
      );
      expect(hospitalityAccessibility.length).toBeGreaterThan(0);
    });

    it('never gives a hospitality accessibility row a scalable ratio', () => {
      // docs/research/sector-reference-stats/hospitality.md's own
      // "confirmed no citable data" section: no study anywhere ties a
      // WCAG fix to a measured booking-conversion delta for a hotel or
      // restaurant. A scalable ratio here would mean this was invented,
      // not sourced.
      const hospitalityAccessibility = REFERENCE_STAT_TABLE.filter(
        (stat) => stat.sector === 'hospitality' && stat.category.includes('accessibility'),
      );
      for (const stat of hospitalityAccessibility) {
        expect(stat.scalability).toBe('context-only');
      }
    });

    it('never references the dropped secondhand TRAVELSAT figure', () => {
      for (const stat of REFERENCE_STAT_TABLE) {
        const haystack = `${stat.source} ${stat.citation.fr} ${stat.citation.en}`.toLowerCase();
        expect(haystack).not.toContain('travelsat');
      }
    });

    it('labels the SiteMinder abandonment stat as self-reported recall, not a measured rate', () => {
      const stat = REFERENCE_STAT_TABLE.find(
        (s) => s.id === 'siteminder-digital-experience-abandonment-2025',
      );
      expect(stat).toBeDefined();
      expect(stat?.citation.fr.toLowerCase()).toContain('déclarative');
      expect(stat?.citation.en.toLowerCase()).toContain('self-reported');
    });
  });
});
