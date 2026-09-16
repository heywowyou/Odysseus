import { describe, expect, it } from 'vitest';
import { RULE_LABELS_EN } from './rule-labels-en.js';
import { RULE_TRANSLATIONS_FR, resolveFindingDisplayLabel } from './rule-translations.js';

// Issue #332: English reports printed raw axe/Lighthouse strings as titles
// while French reports used the reviewed catalogue.
describe('English rule labels (issue #332)', () => {
  it('covers exactly the rule ids the French catalogue covers', () => {
    expect(Object.keys(RULE_LABELS_EN).sort()).toEqual(Object.keys(RULE_TRANSLATIONS_FR).sort());
  });

  it('has a non-empty label for every rule, none of them a raw rule-sentence', () => {
    for (const [ruleId, label] of Object.entries(RULE_LABELS_EN)) {
      expect(label.trim(), ruleId).not.toBe('');
      expect(label, ruleId).not.toMatch(/\bmust\b|\bshould\b/i);
    }
  });

  it('replaces the scanner titles from the review in an English report', () => {
    expect(
      resolveFindingDisplayLabel(
        'en',
        'target-size',
        'All touch targets must be 24px large, or leave sufficient space',
      ),
    ).toBe('Touch targets are smaller than 24 px without enough space around them');
    expect(
      resolveFindingDisplayLabel(
        'en',
        'color-contrast',
        'Elements must meet minimum color contrast ratio thresholds',
      ),
    ).toBe('Color contrast is insufficient');
    expect(
      resolveFindingDisplayLabel('en', 'cumulative-layout-shift', 'Cumulative Layout Shift'),
    ).toBe('The layout shifts while the page loads (CLS)');
  });

  it('still falls back to the scanner title for a rule neither table knows', () => {
    expect(resolveFindingDisplayLabel('en', 'brand-new-rule', 'Brand new rule')).toBe(
      'Brand new rule',
    );
  });
});
