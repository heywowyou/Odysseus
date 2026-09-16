import { describe, expect, it } from 'vitest';
import { REFERENCE_STAT_TABLE } from '@odysseus/core';
import { remediationFor } from './remediation/index.js';

/**
 * Issue #298: every reference statistic declares what it is about, because
 * a category tag is a slot rather than a topic. A real hotel report cited
 * Baymard's e-commerce cart-abandonment rate on an accessibility priority
 * about link and image text, a checkout-design uplift on an
 * indexing-blockers priority, and Nestle's rich-results click-through rate
 * on a priority about broken internal links.
 */
describe('reference-stat scope', () => {
  it('names only rule ids the report can actually print', () => {
    // A typo here would silently make a statistic uncitable rather than
    // fail, since scope matching is a membership test.
    const unknown = REFERENCE_STAT_TABLE.flatMap((stat) =>
      stat.scope.kind === 'rules'
        ? stat.scope.ruleIds
            .filter((ruleId) => remediationFor(ruleId, 'fr') === undefined)
            .map((ruleId) => `${stat.id}: ${ruleId}`)
        : [],
    );

    expect(unknown).toEqual([]);
  });

  it('never leaves a rule-scoped statistic with an empty rule list', () => {
    for (const stat of REFERENCE_STAT_TABLE) {
      if (stat.scope.kind !== 'rules') continue;
      expect(stat.scope.ruleIds.length, stat.id).toBeGreaterThan(0);
    }
  });

  it('keeps the cited defect types apart, so one statistic cannot cover every complaint', () => {
    const scopeOf = (id: string) => REFERENCE_STAT_TABLE.find((stat) => stat.id === id)!.scope;

    // The three mis-citations the issue reported, as membership questions.
    const cartAbandonment = scopeOf('baymard-cart-abandonment-2025');
    expect(cartAbandonment.kind === 'rules' && cartAbandonment.ruleIds).not.toContain('link-name');

    const checkoutUplift = scopeOf('baymard-checkout-uplift-2025');
    expect(checkoutUplift.kind === 'rules' && checkoutUplift.ruleIds).not.toContain(
      'meta-description-missing',
    );

    const richResults = scopeOf('nestle-rich-results-ctr');
    expect(richResults.kind === 'rules' && richResults.ruleIds).not.toContain('canonical-missing');
    expect(richResults.kind === 'rules' && richResults.ruleIds).not.toContain(
      'broken-internal-link',
    );
  });
});
