import { describe, expect, it } from 'vitest';
import type { DivertedFinding } from '@odysseus/llm';
import { partitionFindings } from '@odysseus/llm';
import type { Finding } from '@odysseus/core';
import { renderObservations } from './observations.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeFindings, loadSasFernandeManifest } from '../../test-fixtures.js';

describe('renderObservations against the real sas-fernande.fr scan', () => {
  it('renders the legal-page box for f009 (link-in-text-block, confined to /mentions-legales/), with no wrapper box', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
    const { diverted } = partitionFindings(findings, manifest);

    const html = renderObservations(getStrings('fr'), 6, diverted);

    expect(html).toContain('Pages légales exclues de l&#39;indexation');
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
    // sas-fernande has no wrapper pages (render diff 0% everywhere).
    expect(html).not.toContain('Pages d&#39;intégration');
  });

  it('returns empty when nothing is diverted', () => {
    const html = renderObservations(getStrings('fr'), 6, []);

    expect(html).toBe('');
  });

  // report-feedback-la-corniche.md item 0.9: the "legal" diversion reason
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
    expect(html).toContain("généralement exclu de l&#39;indexation");
  });
});
