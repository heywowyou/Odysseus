import { describe, expect, it } from 'vitest';
import type { DivertedFinding } from '@odysseus/llm';
import { partitionFindings } from '@odysseus/llm';
import type { Finding } from '@odysseus/core';
import { renderObservations } from './observations.js';
import { getStrings } from '../strings/i18n.js';
import { loadSmallSiteFindings, loadSmallSiteManifest } from '../../test-fixtures.js';

describe('renderObservations against the real small-site.test scan', () => {
  it('renders the legal-page box for f009 (link-in-text-block, confined to /mentions-legales/), with no wrapper box', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();
    const { diverted } = partitionFindings(findings, manifest);

    const html = renderObservations(getStrings('fr'), 6, diverted);

    expect(html).toContain('Pages légales exclues de l’indexation');
    // Every finding confined entirely to /mentions-legales/, named by id.
    // Read off the same partition the section renders from rather than
    // hardcoded: finding ids are reassigned densely on every normalization,
    // so a literal list silently repoints at different findings.
    const expectedIds = diverted
      .map((d) => d.finding)
      .filter((f) => f.pageUrls.every((url) => url.includes('/mentions-legales/')))
      .map((f) => f.findingId);
    expect(expectedIds.length).toBeGreaterThan(1);
    expect(html).toContain(expectedIds.join(', '));
    // small-site has no wrapper pages (render diff 0% everywhere).
    expect(html).not.toContain('Pages d&#39;intégration');
  });

  it('returns empty when nothing is diverted', () => {
    const html = renderObservations(getStrings('fr'), 6, []);

    expect(html).toBe('');
  });

  // report-feedback-large-rule-families.md item 0.9: the "legal" diversion reason
  // is a URL-pattern match (LEGAL_PATH_PATTERN, @odysseus/core), never a
  // verified per-page noindex check - a real report diverted an
  // accessibility finding (nested-interactive, WCAG 4.1.2, confined to
  // /cookies/) into this box, whose copy stated as fact that the page
  // "portent une directive noindex", overclaiming a fact the diversion
  // signal never actually confirmed. The copy no longer asserts it as a
  // given.
  it('item 0.9: does not state noindex as a confirmed fact, only as the usual configuration for this page type', async () => {
    const finding: Finding = {
      auditId: 'a1',
      schemaVersion: 1,
      source: 'axe',
      findingId: 'f1',
      ruleId: 'nested-interactive',
      category: 'accessibility',
      severity: 'serious',
      wcagCriteria: ['4.1.2'],
      title: 'Nested interactive controls',
      description: 'description',
      pageUrls: ['https://example.com/cookies/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: 'dk-1',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
    const diverted: DivertedFinding[] = [{ finding, reason: 'legal' }];

    const html = renderObservations(getStrings('fr'), 6, diverted);

    expect(html).toContain('f1');
    expect(html).not.toContain('portent une directive noindex');
    expect(html).toContain('généralement exclu de l’indexation');
  });

  // Issue #325: the accessibility-statement block printed a bare "f066".
  it('labels the finding reference under the accessibility-statement block', () => {
    const finding: Finding = {
      auditId: 'a1',
      schemaVersion: 1,
      source: 'custom',
      findingId: 'f066',
      ruleId: 'accessibility-statement-missing',
      category: 'accessibility',
      severity: 'minor',
      wcagCriteria: [],
      title: 'No accessibility statement',
      description: 'description',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: 'dk-66',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
    const diverted: DivertedFinding[] = [{ finding, reason: 'regime-dependent' }];

    expect(renderObservations(getStrings('fr'), 6, diverted)).toContain(
      'Constat concerné\u00a0: f066',
    );
    expect(renderObservations(getStrings('en'), 6, diverted)).toContain('Related finding: f066');
  });
});
