/**
 * A7b (2026-08-24). The scanner has detected the LCEN identification
 * obligation since milestone 8, but section 03 ("Exposition légale"), the
 * one page a client or their lawyer reads to find out what the law asks of
 * them, was entirely about the EAA. The breach appeared only as a row in
 * the annex, under a category that did not name it as legal at all.
 *
 * These tests pin the three things that make stating it safe: the criterion
 * and citation are spliced from regimes.ts rather than written anywhere in
 * the report layer, no sanction amount is ever printed, and the block is
 * silent unless the finding is actually present. See
 * docs/rules/obligation-basis.md section 8bis.
 */
import { describe, expect, it } from 'vitest';
import {
  FINDINGS_SCHEMA_VERSION,
  getRegime,
  LCEN_MENTIONS_LEGALES_REGIME_ID,
  LCEN_MENTIONS_LEGALES_RULE_ID,
  type Finding,
} from '@odysseus/core';
import { getStrings } from '../strings/i18n.js';
import { renderLegalExposure } from './legal-exposure.js';
import { escapeHtml } from '../html-utils.js';
import type { AuditManifest } from '@odysseus/core';

const fr = getStrings('fr');
const en = getStrings('en');

function fakeManifest(): AuditManifest {
  return {
    auditId: 'audit-1',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-24T00:00:00Z',
    pages: [],
  } as unknown as AuditManifest;
}

function lcenFinding(): Finding {
  return {
    findingId: 'f001',
    auditId: 'audit-1',
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    source: 'custom',
    ruleId: LCEN_MENTIONS_LEGALES_RULE_ID,
    category: 'seo',
    severity: 'serious',
    wcagCriteria: [],
    title: 'No legal identifier published',
    description: '',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: 'dedupe-lcen',
    firstSeenAt: new Date('2026-08-24T00:00:00Z'),
    lastSeenAt: new Date('2026-08-24T00:00:00Z'),
  };
}

function otherFinding(): Finding {
  return { ...lcenFinding(), findingId: 'f002', ruleId: 'image-alt', dedupeKey: 'dedupe-other' };
}

function render(language: 'fr' | 'en', findings: Finding[]): string {
  return renderLegalExposure(
    language === 'fr' ? fr : en,
    2,
    language,
    undefined,
    new Date('2026-08-24'),
    fakeManifest(),
    findings,
  );
}

describe('the LCEN identification obligation in section 03', () => {
  it('renders nothing when the finding is absent', () => {
    const html = render('fr', [otherFinding()]);
    expect(html).not.toContain(escapeHtml(fr.legalExposure.lcenKicker));
    expect(html).not.toContain(escapeHtml(fr.legalExposure.lcenObserved));
  });

  it('renders nothing for an empty finding set, rather than defaulting to a claim', () => {
    expect(render('fr', [])).not.toContain(escapeHtml(fr.legalExposure.lcenKicker));
  });

  it('states the criterion and what the scan observed when the finding is present', () => {
    const html = render('fr', [lcenFinding(), otherFinding()]);
    expect(html).toContain(escapeHtml(fr.legalExposure.lcenKicker));
    expect(html).toContain(escapeHtml(fr.legalExposure.lcenObserved));
  });

  it('splices the regime name, criterion text and citation from regimes.ts verbatim', () => {
    const regime = getRegime(LCEN_MENTIONS_LEGALES_REGIME_ID, 'fr')!;
    const html = render('fr', [lcenFinding()]);

    expect(html).toContain(escapeHtml(regime.name));
    // Escaped in the HTML, so compare on a distinctive unescaped fragment.
    expect(html).toContain('registre du commerce et des sociétés');
    expect(html).toContain(regime.legalCitation);
  });

  it('cites the post-SREN article, never the superseded article 6-III', () => {
    const html = render('fr', [lcenFinding()]);
    expect(html).toContain('article 1-1');
    expect(html).not.toContain('article 6-III');
    expect(html).not.toContain('6-VI-2');
  });

  it('never states a sanction amount, a deadline, or a verdict that the client is in breach', () => {
    for (const language of ['fr', 'en'] as const) {
      const html = render(language, [lcenFinding()]);
      expect(html).not.toContain('75 000');
      expect(html).not.toContain('75,000');
      expect(html).not.toContain('375 000');
      expect(html).not.toMatch(/emprisonnement|imprisonment/);
      // The unverified sanctionCeiling text must have no render path at all.
      expect(html).not.toMatch(/ne pas citer|do not cite/);
    }
  });

  it('tells the reader a scan cannot prove the absence, and to confirm with a lawyer', () => {
    const html = render('fr', [lcenFinding()]);
    expect(html).toContain(escapeHtml(fr.legalExposure.lcenScanLimitNote));
    expect(fr.legalExposure.lcenScanLimitNote).toMatch(/conseil juridique/);
  });

  it('renders in English too, with no French leaking in', () => {
    const html = render('en', [lcenFinding()]);
    expect(html).toContain(escapeHtml(en.legalExposure.lcenKicker));
    expect(html).toContain('Publisher identification obligation');
    expect(html).not.toContain('Autre obligation applicable');
  });
});

/** 2026-08-25 Lagnonu review, D9. With no SIREN and an LCEN finding
 *  present, section 03 said the same thing twice, two lines apart: the
 *  LCEN block's "le scan n'a trouve aucun numero SIREN, RCS ou TVA publie
 *  sur les pages visitees", immediately followed by the standalone "aucun
 *  numero SIREN n'a pu etre identifie pour ce site". The LCEN wording is
 *  the better of the two, so the standalone fallback yields to it. */
describe('D9: the missing-SIREN fact is stated once, not twice', () => {
  it('suppresses the standalone fallback when the LCEN block already says it', () => {
    const html = render('fr', [lcenFinding()]);

    expect(html).toContain(escapeHtml(fr.legalExposure.lcenObserved));
    expect(html).not.toContain(escapeHtml(fr.legalExposure.sirenUnavailable));
  });

  it('still states it when there is no LCEN block to carry the fact', () => {
    const html = render('fr', [otherFinding()]);

    expect(html).not.toContain(escapeHtml(fr.legalExposure.lcenObserved));
    expect(html).toContain(escapeHtml(fr.legalExposure.sirenUnavailable));
  });

  it('does the same in English', () => {
    const withLcen = render('en', [lcenFinding()]);
    const withoutLcen = render('en', [otherFinding()]);

    expect(withLcen).not.toContain(escapeHtml(en.legalExposure.sirenUnavailable));
    expect(withoutLcen).toContain(escapeHtml(en.legalExposure.sirenUnavailable));
  });
});
