import { describe, expect, it } from 'vitest';
import { buildEvaluationLedger } from './audit-evaluation-ledger.mjs';

const registry = [
  { id: 'axe', resultField: 'axe', errorField: 'axeError', scope: 'page' },
  {
    id: 'keyboard-navigation',
    resultField: 'keyboardNavigation',
    errorField: 'keyboardNavigationError',
    scope: 'page',
  },
  {
    id: 'structured-data',
    resultField: 'structuredData',
    errorField: 'structuredDataError',
    scope: 'page',
  },
  { id: 'sitemap-check', resultField: 'sitemapCheck', scope: 'site' },
];

const heldWalk = { focusSequence: [1, 2, 1, 2], tabbableCount: 30 };
const walked = { focusSequence: [0, 1, 2], tabbableCount: 3 };
const isTabWalkHeldByDialog = (walk) => walk === heldWalk;

function audit(pageCount, scanFor) {
  const urls = Array.from({ length: pageCount }, (_, i) => `https://example.com/p${i}`);
  return {
    manifest: { pages: urls.map((url) => ({ url, status: 'visited' })) },
    scans: urls.map((url, index) => ({ url, ...scanFor(index) })),
  };
}

describe('evaluation ledger', () => {
  // Grand Hôtel des Alpes after sweep 9: a consent banner held 34 of 38 walks.
  it('reports a check that completed on most pages without concluding', () => {
    const { manifest, scans } = audit(38, (i) => ({
      keyboardNavigation: i < 34 ? heldWalk : walked,
    }));

    const ledger = buildEvaluationLedger({
      manifest,
      scans,
      findings: [],
      registry,
      helpers: { isTabWalkHeldByDialog },
    });

    expect(ledger.checks['keyboard-navigation']).toMatchObject({ completed: 4, inconclusive: 34 });
    expect(ledger.alerts).toContain(
      'keyboard-navigation: evaluated on 4 of 38 analysed pages (34 inconclusive, 0 failed, 0 without a record)',
    );
  });

  // Plan 075 H7: html-validate's tokenizer failed the check on every page.
  it('reports a check that failed on most pages', () => {
    const { manifest, scans } = audit(10, () => ({ structuredDataError: 'tool-error' }));
    const ledger = buildEvaluationLedger({ manifest, scans, findings: [], registry });
    expect(
      ledger.alerts.some((alert) => alert.startsWith('structured-data: evaluated on 0 of 10')),
    ).toBe(true);
  });

  it('says nothing about a check that did not apply or was not planned', () => {
    const { manifest, scans } = audit(10, () => ({
      checkOutcomes: { 'structured-data': 'not-applicable' },
    }));
    const ledger = buildEvaluationLedger({ manifest, scans, findings: [], registry });
    expect(ledger.alerts).toEqual([]);
    expect(ledger.checks['sitemap-check']).toBeUndefined();
  });

  it('counts raw axe detections that became no finding, and alerts on a heavy filter', () => {
    const { manifest, scans } = audit(2, () => ({
      axe: {
        violations: [
          { id: 'color-contrast', nodes: Array.from({ length: 30 }, () => ({})) },
          { id: 'label', nodes: [{}] },
        ],
      },
    }));
    const findings = [
      { source: 'axe', ruleId: 'color-contrast', occurrences: 4 },
      { source: 'axe', ruleId: 'label', occurrences: 2 },
    ];

    const ledger = buildEvaluationLedger({ manifest, scans, findings, registry });

    expect(ledger.filtering.axe).toEqual({
      rawNodes: 62,
      occurrences: 6,
      filteredRules: [{ ruleId: 'color-contrast', rawNodes: 60, occurrences: 4, dropped: 56 }],
    });
    expect(ledger.alerts).toContain(
      'axe color-contrast: 56 of 60 raw detections on analysed pages became no finding',
    );
  });

  it('leaves pages that were not analysed out of every count', () => {
    const { manifest, scans } = audit(3, () => ({ structuredDataError: 'tool-error' }));
    manifest.pages[0].status = 'redirect-interstitial';
    const ledger = buildEvaluationLedger({ manifest, scans, findings: [], registry });
    expect(ledger.analysedPages).toBe(2);
    expect(ledger.checks['structured-data'].failed).toBe(2);
  });
});
