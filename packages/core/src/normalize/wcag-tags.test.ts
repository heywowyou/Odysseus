import { describe, expect, it } from 'vitest';
import { wcagCriteriaFromAxeTags } from './wcag-tags.js';

describe('wcagCriteriaFromAxeTags', () => {
  it('extracts real axe-core SC tags into dotted notation', () => {
    // Pulled from the installed axe-core package's own tag set.
    expect(wcagCriteriaFromAxeTags(['wcag143'])).toEqual(['1.4.3']);
    expect(wcagCriteriaFromAxeTags(['wcag1412'])).toEqual(['1.4.12']);
    expect(wcagCriteriaFromAxeTags(['wcag258'])).toEqual(['2.5.8']);
  });

  it('excludes conformance-level tags that are not success criteria', () => {
    expect(wcagCriteriaFromAxeTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])).toEqual([]);
  });

  it('dedupes and sorts numerically, not lexicographically', () => {
    expect(wcagCriteriaFromAxeTags(['wcag1412', 'wcag143', 'wcag143', 'wcag111'])).toEqual([
      '1.1.1',
      '1.4.3',
      '1.4.12',
    ]);
  });

  it('ignores non-wcag tags', () => {
    expect(wcagCriteriaFromAxeTags(['best-practice', 'cat.color', 'wcag143'])).toEqual(['1.4.3']);
  });

  it('returns an empty array for no tags', () => {
    expect(wcagCriteriaFromAxeTags([])).toEqual([]);
  });
});
