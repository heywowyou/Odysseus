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
});
