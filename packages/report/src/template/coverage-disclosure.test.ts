import { describe, expect, it } from 'vitest';
import type { AuditManifest, AuditPassOutcome, ManifestPageEntry } from '@odysseus/core';
import { getStrings } from './strings/i18n.js';
import { buildCoverageDisclosure } from './coverage-disclosure.js';

function coveredPage(
  suffix: string,
  contentOutcome: Exclude<AuditPassOutcome, 'not-planned'>,
  lighthouseOutcome: AuditPassOutcome,
): ManifestPageEntry {
  return {
    url: `https://example.com/${suffix}`,
    depth: 1,
    status: 'visited',
    errors: {},
    analysisCoverage: {
      plannerVersion: 'v1',
      role: 'content',
      confidence: 'high',
      reasonCodes: [],
      passes: {
        rendered: { outcome: contentOutcome },
        axe: { outcome: contentOutcome },
        extended: { outcome: contentOutcome },
        lighthouse: { outcome: lighthouseOutcome },
      },
    },
  };
}

function currentManifest(): AuditManifest {
  return {
    siteUrl: 'https://example.com/',
    pages: [
      coveredPage('complete', 'completed', 'completed'),
      coveredPage('partial', 'partial', 'failed'),
      coveredPage('failed', 'failed', 'not-planned'),
      {
        url: 'https://example.com/private',
        depth: 1,
        status: 'skipped-robots',
        errors: {},
      },
      {
        url: 'https://example.com/broken',
        depth: 1,
        status: 'error',
        errors: {},
      },
    ],
    continuationGuardSummary: {
      guardVersion: 'v1',
      familyMaxEnqueued: 3,
      families: [],
      additionalFamiliesOmittedCount: 0,
      totalOmittedUrlCount: 12,
    },
  } as unknown as AuditManifest;
}

describe('buildCoverageDisclosure', () => {
  it('separates inventory, completed work, failures, planned choices, and guarded omissions', () => {
    const disclosure = buildCoverageDisclosure(getStrings('en'), currentManifest(), 'en');

    expect(disclosure.summary).toContain('5 URLs inventoried');
    expect(disclosure.summary).toContain(
      'content-sensitive results on 2 pages (1 completed, 1 partial, 1 failed)',
    );
    expect(disclosure.summary).toContain(
      'Lighthouse: 1 measured, 0 partial, 1 failed, 1 not planned',
    );
    expect(disclosure.details).toEqual([
      'Pages without content analysis: 1 blocked by robots.txt, 1 crawl error.',
      '12 additional continuation URLs were omitted by the repetition guard.',
    ]);
  });

  it('renders the same facts in French', () => {
    const disclosure = buildCoverageDisclosure(getStrings('fr'), currentManifest(), 'fr');

    expect(disclosure.summary).toContain('5 URL inventoriées');
    expect(disclosure.summary).toContain('1 en échec, 1 non planifiée');
    expect(disclosure.details.join(' ')).toContain('12 URL de continuation');
  });

  // Issue #28: a large non-HTML skip count printed the singular English
  // noun ("520 non-HTML resource") and the French participle disagreed
  // the other way, always plural even for a single skip.
  it('agrees the without-content reason labels with their counts, in both languages', () => {
    const manyNonHtmlManifest: AuditManifest = {
      siteUrl: 'https://example.com/',
      pages: [
        coveredPage('home', 'completed', 'completed'),
        ...Array.from({ length: 520 }, (_, i) => ({
          url: `https://example.com/asset-${i}.pdf`,
          depth: 1,
          status: 'skipped-non-html',
          errors: {},
        })),
      ],
    } as unknown as AuditManifest;
    const disclosureEn = buildCoverageDisclosure(getStrings('en'), manyNonHtmlManifest, 'en');
    expect(disclosureEn.details.join(' ')).toContain('520 non-HTML resources');
    expect(disclosureEn.details.join(' ')).not.toContain('520 non-HTML resource,');

    const oneNotPlannedManifest = currentManifest();
    const disclosureFr = buildCoverageDisclosure(getStrings('fr'), oneNotPlannedManifest, 'fr');
    expect(disclosureFr.details.join(' ')).toContain('1 bloquée par robots.txt');
    expect(disclosureFr.details.join(' ')).not.toContain('1 bloquées par robots.txt');
  });

  it('states that pass coverage is unknown for a historical manifest', () => {
    const manifest = {
      ...currentManifest(),
      pages: currentManifest().pages.map(({ analysisCoverage: _coverage, ...page }) => page),
    } as AuditManifest;

    const disclosure = buildCoverageDisclosure(getStrings('en'), manifest, 'en');

    expect(disclosure.summary).toContain('Pass-by-pass coverage is unavailable');
    expect(disclosure.details).toEqual([]);
  });
});
